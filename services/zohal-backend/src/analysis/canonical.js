import { createHash } from "node:crypto";

export function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

export function deterministicId(prefix, ...parts) {
  const seed = parts.map((part) => JSON.stringify(part ?? null)).join("|");
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

export function normalizeConfidence(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

export function normalizeStructuralFacet(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "annotation";
  return raw.replace(/[^a-z0-9_]+/g, "_");
}

export function isSnapshotV3(snapshot) {
  return String(snapshot?.schema_version || "").split(".")[0] === "3";
}

export function getTemplateIntent(playbookSpec = {}, templateId = "document_analysis") {
  const intent = playbookSpec?.intent && typeof playbookSpec.intent === "object"
    ? playbookSpec.intent
    : {};
  const extractionTargets = Array.isArray(intent.extraction_targets)
    ? intent.extraction_targets.map((target, index) => ({
      id: String(target?.id || `target_${index + 1}`).trim(),
      label: String(target?.label || target?.id || `Target ${index + 1}`).trim(),
      description: String(target?.description || "").trim() || null,
      structural_facet: normalizeStructuralFacet(target?.structural_facet || "annotation"),
      required: target?.required === true,
      source_scope: String(target?.source_scope || "any_doc").trim() || "any_doc",
    })).filter((target) => target.id && target.label)
    : [];
  const derivationIntents = Array.isArray(intent.derivation_intents)
    ? intent.derivation_intents.map((derivation, index) => ({
      id: String(derivation?.id || `derived_${index + 1}`).trim(),
      label: String(derivation?.label || derivation?.id || `Derived ${index + 1}`).trim(),
      description: String(derivation?.description || "").trim(),
      structural_facet: normalizeStructuralFacet(derivation?.structural_facet || "annotation"),
      required: derivation?.required === true,
      input_target_ids: Array.isArray(derivation?.input_target_ids)
        ? derivation.input_target_ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      method: String(derivation?.method || "llm_reasoning").trim() || "llm_reasoning",
    })).filter((derivation) => derivation.id && derivation.label)
    : [];
  const projectionIntents = Array.isArray(intent.projection_intents)
    ? intent.projection_intents.map((projection, index) => ({
      route_id: String(projection?.route_id || `route_${index + 1}`).trim(),
      title: String(projection?.title || projection?.route_id || `Route ${index + 1}`).trim(),
      description: String(projection?.description || "").trim() || null,
      view_kind: String(projection?.view_kind || "list").trim() || "list",
      structural_facets: Array.isArray(projection?.structural_facets)
        ? projection.structural_facets.map((facet) => normalizeStructuralFacet(facet)).filter(Boolean)
        : [],
      provenance_classes: Array.isArray(projection?.provenance_classes)
        ? projection.provenance_classes.filter((value) => value === "extracted" || value === "derived")
        : [],
    })).filter((projection) => projection.route_id && projection.title)
    : [];
  const reviewPolicy = intent?.review_policy && typeof intent.review_policy === "object"
    ? intent.review_policy
    : {};
  const presentationHints = intent?.presentation_hints &&
      typeof intent.presentation_hints === "object"
    ? intent.presentation_hints
    : {};

  if (extractionTargets.length === 0) {
    extractionTargets.push(
      {
        id: "entities",
        label: "Entities",
        description:
          "Atomic named things in the source such as people, organizations, products, places, and document-defined concepts.",
        structural_facet: "entity",
        required: true,
        source_scope: "any_doc",
      },
      {
        id: "events",
        label: "Events",
        description:
          "Dated or state-changing happenings such as deadlines, renewals, shipments, approvals, incidents, and milestones.",
        structural_facet: "event",
        required: true,
        source_scope: "any_doc",
      },
      {
        id: "measures",
        label: "Measures",
        description:
          "Atomic quantitative facts such as amounts, dates, durations, percentages, counts, and identifiers stated in the source.",
        structural_facet: "measure",
        required: true,
        source_scope: "any_doc",
      },
      {
        id: "relationships",
        label: "Relationships",
        description:
          "Explicit relationships stated in the source such as ownership, responsibility, dependency, inclusion, or association.",
        structural_facet: "relationship",
        required: false,
        source_scope: "any_doc",
      },
      {
        id: "annotations",
        label: "Annotations",
        description:
          "Important source-backed clauses, assertions, conditions, findings, or statements that should be preserved as standalone facts.",
        structural_facet: "annotation",
        required: true,
        source_scope: "any_doc",
      },
    );
  }

  if (projectionIntents.length === 0) {
    projectionIntents.push(
      {
        route_id: "overview",
        title: "Overview",
        description: "Combined extracted and derived items.",
        view_kind: "overview",
        structural_facets: [],
        provenance_classes: ["extracted", "derived"],
      },
      {
        route_id: "extracted",
        title: "Extracted",
        description: "Source-backed items.",
        view_kind: "list",
        structural_facets: [],
        provenance_classes: ["extracted"],
      },
      {
        route_id: "derived",
        title: "Derived",
        description: "Derived insights and conclusions.",
        view_kind: "list",
        structural_facets: [],
        provenance_classes: ["derived"],
      },
    );
  }

  if (derivationIntents.length === 0) {
    derivationIntents.push({
      id: "analysis_summary",
      label: "Analysis summary",
      description: `Summarize the most important conclusions for ${templateId}.`,
      structural_facet: "annotation",
      required: true,
      input_target_ids: extractionTargets.map((target) => target.id),
      method: "llm_reasoning",
    });
  }

  return {
    extractionTargets,
    derivationIntents,
    projectionIntents,
    reviewPolicy: {
      enable_verifier: reviewPolicy.enable_verifier === true,
      selective: reviewPolicy.selective !== false,
      high_impact_only: reviewPolicy.high_impact_only === true,
      require_anchor_verification: reviewPolicy.require_anchor_verification !== false,
    },
    presentationHints: {
      default_title: String(presentationHints.default_title || "").trim() || null,
      default_summary: String(presentationHints.default_summary || "").trim() || null,
      preferred_locale: String(presentationHints.preferred_locale || "").trim() || null,
    },
  };
}

export function buildSourceManifest(chunksByDoc) {
  const documents = Object.entries(chunksByDoc || {}).map(([documentId, chunks]) => ({
    document_id: normalizeUuid(documentId),
    chunk_count: Array.isArray(chunks) ? chunks.length : 0,
    page_numbers: Array.isArray(chunks)
      ? Array.from(new Set(chunks.map((chunk) => Number(chunk?.page_number || 0)).filter((value) => value > 0))).sort((a, b) => a - b)
      : [],
  }));
  return {
    documents,
    document_count: documents.length,
  };
}

export function buildProofManifest(items, reviewPolicy = {}) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const extractedItems = normalizedItems.filter((item) => item?.provenance_class === "extracted");
  const derivedItems = normalizedItems.filter((item) => item?.provenance_class === "derived");
  const anchorVerified = extractedItems.filter((item) => item?.anchor_integrity === "verified").length;
  return {
    proof_paths: {
      extracted: "source_anchor",
      derived: "lineage",
    },
    counts: {
      total_items: normalizedItems.length,
      extracted_items: extractedItems.length,
      derived_items: derivedItems.length,
      anchor_verified_items: anchorVerified,
      anchor_failed_items: extractedItems.filter((item) => item?.anchor_integrity === "failed").length,
      derived_with_lineage: derivedItems.filter((item) =>
        Array.isArray(item?.derivation?.input_item_ids) && item.derivation.input_item_ids.length > 0
      ).length,
    },
    review_policy: reviewPolicy,
  };
}

export function buildStageTrace(stageEntries = [], metadata = {}) {
  return {
    execution_plane: "gcp",
    entries: stageEntries,
    metadata,
  };
}

export function filterItemsForProjection(items, projection) {
  const rows = Array.isArray(items) ? items : [];
  const allowedProvenance = Array.isArray(projection?.provenance_classes) &&
      projection.provenance_classes.length > 0
    ? new Set(projection.provenance_classes)
    : null;
  const allowedFacets = Array.isArray(projection?.structural_facets) &&
      projection.structural_facets.length > 0
    ? new Set(projection.structural_facets.map((facet) => normalizeStructuralFacet(facet)))
    : null;
  return rows.filter((item) => {
    if (allowedProvenance && !allowedProvenance.has(item?.provenance_class)) return false;
    if (allowedFacets && !allowedFacets.has(normalizeStructuralFacet(item?.structural_facet))) return false;
    return true;
  });
}

export function summarizeSnapshotForLive(snapshot) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  return {
    extracted_count: items.filter((item) => item?.provenance_class === "extracted").length,
    derived_count: items.filter((item) => item?.provenance_class === "derived").length,
    failed_anchor_count: items.filter((item) => item?.anchor_integrity === "failed").length,
    facets: Array.from(new Set(items.map((item) => normalizeStructuralFacet(item?.structural_facet)).filter(Boolean))),
  };
}
