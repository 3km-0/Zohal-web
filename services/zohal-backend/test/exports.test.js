import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeICS,
  extractCitationsFromSnapshot,
  generateICS,
  pickRunIdFromActions,
} from "../src/handlers/exports.js";

test("ICS escaping preserves calendar-safe text", () => {
  assert.equal(escapeICS("A, B; C\\D\nE"), "A\\, B\\; C\\\\D\\nE");
});

test("calendar export generates legacy ICS event shape", () => {
  const ics = generateICS([
    {
      id: "action-1",
      due_at: "2026-05-10T00:00:00.000Z",
      action_kind: "notice_deadline",
      responsible_party: "Tenant",
      title: "Notice",
      summary: "Send notice",
      workflow_state: "extracted",
    },
  ], "Lease");

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:analysis-action-action-1@zohal.ai/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260510/);
  assert.match(ics, /SUMMARY:Notice deadline: Tenant/);
  assert.match(ics, /TRIGGER:-P1D/);
});

test("audit pack citations are extracted without full snapshot rewrite", () => {
  const citations = extractCitationsFromSnapshot({
    variables: [{ id: "v1", display_name: "Rent", evidence: { page_number: 2, snippet: "SAR 10" } }],
    clauses: [{ id: "c1", clause_title: "Term" }],
    obligations: [{ id: "o1", summary: "Pay rent" }],
    risks: [{ id: "r1", description: "Late fee" }],
  });

  assert.equal(citations.length, 4);
  assert.deepEqual(citations[0], {
    item_type: "variable",
    item_id: "v1",
    label: "Rent",
    evidence: {
      document_id: undefined,
      page_number: 2,
      chunk_id: undefined,
      snippet: "SAR 10",
      bbox: null,
    },
  });
});

test("audit pack run id picker keeps uuid-only breadcrumb behavior", () => {
  assert.equal(pickRunIdFromActions([{ output_json: { run_id: "not-a-uuid" } }]), null);
  assert.equal(
    pickRunIdFromActions([{ output_json: { run_id: "ABCDEFAB-1234-4321-9999-ABCDEFABCDEF" } }]),
    "abcdefab-1234-4321-9999-abcdefabcdef",
  );
});
