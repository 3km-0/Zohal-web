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

test("LTV, ARV, and refinance assumptions affect the debt stack and cash flows", () => {
  const assumptions = normalizeUnderwritingAssumptions({
    opportunity,
    input: {
      ltv_pct: 70,
      after_repair_value: 3800000,
      exit_growth_pct: 2,
      refinance_enabled: true,
      refinance_year: 2,
      refinance_ltv_pct: 65,
      refinance_rate_pct: 5.25,
      refinance_cost_pct: 1,
      target_irr_pct: 8,
    },
  });
  const metrics = calculateDealMetrics(assumptions);
  assert.equal(metrics.loan_amount, 2170000);
  assert(metrics.equity_required < 1400000);
  assert.equal(metrics.exit_price, Math.round(3800000 * (1.02 ** 5)));
  assert.equal(metrics.refinance.enabled, true);
  assert.equal(metrics.refinance.year, 2);
  assert(metrics.refinance.loan_amount > metrics.refinance.payoff_balance);
  assert(metrics.refinance.net_proceeds > 0);
  assert.equal(metrics.cash_flows.length, 6);
});

test("underwriting run is deterministic and produces decision payload sections", () => {
  const first = runUnderwritingEngine({ opportunity, input: { target_irr_pct: 8 }, mode: "quick" });
  const second = runUnderwritingEngine({ opportunity, input: { target_irr_pct: 8 }, mode: "quick" });
  assert.equal(first.status, "complete");
  assert.equal(first.outputs.monte_carlo.p50_irr, second.outputs.monte_carlo.p50_irr);
  assert.equal(first.outputs.monte_carlo.runs, 5000);
  assert(first.outputs.summary.max_bid > 0);
  assert(first.outputs.financing.loan_amount > 0);
  assert(Array.isArray(first.outputs.sensitivity.financing_ltv));
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

test("flip underwriting does not require rent assumptions", () => {
  const result = runUnderwritingEngine({
    opportunity: {
      id: "opp_flip",
      metadata_json: {
        asking_price: 1200000,
        acquisition_price: 1150000,
      },
      renovation_capex_json: { base_total: 120000, low_total: 90000, high_total: 170000 },
    },
    input: {
      deal_strategy: "flip",
      exit_growth_pct: 18,
      hold_period_years: 1,
      target_irr_pct: 8,
    },
    mode: "quick",
  });
  assert.equal(result.status, "complete");
  assert.equal(result.assumptions.deal_strategy, "flip");
  assert.equal(result.assumptions.operations.gross_annual_rent, 0);
  assert.equal(result.assumptions.operations.vacancy_pct, 0);
  assert.deepEqual(result.assumptions.missing_assumptions, []);
  assert.deepEqual(result.outputs.sensitivity.rent, []);
});
