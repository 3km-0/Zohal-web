export function confidenceLabel(score) {
  const value = Number(score);
  if (value >= 0.8) return "high";
  if (value >= 0.6) return "medium";
  if (value >= 0.4) return "low";
  return "very_low";
}

export function contingencyForConfidence(label) {
  switch (label) {
    case "high":
      return { low: 0.05, base: 0.075, high: 0.1 };
    case "medium":
      return { low: 0.1, base: 0.125, high: 0.15 };
    case "low":
      return { low: 0.15, base: 0.2, high: 0.25 };
    default:
      return { low: 0.25, base: 0.3, high: 0.35 };
  }
}

export function calculateConfidence({
  pricingConfidence = 0,
  quantityConfidence = 0,
  scopeConfidence = 0.6,
  evidenceConfidence = 0.4,
  reviewConfidence = 0,
} = {}) {
  const score =
    0.35 * pricingConfidence +
    0.25 * quantityConfidence +
    0.2 * scopeConfidence +
    0.1 * evidenceConfidence +
    0.1 * reviewConfidence;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

export function baseMissingEvidence(metrics = {}) {
  const items = [];
  if (!metrics.gross_area_sqm) {
    items.push({
      type: "confirm_area",
      label: "Confirm gross/internal area",
      suggested_action: "Confirm property area or upload floor plan.",
    });
  }
  if (!metrics.bathroom_count) {
    items.push({
      type: "confirm_bathroom_count",
      label: "Confirm bathroom count",
      suggested_action: "Confirm bathroom count from listing, broker, or floor plan.",
    });
  }
  items.push({
    type: "mep_condition",
    label: "Confirm AC/MEP condition",
    suggested_action: "Request inspection notes for electrical, plumbing, and AC condition.",
  });
  return items;
}

export function baseRisks({ missingPricing = [], cityFallbackUsed = false, pricingAvailable = true } = {}) {
  const risks = [];
  if (cityFallbackUsed) {
    risks.push({
      type: "city_fallback",
      severity: "medium",
      message: "Pricing city was missing or unsupported, so Riyadh fallback pricing was used.",
      suggested_action: "Confirm the property city before treating this as investment-grade.",
    });
  }
  if (!pricingAvailable) {
    risks.push({
      type: "pricing_library_missing",
      severity: "high",
      message: "No active rate card is available, so Zohal returned a scope plan without prices.",
      suggested_action: "Seed an active Riyadh renovation rate card before relying on capex totals.",
    });
  }
  if (missingPricing.length) {
    risks.push({
      type: "missing_pricing_items",
      severity: "high",
      message: `${missingPricing.length} scope items had no matching rate-card price and were excluded from totals.`,
      suggested_action: "Add missing rate-card items or remove them from scope.",
      items: missingPricing,
    });
  }
  return risks;
}
