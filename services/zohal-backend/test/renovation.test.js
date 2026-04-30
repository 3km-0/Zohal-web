import test from "node:test";
import assert from "node:assert/strict";
import { interpretScopeInput } from "../src/renovation/scope.js";
import { extractPropertyMetrics, estimateQuantities } from "../src/renovation/quantities.js";
import { estimateCapex } from "../src/renovation/pricing.js";
import { confidenceLabel } from "../src/renovation/risk.js";

test("renovation scope maps strategy to default assembly codes", () => {
  const scope = interpretScopeInput({
    strategy: "rental_ready",
    finish_level: "mid",
    scope_overrides: { include: ["bathroom_refresh_standard"], exclude: ["basic_plumbing_refresh"] },
  });
  assert.equal(scope.strategy, "rental_ready");
  assert.equal(scope.finish_level, "mid_grade");
  assert.ok(scope.selected_assemblies.includes("flooring_replacement_standard"));
  assert.ok(!scope.selected_assemblies.includes("basic_plumbing_refresh"));
});

test("quantity defaults return values, basis strings, and confidence", () => {
  const metrics = extractPropertyMetrics({
    metadata_json: { gross_area_sqm: 160, bathrooms: 3, property_type: "apartment" },
  });
  const quantities = estimateQuantities(metrics);
  assert.equal(quantities.flooring_sqm.value, 144);
  assert.match(quantities.flooring_sqm.basis, /160/);
  assert.equal(quantities.bathroom_count.value, 3);
  assert.ok(quantities.quantity_confidence > 0.6);
});

test("missing active rate card returns non-priced scope result", () => {
  const scope = interpretScopeInput({ strategy: "rental_ready" });
  const quantities = estimateQuantities({ gross_area_sqm: 120 });
  const estimate = estimateCapex({
    catalog: {
      city_code: "riyadh",
      currency: "SAR",
      pricing_available: false,
      city_fallback_used: true,
    },
    scope,
    quantities,
    metrics: { gross_area_sqm: 120 },
    requestedCityCode: "jeddah",
    cityFallbackUsed: true,
  });
  assert.equal(estimate.pricing_status, "missing_rate_card");
  assert.equal(estimate.city_fallback_used, true);
  assert.equal(estimate.base_total, null);
  assert.ok(estimate.risks.some((risk) => risk.type === "pricing_library_missing"));
});

test("pricing calculates low/base/high with waste and contingency", () => {
  const scope = { ...interpretScopeInput({ strategy: "custom_scope" }), selected_assemblies: ["paint_package"], included_scope: ["paint_package"] };
  const quantities = estimateQuantities({ gross_area_sqm: 100 });
  const catalog = {
    city_code: "riyadh",
    currency: "SAR",
    pricing_available: true,
    rate_card: { id: "rate_card_1", name: "Riyadh baseline", currency: "SAR" },
    finish_levels: [{ id: "finish_mid", code: "mid_grade" }],
    units: [{ id: "unit_sqm", code: "sqm" }],
    categories: [{ id: "cat_paint", code: "paint", name_en: "Painting" }],
    cost_items: [{ id: "item_paint", code: "paint_wall", name_en: "Paint walls", category_id: "cat_paint", default_unit_id: "unit_sqm" }],
    assemblies: [{ id: "assembly_paint", code: "paint_package", name_en: "Paint package" }],
    assembly_items: [{
      assembly_id: "assembly_paint",
      cost_item_id: "item_paint",
      quantity_formula: "paint_wall_sqm",
      waste_factor_percent: 10,
    }],
    multipliers: [],
    rate_card_items: [{
      cost_item_id: "item_paint",
      finish_level_id: "finish_mid",
      unit_id: "unit_sqm",
      low_rate: 10,
      base_rate: 20,
      high_rate: 30,
      confidence_score: 0.8,
    }],
  };
  const estimate = estimateCapex({ catalog, scope, quantities, metrics: { gross_area_sqm: 100 } });
  assert.equal(estimate.pricing_status, "priced");
  assert.ok(estimate.low_total < estimate.base_total);
  assert.ok(estimate.base_total < estimate.high_total);
  assert.equal(estimate.line_items[0].base_total, 6600);
  assert.ok(estimate.line_items.some((line) => line.category_code === "contingency"));
});

test("confidence labels map expected bands", () => {
  assert.equal(confidenceLabel(0.8), "high");
  assert.equal(confidenceLabel(0.6), "medium");
  assert.equal(confidenceLabel(0.4), "low");
  assert.equal(confidenceLabel(0.39), "very_low");
});
