import { quantityValueForFormula } from "./quantities.js";
import {
  baseMissingEvidence,
  baseRisks,
  calculateConfidence,
  confidenceLabel,
  contingencyForConfidence,
} from "./risk.js";

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric);
}

function byId(rows = []) {
  return new Map(rows.map((row) => [row.id, row]));
}

function normalizeCode(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function quantityBasis(formula, quantities, fallback) {
  const key = String(formula || "").trim();
  const exact = quantities[key];
  if (exact?.basis) return exact.basis;
  if (key.includes("floor")) return quantities.flooring_sqm?.basis || "flooring quantity default";
  if (key.includes("paint") || key.includes("wall")) return quantities.paint_wall_sqm?.basis || "paint wall quantity default";
  if (key.includes("ceiling")) return quantities.ceiling_sqm?.basis || "ceiling quantity default";
  if (key.includes("bath")) return quantities.bathroom_count?.basis || "bathroom count default";
  if (key.includes("kitchen")) return quantities.kitchen_linear_meters?.basis || "kitchen quantity default";
  return fallback === null ? "quantity unavailable" : "assembly default quantity";
}

function resolveRate({ rateItems, costItemId, finishLevelId }) {
  return rateItems.find((item) => item.cost_item_id === costItemId && item.finish_level_id === finishLevelId) ||
    rateItems.find((item) => item.cost_item_id === costItemId && !item.finish_level_id) ||
    null;
}

function resolveMultiplierStack({ multipliers, costItem, category, metrics }) {
  const propertyType = normalizeCode(metrics.property_type);
  const stack = multipliers.filter((multiplier) => {
    if (multiplier.applies_to_cost_item_id && multiplier.applies_to_cost_item_id !== costItem.id) return false;
    if (multiplier.applies_to_category_id && multiplier.applies_to_category_id !== category?.id) return false;
    if (multiplier.property_type && normalizeCode(multiplier.property_type) !== propertyType) return false;
    if (multiplier.condition_key) return false;
    return true;
  });

  return stack.map((item) => ({
    id: item.id,
    name: item.name,
    multiplier_type: item.multiplier_type,
    factor_low: Number(item.factor_low || 1),
    factor_base: Number(item.factor_base || 1),
    factor_high: Number(item.factor_high || 1),
  }));
}

function multiplyFactors(stack, key) {
  return stack.reduce((total, item) => total * Number(item[key] || 1), 1);
}

export function buildUnpricedEstimate({
  scope,
  quantities,
  metrics,
  catalog,
  requestedCityCode,
  cityFallbackUsed,
  reason = "missing_rate_card",
}) {
  const pricingConfidence = 0;
  const confidenceScore = calculateConfidence({
    pricingConfidence,
    quantityConfidence: quantities.quantity_confidence || 0,
    scopeConfidence: scope.scope_confidence,
    evidenceConfidence: metrics.gross_area_sqm ? 0.45 : 0.25,
  });
  const label = confidenceLabel(confidenceScore);
  return {
    version: 1,
    mode: "quick_estimate",
    pricing_status: reason,
    planning_estimate_label: "Planning estimate - not a contractor quote",
    city: catalog.city_code || requestedCityCode || "riyadh",
    city_fallback_used: Boolean(cityFallbackUsed || catalog.city_fallback_used),
    currency: catalog.currency || "SAR",
    strategy: scope.strategy,
    finish_level: scope.finish_level,
    low_total: null,
    base_total: null,
    high_total: null,
    confidence_score: confidenceScore,
    confidence_label: label,
    rate_card_id: null,
    line_items: [],
    assumptions: [
      {
        type: "scope",
        description: "Scope interpreted into renovation assemblies, but no active rate card was available for pricing.",
        basis: "strategy and user notes",
        confidence_score: scope.scope_confidence,
      },
    ],
    risks: baseRisks({
      pricingAvailable: false,
      cityFallbackUsed: Boolean(cityFallbackUsed || catalog.city_fallback_used),
    }),
    missing_evidence: baseMissingEvidence(metrics),
    missing_pricing: [],
    included_scope: scope.included_scope,
    excluded_scope: scope.excluded_scope,
    unknowns: ["pricing_library_missing", ...scope.unknowns],
    selected_assemblies: scope.selected_assemblies,
    quantities,
    generated_at: new Date().toISOString(),
  };
}

export function estimateCapex({ catalog, scope, quantities, metrics, requestedCityCode, cityFallbackUsed }) {
  if (!catalog.pricing_available) {
    return buildUnpricedEstimate({ scope, quantities, metrics, catalog, requestedCityCode, cityFallbackUsed });
  }

  const assembliesByCode = new Map(catalog.assemblies.map((row) => [normalizeCode(row.code), row]));
  const costItemsById = byId(catalog.cost_items);
  const categoriesById = byId(catalog.categories);
  const unitsById = byId(catalog.units);
  const finishLevel = catalog.finish_levels.find((row) => normalizeCode(row.code) === normalizeCode(scope.finish_level)) ||
    catalog.finish_levels.find((row) => normalizeCode(row.code) === "mid_grade") ||
    null;
  const missingPricing = [];
  const lineItems = [];
  let pricingConfidenceTotal = 0;
  let pricedCount = 0;

  for (const assemblyCode of scope.selected_assemblies) {
    const assembly = assembliesByCode.get(normalizeCode(assemblyCode));
    if (!assembly) {
      missingPricing.push({ assembly_code: assemblyCode, reason: "assembly_missing" });
      continue;
    }

    const assemblyItems = catalog.assembly_items.filter((item) => item.assembly_id === assembly.id);
    for (const assemblyItem of assemblyItems) {
      const costItem = costItemsById.get(assemblyItem.cost_item_id);
      if (!costItem) {
        missingPricing.push({ assembly_code: assembly.code, reason: "cost_item_missing" });
        continue;
      }
      const rate = resolveRate({
        rateItems: catalog.rate_card_items,
        costItemId: costItem.id,
        finishLevelId: finishLevel?.id || null,
      });
      if (!rate) {
        missingPricing.push({
          assembly_code: assembly.code,
          cost_item_code: costItem.code,
          reason: "rate_card_item_missing",
        });
        continue;
      }

      const defaultQuantity = assemblyItem.default_quantity === null || assemblyItem.default_quantity === undefined
        ? null
        : Number(assemblyItem.default_quantity);
      const quantity = quantityValueForFormula(assemblyItem.quantity_formula, quantities, defaultQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        missingPricing.push({
          assembly_code: assembly.code,
          cost_item_code: costItem.code,
          reason: "quantity_missing",
        });
        continue;
      }

      const category = categoriesById.get(costItem.category_id);
      const unit = unitsById.get(rate.unit_id || assemblyItem.quantity_unit_id || costItem.default_unit_id);
      const wasteFactor = 1 + Number(assemblyItem.waste_factor_percent || 0) / 100;
      const multiplierStack = resolveMultiplierStack({
        multipliers: catalog.multipliers,
        costItem,
        category,
        metrics,
      });
      const lowFactor = multiplyFactors(multiplierStack, "factor_low");
      const baseFactor = multiplyFactors(multiplierStack, "factor_base");
      const highFactor = multiplyFactors(multiplierStack, "factor_high");
      const lowTotal = roundMoney(quantity * Number(rate.low_rate) * wasteFactor * lowFactor);
      const baseTotal = roundMoney(quantity * Number(rate.base_rate) * wasteFactor * baseFactor);
      const highTotal = roundMoney(quantity * Number(rate.high_rate) * wasteFactor * highFactor);
      pricingConfidenceTotal += Number(rate.confidence_score ?? 0.55);
      pricedCount += 1;

      lineItems.push({
        assembly_id: assembly.id,
        assembly_code: assembly.code,
        assembly_name: assembly.name_en,
        cost_item_id: costItem.id,
        cost_item_code: costItem.code,
        name: costItem.name_en,
        category: category?.name_en || "Other",
        category_code: category?.code || "other",
        quantity,
        quantity_formula: assemblyItem.quantity_formula || null,
        quantity_basis: quantityBasis(assemblyItem.quantity_formula, quantities, defaultQuantity),
        unit: unit?.code || null,
        low_unit_rate: Number(rate.low_rate),
        base_unit_rate: Number(rate.base_rate),
        high_unit_rate: Number(rate.high_rate),
        waste_factor_percent: Number(assemblyItem.waste_factor_percent || 0),
        multipliers: multiplierStack,
        low_total: lowTotal,
        base_total: baseTotal,
        high_total: highTotal,
        confidence_score: Number(rate.confidence_score ?? 0.55),
        pricing_source: "active_rate_card",
        assumptions: rate.assumptions || assemblyItem.notes || null,
        exclusions: rate.exclusions || null,
      });
    }
  }

  const subtotal = lineItems.reduce((total, item) => ({
    low: total.low + item.low_total,
    base: total.base + item.base_total,
    high: total.high + item.high_total,
  }), { low: 0, base: 0, high: 0 });
  const pricingConfidence = pricedCount ? pricingConfidenceTotal / pricedCount : 0;
  const confidenceScore = calculateConfidence({
    pricingConfidence,
    quantityConfidence: quantities.quantity_confidence || 0,
    scopeConfidence: scope.scope_confidence,
    evidenceConfidence: metrics.gross_area_sqm ? 0.55 : 0.3,
  });
  const label = confidenceLabel(confidenceScore);
  const contingency = contingencyForConfidence(label);
  const contingencyLine = {
    name: "Recommended contingency",
    category: "Contingency",
    category_code: "contingency",
    quantity: 1,
    unit: "ls",
    low_unit_rate: roundMoney(subtotal.low * contingency.low),
    base_unit_rate: roundMoney(subtotal.base * contingency.base),
    high_unit_rate: roundMoney(subtotal.high * contingency.high),
    low_total: roundMoney(subtotal.low * contingency.low),
    base_total: roundMoney(subtotal.base * contingency.base),
    high_total: roundMoney(subtotal.high * contingency.high),
    confidence_score: confidenceScore,
    pricing_source: "confidence_contingency",
    quantity_basis: `${label} confidence contingency`,
  };
  const allLines = lineItems.length ? [...lineItems, contingencyLine] : lineItems;
  const lowTotal = roundMoney(subtotal.low + contingencyLine.low_total);
  const baseTotal = roundMoney(subtotal.base + contingencyLine.base_total);
  const highTotal = roundMoney(subtotal.high + contingencyLine.high_total);

  return {
    version: 1,
    mode: "quick_estimate",
    pricing_status: lineItems.length ? "priced" : "no_priced_lines",
    planning_estimate_label: "Planning estimate - not a contractor quote",
    city: catalog.city_code || requestedCityCode || "riyadh",
    city_fallback_used: Boolean(cityFallbackUsed || catalog.city_fallback_used),
    currency: catalog.currency || "SAR",
    strategy: scope.strategy,
    finish_level: scope.finish_level,
    low_total: lowTotal || null,
    base_total: baseTotal || null,
    high_total: highTotal || null,
    subtotal_low: roundMoney(subtotal.low),
    subtotal_base: roundMoney(subtotal.base),
    subtotal_high: roundMoney(subtotal.high),
    confidence_score: confidenceScore,
    confidence_label: label,
    rate_card_id: catalog.rate_card?.id || null,
    line_items: allLines,
    assumptions: [
      {
        type: "pricing_basis",
        description: "Unit rates come from the active renovation rate card and are saved with this estimate.",
        basis: catalog.rate_card?.name || "active rate card",
        confidence_score: pricingConfidence,
      },
      ...Object.entries(quantities)
        .filter(([, value]) => value && typeof value === "object" && "basis" in value)
        .map(([key, value]) => ({
          type: "quantity",
          key,
          description: value.basis,
          confidence_score: value.confidence,
        })),
    ],
    risks: baseRisks({
      missingPricing,
      pricingAvailable: true,
      cityFallbackUsed: Boolean(cityFallbackUsed || catalog.city_fallback_used),
    }),
    missing_evidence: baseMissingEvidence(metrics),
    missing_pricing: missingPricing,
    included_scope: scope.included_scope,
    excluded_scope: scope.excluded_scope,
    unknowns: scope.unknowns,
    selected_assemblies: scope.selected_assemblies,
    quantities,
    generated_at: new Date().toISOString(),
  };
}
