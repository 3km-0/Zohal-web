export const UNDERWRITING_ENGINE_VERSION = "underwriting/v1";

export const DEFAULT_ASSUMPTIONS = Object.freeze({
  target_irr_pct: 8,
  ltv_pct: 60,
  financing_rate_pct: 5.5,
  amortization_years: 20,
  hold_period_years: 5,
  vacancy_pct: 7,
  operating_expense_ratio_pct: 15,
  transaction_cost_pct: 2.5,
  brokerage_fee_pct: 2.5,
  legal_admin_costs: 10000,
  selling_cost_pct: 2.5,
  exit_growth_pct: 2,
  monte_carlo_runs_quick: 5000,
  monte_carlo_runs_deep: 25000,
});

const DISCLAIMER = "Zohal provides decision-support analysis based on available information and user-selected assumptions. Formal valuation, legal, brokerage, financing, and investment advice should be obtained from qualified professionals where required.";

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const value = num(source[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function firstText(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const value = String(source[key] ?? "").trim();
      if (value) return value;
    }
  }
  return null;
}

function compactObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeBudgetRange(value) {
  const raw = compactObject(value);
  return {
    min: num(raw.min ?? raw.minimum ?? raw.from) ?? null,
    max: num(raw.max ?? raw.maximum ?? raw.to) ?? null,
  };
}

function normalizePercent(value, fallback) {
  const parsed = num(value);
  return parsed === null ? fallback : parsed;
}

function normalizeCapex(opportunity, input) {
  const metadata = compactObject(opportunity?.metadata_json);
  const capex = compactObject(opportunity?.renovation_capex_json);
  const inputCapex = compactObject(input?.renovation_capex);
  const base = firstNumber([inputCapex, input, capex, metadata], ["base_total", "base", "renovation", "renovation_budget", "capex", "estimated_capex"]) ?? 0;
  const low = firstNumber([inputCapex, input, capex, metadata], ["low_total", "low", "low_capex"]) ?? Math.max(0, base * 0.75);
  const high = firstNumber([inputCapex, input, capex, metadata], ["high_total", "high", "high_capex"]) ?? Math.max(base, base * 1.35);
  return {
    low: round(low, 0),
    base: round(base, 0),
    high: round(high, 0),
    confidence_score: firstNumber([inputCapex, capex, metadata], ["confidence_score", "renovation_confidence_score"]) ?? null,
    confidence_label: firstText([inputCapex, capex, metadata], ["confidence_label", "confidence", "renovation_confidence"]) || null,
    missing_evidence: Array.isArray(capex.missing_evidence) ? capex.missing_evidence : [],
    risks: Array.isArray(capex.risks) ? capex.risks : [],
  };
}

export function annualDebtService(principal, annualRatePct, amortizationYears) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const months = Math.max(1, Math.round((amortizationYears || 0) * 12));
  const monthlyRate = Math.max(0, annualRatePct || 0) / 100 / 12;
  if (monthlyRate === 0) return principal / Math.max(1, amortizationYears || 1);
  const monthlyPayment = principal * monthlyRate / (1 - (1 + monthlyRate) ** -months);
  return monthlyPayment * 12;
}

export function remainingLoanBalance(principal, annualRatePct, amortizationYears, yearsElapsed) {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const totalMonths = Math.max(1, Math.round((amortizationYears || 0) * 12));
  const elapsedMonths = clamp(Math.round((yearsElapsed || 0) * 12), 0, totalMonths);
  if (elapsedMonths >= totalMonths) return 0;
  const monthlyRate = Math.max(0, annualRatePct || 0) / 100 / 12;
  if (monthlyRate === 0) {
    return Math.max(0, principal * (1 - elapsedMonths / totalMonths));
  }
  const monthlyPayment = principal * monthlyRate / (1 - (1 + monthlyRate) ** -totalMonths);
  return principal * (1 + monthlyRate) ** elapsedMonths -
    monthlyPayment * (((1 + monthlyRate) ** elapsedMonths - 1) / monthlyRate);
}

export function irr(cashFlows) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;
  const hasPositive = cashFlows.some((value) => value > 0);
  const hasNegative = cashFlows.some((value) => value < 0);
  if (!hasPositive || !hasNegative) return null;
  const npv = (rate) => cashFlows.reduce((total, flow, index) => total + flow / ((1 + rate) ** index), 0);
  let low = -0.95;
  let high = 1;
  while (npv(high) > 0 && high < 100) high *= 2;
  if (npv(low) * npv(high) > 0) return null;
  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 0.000001) return mid;
    if (npv(low) * value <= 0) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

export function calculateDealMetrics(assumptions) {
  const purchasePrice = assumptions.property.purchase_price;
  const renovationCost = assumptions.renovation.base;
  const transactionCosts = purchasePrice * assumptions.costs.transaction_cost_pct / 100;
  const brokerage = purchasePrice * assumptions.costs.brokerage_fee_pct / 100;
  const admin = assumptions.costs.legal_admin_costs;
  const totalProjectCost = purchasePrice + transactionCosts + brokerage + admin + renovationCost;
  const loanAmount = purchasePrice * assumptions.financing.ltv_pct / 100;
  const equityRequired = totalProjectCost - loanAmount;
  const debtService = annualDebtService(loanAmount, assumptions.financing.financing_rate_pct, assumptions.financing.amortization_years);
  const grossRent = assumptions.operations.gross_annual_rent;
  const egi = grossRent * (1 - assumptions.operations.vacancy_pct / 100);
  const operatingExpenses = egi * assumptions.operations.operating_expense_ratio_pct / 100;
  const noi = egi - operatingExpenses;
  const annualCashFlow = noi - debtService;
  const hold = Math.max(1, Math.round(assumptions.exit.hold_period_years));
  const exitPrice = purchasePrice * ((1 + assumptions.exit.exit_growth_pct / 100) ** hold);
  const netSaleBeforeDebt = exitPrice * (1 - assumptions.exit.selling_cost_pct / 100);
  const remainingDebt = remainingLoanBalance(loanAmount, assumptions.financing.financing_rate_pct, assumptions.financing.amortization_years, hold);
  const netSaleProceeds = netSaleBeforeDebt - remainingDebt;
  const cashFlows = [-equityRequired, ...Array.from({ length: hold }, (_, index) =>
    index === hold - 1 ? annualCashFlow + netSaleProceeds : annualCashFlow
  )];
  const dealIrr = irr(cashFlows);
  const totalCashReturned = annualCashFlow * hold + netSaleProceeds;
  return {
    purchase_price: round(purchasePrice, 0),
    renovation_cost: round(renovationCost, 0),
    transaction_costs: round(transactionCosts, 0),
    brokerage_fee: round(brokerage, 0),
    legal_admin_costs: round(admin, 0),
    total_project_cost: round(totalProjectCost, 0),
    loan_amount: round(loanAmount, 0),
    equity_required: round(equityRequired, 0),
    annual_debt_service: round(debtService, 0),
    effective_gross_income: round(egi, 0),
    operating_expenses: round(operatingExpenses, 0),
    noi: round(noi, 0),
    annual_cash_flow: round(annualCashFlow, 0),
    exit_price: round(exitPrice, 0),
    net_sale_proceeds: round(netSaleProceeds, 0),
    irr: dealIrr === null ? null : round(dealIrr, 6),
    cash_on_cash: equityRequired > 0 ? round(annualCashFlow / equityRequired, 6) : null,
    equity_multiple: equityRequired > 0 ? round(totalCashReturned / equityRequired, 4) : null,
    capital_loss: totalCashReturned < equityRequired,
    cash_flows: cashFlows.map((flow) => round(flow, 0)),
  };
}

export function normalizeUnderwritingAssumptions({ opportunity, mandate = null, input = {} }) {
  const metadata = compactObject(opportunity?.metadata_json);
  const result = compactObject(opportunity?.result_json);
  const sources = [input, compactObject(input.assumptions), metadata, result, opportunity || {}];
  const asking = firstNumber(sources, ["asking_price", "listing_price", "price"]);
  const purchase = firstNumber(sources, ["purchase_price", "acquisition_price", "offer_price"]) ?? asking;
  const monthlyRent = firstNumber(sources, ["monthly_rent", "rent", "expected_monthly_rent", "rent_assumption"]);
  const annualRent = firstNumber(sources, ["gross_annual_rent", "annual_rent", "market_rent_estimate"]) ?? (monthlyRent === null ? null : monthlyRent * 12);
  const capex = normalizeCapex(opportunity, { ...input, ...compactObject(input.assumptions) });
  const budgetRange = normalizeBudgetRange(mandate?.budget_range_json || input.budget_range || metadata.budget_range);
  const targetIrr = normalizePercent(input.target_irr_pct ?? input.target_irr ?? metadata.target_irr_pct ?? mandate?.target_irr_pct, DEFAULT_ASSUMPTIONS.target_irr_pct);
  const missing = [];
  if (!purchase || purchase <= 0) missing.push("purchase_price");
  if (!annualRent || annualRent <= 0) missing.push("gross_annual_rent");
  return {
    underwriting_engine_version: UNDERWRITING_ENGINE_VERSION,
    currency: firstText(sources, ["currency"]) || "SAR",
    property: {
      asking_price: asking,
      purchase_price: purchase,
      property_type: firstText(sources, ["property_type", "asset_type"]) || null,
      built_up_area_sqm: firstNumber(sources, ["built_up_area_sqm", "built_up_area", "building_area"]),
      land_area_sqm: firstNumber(sources, ["land_area_sqm", "land_area", "area_sqm", "area"]),
      current_condition: firstText(sources, ["current_condition", "condition"]) || null,
      current_rent: firstNumber(sources, ["current_rent", "current_annual_rent"]),
      market_rent_estimate: annualRent,
      occupancy: firstText(sources, ["occupancy"]) || null,
    },
    costs: {
      transaction_cost_pct: normalizePercent(input.transaction_cost_pct ?? metadata.transaction_cost_pct, DEFAULT_ASSUMPTIONS.transaction_cost_pct),
      brokerage_fee_pct: normalizePercent(input.brokerage_fee_pct ?? metadata.brokerage_fee_pct, DEFAULT_ASSUMPTIONS.brokerage_fee_pct),
      legal_admin_costs: firstNumber(sources, ["legal_admin_costs", "admin_costs"]) ?? DEFAULT_ASSUMPTIONS.legal_admin_costs,
    },
    financing: {
      ltv_pct: normalizePercent(input.ltv_pct ?? input.loan_to_value_pct ?? metadata.ltv_pct, DEFAULT_ASSUMPTIONS.ltv_pct),
      financing_rate_pct: normalizePercent(input.financing_rate_pct ?? metadata.financing_rate_pct, DEFAULT_ASSUMPTIONS.financing_rate_pct),
      amortization_years: firstNumber(sources, ["amortization_years", "amortization_period"]) ?? DEFAULT_ASSUMPTIONS.amortization_years,
    },
    operations: {
      gross_annual_rent: annualRent,
      vacancy_pct: normalizePercent(input.vacancy_pct ?? input.vacancy ?? metadata.vacancy_pct ?? metadata.vacancy, DEFAULT_ASSUMPTIONS.vacancy_pct),
      operating_expense_ratio_pct: normalizePercent(input.operating_expense_ratio_pct ?? metadata.operating_expense_ratio_pct, DEFAULT_ASSUMPTIONS.operating_expense_ratio_pct),
    },
    renovation: capex,
    exit: {
      hold_period_years: firstNumber(sources, ["hold_period_years", "hold_period", "hold"]) ?? DEFAULT_ASSUMPTIONS.hold_period_years,
      exit_growth_pct: normalizePercent(input.exit_growth_pct ?? input.appreciation ?? metadata.exit_growth_pct ?? metadata.appreciation, DEFAULT_ASSUMPTIONS.exit_growth_pct),
      selling_cost_pct: normalizePercent(input.selling_cost_pct ?? metadata.selling_cost_pct, DEFAULT_ASSUMPTIONS.selling_cost_pct),
    },
    investor: {
      target_irr_pct: targetIrr,
      risk_tolerance: firstText([input, metadata, mandate || {}], ["risk_tolerance", "risk_appetite"]) || null,
      renovation_appetite: firstText([input, metadata, mandate?.buy_box_json || {}], ["renovation_appetite"]) || null,
      budget_range: budgetRange,
    },
    missing_assumptions: missing,
  };
}

function withScenario(base, overrides) {
  return {
    ...base,
    property: { ...base.property, ...(overrides.property || {}) },
    financing: { ...base.financing, ...(overrides.financing || {}) },
    operations: { ...base.operations, ...(overrides.operations || {}) },
    renovation: { ...base.renovation, ...(overrides.renovation || {}) },
    exit: { ...base.exit, ...(overrides.exit || {}) },
  };
}

function buildScenarioCases(assumptions) {
  const base = calculateDealMetrics(assumptions);
  const downside = withScenario(assumptions, {
    property: { purchase_price: assumptions.property.asking_price || assumptions.property.purchase_price },
    renovation: { base: assumptions.renovation.high },
    operations: {
      gross_annual_rent: Math.min(assumptions.operations.gross_annual_rent, assumptions.property.current_rent || assumptions.operations.gross_annual_rent) * 0.95,
      vacancy_pct: Math.max(assumptions.operations.vacancy_pct + 5, 12),
    },
    exit: { exit_growth_pct: Math.min(assumptions.exit.exit_growth_pct, 0) },
    financing: { financing_rate_pct: assumptions.financing.financing_rate_pct + 0.75 },
  });
  const upside = withScenario(assumptions, {
    property: { purchase_price: assumptions.property.purchase_price * 0.95 },
    renovation: { base: assumptions.renovation.low },
    operations: {
      gross_annual_rent: assumptions.operations.gross_annual_rent * 1.12,
      vacancy_pct: Math.max(0, assumptions.operations.vacancy_pct - 4),
    },
    exit: { exit_growth_pct: assumptions.exit.exit_growth_pct + 3 },
    financing: { financing_rate_pct: Math.max(0, assumptions.financing.financing_rate_pct - 0.75) },
  });
  return [
    { key: "downside", label: "Downside", assumptions: downside, metrics: calculateDealMetrics(downside) },
    { key: "base", label: "Base", assumptions, metrics: base },
    { key: "upside", label: "Upside", assumptions: upside, metrics: calculateDealMetrics(upside) },
  ];
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function triangular(random, low, mode, high) {
  if (high <= low) return mode;
  const u = random();
  const c = (mode - low) / (high - low);
  return u < c
    ? low + Math.sqrt(u * (high - low) * (mode - low))
    : high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function histogram(values, bucketCount = 18) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 0.01;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    min: min + span * index / bucketCount,
    max: min + span * (index + 1) / bucketCount,
    count: 0,
  }));
  for (const value of values) {
    const index = clamp(Math.floor((value - min) / span * bucketCount), 0, bucketCount - 1);
    buckets[index].count += 1;
  }
  return buckets.map((bucket) => ({
    min_irr: round(bucket.min, 4),
    max_irr: round(bucket.max, 4),
    count: bucket.count,
    pct: round(bucket.count / values.length, 4),
  }));
}

function runMonteCarlo(assumptions, mode) {
  const runs = mode === "deep" ? DEFAULT_ASSUMPTIONS.monte_carlo_runs_deep : DEFAULT_ASSUMPTIONS.monte_carlo_runs_quick;
  const random = lcg(92821);
  const irrs = [];
  const multiples = [];
  let targetHits = 0;
  let capitalLosses = 0;
  let capexOver20 = 0;
  for (let index = 0; index < runs; index += 1) {
    const capex = triangular(random, assumptions.renovation.low, assumptions.renovation.base, assumptions.renovation.high);
    const rent = triangular(random, assumptions.operations.gross_annual_rent * 0.86, assumptions.operations.gross_annual_rent, assumptions.operations.gross_annual_rent * 1.16);
    const vacancy = triangular(random, Math.max(0, assumptions.operations.vacancy_pct - 4), assumptions.operations.vacancy_pct, Math.min(35, assumptions.operations.vacancy_pct + 7));
    const growth = triangular(random, Math.max(-2, assumptions.exit.exit_growth_pct - 2), assumptions.exit.exit_growth_pct, assumptions.exit.exit_growth_pct + 3);
    const rate = triangular(random, Math.max(0, assumptions.financing.financing_rate_pct - 0.75), assumptions.financing.financing_rate_pct, assumptions.financing.financing_rate_pct + 1);
    const opex = triangular(random, Math.max(5, assumptions.operations.operating_expense_ratio_pct - 4), assumptions.operations.operating_expense_ratio_pct, assumptions.operations.operating_expense_ratio_pct + 6);
    const metrics = calculateDealMetrics(withScenario(assumptions, {
      renovation: { base: capex },
      operations: { gross_annual_rent: rent, vacancy_pct: vacancy, operating_expense_ratio_pct: opex },
      exit: { exit_growth_pct: growth },
      financing: { financing_rate_pct: rate },
    }));
    if (metrics.irr !== null) {
      irrs.push(metrics.irr);
      if (metrics.irr >= assumptions.investor.target_irr_pct / 100) targetHits += 1;
    }
    if (metrics.equity_multiple !== null) multiples.push(metrics.equity_multiple);
    if (metrics.capital_loss) capitalLosses += 1;
    if (capex > assumptions.renovation.base * 1.2) capexOver20 += 1;
  }
  irrs.sort((a, b) => a - b);
  multiples.sort((a, b) => a - b);
  return {
    runs,
    seed: 92821,
    p10_irr: round(percentile(irrs, 0.1), 4),
    p50_irr: round(percentile(irrs, 0.5), 4),
    p90_irr: round(percentile(irrs, 0.9), 4),
    probability_target_irr: round(targetHits / runs, 4),
    probability_capital_loss: round(capitalLosses / runs, 4),
    median_equity_multiple: round(percentile(multiples, 0.5), 4),
    capex_overrun_probability_20: round(capexOver20 / runs, 4),
    histogram: histogram(irrs),
  };
}

function capexOverrun(assumptions) {
  const base = assumptions.renovation.base;
  const thresholds = [
    { key: "base_plus_10", amount: base * 1.1 },
    { key: "base_plus_20", amount: base * 1.2 },
    { key: "base_plus_30", amount: base * 1.3 },
    { key: "severe", amount: Math.max(base * 1.5, assumptions.renovation.high * 0.95) },
  ];
  const low = assumptions.renovation.low;
  const mode = assumptions.renovation.base;
  const high = assumptions.renovation.high;
  function probabilityAbove(x) {
    if (x <= low) return 1;
    if (x >= high) return 0;
    if (x <= mode) return 1 - ((x - low) ** 2) / ((high - low) * (mode - low || 1));
    return ((high - x) ** 2) / ((high - low) * (high - mode || 1));
  }
  const results = thresholds.map((threshold) => ({
    ...threshold,
    amount: round(threshold.amount, 0),
    probability: round(probabilityAbove(threshold.amount), 4),
  }));
  const p20 = results.find((item) => item.key === "base_plus_20")?.probability ?? 0;
  const label = p20 <= 0.15 ? "Low" : p20 <= 0.30 ? "Moderate" : p20 <= 0.50 ? "High" : "Severe";
  return {
    low: assumptions.renovation.low,
    base,
    high: assumptions.renovation.high,
    confidence_score: renovationConfidenceScore(assumptions),
    confidence_label: assumptions.renovation.confidence_label || null,
    thresholds: results,
    overrun_risk_label: label,
  };
}

function renovationConfidenceScore(assumptions) {
  if (Number.isFinite(assumptions.renovation.confidence_score)) {
    return round(clamp(assumptions.renovation.confidence_score, 0, 100), 0);
  }
  let score = 70;
  score -= Math.min(30, assumptions.renovation.missing_evidence.length * 10);
  score -= Math.min(20, assumptions.renovation.risks.length * 6);
  const spread = assumptions.renovation.base > 0 ? (assumptions.renovation.high - assumptions.renovation.low) / assumptions.renovation.base : 0;
  if (spread > 1) score -= 20;
  else if (spread > 0.55) score -= 10;
  return round(clamp(score, 0, 100), 0);
}

function mandateFitScore(assumptions, baseMetrics, mandate) {
  const budget = assumptions.investor.budget_range;
  const budgetScore = budget.max ? (assumptions.property.purchase_price <= budget.max ? 20 : Math.max(0, 20 - ((assumptions.property.purchase_price - budget.max) / budget.max) * 40)) : 12;
  const locationScore = mandate?.target_locations_json?.length ? 16 : 12;
  const assetScore = mandate?.buy_box_json?.property_type && assumptions.property.property_type
    ? String(mandate.buy_box_json.property_type).toLowerCase() === String(assumptions.property.property_type).toLowerCase() ? 10 : 4
    : 7;
  const returnScore = baseMetrics.irr === null ? 6 : clamp((baseMetrics.irr / (assumptions.investor.target_irr_pct / 100)) * 25, 0, 25);
  const renovationScore = assumptions.renovation.base > 0 ? clamp(renovationConfidenceScore(assumptions) / 100 * 10, 2, 10) : 7;
  const riskScore = baseMetrics.capital_loss ? 4 : 8;
  const evidenceScore = assumptions.missing_assumptions.length ? 2 : 4;
  return {
    score: round(budgetScore + locationScore + assetScore + returnScore + renovationScore + riskScore + evidenceScore, 0),
    components: [
      { key: "budget_fit", label: "Budget fit", score: round(budgetScore, 0), max: 20 },
      { key: "location_fit", label: "Location fit", score: round(locationScore, 0), max: 20 },
      { key: "asset_type_fit", label: "Asset type fit", score: round(assetScore, 0), max: 10 },
      { key: "return_fit", label: "Return fit", score: round(returnScore, 0), max: 25 },
      { key: "renovation_appetite", label: "Renovation appetite", score: round(renovationScore, 0), max: 10 },
      { key: "risk_tolerance", label: "Risk tolerance", score: round(riskScore, 0), max: 10 },
      { key: "evidence_completeness", label: "Evidence completeness", score: round(evidenceScore, 0), max: 5 },
    ],
  };
}

function solveMaxBid(assumptions) {
  const target = assumptions.investor.target_irr_pct / 100;
  let low = Math.max(1, assumptions.property.purchase_price * 0.35);
  let high = assumptions.property.purchase_price * 1.2;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const metrics = calculateDealMetrics(withScenario(assumptions, { property: { purchase_price: mid } }));
    if ((metrics.irr ?? -1) >= target) low = mid;
    else high = mid;
  }
  return round(low, 0);
}

function sensitivity(assumptions, baseMetrics) {
  const priceSteps = [-0.1, -0.05, 0, 0.05, 0.1].map((shift) => {
    const price = assumptions.property.purchase_price * (1 + shift);
    const metrics = calculateDealMetrics(withScenario(assumptions, { property: { purchase_price: price } }));
    return { purchase_price: round(price, 0), irr: metrics.irr, clears_target: (metrics.irr ?? -1) >= assumptions.investor.target_irr_pct / 100 };
  });
  const renovationSteps = [assumptions.renovation.low, assumptions.renovation.base * 0.9, assumptions.renovation.base, assumptions.renovation.base * 1.1, assumptions.renovation.high]
    .map((amount) => {
      const metrics = calculateDealMetrics(withScenario(assumptions, { renovation: { base: amount } }));
      return { renovation_cost: round(amount, 0), irr: metrics.irr };
    });
  const rentSteps = [-0.12, -0.06, 0, 0.06, 0.12].map((shift) => {
    const rent = assumptions.operations.gross_annual_rent * (1 + shift);
    const metrics = calculateDealMetrics(withScenario(assumptions, { operations: { gross_annual_rent: rent } }));
    return { annual_rent: round(rent, 0), irr: metrics.irr };
  });
  const drivers = [
    ["exit_value", { exit: { exit_growth_pct: assumptions.exit.exit_growth_pct + 2 } }, { exit: { exit_growth_pct: assumptions.exit.exit_growth_pct - 2 } }],
    ["purchase_price", { property: { purchase_price: assumptions.property.purchase_price * 0.95 } }, { property: { purchase_price: assumptions.property.purchase_price * 1.05 } }],
    ["renovation_cost", { renovation: { base: assumptions.renovation.low } }, { renovation: { base: assumptions.renovation.high } }],
    ["rent", { operations: { gross_annual_rent: assumptions.operations.gross_annual_rent * 1.08 } }, { operations: { gross_annual_rent: assumptions.operations.gross_annual_rent * 0.92 } }],
    ["vacancy", { operations: { vacancy_pct: Math.max(0, assumptions.operations.vacancy_pct - 4) } }, { operations: { vacancy_pct: assumptions.operations.vacancy_pct + 5 } }],
    ["financing_rate", { financing: { financing_rate_pct: Math.max(0, assumptions.financing.financing_rate_pct - 0.75) } }, { financing: { financing_rate_pct: assumptions.financing.financing_rate_pct + 0.75 } }],
    ["operating_expenses", { operations: { operating_expense_ratio_pct: Math.max(5, assumptions.operations.operating_expense_ratio_pct - 4) } }, { operations: { operating_expense_ratio_pct: assumptions.operations.operating_expense_ratio_pct + 6 } }],
  ].map(([key, up, down]) => {
    const upIrr = calculateDealMetrics(withScenario(assumptions, up)).irr ?? baseMetrics.irr;
    const downIrr = calculateDealMetrics(withScenario(assumptions, down)).irr ?? baseMetrics.irr;
    return { key, upside_irr: upIrr, downside_irr: downIrr, impact: round(Math.abs((upIrr ?? 0) - (downIrr ?? 0)), 4) };
  }).sort((a, b) => b.impact - a.impact);
  return { purchase_price: priceSteps, renovation_cost: renovationSteps, rent: rentSteps, tornado: drivers };
}

function recommendation({ baseMetrics, downsideMetrics, monteCarlo, maxBid, assumptions, capexRisk }) {
  const target = assumptions.investor.target_irr_pct / 100;
  if ((baseMetrics.irr ?? -1) >= target && !downsideMetrics.capital_loss && monteCarlo.probability_capital_loss < 0.15) return "Strong Candidate";
  if ((baseMetrics.irr ?? -1) >= target * 0.9 && (capexRisk.overrun_risk_label === "High" || capexRisk.overrun_risk_label === "Severe" || assumptions.renovation.missing_evidence.length)) return "Promising";
  if ((baseMetrics.irr ?? -1) < target && maxBid < assumptions.property.purchase_price * 0.995) return "Negotiate";
  if (monteCarlo.probability_target_irr < 0.25 || assumptions.missing_assumptions.length) return "Watchlist";
  if ((baseMetrics.irr ?? -1) < target * 0.5 || monteCarlo.probability_capital_loss > 0.35) return "Pass";
  return "Promising";
}

function riskFlags({ baseMetrics, monteCarlo, assumptions, capexRisk, maxBid }) {
  const target = assumptions.investor.target_irr_pct / 100;
  return [
    { key: "return_risk", label: "Return risk", level: (baseMetrics.irr ?? -1) >= target ? "low" : "high", detail: "Base IRR compared with the selected target return." },
    { key: "capital_loss_risk", label: "Capital loss risk", level: monteCarlo.probability_capital_loss > 0.2 ? "high" : monteCarlo.probability_capital_loss > 0.08 ? "medium" : "low", detail: "Probability simulated total cash returned is below equity invested." },
    { key: "capex_risk", label: "Capex risk", level: capexRisk.overrun_risk_label.toLowerCase(), detail: "Probability renovation cost exceeds the base estimate." },
    { key: "rent_risk", label: "Rent risk", level: assumptions.operations.gross_annual_rent > (assumptions.property.current_rent || assumptions.operations.gross_annual_rent) * 1.1 ? "medium" : "low", detail: "Whether target returns depend on higher-than-current rent." },
    { key: "exit_risk", label: "Exit risk", level: assumptions.exit.exit_growth_pct > 4 ? "medium" : "low", detail: "Whether returns depend heavily on appreciation." },
    { key: "financing_risk", label: "Financing risk", level: assumptions.financing.financing_rate_pct > 6.5 ? "medium" : "low", detail: "Sensitivity to higher borrowing cost." },
    { key: "evidence_risk", label: "Evidence risk", level: assumptions.renovation.missing_evidence.length || assumptions.missing_assumptions.length ? "high" : "low", detail: "Missing assumptions and unsupported capex evidence." },
    { key: "negotiation_risk", label: "Negotiation risk", level: maxBid < assumptions.property.purchase_price ? "high" : "low", detail: "Whether current ask leaves enough margin of safety." },
  ];
}

function mainRisk(flags) {
  return flags.find((flag) => flag.level === "severe" || flag.level === "high")?.label || flags.find((flag) => flag.level === "medium")?.label || "No dominant risk";
}

function buildReadout(summary, assumptions) {
  const target = `${round(assumptions.investor.target_irr_pct, 1)}%`;
  return {
    investor_summary: `${summary.recommendation}. Median IRR is ${round(summary.median_irr * 100, 1)}%, versus a ${target} target. The deal reaches target return in ${round(summary.probability_target_irr * 100, 0)}% of simulations. Max bid to reach target IRR is approximately SAR ${Math.round(summary.max_bid).toLocaleString("en-US")}. Main risk is ${summary.main_risk.toLowerCase()}.`,
    disclaimer: DISCLAIMER,
  };
}

export function runUnderwritingEngine({ opportunity, mandate = null, input = {}, mode = "quick" }) {
  const assumptions = normalizeUnderwritingAssumptions({ opportunity, mandate, input });
  if (assumptions.missing_assumptions.length) {
    return {
      underwriting_engine_version: UNDERWRITING_ENGINE_VERSION,
      status: "needs_assumptions",
      assumptions,
      outputs: {
        summary: {
          recommendation: "Watchlist",
          missing_assumptions: assumptions.missing_assumptions,
          next_action: "Add purchase price and rent assumptions before running deal simulation.",
        },
        readout: {
          investor_summary: "Underwriting is blocked until the required price and rent assumptions are provided.",
          disclaimer: DISCLAIMER,
        },
      },
    };
  }
  const scenarios = buildScenarioCases(assumptions);
  const baseMetrics = scenarios.find((item) => item.key === "base").metrics;
  const downsideMetrics = scenarios.find((item) => item.key === "downside").metrics;
  const monteCarlo = runMonteCarlo(assumptions, mode);
  const capexRisk = capexOverrun(assumptions);
  const maxBid = solveMaxBid(assumptions);
  const fit = mandateFitScore(assumptions, baseMetrics, mandate);
  const sensitivityOutput = sensitivity(assumptions, baseMetrics);
  const flags = riskFlags({ baseMetrics, monteCarlo, assumptions, capexRisk, maxBid });
  const rec = recommendation({ baseMetrics, downsideMetrics, monteCarlo, maxBid, assumptions, capexRisk });
  const summary = {
    recommendation: rec,
    mandate_fit_score: fit.score,
    median_irr: monteCarlo.p50_irr,
    p10_irr: monteCarlo.p10_irr,
    p90_irr: monteCarlo.p90_irr,
    probability_target_irr: monteCarlo.probability_target_irr,
    probability_capital_loss: monteCarlo.probability_capital_loss,
    median_equity_multiple: monteCarlo.median_equity_multiple,
    target_irr: assumptions.investor.target_irr_pct / 100,
    capex_overrun_risk: capexRisk.overrun_risk_label,
    current_ask: assumptions.property.asking_price || assumptions.property.purchase_price,
    max_bid: maxBid,
    main_risk: mainRisk(flags),
    next_action: maxBid < assumptions.property.purchase_price ? "Request quote and negotiate below current ask." : "Verify open evidence before proceeding.",
  };
  return {
    underwriting_engine_version: UNDERWRITING_ENGINE_VERSION,
    status: "complete",
    assumptions: {
      ...assumptions,
      financing: {
        ...assumptions.financing,
        loan_amount: baseMetrics.loan_amount,
        equity_required: baseMetrics.equity_required,
        annual_debt_service: baseMetrics.annual_debt_service,
      },
      operations: {
        ...assumptions.operations,
        effective_gross_income: baseMetrics.effective_gross_income,
        noi: baseMetrics.noi,
      },
      exit: {
        ...assumptions.exit,
        exit_price: baseMetrics.exit_price,
        net_sale_proceeds: baseMetrics.net_sale_proceeds,
      },
    },
    outputs: {
      summary,
      scenarios: scenarios.map((item) => ({
        key: item.key,
        label: item.label,
        assumptions: {
          purchase_price: item.assumptions.property.purchase_price,
          renovation_cost: item.assumptions.renovation.base,
          annual_rent: item.assumptions.operations.gross_annual_rent,
          vacancy_pct: item.assumptions.operations.vacancy_pct,
          exit_growth_pct: item.assumptions.exit.exit_growth_pct,
          financing_rate_pct: item.assumptions.financing.financing_rate_pct,
        },
        metrics: item.metrics,
      })),
      monte_carlo: monteCarlo,
      capex: capexRisk,
      mandate_fit: fit,
      renovation_confidence: {
        score: renovationConfidenceScore(assumptions),
        label: renovationConfidenceScore(assumptions) >= 80 ? "High confidence" : renovationConfidenceScore(assumptions) >= 60 ? "Medium confidence" : renovationConfidenceScore(assumptions) >= 40 ? "Low confidence" : "Blocked / insufficient evidence",
        factors: [
          { key: "photos", label: "Photos", score: assumptions.renovation.missing_evidence.length ? 10 : 16, max: 20 },
          { key: "floor_plan", label: "Floor plan", score: assumptions.property.built_up_area_sqm ? 12 : 6, max: 15 },
          { key: "contractor_quote", label: "Contractor quote", score: assumptions.renovation.confidence_label?.toLowerCase().includes("quote") ? 22 : 8, max: 25 },
          { key: "scope_clarity", label: "Scope clarity", score: assumptions.renovation.base > 0 ? 11 : 4, max: 15 },
          { key: "mep_visibility", label: "MEP visibility", score: assumptions.renovation.risks.length ? 6 : 11, max: 15 },
          { key: "missing_evidence", label: "Missing evidence", score: Math.max(0, 10 - assumptions.renovation.missing_evidence.length * 3), max: 10 },
        ],
      },
      sensitivity: sensitivityOutput,
      risk_flags: flags,
      readout: buildReadout(summary, assumptions),
    },
  };
}
