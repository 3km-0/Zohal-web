export const ESTIMATOR_VERSION = "renovation-capex-v1";

export const STRATEGIES = new Set([
  "cosmetic_refresh",
  "rental_ready",
  "value_add",
  "premium_repositioning",
  "custom_scope",
]);

export const FINISH_LEVELS = new Set([
  "economy",
  "standard",
  "mid_grade",
  "premium",
  "luxury",
]);

export const STRATEGY_ASSEMBLIES = {
  cosmetic_refresh: [
    "interior_repaint",
    "minor_repairs",
    "lighting_refresh",
    "deep_cleaning_and_debris",
  ],
  rental_ready: [
    "interior_repaint",
    "flooring_replacement_standard",
    "bathroom_refresh_standard",
    "kitchen_refresh_standard",
    "basic_electrical_refresh",
    "basic_plumbing_refresh",
    "deep_cleaning_and_debris",
  ],
  value_add: [
    "interior_repaint",
    "flooring_replacement_standard",
    "bathroom_renovation_standard",
    "kitchen_renovation_standard",
    "lighting_upgrade",
    "gypsum_ceiling_refresh",
    "selected_mep_upgrades",
    "deep_cleaning_and_debris",
  ],
  premium_repositioning: [
    "premium_flooring_replacement",
    "bathroom_renovation_premium",
    "kitchen_renovation_premium",
    "lighting_design_upgrade",
    "gypsum_ceiling_upgrade",
    "doors_and_cabinets_refresh",
    "mep_condition_review",
    "deep_cleaning_and_debris",
  ],
  custom_scope: [],
};

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeStrategy(value, fallback = "rental_ready") {
  const normalized = normalizeToken(value);
  return STRATEGIES.has(normalized) ? normalized : fallback;
}

export function normalizeFinishLevel(value, fallback = "mid_grade") {
  const normalized = normalizeToken(value);
  if (normalized === "mid") return "mid_grade";
  return FINISH_LEVELS.has(normalized) ? normalized : fallback;
}

function unique(values) {
  return [...new Set(values.map(normalizeToken).filter(Boolean))];
}

function inferStrategyFromNotes(notes) {
  const text = String(notes || "").toLowerCase();
  if (!text) return null;
  if (text.includes("premium") || text.includes("luxury") || text.includes("reposition")) return "premium_repositioning";
  if (text.includes("flip") || text.includes("value add") || text.includes("value-add")) return "value_add";
  if (text.includes("rental") || text.includes("rent ready") || text.includes("rental-ready")) return "rental_ready";
  if (text.includes("cosmetic") || text.includes("refresh") || text.includes("paint")) return "cosmetic_refresh";
  return null;
}

export function interpretScopeInput(input = {}, opportunity = {}) {
  const notes = input.user_notes || input.notes || opportunity.summary || "";
  const strategy = normalizeStrategy(input.strategy || inferStrategyFromNotes(notes));
  const finishLevel = normalizeFinishLevel(input.finish_level || input.finishLevel);
  const overrides = input.scope_overrides && typeof input.scope_overrides === "object"
    ? input.scope_overrides
    : {};
  const includedOverrides = unique(overrides.include || input.include_scope || []);
  const excludedScope = unique(overrides.exclude || input.exclude_scope || []);
  const selectedAssemblies = unique([
    ...STRATEGY_ASSEMBLIES[strategy],
    ...includedOverrides,
  ]).filter((code) => !excludedScope.includes(code));

  return {
    strategy,
    finish_level: finishLevel,
    selected_assemblies: selectedAssemblies,
    included_scope: selectedAssemblies,
    excluded_scope: excludedScope,
    explicit_scope: includedOverrides,
    unknowns: [],
    missing_evidence: [],
    scope_confidence: strategy === "custom_scope" && selectedAssemblies.length === 0 ? 0.42 : 0.72,
  };
}
