import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { __test } from "../src/handlers/agent.js";

function makeId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.pending = null;
    this.pendingUpdate = null;
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
        for (const [key, value] of Object.entries(row)) {
          if (value !== undefined) existing[key] = value;
        }
        existing.updated_at = new Date().toISOString();
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

test("new WhatsApp numbers get a guest workspace and a two-candidate cap", async () => {
  const supabase = createMockSupabase();
  const phone = "+966500000001";

  for (let index = 0; index < 3; index += 1) {
    await __test.orchestrateAgentEvent({
      supabase,
      body: {
        channel: "whatsapp",
        external_thread_id: phone,
        sender: { address: phone },
        message: {
          provider_message_id: `msg_${index}`,
          text_body: `Broker listing villa in Riyadh asking ${3 + index}m with photos and a PDF document`,
          media: [],
        },
      },
    });
  }

  assert.equal(supabase.db.profiles.length, 1);
  assert.equal(supabase.db.workspaces.length, 1);
  assert.equal(supabase.db.acquisition_candidate_opportunities.length, 2);
  assert(supabase.db.agent_conversations[0].state_json.is_guest);
});

test("approved sources can submit private candidates while unapproved private numbers are blocked", async () => {
  const approvedPhone = "+966500000002";
  const unapprovedPhone = "+966500000003";
  const supabase = createMockSupabase({
    workspaces: [{ id: "ws_owner", owner_id: "owner_1", workspace_type: "personal", name: "Owner Workspace" }],
    acquisition_contacts: [{
      id: "contact_approved",
      owner_user_id: "owner_1",
      display_name: "Approved Source",
      status: "active",
    }],
    acquisition_contact_channels: [{
      id: "channel_approved",
      contact_id: "contact_approved",
      channel: "whatsapp",
      address: approvedPhone,
      normalized_address: approvedPhone,
      consent_status: "opted_in",
      approved_for_inbound: true,
      approved_for_outbound: true,
      approved_for_private_submission: true,
    }],
  });

  const approved = await __test.orchestrateAgentEvent({
    supabase,
    body: {
      channel: "whatsapp",
      external_thread_id: approvedPhone,
      sender: { address: approvedPhone },
      message: { text_body: "Private off-market villa deal in Riyadh asking 4m with photos and document" },
    },
  });
  const blocked = await __test.orchestrateAgentEvent({
    supabase,
    body: {
      channel: "whatsapp",
      external_thread_id: unapprovedPhone,
      sender: { address: unapprovedPhone },
      message: { text_body: "Private off-market villa deal in Riyadh asking 4m with photos and document" },
    },
  });

  assert.equal(approved.side_effects.includes("candidate_saved"), true);
  assert.equal(blocked.side_effects.includes("private_submission_blocked"), true);
  assert.equal(supabase.db.acquisition_candidate_opportunities.length, 1);
  assert.equal(supabase.db.acquisition_candidate_opportunities[0].source, "broker_whatsapp");
});

test("linked workspace media uploads route to acquisition folders with agent metadata", async () => {
  const supabase = createMockSupabase({
    workspaces: [{ id: "ws_1", owner_id: "user_1", workspace_type: "personal", name: "Acquisition Workspace" }],
  });

  const result = await __test.orchestrateAgentEvent({
    supabase,
    body: {
      channel: "whatsapp",
      external_thread_id: "+966500000004",
      sender: { address: "+966500000004" },
      workspace_session_snapshot: { workspace_id: "ws_1", user_id: "user_1" },
      opportunity_id: "opp_1",
      message: {
        provider_message_id: "media_1",
        media: [{ url: "https://example.com/deed.pdf", file_name: "deed.pdf", mime_type: "application/pdf" }],
      },
    },
  });

  assert.equal(result.side_effects.includes("import_requested"), true);
  assert.equal(result.import_request.workspace_id, "ws_1");
  assert.equal(result.import_request.opportunity_id, "opp_1");
  assert.equal(result.import_request.contact_id, supabase.db.acquisition_contacts[0].id);
  assert.equal(result.import_request.agent_event_id, supabase.db.agent_events[0].id);
  assert(supabase.db.workspace_folders.some((folder) => folder.folder_kind === "acquisition_property"));
});

test("outbound messages require consent, approval, and WhatsApp template or open session", async () => {
  const workspace = { id: "ws_1", owner_id: "owner_1" };
  const contact = { id: "contact_1" };
  const denied = await __test.prepareExternalAction(createMockSupabase(), {
    body: { channel: "whatsapp", approval_status: "approved", template_key: "broker_question" },
    workspace,
    contact,
    contactChannel: { id: "channel_1", consent_status: "unknown", approved_for_outbound: false, normalized_address: "+966500000005" },
    opportunityId: "opp_1",
    messageBody: "Can you share the title deed?",
  });
  assert.equal(denied.outbox.status, "blocked_consent_required");

  const pending = await __test.prepareExternalAction(createMockSupabase(), {
    body: { channel: "whatsapp", template_key: "broker_question" },
    workspace,
    contact,
    contactChannel: { id: "channel_1", consent_status: "opted_in", approved_for_outbound: true, normalized_address: "+966500000005" },
    opportunityId: "opp_1",
    messageBody: "Can you share the title deed?",
  });
  assert.equal(pending.outbox.status, "blocked_approval_required");

  const templateBlocked = await __test.prepareExternalAction(createMockSupabase(), {
    body: { channel: "whatsapp", approval_status: "approved" },
    workspace,
    contact,
    contactChannel: { id: "channel_1", consent_status: "opted_in", approved_for_outbound: true, normalized_address: "+966500000005" },
    opportunityId: "opp_1",
    messageBody: "Can you share the title deed?",
  });
  assert.equal(templateBlocked.outbox.status, "blocked_template_required");

  const ready = await __test.prepareExternalAction(createMockSupabase(), {
    body: { channel: "whatsapp", approval_status: "approved", template_key: "broker_question" },
    workspace,
    contact,
    contactChannel: { id: "channel_1", consent_status: "opted_in", approved_for_outbound: true, normalized_address: "+966500000005" },
    opportunityId: "opp_1",
    messageBody: "Can you share the title deed?",
  });
  assert.equal(ready.outbox.status, "ready");
});

test("Investor Pro mandate intake broadcasts once per workspace to opted-in network", async () => {
  const phone = "+966500000007";
  const supabase = createMockSupabase({
    profiles: [{
      id: "owner_1",
      subscription_tier: "premium",
      subscription_status: "active",
    }],
    workspaces: [{ id: "ws_1", owner_id: "owner_1", workspace_type: "personal", name: "Investor Workspace" }],
    acquisition_contacts: [
      { id: "source_1", display_name: "Approved Source 1", status: "active" },
      { id: "source_2", display_name: "Approved Source 2", status: "active" },
    ],
    acquisition_contact_channels: [
      {
        id: "source_channel_1",
        contact_id: "source_1",
        channel: "whatsapp",
        address: "+966500010001",
        normalized_address: "+966500010001",
        consent_status: "opted_in",
        approved_for_outbound: true,
        metadata_json: { consent_purposes: ["buyer_mandate_broadcast"] },
      },
      {
        id: "source_channel_2",
        contact_id: "source_2",
        channel: "whatsapp",
        address: "+966500010002",
        normalized_address: "+966500010002",
        consent_status: "opted_in",
        approved_for_outbound: true,
        metadata_json: { buyer_mandate_broadcast_opt_in: true },
      },
    ],
  });

  const body = {
    channel: "whatsapp",
    external_thread_id: phone,
    sender: { address: phone },
    workspace_session_snapshot: { workspace_id: "ws_1", user_id: "owner_1" },
    message: {
      text_body: "New buy box mandate looking for villa in Riyadh budget 5m",
    },
  };

  const first = await __test.orchestrateAgentEvent({ supabase, body });
  const second = await __test.orchestrateAgentEvent({
    supabase,
    body: {
      ...body,
      message: { text_body: "Updated buy box mandate looking for villa in Riyadh budget 5.2m" },
    },
  });

  assert.equal(first.side_effects.includes("mandate_broadcast_prepared"), true);
  assert.equal(second.side_effects.includes("mandate_broadcast_already_prepared"), true);
  assert.equal(supabase.db.agent_workspace_broadcasts.length, 1);
  assert.equal(supabase.db.agent_workspace_broadcasts[0].outbox_count, 2);
  assert.equal(supabase.db.agent_outbox_messages.length, 2);
  assert(supabase.db.agent_outbox_messages.every((message) => message.message_intent === "buyer_mandate_broadcast"));
});

test("contractor evaluation creates participant, thread, diligence item, and outbox", async () => {
  const supabase = createMockSupabase({
    workspaces: [{ id: "ws_1", owner_id: "owner_1", workspace_type: "personal", name: "Owner Workspace" }],
    acquisition_contacts: [{ id: "contractor_1", owner_user_id: "owner_1", display_name: "Contractor", status: "active" }],
    acquisition_contact_channels: [{
      id: "contractor_channel_1",
      contact_id: "contractor_1",
      channel: "whatsapp",
      address: "+966500000006",
      normalized_address: "+966500000006",
      consent_status: "opted_in",
      approved_for_outbound: true,
      approved_for_private_submission: true,
    }],
  });

  const result = await __test.orchestrateAgentEvent({
    supabase,
    body: {
      channel: "whatsapp",
      external_thread_id: "+966500000006",
      sender: { address: "+966500000006" },
      opportunity_id: "opp_1",
      message: { text_body: "Please request contractor inspection availability and renovation quote" },
    },
  });

  assert.equal(result.side_effects.includes("contractor_evaluation_prepared"), true);
  assert.equal(supabase.db.acquisition_opportunity_participants[0].role, "contractor");
  assert.equal(supabase.db.acquisition_threads[0].thread_kind, "diligence");
  assert.equal(supabase.db.acquisition_diligence_items[0].owner_kind, "contractor");
  assert.equal(supabase.db.agent_outbox_messages.length, 1);
});
