import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScreeningOutput,
  buildSourceFingerprint,
  normalizeSearchLimits,
  normalizeSources,
  __test,
} from "../src/handlers/acquisition.js";

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
    photo_refs_json: ["photo-1"],
  }, {
    budget_range_json: { max: 4000000 },
  });

  assert.equal(output.decision, "pursue");
  assert.equal(output.confidence, "high");
  assert.equal(output.nextAction.type, "create_workspace");
  assert(Array.isArray(output.evidenceBackedFacts));
  assert(Array.isArray(output.missingInformation));
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
    photo_refs_json: ["photo-1"],
  });

  const promoted = await __test.promoteCandidate(supabase, result.candidate.id);

  assert.equal(promoted.candidate.status, "promoted");
  assert.equal(promoted.opportunity.stage, "workspace_created");
  assert.equal(supabase.db.acquisition_opportunities.length, 1);
  assert.equal(supabase.db.acquisition_scenarios.length, 1);
  assert.equal(supabase.db.acquisition_events.length, 2);
  assert(
    supabase.db.acquisition_claims.some((claim) => claim.opportunity_id === promoted.opportunity.id),
  );
});
