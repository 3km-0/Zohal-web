import test from "node:test";
import assert from "node:assert/strict";
import {
  annualDebtService,
  calculateDealMetrics,
  irr,
  normalizeUnderwritingAssumptions,
  runUnderwritingEngine,
} from "../src/underwriting/engine.js";

const opportunity = {
  id: "opp_1",
  workspace_id: "ws_1",
  title: "Riyadh villa",
  metadata_json: {
    asking_price: 3200000,
    acquisition_price: 3100000,
    property_type: "villa",
    area_sqm: 500,
    monthly_rent: 15417,
    vacancy: 7,
  },
  renovation_capex_json: {
    low_total: 180000,
    base_total: 260000,
    high_total: 420000,
    confidence_score: 54,
    confidence_label: "low",
    missing_evidence: [{ type: "contractor_quote", label: "No contractor quote" }],
  },
};

test("annual debt service uses standard amortization", () => {
  const service = annualDebtService(1860000, 5.5, 20);
  assert(service > 150000);
  assert(service < 160000);
});

test("IRR solves standard cash-flow vectors and rejects invalid vectors", () => {
  assert.equal(irr([-100, -1, -2]), null);
  assert(Math.abs(irr([-1000, 200, 200, 200, 200, 1200]) - 0.20) < 0.01);
});

test("deal metrics calculate project cost, equity, cash flow, and multiple", () => {
  const assumptions = normalizeUnderwritingAssumptions({ opportunity, input: { target_irr_pct: 8 } });
  const metrics = calculateDealMetrics(assumptions);
  assert.equal(metrics.total_project_cost, 3525000);
  assert.equal(metrics.loan_amount, 1860000);
  assert.equal(metrics.equity_required, 1665000);
  assert(metrics.annual_debt_service > 150000);
  assert(metrics.equity_multiple > 1);
});

test("underwriting run is deterministic and produces decision payload sections", () => {
  const first = runUnderwritingEngine({ opportunity, input: { target_irr_pct: 8 }, mode: "quick" });
  const second = runUnderwritingEngine({ opportunity, input: { target_irr_pct: 8 }, mode: "quick" });
  assert.equal(first.status, "complete");
  assert.equal(first.outputs.monte_carlo.p50_irr, second.outputs.monte_carlo.p50_irr);
  assert.equal(first.outputs.monte_carlo.runs, 5000);
  assert(first.outputs.summary.max_bid > 0);
  assert(Array.isArray(first.outputs.scenarios));
  assert(Array.isArray(first.outputs.sensitivity.purchase_price));
  assert(Array.isArray(first.outputs.risk_flags));
  assert(first.outputs.readout.disclaimer.includes("decision-support"));
});

test("missing price or rent returns a structured assumptions blocker", () => {
  const blocked = runUnderwritingEngine({
    opportunity: { id: "opp_missing", metadata_json: { asking_price: 1200000 } },
    input: {},
  });
  assert.equal(blocked.status, "needs_assumptions");
  assert.deepEqual(blocked.assumptions.missing_assumptions, ["gross_annual_rent"]);
  assert.equal(blocked.outputs.summary.recommendation, "Watchlist");
});

test("missing capex suppresses zero-value overrun thresholds", () => {
  const result = runUnderwritingEngine({
    opportunity: {
      ...opportunity,
      renovation_capex_json: {
        pricing_status: "missing_rate_card",
        low_total: null,
        base_total: null,
        high_total: null,
      },
    },
    input: { target_irr_pct: 8, renovation: 0 },
    mode: "quick",
  });
  assert.equal(result.status, "complete");
  assert.equal(result.assumptions.renovation.has_capex_assumption, false);
  assert.equal(result.outputs.capex.overrun_risk_label, "Needs evidence");
  assert.deepEqual(result.outputs.capex.thresholds, []);
});
