import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScreeningOutput,
  buildSourceFingerprint,
  normalizeSearchLimits,
  normalizeSources,
  __test,
} from "../src/handlers/acquisition.js";
import { runAndPersistUnderwriting } from "../src/underwriting/persistence.js";

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.pending = null;
    this.limitCount = null;
  }

  select() {
    return this;
  }

  insert(payload) {
    const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
      id: row.id || makeId(this.table),
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
      ...row,
    }));
    this.db[this.table] ||= [];
    this.db[this.table].push(...rows);
    this.pending = Array.isArray(payload) ? rows : rows[0];
    return this;
  }

  upsert(payload, options = {}) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const conflicts = String(options.onConflict || "id").split(",").map((field) => field.trim());
    const saved = rows.map((row) => {
      this.db[this.table] ||= [];
      const existing = this.db[this.table].find((candidate) =>
        conflicts.every((field) => candidate[field] === row[field])
      );
      if (existing) {
        Object.assign(existing, row, { updated_at: new Date().toISOString() });
        return existing;
      }
      const next = {
        id: row.id || makeId(this.table),
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
        ...row,
      };
      this.db[this.table].push(next);
      return next;
    });
    this.pending = Array.isArray(payload) ? saved : saved[0];
    return this;
  }

  update(payload) {
    this.pendingUpdate = payload;
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, value });
    return this;
  }

  order() {
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  _matches(row) {
    return this.filters.every((filter) => row[filter.field] === filter.value);
  }

  _rows() {
    let rows = [...(this.db[this.table] || [])].filter((row) => this._matches(row));
    if (this.pendingUpdate) {
      rows = rows.map((row) => Object.assign(row, this.pendingUpdate, { updated_at: new Date().toISOString() }));
      this.pending = rows.length === 1 ? rows[0] : rows;
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }

  async single() {
    if (this.pending) return { data: Array.isArray(this.pending) ? this.pending[0] : this.pending, error: null };
    const rows = this._rows();
    return { data: rows[0] || null, error: rows[0] ? null : new Error("not found") };
  }

  async maybeSingle() {
    if (this.pending) return { data: Array.isArray(this.pending) ? this.pending[0] : this.pending, error: null };
    const rows = this._rows();
    return { data: rows[0] || null, error: null };
  }

  then(resolve, reject) {
    const result = this.pending
      ? { data: this.pending, error: null }
      : { data: this._rows(), error: null };
    return Promise.resolve(result).then(resolve, reject);
  }
}

function createMockSupabase(seed = {}) {
  const db = { ...seed };
  return {
    db,
    from(table) {
      return new Query(db, table);
    },
  };
}

test("acquisition helpers normalize sources, limits, and fingerprints", () => {
  assert.deepEqual(normalizeSources(["aqar", "bad", "bayut", "aqar"]), ["aqar", "bayut"]);
  assert.deepEqual(
    normalizeSearchLimits({ max_result_pages_per_source: 9, per_run_timeout_ms: 1 }),
    {
      max_result_pages_per_source: 3,
      max_detail_pages_per_source: 8,
      per_source_timeout_ms: 45000,
      per_run_timeout_ms: 30000,
      retry_transient_failures: true,
    },
  );
  assert.equal(
    buildSourceFingerprint({ source: "aqar", source_url: "https://a.example/1" }).length,
    64,
  );
});

test("candidate screening returns the standard output shape", () => {
  const output = buildScreeningOutput({
    title: "Villa in Riyadh",
    asking_price: 3200000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
    area_sqm: 350,
    photo_refs_json: ["https://example.com/photo-1.jpg"],
  }, {
    budget_range_json: { max: 4000000 },
  });

  assert.equal(output.decision, "pursue");
  assert.equal(output.confidence, "high");
  assert.equal(output.nextAction.type, "create_workspace");
  assert(Array.isArray(output.evidenceBackedFacts));
  assert(Array.isArray(output.missingInformation));
});

test("mandate fit ranks matching candidates and passes hard mismatches", () => {
  const mandate = {
    buy_box_json: { property_type: "villa", city: "Riyadh", district: "Al Arid" },
    target_locations_json: ["Al Arid", "North Riyadh"],
    budget_range_json: { max: 4000000 },
  };
  const fit = __test.buildMandateFit({
    title: "فيلا للبيع في حي العارض الرياض",
    asking_price: 3400000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
  }, mandate);
  assert.equal(fit.score, 100);

  const mismatch = buildScreeningOutput({
    title: "Apartment in Jeddah",
    asking_price: 900000,
    city: "Jeddah",
    district: "Al Rawdah",
    property_type: "apartment",
    area_sqm: 120,
    photo_refs_json: ["https://example.com/photo-1.jpg"],
  }, mandate);

  assert.equal(mismatch.decision, "pass");
  assert.deepEqual(mismatch.fit.hard_mismatches, ["city", "property_type"]);
});

test("candidate screening watches weak district/budget fits instead of treating them as ranked matches", () => {
  const output = buildScreeningOutput({
    title: "Villa district Hittin Riyadh",
    asking_price: 5200000,
    city: "Riyadh",
    district: "Hittin",
    property_type: "villa",
    area_sqm: 420,
    photo_refs_json: ["https://example.com/photo-1.jpg"],
  }, {
    buy_box_json: { property_type: "villa", city: "Riyadh", district: "Al Arid" },
    target_locations_json: ["Al Arid"],
    budget_range_json: { max: 4000000 },
  });

  assert.equal(output.decision, "watch");
  assert.equal(output.fit.over_budget, true);
  assert(output.fit.score < 70);
});

test("candidate screening creates a gated broker contact diligence item", () => {
  const output = buildScreeningOutput({
    title: "Villa in Riyadh",
    asking_price: 3200000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
    area_sqm: 350,
    photo_refs_json: ["photo-1"],
    limited_evidence_snapshot_json: {
      contact_access: { status: "requires_sign_in", reason: "broker_contact_gated" },
    },
  }, {
    budget_range_json: { max: 4000000 },
  });

  assert(
    output.missingInformation.some((item) =>
      item.type === "needs_contact_access" &&
      item.title === "Broker contact requires marketplace access"
    ),
  );
});

test("mandate creation writes acquisition_mandates", async () => {
  const supabase = createMockSupabase();
  const mandate = await __test.createMandate(supabase, {
    workspace_id: "ws_1",
    user_id: "user_1",
    title: "North Riyadh villas",
    buy_box: { property_type: "villa" },
    target_locations: ["North Riyadh"],
    budget_range: { max: 4000000 },
  });

  assert.equal(mandate.workspace_id, "ws_1");
  assert.equal(supabase.db.acquisition_mandates.length, 1);
});

test("listing intake creates and screens a candidate without search run", async () => {
  const supabase = createMockSupabase();
  const result = await __test.createListingCandidate(supabase, {
    workspace_id: "ws_1",
    user_id: "user_1",
    source_url: "https://example.com/listing/1",
    title: "Villa district Al Arid Riyadh",
    asking_price: 3200000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
    area_sqm: 350,
    photo_refs_json: ["photo-1"],
  });

  assert.equal(result.screening.decision, "pursue");
  assert.equal(result.candidate.status, "pursue");
  assert.equal(supabase.db.acquisition_candidate_opportunities.length, 1);
  assert(supabase.db.acquisition_claims.length >= 1);
});

test("candidate promotion creates opportunity, scenario, copied claims, and events", async () => {
  const supabase = createMockSupabase();
  const result = await __test.createListingCandidate(supabase, {
    workspace_id: "ws_1",
    source_url: "https://example.com/listing/2",
    title: "Villa district Hittin Riyadh",
    asking_price: 3800000,
    city: "Riyadh",
    district: "Hittin",
    property_type: "villa",
    area_sqm: 420,
    photo_refs_json: ["https://example.com/photo-1.jpg"],
  });

  const promoted = await __test.promoteCandidate(supabase, result.candidate.id);

  assert.equal(promoted.candidate.status, "promoted");
  assert.equal(promoted.opportunity.stage, "workspace_created");
  assert.equal(promoted.opportunity.source_channel, "user_provided_listing");
  assert.deepEqual(promoted.opportunity.metadata_json.photo_refs, ["https://example.com/photo-1.jpg"]);
  assert.equal(supabase.db.acquisition_opportunities.length, 1);
  assert.equal(supabase.db.properties?.length || 0, 0);
  assert.equal(supabase.db.acquisition_scenarios.length, 1);
  assert.equal(supabase.db.acquisition_events.length, 2);
  assert(
    supabase.db.acquisition_claims.some((claim) => claim.opportunity_id === promoted.opportunity.id),
  );
});

test("manual listing intake records manual source metadata", async () => {
  const supabase = createMockSupabase();
  const result = await __test.createListingCandidate(supabase, {
    workspace_id: "ws_1",
    source: "manual_operator",
    manual_entry: true,
    title: "Manually added villa",
    asking_price: 3000000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
    area_sqm: 360,
  });

  const promoted = await __test.promoteCandidate(supabase, result.candidate.id);

  assert.equal(promoted.opportunity.source_channel, "manual_operator");
  assert.equal(promoted.opportunity.metadata_json.source, "manual_operator");
  assert.equal(promoted.opportunity.metadata_json.source_fingerprint, result.candidate.source_fingerprint);
  assert.equal(result.candidate.limited_evidence_snapshot_json.intake_mode, "manual_user_entry");
});

test("rejecting an opportunity archives its candidate so future upserts stay suppressed", async () => {
  const supabase = createMockSupabase();
  const result = await __test.createListingCandidate(supabase, {
    workspace_id: "ws_1",
    source: "aqar",
    source_url: "https://sa.aqar.fm/123456",
    title: "Villa district Al Arid Riyadh",
    asking_price: 3200000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
    area_sqm: 350,
  });
  const promoted = await __test.promoteCandidate(supabase, result.candidate.id);

  const rejected = await __test.updateOpportunityStage(supabase, promoted.opportunity.id, {
    stage: "archived",
    suppress_source: true,
  });
  const repeated = await __test.upsertCandidateDraft(supabase, {
    workspace_id: "ws_1",
    source: "aqar",
    source_url: "https://sa.aqar.fm/123456",
    title: "Villa district Al Arid Riyadh",
    asking_price: 3200000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
    area_sqm: 350,
  });

  assert.equal(rejected.stage, "archived");
  assert.equal(supabase.db.acquisition_candidate_opportunities[0].status, "archived");
  assert.equal(repeated.suppressed_by_workspace, true);
  assert.equal(supabase.db.acquisition_events.at(-1).event_type, "opportunity_rejected");
});

test("underwriting run persists versioned assumptions and outputs on base scenario", async () => {
  const supabase = createMockSupabase({
    workspaces: [{ id: "ws_1", owner_id: "user_1", org_id: null }],
    acquisition_opportunities: [{
      id: "opp_1",
      workspace_id: "ws_1",
      title: "Riyadh villa",
      metadata_json: {
        asking_price: 3200000,
        acquisition_price: 3100000,
        monthly_rent: 15417,
        property_type: "villa",
      },
      renovation_capex_json: {
        low_total: 180000,
        base_total: 260000,
        high_total: 420000,
      },
    }],
    acquisition_mandates: [{
      id: "mandate_1",
      workspace_id: "ws_1",
      budget_range_json: { max: 4000000 },
      buy_box_json: { property_type: "villa" },
      target_locations_json: ["Riyadh"],
    }],
    acquisition_scenarios: [],
  });

  const result = await runAndPersistUnderwriting({
    supabase,
    opportunityId: "opp_1",
    input: { mode: "quick", target_irr_pct: 8 },
    userId: "user_1",
  });

  assert.equal(result.underwriting.status, "complete");
  assert.equal(supabase.db.acquisition_scenarios.length, 1);
  const saved = supabase.db.acquisition_scenarios[0];
  assert.equal(saved.scenario_kind, "base");
  assert.equal(saved.assumptions_json.underwriting_engine_version, "underwriting/v1");
  assert.equal(saved.outputs_json.underwriting.underwriting_engine_version, "underwriting/v1");
  assert(saved.outputs_json.underwriting.summary.max_bid > 0);
});

test("underwriting run rejects users without workspace write access", async () => {
  const supabase = createMockSupabase({
    workspaces: [{ id: "ws_1", owner_id: "user_1", org_id: null }],
    acquisition_opportunities: [{
      id: "opp_1",
      workspace_id: "ws_1",
      metadata_json: { acquisition_price: 3100000, monthly_rent: 15000 },
      renovation_capex_json: { base_total: 200000 },
    }],
    acquisition_scenarios: [],
  });

  await assert.rejects(
    () => runAndPersistUnderwriting({
      supabase,
      opportunityId: "opp_1",
      input: { mode: "quick" },
      userId: "user_2",
    }),
    /workspace_write_access_denied/,
  );
});

test("buyer readiness profile computes transaction readiness from verified evidence", async () => {
  const supabase = createMockSupabase();
  const profile = await __test.createReadinessProfile(supabase, {
    workspace_id: "ws_1",
    user_id: "user_1",
    buyer_type: "individual",
    mandate_summary: "Villa in North Riyadh, SAR 3M-5M",
    funding_path: "cash",
    visit_readiness: "available this week",
  });

  const identity = await __test.attachReadinessEvidence(supabase, profile.id, {
    evidence_type: "identity",
    status: "verified",
    user_id: "operator_1",
    sensitivity_level: "identity",
  });
  await __test.attachReadinessEvidence(supabase, profile.id, {
    evidence_type: "proof_of_funds",
    status: "verified",
    user_id: "operator_1",
    sensitivity_level: "financial",
  });
  await __test.attachReadinessEvidence(supabase, profile.id, {
    evidence_type: "offer_readiness",
    status: "verified",
    user_id: "operator_1",
  });

  let recomputed = await __test.recomputeReadinessProfile(supabase, profile.id);
  assert.equal(recomputed.profile.readiness_level, 4);
  assert.equal(recomputed.profile.evidence_status, "verified");
  assert.equal(identity.status, "verified");

  await __test.createKycCase(supabase, {
    buyer_profile_id: profile.id,
    state: "brokerage_ready",
  });
  await __test.createBrokerageAgreement(supabase, {
    buyer_profile_id: profile.id,
    status: "active",
    effective_at: new Date(Date.now() - 1000).toISOString(),
  });
  recomputed = await __test.recomputeReadinessProfile(supabase, profile.id);
  assert.equal(recomputed.profile.readiness_level, 5);
  assert.equal(recomputed.profile.kyc_state, "brokerage_ready");
  assert.equal(recomputed.profile.brokerage_status, "signed");
});

test("document sharing grants default financial evidence to status-only", async () => {
  const supabase = createMockSupabase();
  const grant = await __test.createDocumentSharingGrant(supabase, {
    document_id: "doc_1",
    workspace_id: "ws_1",
    buyer_profile_id: "profile_1",
    purpose: "proof of funds readiness signal",
    document_kind: "financial",
    allowed_action: "share_document",
  });

  assert.equal(grant.share_mode, "status_only");
  assert.equal(grant.allowed_action, "share_document");
});

test("approval-gated actions require brokerage authority before execution", async () => {
  const supabase = createMockSupabase({
    buyer_readiness_profiles: [{
      id: "profile_1",
      workspace_id: "ws_1",
      buyer_type: "individual",
      mandate_summary: "North Riyadh villas",
      visit_readiness: "available this week",
      brokerage_status: "not_started",
      kyc_state: "not_started",
      evidence_status: "self_declared",
      readiness_level: 1,
    }],
  });
  const approval = await __test.createExternalActionApproval(supabase, {
    workspace_id: "ws_1",
    opportunity_id: "opp_1",
    buyer_profile_id: "profile_1",
    action_type: "send_outreach",
    draft_payload: { message: "Zohal represents a verified buyer mandate." },
  });

  await assert.rejects(
    () => __test.approveExternalAction(supabase, approval.id, { user_id: "operator_1" }),
    /Active brokerage agreement required/,
  );

  await __test.createBrokerageAgreement(supabase, {
    buyer_profile_id: "profile_1",
    status: "active",
    effective_at: new Date(Date.now() - 1000).toISOString(),
  });
  const approved = await __test.approveExternalAction(supabase, approval.id, { user_id: "operator_1" });
  assert.equal(approved.approval_status, "approved");

  const executed = await __test.executeExternalAction(supabase, approved.id, { user_id: "operator_1" });
  assert.equal(executed.approval_status, "executed");
  assert.equal(supabase.db.acquisition_events.length, 1);
  assert.equal(supabase.db.acquisition_events[0].event_type, "external_action_executed");
});

test("high severity KYC flags restrict readiness", async () => {
  const supabase = createMockSupabase();
  const profile = await __test.createReadinessProfile(supabase, {
    workspace_id: "ws_1",
    buyer_type: "company",
    mandate_summary: "Residential acquisition mandate",
    visit_readiness: "available this week",
  });
  await __test.attachReadinessEvidence(supabase, profile.id, { evidence_type: "commercial_registration", status: "verified" });
  await __test.attachReadinessEvidence(supabase, profile.id, { evidence_type: "company_authorization", status: "verified" });
  await __test.attachReadinessEvidence(supabase, profile.id, { evidence_type: "beneficial_owner", status: "verified" });
  await __test.attachReadinessEvidence(supabase, profile.id, { evidence_type: "proof_of_funds", status: "verified" });
  await __test.attachReadinessEvidence(supabase, profile.id, { evidence_type: "offer_readiness", status: "verified" });
  const kyc = await __test.createKycCase(supabase, {
    buyer_profile_id: profile.id,
    state: "buyer_verified",
  });

  const flagged = await __test.createKycRiskFlag(supabase, kyc.kyc_case.id, {
    flag_type: "beneficial_owner_missing",
    severity: "high",
  });

  assert.equal(flagged.profile.kyc_state, "escalated");
  assert.equal(flagged.profile.readiness_level, 2);
});
