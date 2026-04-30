function numberFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function findNumber(source, keys) {
  if (!source || typeof source !== "object") return null;
  for (const key of keys) {
    const direct = numberFrom(source[key]);
    if (direct !== null) return direct;
  }
  return null;
}

function inferBathrooms(area, propertyType) {
  if (area === null) return propertyType === "villa" ? 4 : 2;
  if (propertyType === "villa") {
    if (area >= 450) return 6;
    if (area >= 300) return 5;
    return 4;
  }
  if (area >= 220) return 4;
  if (area >= 150) return 3;
  return 2;
}

function inferKitchenLm(propertyType, area) {
  if (propertyType === "villa") return area && area > 350 ? 9 : 7;
  return area && area > 160 ? 6 : 4.5;
}

export function extractPropertyMetrics(opportunity = {}, input = {}) {
  const metadata = opportunity.metadata_json && typeof opportunity.metadata_json === "object"
    ? opportunity.metadata_json
    : {};
  const overrides = input.quantity_overrides && typeof input.quantity_overrides === "object"
    ? input.quantity_overrides
    : {};
  const grossArea = findNumber(overrides, ["gross_area_sqm", "area_sqm", "area"]) ??
    findNumber(metadata, ["gross_area_sqm", "area_sqm", "sqm", "area", "built_up_area_sqm"]);
  const bathrooms = findNumber(overrides, ["bathroom_count", "bathrooms"]) ??
    findNumber(metadata, ["bathroom_count", "bathrooms", "bathrooms_count"]);
  const bedrooms = findNumber(overrides, ["bedroom_count", "bedrooms"]) ??
    findNumber(metadata, ["bedroom_count", "bedrooms", "bedrooms_count"]);
  const propertyType = String(
    overrides.property_type || metadata.property_type || metadata.propertyType || "",
  ).trim().toLowerCase() || null;
  const city = String(
    input.city || metadata.city || metadata.city_code || metadata.location_city || "",
  ).trim().toLowerCase() || null;

  return {
    gross_area_sqm: grossArea,
    bathroom_count: bathrooms,
    bedroom_count: bedrooms,
    property_type: propertyType,
    city,
  };
}

export function estimateQuantities(metrics = {}) {
  const area = numberFrom(metrics.gross_area_sqm);
  const propertyType = metrics.property_type === "villa" ? "villa" : "apartment";
  const bathrooms = numberFrom(metrics.bathroom_count);
  const kitchenLm = numberFrom(metrics.kitchen_linear_meters);
  const quantityConfidence = area ? 0.68 : 0.38;
  const inferredBathrooms = bathrooms ?? inferBathrooms(area, propertyType);

  return {
    flooring_sqm: {
      value: area ? Math.round(area * 0.9 * 10) / 10 : null,
      basis: area ? `gross_area_sqm ${area} x 0.90 flooring factor` : "gross area missing",
      confidence: area ? 0.68 : 0.25,
    },
    paint_wall_sqm: {
      value: area ? Math.round(area * 3.0 * 10) / 10 : null,
      basis: area ? `gross_area_sqm ${area} x 3.00 wall paint factor` : "gross area missing",
      confidence: area ? 0.58 : 0.25,
    },
    ceiling_sqm: {
      value: area ? Math.round(area * 0.95 * 10) / 10 : null,
      basis: area ? `gross_area_sqm ${area} x 0.95 ceiling factor` : "gross area missing",
      confidence: area ? 0.62 : 0.25,
    },
    bathroom_count: {
      value: inferredBathrooms,
      basis: bathrooms
        ? "bathroom count provided"
        : `bathroom count inferred from ${area ? `${area} sqm` : propertyType}`,
      confidence: bathrooms ? 0.9 : 0.45,
    },
    kitchen_linear_meters: {
      value: kitchenLm ?? inferKitchenLm(propertyType, area),
      basis: kitchenLm
        ? "kitchen linear meters provided"
        : `default kitchen length for ${propertyType}`,
      confidence: kitchenLm ? 0.85 : 0.42,
    },
    gross_area_sqm: {
      value: area,
      basis: area ? "gross area from opportunity metadata or user override" : "not provided",
      confidence: area ? 0.75 : 0.2,
    },
    quantity_confidence: quantityConfidence,
  };
}

export function quantityValueForFormula(formula, quantities, fallback = null) {
  const key = String(formula || "").trim();
  if (!key) return fallback;
  const exact = quantities[key];
  if (exact && typeof exact === "object" && Number.isFinite(Number(exact.value))) {
    return Number(exact.value);
  }
  if (key.includes("floor")) return Number(quantities.flooring_sqm?.value ?? fallback);
  if (key.includes("paint") || key.includes("wall")) return Number(quantities.paint_wall_sqm?.value ?? fallback);
  if (key.includes("ceiling")) return Number(quantities.ceiling_sqm?.value ?? fallback);
  if (key.includes("bath")) return Number(quantities.bathroom_count?.value ?? fallback);
  if (key.includes("kitchen") && key.includes("linear")) return Number(quantities.kitchen_linear_meters?.value ?? fallback);
  if (key.includes("gross") || key.includes("area")) return Number(quantities.gross_area_sqm?.value ?? fallback);
  return fallback;
}
