import { requireInternalCaller } from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient } from "../runtime/supabase.js";

const BUYER_MODES = new Set([
  "discovery",
  "property_context",
  "progression",
  "document_ingestion",
]);

const STOPWORDS = new Set([
  "i",
  "me",
  "my",
  "a",
  "an",
  "the",
  "show",
  "find",
  "looking",
  "for",
  "property",
  "properties",
  "home",
  "house",
  "with",
  "in",
  "at",
  "to",
  "near",
  "need",
  "want",
  "under",
  "budget",
  "please",
  "can",
  "you",
  "send",
  "share",
  "compare",
  "more",
  "about",
  "this",
  "that",
  "the",
  "one",
  "ones",
  "ابي",
  "ابغى",
  "اريد",
  "محتاج",
  "ابيها",
  "عقار",
  "عقارات",
  "بيت",
  "شقة",
  "في",
  "من",
  "الى",
  "على",
  "مع",
  "عن",
  "لو",
  "سمحت",
  "ممكن",
  "اعرض",
  "ورني",
  "أبي",
  "أبغى",
  "أريد",
]);

const DISCOVERY_KEYWORDS = [
  "find",
  "show",
  "looking",
  "search",
  "available",
  "villa",
  "apartment",
  "duplex",
  "townhouse",
  "land",
  "commercial",
  "bedroom",
  "bedrooms",
  "under",
  "budget",
  "riyadh",
  "jeddah",
  "villa",
  "شقة",
  "فلل",
  "فيلا",
  "دور",
  "أرض",
  "ارضي",
  "تجاري",
  "غرف",
  "غرفة",
  "ميزانية",
  "سعر",
  "ابحث",
  "أبحث",
  "ورني",
  "اعرض",
  "أرني",
];

const PROGRESSION_KEYWORDS = [
  "viewing",
  "visit",
  "schedule",
  "tour",
  "mortgage",
  "finance",
  "financing",
  "broker",
  "agent",
  "call me",
  "callback",
  "contact me",
  "documents",
  "docs",
  "loan",
  "زيارة",
  "معاينة",
  "موعد",
  "تمويل",
  "رهن",
  "وسيط",
  "سمسار",
  "اتصل",
  "كلمني",
  "أوراق",
  "اوراق",
  "مستندات",
];

const PROPERTY_CONTEXT_KEYWORDS = [
  "floor plan",
  "photos",
  "price",
  "district",
  "location",
  "details",
  "about it",
  "about this",
  "more about",
  "المخطط",
  "صور",
  "السعر",
  "الموقع",
  "الحي",
  "تفاصيل",
  "المزيد",
];

const FINANCE_DOC_KEYWORDS = ["finance", "mortgage", "loan", "تمويل", "رهن"];
const IDENTITY_DOC_KEYWORDS = ["id", "identity", "iqama", "هوية", "اقامة", "إقامة"];
const PROPERTY_DOC_KEYWORDS = ["deed", "title", "property docs", "صك", "مخطط", "رخصة"];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${hasPlus ? "+" : ""}${digits}`;
}

function normalizeUuid(value) {
  const raw = normalizeText(value).toLowerCase();
  return raw || null;
}

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

export function detectLanguageFromText(text, fallback = "auto") {
  const normalized = normalizeText(text);
  if (hasArabic(normalized)) return "ar";
  if (normalized) return "en";
  return fallback === "ar" || fallback === "en" ? fallback : "en";
}

function chooseCopy(language, english, arabic) {
  return language === "ar" ? arabic : english;
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
}

function listIncludesKeyword(text, keywords) {
  const lower = normalizeText(text).toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function parseBudget(text) {
  const lower = normalizeText(text).toLowerCase();
  const millionMatch = lower.match(/(\d+(?:\.\d+)?)\s*(m|mn|million|مليون)/i);
  if (millionMatch) return Math.round(Number(millionMatch[1]) * 1_000_000);
  const thousandMatch = lower.match(/(\d+(?:\.\d+)?)\s*(k|thousand|الف|ألف)/i);
  if (thousandMatch) return Math.round(Number(thousandMatch[1]) * 1_000);
  const underMatch = lower.match(
    /(?:under|below|budget|less than|اقل من|أقل من|ميزانية)\s*([\d,]+)/i,
  );
  if (underMatch) return Number(underMatch[1].replace(/,/g, ""));
  const bare = lower.match(/([\d,]{5,})/);
  if (bare) return Number(bare[1].replace(/,/g, ""));
  return null;
}

function parseBedrooms(text) {
  const lower = normalizeText(text).toLowerCase();
  const match = lower.match(/(\d+)\s*(?:bed|beds|bedroom|bedrooms|br|غرف|غرفة)/i);
  return match ? Number(match[1]) : null;
}

function parsePropertyType(text) {
  const lower = normalizeText(text).toLowerCase();
  if (/(villa|فيلا|فلل)/i.test(lower)) return "villa";
  if (/(apartment|flat|شقة|شقق)/i.test(lower)) return "apartment";
  if (/(duplex|دوبلكس)/i.test(lower)) return "duplex";
  if (/(townhouse|تاون هاوس)/i.test(lower)) return "townhouse";
  if (/(land|أرض|ارض)/i.test(lower)) return "land";
  if (/(commercial|تجاري)/i.test(lower)) return "commercial";
  return null;
}

function extractSearchHints(text) {
  const tokens = tokenize(text);
  const propertyType = parsePropertyType(text);
  const budgetMax = parseBudget(text);
  const bedrooms = parseBedrooms(text);
  const areas = tokens.filter((token) => token.length >= 3).slice(0, 6);
  return {
    propertyType,
    budgetMax,
    bedrooms,
    areas,
    tokens,
  };
}

function detectProgressionUploadKind(text) {
  if (listIncludesKeyword(text, FINANCE_DOC_KEYWORDS)) return "finance_docs";
  if (listIncludesKeyword(text, IDENTITY_DOC_KEYWORDS)) return "identity_docs";
  if (listIncludesKeyword(text, PROPERTY_DOC_KEYWORDS)) return "property_docs";
  return "none";
}

export function extractOrdinalSelection(text) {
  const lower = normalizeText(text).toLowerCase();
  if (!lower) return null;
  const wantsCompare = lower.includes("compare") || lower.includes("comparison") ||
    lower.includes("قارن") || lower.includes("مقارنة");
  if (wantsCompare) {
    if (/(first|1|one|الأول|اول|١).*(second|2|two|الثاني|ثاني|٢)/.test(lower)) {
      return [0, 1];
    }
    return "compare";
  }
  if (/\b(first|1|one|الأول|اول|١)\b/.test(lower)) return [0];
  if (/\b(second|2|two|الثاني|ثاني|٢)\b/.test(lower)) return [1];
  if (/\b(third|3|three|الثالث|ثالث|٣)\b/.test(lower)) return [2];
  return null;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractListingSnapshot(row) {
  const overlay = row?.overlay_json && typeof row.overlay_json === "object"
    ? row.overlay_json
    : {};
  const listing = overlay?.listing && typeof overlay.listing === "object"
    ? overlay.listing
    : {};
  const geo = overlay?.geo && typeof overlay.geo === "object"
    ? overlay.geo
    : {};
  const dimensions = overlay?.dimensions && typeof overlay.dimensions === "object"
    ? overlay.dimensions
    : {};
  const description = overlay?.description && typeof overlay.description === "object"
    ? overlay.description
    : {};
  const agent = overlay?.agent && typeof overlay.agent === "object"
    ? overlay.agent
    : {};
  const property = row?.properties && typeof row.properties === "object"
    ? row.properties
    : {};
  const headline = normalizeText(
    listing.headline ||
      listing.title ||
      description.headline ||
      property.name,
  );
  const gallery = Array.isArray(overlay?.media?.gallery) ? overlay.media.gallery : [];
  return {
    workspace_id: normalizeUuid(row.workspace_id),
    property_id: normalizeUuid(row.property_id),
    property_name: normalizeText(property.name) || headline,
    property_type: normalizeText(property.property_type || listing.property_type || row.property_kind),
    surface_key: normalizeText(
      listing.surface_key ||
        listing.public_id ||
        overlay.surface_key ||
        overlay.public_id,
    ) || null,
    headline,
    city: normalizeText(geo.city),
    district: normalizeText(geo.district),
    asking_price: toNumber(listing.asking_price),
    currency: normalizeText(listing.currency) || "SAR",
    bedrooms: toNumber(dimensions.bedrooms),
    bathrooms: toNumber(dimensions.bathrooms_full),
    built_area_m2: toNumber(dimensions.built_area_m2),
    description: Array.isArray(description.long_paragraphs)
      ? description.long_paragraphs.map((item) => normalizeText(item)).filter(Boolean).join(" ")
      : normalizeText(description.summary || description.short || ""),
    features: Array.isArray(overlay.features)
      ? overlay.features.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    floor_plan_ref: normalizeText(overlay?.media?.floor_plan_ref) || null,
    media_count: gallery.length,
    agent_name: normalizeText(agent.name),
    agent_phone: normalizeText(agent.phone),
  };
}

function scoreListing(listing, hints) {
  let score = 0;
  const haystack = [
    listing.property_name,
    listing.headline,
    listing.city,
    listing.district,
    listing.description,
    ...(listing.features || []),
  ]
    .join(" ")
    .toLowerCase();

  for (const token of hints.tokens) {
    if (haystack.includes(token)) score += 2;
  }

  if (hints.propertyType) {
    const kind = `${listing.property_type} ${listing.headline}`.toLowerCase();
    if (kind.includes(hints.propertyType.toLowerCase())) score += 4;
  }

  if (hints.bedrooms && listing.bedrooms) {
    score += listing.bedrooms === hints.bedrooms ? 4 : Math.max(0, 2 - Math.abs(listing.bedrooms - hints.bedrooms));
  }

  if (hints.budgetMax && listing.asking_price) {
    if (listing.asking_price <= hints.budgetMax) {
      score += 5;
    } else {
      score -= Math.min(3, Math.ceil((listing.asking_price - hints.budgetMax) / Math.max(hints.budgetMax, 1) * 10));
    }
  }

  if (listing.city) score += 1;
  if (listing.district) score += 1;
  if (listing.media_count > 0) score += 1;
  if (listing.floor_plan_ref) score += 1;

  return score;
}

function summarizePrice(listing) {
  if (!listing.asking_price) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(listing.asking_price);
  } catch {
    return String(listing.asking_price);
  }
}

function buildMarketUrl(surfaceKey) {
  const host = normalizeText(process.env.WHATSAPP_MARKET_HOST || "live.zohal.ai");
  if (!surfaceKey) return null;
  return `https://${host}/market/${encodeURIComponent(surfaceKey)}`;
}

function buildDiscoveryReply({ language, results, usedExternalFallback = false }) {
  if (!results.length) {
    return chooseCopy(
      language,
      "I couldn't find a strong property match yet. Tell me the area, budget, and property type and I’ll narrow it down.",
      "ما لقيت تطابق قوي حتى الآن. أرسل لي الحي والميزانية ونوع العقار وأنا أضيّق لك الخيارات.",
    );
  }

  const lines = results.slice(0, 3).map((result, index) => {
    const location = [result.district, result.city].filter(Boolean).join(", ");
    const pieces = [
      `${index + 1}. ${result.property_name || result.headline || chooseCopy(language, "Property", "العقار")}`,
      location,
      result.asking_price ? `${summarizePrice(result)} ${result.currency}` : null,
      result.bedrooms ? chooseCopy(language, `${result.bedrooms} bed`, `${result.bedrooms} غرف`) : null,
      result.result_source === "external"
        ? chooseCopy(language, "external", "خارجي")
        : null,
    ].filter(Boolean);
    const url = result.public_url || buildMarketUrl(result.surface_key);
    return url ? `${pieces.join(" · ")}\n${url}` : pieces.join(" · ");
  });

  const intro = usedExternalFallback
    ? chooseCopy(
      language,
      "I relaxed the Zohal search and included external fallback options:",
      "وسّعت بحث زحل وأضفت خيارات خارجية احتياطية:",
    )
    : chooseCopy(
      language,
      "Here are the best Zohal matches I found:",
      "هذه أفضل الخيارات التي وجدتها داخل زحل:",
    );
  const outro = chooseCopy(
    language,
    "Reply with 1, 2, or 3 for details, or ask me to compare the first two.",
    "رد برقم 1 أو 2 أو 3 للتفاصيل، أو اطلب مني مقارنة أول خيارين.",
  );
  return `${intro}\n\n${lines.join("\n\n")}\n\n${outro}`;
}

function buildPropertyContextReply({ language, listing }) {
  const location = [listing.district, listing.city].filter(Boolean).join(", ");
  const parts = [
    `${listing.property_name || listing.headline}`,
    location || null,
    listing.asking_price ? `${summarizePrice(listing)} ${listing.currency}` : null,
    listing.bedrooms ? chooseCopy(language, `${listing.bedrooms} bedrooms`, `${listing.bedrooms} غرف`) : null,
    listing.bathrooms ? chooseCopy(language, `${listing.bathrooms} bathrooms`, `${listing.bathrooms} حمامات`) : null,
    listing.built_area_m2
      ? chooseCopy(language, `${listing.built_area_m2} m2 built area`, `${listing.built_area_m2} م2 مساحة مبنية`)
      : null,
  ].filter(Boolean);
  const detail = listing.description
    ? listing.description.slice(0, 260)
    : chooseCopy(
      language,
      "I can also share floor-plan, finance, and viewing next steps for this property.",
      "أقدر كذلك أساعدك بخطوات المخطط والتمويل والمعاينة لهذا العقار.",
    );
  const url = listing.public_url || buildMarketUrl(listing.surface_key);
  return url ? `${parts.join(" · ")}\n\n${detail}\n\n${url}` : `${parts.join(" · ")}\n\n${detail}`;
}

function buildComparisonReply({ language, listings }) {
  const items = listings.slice(0, 2).map((listing) => {
    const price = listing.asking_price ? `${summarizePrice(listing)} ${listing.currency}` : chooseCopy(language, "price pending", "السعر غير متاح");
    const beds = listing.bedrooms
      ? chooseCopy(language, `${listing.bedrooms} bed`, `${listing.bedrooms} غرف`)
      : null;
    return `${listing.property_name}: ${[price, beds, listing.district].filter(Boolean).join(" · ")}`;
  });
  const suffix = chooseCopy(
    language,
    "Tell me which one you want to view, finance, or explore in more detail.",
    "قل لي أي واحد تريد معاينته أو تمويله أو التعمق فيه أكثر.",
  );
  return `${items.join("\n")}\n\n${suffix}`;
}

export function decideWhatsappMode({
  textBody,
  messageType,
  hasMedia,
  conversation,
  workspaceSession,
}) {
  const text = normalizeText(textBody);
  const activeMode = BUYER_MODES.has(conversation?.mode) ? conversation.mode : "discovery";
  if (hasMedia) {
    if (conversation?.awaiting_upload_kind && conversation.awaiting_upload_kind !== "none") {
      return { handled: true, mode: "progression", reason: "awaiting_upload" };
    }
    if (workspaceSession?.workspace_id) {
      return { handled: true, mode: "document_ingestion", reason: "workspace_bound_media" };
    }
    return { handled: true, mode: activeMode, reason: "ambiguous_media" };
  }
  if (!text) {
    if (workspaceSession?.workspace_id) {
      return { handled: false, mode: null, reason: "legacy_non_text" };
    }
    return { handled: true, mode: activeMode, reason: "unsupported_non_text" };
  }
  if (listIncludesKeyword(text, PROGRESSION_KEYWORDS)) {
    return { handled: true, mode: "progression", reason: "progression_keywords" };
  }
  if (
    (conversation?.active_property_id || conversation?.active_surface_key) &&
    (listIncludesKeyword(text, PROPERTY_CONTEXT_KEYWORDS) || activeMode === "property_context")
  ) {
    return { handled: true, mode: "property_context", reason: "active_property_context" };
  }
  if (extractOrdinalSelection(text)) {
    return { handled: true, mode: conversation?.last_result_set_id ? "property_context" : "discovery", reason: "ordinal_selection" };
  }
  if (listIncludesKeyword(text, DISCOVERY_KEYWORDS)) {
    return { handled: true, mode: "discovery", reason: "discovery_keywords" };
  }
  if (workspaceSession?.workspace_id) {
    return { handled: false, mode: null, reason: "legacy_workspace_text" };
  }
  return { handled: true, mode: activeMode, reason: "buyer_default" };
}

async function loadConversationByPhone(supabase, phoneNumber) {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("channel", "whatsapp")
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  if (error) throw new Error(`Failed to load WhatsApp conversation: ${error.message}`);
  return data || null;
}

async function loadBuyerProfile(supabase, phoneNumber) {
  const { data, error } = await supabase
    .from("whatsapp_buyer_profiles")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  if (error) throw new Error(`Failed to load WhatsApp buyer profile: ${error.message}`);
  return data || null;
}

async function loadMessageEvent(supabase, messageId) {
  if (!messageId) return null;
  const { data, error } = await supabase
    .from("whatsapp_conversation_events")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load WhatsApp conversation event: ${error.message}`);
  return data || null;
}

async function upsertConversation(supabase, payload) {
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .upsert(payload, { onConflict: "channel,phone_number" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to upsert WhatsApp conversation: ${error?.message || "unknown"}`);
  }
  return data;
}

async function upsertBuyerProfile(supabase, payload) {
  const { data, error } = await supabase
    .from("whatsapp_buyer_profiles")
    .upsert(payload, { onConflict: "phone_number" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to upsert WhatsApp buyer profile: ${error?.message || "unknown"}`);
  }
  return data;
}

async function insertConversationEvent(supabase, payload) {
  const { data, error } = await supabase
    .from("whatsapp_conversation_events")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert WhatsApp conversation event: ${error?.message || "unknown"}`);
  }
  return data;
}

async function insertResultSet(supabase, payload) {
  const { data, error } = await supabase
    .from("whatsapp_result_sets")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert WhatsApp result set: ${error?.message || "unknown"}`);
  }
  return data;
}

async function loadResultSet(supabase, resultSetId) {
  if (!resultSetId) return null;
  const { data, error } = await supabase
    .from("whatsapp_result_sets")
    .select("*")
    .eq("id", resultSetId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load WhatsApp result set: ${error.message}`);
  return data || null;
}

async function loadPropertyListing(supabase, propertyId, workspaceId = null) {
  if (!propertyId) return null;
  let query = supabase
    .from("property_listing_overlays")
    .select("workspace_id, property_id, property_kind, overlay_json, properties(name, property_type)")
    .eq("property_id", propertyId)
    .eq("surface_family", "market")
    .eq("ready_to_publish", true)
    .limit(1);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load property listing overlay: ${error.message}`);
  return data ? extractListingSnapshot(data) : null;
}

async function searchNativeListings(supabase, { textBody, hints }) {
  const { data, error } = await supabase
    .from("property_listing_overlays")
    .select("workspace_id, property_id, property_kind, overlay_json, properties(name, property_type)")
    .eq("surface_family", "market")
    .eq("ready_to_publish", true)
    .limit(60);

  if (error) {
    throw new Error(`Failed to search listing overlays: ${error.message}`);
  }

  const rows = (data || []).map((row) => {
    const listing = extractListingSnapshot(row);
    const score = scoreListing(listing, hints);
    return {
      ...listing,
      result_source: "zohal_native",
      score,
      public_url: buildMarketUrl(listing.surface_key),
    };
  });

  const strong = rows
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  return {
    results: strong,
    thresholdMet: strong.length > 0 && strong[0].score >= 4,
    query_text: textBody,
    provider: "zohal_native",
  };
}

async function searchExternalFallback({ textBody, hints, requestId, log }) {
  const baseUrl = normalizeText(process.env.WHATSAPP_EXTERNAL_SEARCH_URL);
  if (!baseUrl) {
    log.info("External WhatsApp fallback not configured", { requestId });
    return { results: [], provider: "external_v1", unavailable: true };
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({ query: textBody, hints }),
  });

  if (!response.ok) {
    throw new Error(`External WhatsApp fallback failed (${response.status})`);
  }

  const json = await response.json().catch(() => ({}));
  const results = Array.isArray(json.results) ? json.results : [];
  return {
    provider: "external_v1",
    results: results.slice(0, 6).map((item) => ({
      property_name: normalizeText(item.property_name || item.title || item.headline) || "External listing",
      headline: normalizeText(item.headline || item.title || item.property_name),
      city: normalizeText(item.city),
      district: normalizeText(item.district),
      asking_price: toNumber(item.asking_price),
      currency: normalizeText(item.currency) || "SAR",
      bedrooms: toNumber(item.bedrooms),
      bathrooms: toNumber(item.bathrooms),
      built_area_m2: toNumber(item.built_area_m2),
      description: normalizeText(item.description),
      features: Array.isArray(item.features) ? item.features.map((feature) => normalizeText(feature)).filter(Boolean) : [],
      surface_key: null,
      workspace_id: null,
      property_id: null,
      result_source: "external",
      external_candidate_id: normalizeText(item.external_candidate_id || item.id) || null,
      public_url: normalizeText(item.public_url) || null,
    })),
  };
}

function buildProfilePatch({ existingProfile, phoneNumber, linkedProfileId, language, hints }) {
  const previous = existingProfile?.profile_json && typeof existingProfile.profile_json === "object"
    ? existingProfile.profile_json
    : {};
  const areas = Array.isArray(previous.preferred_areas) ? previous.preferred_areas : [];
  const mergedAreas = [...new Set([...areas, ...hints.areas].filter(Boolean))].slice(0, 8);
  return {
    phone_number: phoneNumber,
    linked_profile_id: normalizeUuid(linkedProfileId),
    preferred_language: language,
    intent: existingProfile?.intent || "unknown",
    financing_interest: listIncludesKeyword(hints.tokens.join(" "), FINANCE_DOC_KEYWORDS)
      ? "interested"
      : (existingProfile?.financing_interest || "unknown"),
    readiness_score: Math.max(Number(existingProfile?.readiness_score || 0), hints.budgetMax ? 0.35 : 0.15),
    profile_json: {
      ...previous,
      preferred_areas: mergedAreas,
      property_type: hints.propertyType || previous.property_type || null,
      budget_max: hints.budgetMax || previous.budget_max || null,
      bedrooms: hints.bedrooms || previous.bedrooms || null,
      last_query_tokens: hints.tokens.slice(0, 12),
    },
    confidence_json: {
      ...(existingProfile?.confidence_json && typeof existingProfile.confidence_json === "object"
        ? existingProfile.confidence_json
        : {}),
      budget_max: hints.budgetMax ? 0.75 : 0.2,
      property_type: hints.propertyType ? 0.8 : 0.2,
      areas: hints.areas.length ? 0.65 : 0.15,
    },
    summary: hints.tokens.length
      ? `Latest search: ${hints.tokens.slice(0, 6).join(", ")}`
      : existingProfile?.summary || null,
  };
}

async function createOrUpdateOpportunity(supabase, payload) {
  const conversationId = normalizeUuid(payload.conversation_id);
  const workspaceId = normalizeUuid(payload.workspace_id);
  const propertyId = normalizeUuid(payload.property_id);
  const phoneNumber = normalizePhone(payload.phone_number);
  if (!workspaceId || !phoneNumber) return null;

  let query = supabase
    .from("buyer_opportunities")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("phone_number", phoneNumber)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (propertyId) query = query.eq("property_id", propertyId);
  if (conversationId) query = query.eq("conversation_id", conversationId);

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) {
    throw new Error(`Failed to load buyer opportunity: ${existingError.message}`);
  }

  const nextPayload = {
    phone_number: phoneNumber,
    conversation_id: conversationId,
    workspace_id: workspaceId,
    property_id: propertyId,
    surface_key: normalizeText(payload.surface_key) || null,
    stage: payload.stage || "qualified",
    source_channel: "whatsapp",
    result_source: payload.result_source || null,
    current_intent: payload.current_intent || null,
    budget_band: payload.budget_band || null,
    area_summary: payload.area_summary || null,
    financing_status: payload.financing_status || null,
    viewing_readiness: payload.viewing_readiness || null,
    assigned_operator_id: normalizeUuid(payload.assigned_operator_id),
    summary: payload.summary || null,
    metadata_json: payload.metadata_json || {},
    marketing_inquiry_id: normalizeUuid(payload.marketing_inquiry_id),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("buyer_opportunities")
      .update(nextPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(`Failed to update buyer opportunity: ${error?.message || "unknown"}`);
    }
    return data;
  }

  const { data, error } = await supabase
    .from("buyer_opportunities")
    .insert(nextPayload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert buyer opportunity: ${error?.message || "unknown"}`);
  }
  return data;
}

async function insertOpportunityMatch(supabase, payload) {
  const { error } = await supabase
    .from("buyer_opportunity_matches")
    .insert(payload);
  if (error) {
    throw new Error(`Failed to insert buyer opportunity match: ${error.message}`);
  }
}

async function insertOpportunityActivity(supabase, payload) {
  const { data, error } = await supabase
    .from("buyer_opportunity_activities")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert buyer opportunity activity: ${error?.message || "unknown"}`);
  }
  return data;
}

async function insertMarketingInquiryCompatibility(supabase, payload) {
  if (!payload.workspace_id || !payload.surface_key) return null;
  const { data, error } = await supabase
    .from("marketing_inquiries")
    .insert({
      workspace_id: payload.workspace_id,
      property_id: payload.property_id || null,
      surface_key: payload.surface_key,
      channel: "whatsapp_click",
      inquirer_name: payload.inquirer_name || null,
      inquirer_phone: payload.inquirer_phone || null,
      inquirer_email: payload.inquirer_email || null,
      message: payload.message || null,
      source_locale: payload.source_locale || "en",
      raw_payload: payload.raw_payload || {},
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert marketing inquiry compatibility row: ${error?.message || "unknown"}`);
  }
  return data.id;
}

function buildImportRequest({ body, conversation, workspaceSession }) {
  const activeWorkspaceId = normalizeUuid(conversation?.linked_workspace_id || workspaceSession?.workspace_id);
  const userId = normalizeUuid(conversation?.linked_profile_id || workspaceSession?.user_id);
  if (!activeWorkspaceId || !userId || !body.media?.length) return null;
  const media = body.media[0];
  return {
    user_id: userId,
    workspace_id: activeWorkspaceId,
    phone_number: normalizePhone(body.phone_number),
    file_url: normalizeText(media.url),
    file_name: normalizeText(media.file_name || media.filename) || null,
    mime_type: normalizeText(media.mime_type) || "application/octet-stream",
    source_message_id: normalizeText(body.message_id) || null,
    media_auth_header: normalizeText(media.auth_header) || null,
  };
}

async function handleDiscovery({
  supabase,
  conversation,
  buyerProfile,
  body,
  language,
  hints,
  requestId,
  log,
}) {
  const nativeSearch = await searchNativeListings(supabase, {
    textBody: body.text_body,
    hints,
  });

  let results = nativeSearch.results;
  let provider = "zohal_native";
  let usedExternalFallback = false;

  if (!nativeSearch.thresholdMet) {
    const external = await searchExternalFallback({
      textBody: body.text_body,
      hints,
      requestId,
      log,
    });
    if (external.results.length) {
      results = results.length ? [...results, ...external.results].slice(0, 6) : external.results;
      provider = external.provider;
      usedExternalFallback = true;
    }
  }

  const resultSet = await insertResultSet(supabase, {
    conversation_id: conversation.id,
    provider,
    phone_number: body.phone_number,
    workspace_id: results[0]?.workspace_id || null,
    query_text: body.text_body,
    search_state_json: hints,
    results_json: results,
    result_count: results.length,
  });

  const nextConversation = await upsertConversation(supabase, {
    id: conversation.id,
    channel: "whatsapp",
    phone_number: body.phone_number,
    mode: "discovery",
    language,
    active_surface_key: null,
    active_property_id: null,
    active_search_id: resultSet.id,
    awaiting_upload_kind: "none",
    last_result_set_id: resultSet.id,
    linked_profile_id: conversation.linked_profile_id || null,
    linked_workspace_id: results[0]?.workspace_id || conversation.linked_workspace_id || null,
    last_user_goal: normalizeText(body.text_body) || conversation.last_user_goal || null,
    state_json: {
      ...(conversation.state_json || {}),
      last_discovery_reason: "search",
      last_result_provider: provider,
    },
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });

  const profilePatch = buildProfilePatch({
    existingProfile: buyerProfile,
    phoneNumber: body.phone_number,
    linkedProfileId: conversation.linked_profile_id,
    language,
    hints,
  });
  await upsertBuyerProfile(supabase, profilePatch);

  const reply = buildDiscoveryReply({ language, results, usedExternalFallback });
  return {
    mode: "discovery",
    conversation: nextConversation,
    side_effects: ["result_set_persisted", provider],
    outbound_messages: [{ type: "text", body: reply }],
    crm_updates: null,
    import_request: null,
  };
}

async function handlePropertyContext({
  supabase,
  conversation,
  body,
  language,
}) {
  const selection = extractOrdinalSelection(body.text_body);
  let listing = null;

  if (Array.isArray(selection) && selection.length > 0 && conversation.last_result_set_id) {
    const resultSet = await loadResultSet(supabase, conversation.last_result_set_id);
    const results = Array.isArray(resultSet?.results_json) ? resultSet.results_json : [];
    if (selection.length > 1) {
      const pair = selection
        .map((index) => results[index])
        .filter(Boolean);
      if (pair.length >= 2) {
        const nextConversation = await upsertConversation(supabase, {
          ...conversation,
          mode: "property_context",
          last_inbound_message_id: normalizeText(body.message_id) || null,
          last_message_at: new Date().toISOString(),
        });
        return {
          mode: "property_context",
          conversation: nextConversation,
          side_effects: ["comparison_ready"],
          outbound_messages: [{ type: "text", body: buildComparisonReply({ language, listings: pair }) }],
          crm_updates: null,
          import_request: null,
        };
      }
    }
    listing = results[selection[0]] || null;
  }

  if (!listing && conversation.active_property_id) {
    listing = await loadPropertyListing(
      supabase,
      conversation.active_property_id,
      conversation.linked_workspace_id,
    );
  }

  if (!listing) {
    return {
      mode: "property_context",
      conversation,
      side_effects: [],
      outbound_messages: [{
        type: "text",
        body: chooseCopy(
          language,
          "Tell me which result you want by replying with 1, 2, or 3.",
          "حدّد النتيجة التي تريدها بالرد بالرقم 1 أو 2 أو 3.",
        ),
      }],
      crm_updates: null,
      import_request: null,
    };
  }

  const nextConversation = await upsertConversation(supabase, {
    id: conversation.id,
    channel: "whatsapp",
    phone_number: conversation.phone_number,
    mode: "property_context",
    language,
    active_surface_key: listing.surface_key,
    active_property_id: listing.property_id,
    active_search_id: conversation.active_search_id || null,
    awaiting_upload_kind: "none",
    last_result_set_id: conversation.last_result_set_id || null,
    linked_profile_id: conversation.linked_profile_id || null,
    linked_workspace_id: listing.workspace_id || conversation.linked_workspace_id || null,
    last_user_goal: normalizeText(body.text_body) || conversation.last_user_goal || null,
    state_json: {
      ...(conversation.state_json || {}),
      active_property_snapshot: listing,
    },
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });

  return {
    mode: "property_context",
    conversation: nextConversation,
    side_effects: ["active_property_updated"],
    outbound_messages: [{ type: "text", body: buildPropertyContextReply({ language, listing }) }],
    crm_updates: null,
    import_request: null,
  };
}

async function handleProgression({
  supabase,
  conversation,
  buyerProfile,
  body,
  language,
}) {
  const uploadKind = detectProgressionUploadKind(body.text_body);
  let listing = null;
  if (conversation.active_property_id) {
    listing = await loadPropertyListing(
      supabase,
      conversation.active_property_id,
      conversation.linked_workspace_id,
    );
  }

  const opportunitySummary = listing
    ? `${listing.property_name} · ${listing.district || listing.city || ""}`.trim()
    : normalizeText(body.text_body);

  let marketingInquiryId = null;
  if (listing?.workspace_id && listing?.surface_key) {
    marketingInquiryId = await insertMarketingInquiryCompatibility(supabase, {
      workspace_id: listing.workspace_id,
      property_id: listing.property_id,
      surface_key: listing.surface_key,
      inquirer_phone: body.phone_number,
      message: body.text_body,
      source_locale: language,
      raw_payload: {
        source: "whatsapp_orchestrator",
        action: "progression",
      },
    });
  }

  const opportunity = await createOrUpdateOpportunity(supabase, {
    phone_number: body.phone_number,
    conversation_id: conversation.id,
    workspace_id: listing?.workspace_id || conversation.linked_workspace_id || null,
    property_id: listing?.property_id || conversation.active_property_id || null,
    surface_key: listing?.surface_key || conversation.active_surface_key || null,
    stage: uploadKind === "finance_docs" ? "finance" : "qualified",
    result_source: listing ? "zohal_native" : "external",
    current_intent: normalizeText(body.text_body) || buyerProfile?.intent || null,
    budget_band: buyerProfile?.profile_json?.budget_max
      ? `<= ${buyerProfile.profile_json.budget_max}`
      : null,
    area_summary: Array.isArray(buyerProfile?.profile_json?.preferred_areas)
      ? buyerProfile.profile_json.preferred_areas.slice(0, 3).join(", ")
      : null,
    financing_status: uploadKind === "finance_docs" ? "awaiting_docs" : null,
    viewing_readiness: listIncludesKeyword(body.text_body, ["viewing", "visit", "زيارة", "معاينة"])
      ? "requested"
      : null,
    summary: opportunitySummary,
    metadata_json: {
      latest_message: normalizeText(body.text_body),
      upload_kind: uploadKind,
    },
    marketing_inquiry_id: marketingInquiryId,
  });

  if (opportunity?.id && opportunity.workspace_id && listing) {
    await insertOpportunityMatch(supabase, {
      opportunity_id: opportunity.id,
      workspace_id: opportunity.workspace_id,
      property_id: listing.property_id,
      surface_key: listing.surface_key,
      result_source: "zohal_native",
      external_candidate_id: null,
      label: listing.property_name,
      match_payload: listing,
    });
  }

  if (opportunity?.id && opportunity.workspace_id) {
    await insertOpportunityActivity(supabase, {
      opportunity_id: opportunity.id,
      workspace_id: opportunity.workspace_id,
      activity_type: uploadKind === "none" ? "progression_request" : uploadKind,
      direction: "inbound",
      body_text: normalizeText(body.text_body) || null,
      media_json: [],
      activity_payload: {
        requested_action: normalizeText(body.text_body),
      },
    });
  }

  const nextConversation = await upsertConversation(supabase, {
    id: conversation.id,
    channel: "whatsapp",
    phone_number: conversation.phone_number,
    mode: "progression",
    language,
    active_surface_key: listing?.surface_key || conversation.active_surface_key || null,
    active_property_id: listing?.property_id || conversation.active_property_id || null,
    active_search_id: conversation.active_search_id || null,
    awaiting_upload_kind: uploadKind,
    last_result_set_id: conversation.last_result_set_id || null,
    linked_profile_id: conversation.linked_profile_id || null,
    linked_workspace_id: listing?.workspace_id || conversation.linked_workspace_id || opportunity?.workspace_id || null,
    last_user_goal: normalizeText(body.text_body) || conversation.last_user_goal || null,
    state_json: {
      ...(conversation.state_json || {}),
      active_opportunity_id: opportunity?.id || null,
      awaiting_upload_kind: uploadKind,
    },
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });

  const reply = uploadKind !== "none"
    ? chooseCopy(
      language,
      "Understood. Send the documents here and I’ll attach them to your buyer case and keep the operator updated.",
      "تمام. أرسل المستندات هنا وسأربطها بملف المشتري وأحدّث المشغّل مباشرة.",
    )
    : chooseCopy(
      language,
      "I’ve opened this as a buyer opportunity. I can help with viewing, finance, broker contact, or required documents next.",
      "فتحت هذا كفرصة مشتري. أقدر أساعدك الآن في المعاينة أو التمويل أو التواصل مع الوسيط أو المستندات المطلوبة.",
    );

  return {
    mode: "progression",
    conversation: nextConversation,
    side_effects: ["buyer_opportunity_upserted"],
    outbound_messages: [{ type: "text", body: reply }],
    crm_updates: opportunity ? { opportunity_id: opportunity.id } : null,
    import_request: null,
  };
}

async function handleProgressionUpload({
  supabase,
  conversation,
  body,
  language,
}) {
  const opportunityId = normalizeUuid(conversation?.state_json?.active_opportunity_id);
  if (!opportunityId || !conversation.linked_workspace_id) {
    return {
      mode: "progression",
      conversation,
      side_effects: [],
      outbound_messages: [{
        type: "text",
        body: chooseCopy(
          language,
          "I don’t have an active buyer case ready for uploads yet. Tell me what you need first and I’ll set it up.",
          "لا يوجد عندي ملف مشتري جاهز لاستقبال المرفقات بعد. قل لي أولاً ماذا تحتاج وسأجهزه لك.",
        ),
      }],
      crm_updates: null,
      import_request: null,
    };
  }

  const media = Array.isArray(body.media) ? body.media : [];
  await insertOpportunityActivity(supabase, {
    opportunity_id: opportunityId,
    workspace_id: conversation.linked_workspace_id,
    activity_type: conversation.awaiting_upload_kind || "upload",
    direction: "inbound",
    body_text: normalizeText(body.text_body) || null,
    media_json: media,
    activity_payload: {
      source_message_id: normalizeText(body.message_id) || null,
      upload_kind: conversation.awaiting_upload_kind || "none",
    },
  });

  const nextConversation = await upsertConversation(supabase, {
    ...conversation,
    awaiting_upload_kind: "none",
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
    state_json: {
      ...(conversation.state_json || {}),
      awaiting_upload_kind: "none",
    },
  });

  return {
    mode: "progression",
    conversation: nextConversation,
    side_effects: ["progression_upload_attached"],
    outbound_messages: [{
      type: "text",
      body: chooseCopy(
        language,
        "Received. I attached the files to your buyer case and the operator can review them now.",
        "وصلت. ربطت الملفات بملف المشتري ويمكن للمشغّل مراجعتها الآن.",
      ),
    }],
    crm_updates: { opportunity_id: opportunityId },
    import_request: null,
  };
}

async function orchestrateWhatsappMessage({ supabase, body, requestId, log }) {
  const phoneNumber = normalizePhone(body.phone_number);
  if (!phoneNumber) {
    const error = new Error("Missing phone_number");
    error.statusCode = 400;
    throw error;
  }

  const messageId = normalizeText(body.message_id) || null;
  const workspaceSession = body.workspace_session_snapshot && typeof body.workspace_session_snapshot === "object"
    ? body.workspace_session_snapshot
    : null;

  if (messageId) {
    const priorEvent = await loadMessageEvent(supabase, messageId);
    if (priorEvent?.id) {
      return {
        handled: true,
        mode: body.conversation_snapshot?.mode || "discovery",
        conversation_updates: {},
        side_effects: ["duplicate_message"],
        outbound_messages: [],
        import_request: null,
        crm_updates: null,
      };
    }
  }

  const existingConversation = body.conversation_snapshot && typeof body.conversation_snapshot === "object"
    ? body.conversation_snapshot
    : await loadConversationByPhone(supabase, phoneNumber);

  const seededConversation = existingConversation || await upsertConversation(supabase, {
    channel: "whatsapp",
    phone_number: phoneNumber,
    mode: "discovery",
    language: detectLanguageFromText(body.text_body, "auto"),
    active_surface_key: null,
    active_property_id: null,
    active_search_id: null,
    awaiting_upload_kind: "none",
    last_result_set_id: null,
    linked_profile_id: normalizeUuid(workspaceSession?.user_id),
    linked_workspace_id: normalizeUuid(workspaceSession?.workspace_id),
    last_user_goal: null,
    state_json: {},
    last_inbound_message_id: null,
    last_message_at: null,
  });

  const buyerProfile = await loadBuyerProfile(supabase, phoneNumber);
  const textBody = normalizeText(body.text_body);
  const language = detectLanguageFromText(textBody, seededConversation.language);
  const hasMedia = Array.isArray(body.media) && body.media.length > 0;

  const inboundEvent = await insertConversationEvent(supabase, {
    conversation_id: seededConversation.id,
    workspace_id: normalizeUuid(
      seededConversation.linked_workspace_id || workspaceSession?.workspace_id,
    ),
    opportunity_id: normalizeUuid(seededConversation.state_json?.active_opportunity_id),
    event_type: hasMedia ? "inbound_media" : "inbound_text",
    event_direction: "inbound",
    message_id: messageId,
    result_source: null,
    event_payload: {
      text_body: textBody || null,
      media: body.media || [],
      timestamp: body.timestamp || null,
      message_type: body.message_type || null,
    },
  });

  const route = decideWhatsappMode({
    textBody,
    messageType: body.message_type,
    hasMedia,
    conversation: seededConversation,
    workspaceSession,
  });

  if (!route.handled) {
    return {
      handled: false,
      mode: null,
      conversation_updates: {
        conversation_id: seededConversation.id,
        inbound_event_id: inboundEvent.id,
        routing_reason: route.reason,
      },
      side_effects: ["continue_legacy"],
      outbound_messages: [],
      import_request: null,
      crm_updates: null,
    };
  }

  let result;
  const hints = extractSearchHints(textBody);
  if (route.mode === "document_ingestion") {
    const importRequest = buildImportRequest({
      body,
      conversation: seededConversation,
      workspaceSession,
    });
    if (!importRequest) {
      result = {
        mode: "document_ingestion",
        conversation: seededConversation,
        side_effects: ["media_missing_import_context"],
        outbound_messages: [{
          type: "text",
          body: chooseCopy(
            language,
            "I need either an active property upload step or a linked workspace before I can import that file here.",
            "أحتاج خطوة رفع نشطة أو عقار/مساحة مرتبطة قبل أن أستورد هذا الملف هنا.",
          ),
        }],
        crm_updates: null,
        import_request: null,
      };
    } else {
      const nextConversation = await upsertConversation(supabase, {
        ...seededConversation,
        mode: "document_ingestion",
        last_inbound_message_id: messageId,
        last_message_at: new Date().toISOString(),
      });
      result = {
        mode: "document_ingestion",
        conversation: nextConversation,
        side_effects: ["legacy_import_requested"],
        outbound_messages: [],
        crm_updates: null,
        import_request: importRequest,
      };
    }
  } else if (hasMedia && seededConversation.awaiting_upload_kind && seededConversation.awaiting_upload_kind !== "none") {
    result = await handleProgressionUpload({
      supabase,
      conversation: seededConversation,
      body,
      language,
    });
  } else if (hasMedia) {
    result = {
      mode: route.mode,
      conversation: seededConversation,
      side_effects: ["ambiguous_media_clarified"],
      outbound_messages: [{
        type: "text",
        body: chooseCopy(
          language,
          "I received the file. If this is for a buyer step, tell me whether it is finance, identity, or property documents. If it is for a workspace import, link the property first and resend it.",
          "وصلني الملف. إذا كان ضمن خطوة مشتري قل لي هل هو تمويل أو هوية أو مستندات عقار. وإذا كان للاستيراد إلى عقار مرتبط فقم بربط العقار أولاً ثم أعد الإرسال.",
        ),
      }],
      crm_updates: null,
      import_request: null,
    };
  } else if (route.mode === "progression") {
    result = await handleProgression({
      supabase,
      conversation: seededConversation,
      buyerProfile,
      body,
      language,
    });
  } else if (route.mode === "property_context") {
    result = await handlePropertyContext({
      supabase,
      conversation: seededConversation,
      body,
      language,
    });
  } else {
    result = await handleDiscovery({
      supabase,
      conversation: seededConversation,
      buyerProfile,
      body,
      language,
      hints,
      requestId,
      log,
    });
  }

  for (const outbound of result.outbound_messages || []) {
    await insertConversationEvent(supabase, {
      conversation_id: result.conversation.id,
      workspace_id: normalizeUuid(result.conversation.linked_workspace_id),
      opportunity_id: normalizeUuid(result.conversation.state_json?.active_opportunity_id),
      event_type: "outbound_text",
      event_direction: "outbound",
      message_id: null,
      result_source: null,
      event_payload: {
        body: outbound.body,
        type: outbound.type,
      },
    });
  }

  return {
    handled: true,
    mode: result.mode,
    conversation_updates: {
      conversation_id: result.conversation.id,
      mode: result.conversation.mode,
      language: result.conversation.language,
      active_surface_key: result.conversation.active_surface_key,
      active_property_id: result.conversation.active_property_id,
      active_search_id: result.conversation.active_search_id,
      awaiting_upload_kind: result.conversation.awaiting_upload_kind,
      last_result_set_id: result.conversation.last_result_set_id,
      linked_workspace_id: result.conversation.linked_workspace_id,
    },
    side_effects: result.side_effects || [],
    outbound_messages: result.outbound_messages || [],
    import_request: result.import_request || null,
    crm_updates: result.crm_updates || null,
  };
}

export async function handleWhatsappOrchestrate(req, res, { requestId, log, readJsonBody }) {
  try {
    requireInternalCaller(req.headers);
    const body = await readJsonBody(req);
    const supabase = createServiceClient();
    const response = await orchestrateWhatsappMessage({
      supabase,
      body,
      requestId,
      log,
    });
    return sendJson(res, 200, response);
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    log.error("WhatsApp orchestrator failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, statusCode, {
      error: error instanceof Error ? error.message : "internal_server_error",
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
}
