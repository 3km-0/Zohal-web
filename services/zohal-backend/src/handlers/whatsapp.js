import { requireInternalCaller } from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient } from "../runtime/supabase.js";

const WHATSAPP_MODES = new Set([
  "mandate_intake",
  "opportunity_submission",
  "screening",
  "workspace_coordination",
  "diligence_followup",
  "document_ingestion",
]);

const STOPWORDS = new Set([
  "i", "me", "my", "a", "an", "the", "to", "for", "with", "in", "at", "of", "and", "or", "on",
  "this", "that", "it", "we", "you", "our", "need", "want", "help", "please", "can", "could",
  "ابي", "ابغى", "أبي", "أبغى", "اريد", "أريد", "محتاج", "احتاج", "أحتاج", "هذا", "هذه",
  "في", "على", "من", "الى", "إلى", "مع", "عن", "لو", "سمحت", "ممكن", "نحتاج",
]);

const MANDATE_KEYWORDS = [
  "buy box", "mandate", "criteria", "target", "looking for", "want to buy", "budget", "range",
  "risk appetite", "areas", "neighborhoods", "invest", "investment", "acquire", "acquisition",
  "ابي اشتري", "أبغى أشتري", "معايير", "تفويض", "ميزانية", "استثمار", "استحواذ", "مناطق",
];

const OPPORTUNITY_KEYWORDS = [
  "broker", "listing", "deal", "opportunity", "property", "villa", "apartment", "land", "building",
  "asking", "price", "sqm", "m2", "sent me", "worth", "screen this", "فيلا", "شقة", "أرض",
  "عمارة", "عقار", "وسيط", "عرض", "صفقة", "سعر", "متر",
];

const SCREENING_KEYWORDS = [
  "screen", "underwrite", "pursue", "pass", "watch", "worth it", "evaluate", "decision", "missing",
  "follow up", "draft reply", "broker reply", "حلل", "قيّم", "هل يستاهل", "نلاحق", "نرفض",
  "ناقص", "رد", "الوسيط",
];

const DOCUMENT_KEYWORDS = [
  "deed", "title deed", "listing pdf", "valuation", "photos", "photo", "floor plan", "survey",
  "document", "pdf", "image", "صك", "تقييم", "صور", "مخطط", "مستند", "ملف",
];

const KNOWN_LOCATIONS = [
  "riyadh", "jeddah", "khobar", "dammam", "makkah", "mecca", "madinah", "medina",
  "diriyah", "north riyadh", "الرياض", "جدة", "الخبر", "الدمام", "مكة", "المدينة", "الدرعية", "شمال الرياض",
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  const raw = normalizeText(value);
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `${hasPlus ? "+" : ""}${digits}` : "";
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

function listIncludesKeyword(text, keywords) {
  const lower = normalizeText(text).toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
}

function parseLocations(text) {
  const lower = normalizeText(text).toLowerCase();
  const tokens = tokenize(text);
  const fromKnown = KNOWN_LOCATIONS.filter((location) => lower.includes(location.toLowerCase()));
  const directional = tokens.filter((token) => /^(north|south|east|west|شمال|جنوب|شرق|غرب)$/i.test(token));
  return [...new Set([...fromKnown, ...directional])].slice(0, 6);
}

function parseBudgetRange(text) {
  const normalized = normalizeText(text).replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(m|mn|million|مليون|k|thousand|ألف|الف)?/gi)];
  const values = matches
    .map((match) => {
      const base = Number(match[1]);
      const unit = String(match[2] || "").toLowerCase();
      if (!Number.isFinite(base)) return null;
      if (["m", "mn", "million", "مليون"].includes(unit)) return base * 1_000_000;
      if (["k", "thousand", "ألف", "الف"].includes(unit)) return base * 1_000;
      return base;
    })
    .filter((value) => value && value >= 10_000)
    .slice(0, 4);
  if (!values.length) return {};
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    currency: /sar|ريال|ر\.س/i.test(normalized) ? "SAR" : "SAR",
  };
}

function parsePropertyType(text) {
  const lower = normalizeText(text).toLowerCase();
  if (/(villa|فيلا)/i.test(lower)) return "villa";
  if (/(apartment|flat|شقة)/i.test(lower)) return "apartment";
  if (/(land|plot|أرض|ارض)/i.test(lower)) return "land";
  if (/(building|عمارة|مبنى)/i.test(lower)) return "building";
  if (/(office|retail|commercial|مكتب|تجاري)/i.test(lower)) return "commercial";
  return "unknown";
}

function inferMaterialTypes(text, media = []) {
  const inferred = new Set();
  if (listIncludesKeyword(text, DOCUMENT_KEYWORDS)) inferred.add("source_document");
  if (/(photo|image|صور|صورة)/i.test(text)) inferred.add("photos");
  if (/(deed|title deed|صك)/i.test(text)) inferred.add("title_deed");
  if (/(valuation|تقييم)/i.test(text)) inferred.add("valuation");
  for (const item of Array.isArray(media) ? media : []) {
    const mime = normalizeText(item?.mime_type).toLowerCase();
    if (mime.startsWith("image/")) inferred.add("photos");
    if (mime.includes("pdf") || mime.includes("document") || mime.includes("word")) inferred.add("source_document");
  }
  return [...inferred];
}

function inferOpportunityKind(text) {
  if (listIncludesKeyword(text, MANDATE_KEYWORDS) && !listIncludesKeyword(text, OPPORTUNITY_KEYWORDS)) return "mandate";
  if (listIncludesKeyword(text, OPPORTUNITY_KEYWORDS)) return "property_submission";
  if (listIncludesKeyword(text, SCREENING_KEYWORDS)) return "screening_request";
  return "general_acquisition";
}

function computeMissingInfo({ materialTypes, propertyType, budgetRange, locations, textBody }) {
  const missing = [];
  if (!locations.length) missing.push("target_location");
  if (!budgetRange.min && !budgetRange.max) missing.push("budget_or_asking_price");
  if (propertyType === "unknown") missing.push("property_type");
  if (!materialTypes.includes("source_document") && normalizeText(textBody).length < 80) missing.push("source_document_or_listing_text");
  if (!materialTypes.includes("photos")) missing.push("photos");
  return [...new Set(missing)].slice(0, 6);
}

function computeScreeningRecommendation({ missingInfo, textBody, budgetRange }) {
  const lower = normalizeText(textBody).toLowerCase();
  if (missingInfo.length >= 3) return "insufficient_info";
  if (/(overpriced|too expensive|bad|reject|pass|ارفض|غالي|سيء)/i.test(lower)) return "pass";
  if (/(strong|good deal|below market|distressed|urgent sale|pursue|ممتاز|فرصة|نلاحق)/i.test(lower)) return "pursue";
  if (budgetRange.max && budgetRange.max > 0) return "watch";
  return "insufficient_info";
}

function computeConfidence({ missingInfo, materialTypes, locations }) {
  const score = 0.35 + Math.min(materialTypes.length, 3) * 0.12 + Math.min(locations.length, 2) * 0.08 - missingInfo.length * 0.06;
  return Math.max(0.15, Math.min(0.86, Number(score.toFixed(2))));
}

export function extractAcquisitionSignals(text, media = []) {
  const normalized = normalizeText(text);
  const propertyType = parsePropertyType(normalized);
  const locations = parseLocations(normalized);
  const budgetRange = parseBudgetRange(normalized);
  const materialTypes = inferMaterialTypes(normalized, media);
  const opportunityKind = inferOpportunityKind(normalized);
  const missingInfo = computeMissingInfo({ materialTypes, propertyType, budgetRange, locations, textBody: normalized });
  const recommendation = computeScreeningRecommendation({ missingInfo, textBody: normalized, budgetRange });
  const confidence = computeConfidence({ missingInfo, materialTypes, locations });

  return {
    opportunityKind,
    acquisitionFocus: opportunityKind === "mandate" ? "mandate_fit" : "screening",
    propertyType,
    locations,
    budgetRange,
    materialTypes,
    missingInfo,
    recommendation,
    confidence,
    tokens: tokenize(normalized).slice(0, 16),
  };
}

export function decideWhatsappMode({ textBody, hasMedia, conversation, workspaceSession }) {
  const text = normalizeText(textBody);
  const activeMode = WHATSAPP_MODES.has(conversation?.mode) ? conversation.mode : "mandate_intake";
  const hasWorkspace = Boolean(conversation?.active_workspace_id || workspaceSession?.workspace_id);

  if (hasMedia) {
    if (conversation?.awaiting_upload_kind && conversation.awaiting_upload_kind !== "none") {
      return { handled: true, mode: "diligence_followup", reason: "awaiting_upload" };
    }
    return { handled: true, mode: hasWorkspace ? "document_ingestion" : "opportunity_submission", reason: "media_submission" };
  }

  if (!text) {
    return { handled: true, mode: activeMode, reason: "empty_message" };
  }

  if (listIncludesKeyword(text, SCREENING_KEYWORDS)) {
    return { handled: true, mode: "screening", reason: "screening_keywords" };
  }
  if (listIncludesKeyword(text, MANDATE_KEYWORDS)) {
    return { handled: true, mode: "mandate_intake", reason: "mandate_keywords" };
  }
  if (listIncludesKeyword(text, OPPORTUNITY_KEYWORDS)) {
    return { handled: true, mode: "opportunity_submission", reason: "opportunity_keywords" };
  }
  if (hasWorkspace) {
    return { handled: true, mode: "workspace_coordination", reason: "workspace_context" };
  }
  return { handled: true, mode: activeMode, reason: "mandate_default" };
}

function humanize(language, value) {
  const labels = {
    insufficient_info: chooseCopy(language, "insufficient information", "معلومات غير كافية"),
    pursue: chooseCopy(language, "pursue", "متابعة"),
    watch: chooseCopy(language, "watch", "مراقبة"),
    pass: chooseCopy(language, "pass", "رفض"),
    source_document_or_listing_text: chooseCopy(language, "source document or listing text", "مستند المصدر أو نص الإعلان"),
    budget_or_asking_price: chooseCopy(language, "budget or asking price", "الميزانية أو السعر المطلوب"),
    target_location: chooseCopy(language, "target location", "الموقع المستهدف"),
    property_type: chooseCopy(language, "property type", "نوع العقار"),
    photos: chooseCopy(language, "photos", "الصور"),
  };
  return labels[value] || String(value || "").replace(/_/g, " ");
}

function buildOpportunityTitle(signals, textBody) {
  if (signals.propertyType !== "unknown" && signals.locations.length) {
    return `${signals.propertyType.replace(/_/g, " ")} · ${signals.locations[0]}`;
  }
  const first = normalizeText(textBody).split(/\s+/).slice(0, 8).join(" ");
  return first || "Acquisition opportunity";
}

function buildScreeningPayload(signals) {
  return {
    recommendation: signals.recommendation,
    confidence: signals.confidence,
    reasons: [
      signals.locations.length ? "Location signal captured." : "Location is not yet clear.",
      signals.budgetRange.max ? "Budget or asking price signal captured." : "Budget or asking price is missing.",
      signals.materialTypes.length ? "Source material is attached or referenced." : "Source material still needs to be attached.",
    ],
    evidence_backed_facts: {
      property_type: signals.propertyType,
      locations: signals.locations,
      budget_range: signals.budgetRange,
      material_types: signals.materialTypes,
    },
    assumptions: signals.missingInfo.length ? ["Recommendation is preliminary until missing information is resolved."] : [],
    missing_information: signals.missingInfo,
    next_action: signals.missingInfo.length ? "Request missing information from the broker or investor." : "Review scenario assumptions and decide whether to pursue.",
  };
}

function buildAcquisitionReply({ language, mode, workspace, signals }) {
  const screening = buildScreeningPayload(signals);
  const lines = [];
  if (mode === "mandate_intake") {
    lines.push(chooseCopy(language, "I captured this as an acquisition mandate.", "سجلت هذا كتفويض استحواذ."));
  } else {
    lines.push(chooseCopy(language, "I captured this as an acquisition opportunity.", "سجلت هذا كفرصة استحواذ."));
  }
  if (workspace?.name) {
    lines.push(chooseCopy(language, `Workspace: ${workspace.name}.`, `مساحة العمل: ${workspace.name}.`));
  }
  lines.push(
    chooseCopy(
      language,
      `Current screen: ${humanize(language, screening.recommendation)} (${Math.round(signals.confidence * 100)}% confidence).`,
      `الفرز الحالي: ${humanize(language, screening.recommendation)} (ثقة ${Math.round(signals.confidence * 100)}%).`,
    ),
  );
  if (signals.missingInfo.length) {
    lines.push(
      chooseCopy(
        language,
        `Missing next: ${signals.missingInfo.slice(0, 4).map((item) => humanize(language, item)).join(", ")}.`,
        `الناقص الآن: ${signals.missingInfo.slice(0, 4).map((item) => humanize(language, item)).join("، ")}.`,
      ),
    );
  }
  lines.push(
    chooseCopy(
      language,
      "I will keep facts, assumptions, and evidence labels separate before any decision.",
      "سأفصل الحقائق والافتراضات وتسميات الأدلة قبل أي قرار.",
    ),
  );
  return lines.join("\n\n");
}

function buildBrokerDraft(language, signals) {
  const missing = signals.missingInfo.slice(0, 4).map((item) => humanize(language, item));
  if (!missing.length) {
    return chooseCopy(
      language,
      "Draft reply: Thanks, we have enough to start screening. Please confirm whether there are any title, occupancy, or pricing constraints we should know before a serious review.",
      "مسودة الرد: شكرًا، لدينا ما يكفي لبدء الفرز. فضلاً أكد إذا كان هناك أي قيود على الصك أو الإشغال أو السعر قبل المراجعة الجادة.",
    );
  }
  return chooseCopy(
    language,
    `Draft reply: Thanks for sending this. Before we screen seriously, please share: ${missing.join(", ")}.`,
    `مسودة الرد: شكرًا على الإرسال. قبل الفرز الجاد، فضلاً أرسل: ${missing.join("، ")}.`,
  );
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
  if (error || !data) throw new Error(`Failed to upsert WhatsApp conversation: ${error?.message || "unknown"}`);
  return data;
}

async function insertConversationEvent(supabase, payload) {
  const { data, error } = await supabase
    .from("whatsapp_conversation_events")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to insert WhatsApp conversation event: ${error?.message || "unknown"}`);
  return data;
}

async function loadWorkspaceSummary(supabase, workspaceId) {
  if (!workspaceId) return null;
  const { data, error } = await supabase
    .from("workspaces")
    .select("id,name,description,analysis_brief,preparation_status")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load workspace summary: ${error.message}`);
  return data || null;
}

async function createOrUpdateMandate(supabase, { workspaceId, userId, phoneNumber, textBody, signals }) {
  const query = supabase
    .from("acquisition_mandates")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);
  const scoped = workspaceId ? query.eq("workspace_id", workspaceId) : query.eq("buy_box_json->>phone_number", phoneNumber);
  const { data: existing, error: existingError } = await scoped.maybeSingle();
  if (existingError) throw new Error(`Failed to load acquisition mandate: ${existingError.message}`);

  const payload = {
    workspace_id: workspaceId,
    user_id: userId,
    status: "active",
    title: signals.locations[0] ? `Mandate · ${signals.locations[0]}` : "Acquisition mandate",
    buy_box_json: {
      ...(existing?.buy_box_json && typeof existing.buy_box_json === "object" ? existing.buy_box_json : {}),
      phone_number: phoneNumber,
      latest_text: textBody,
      property_type: signals.propertyType,
      material_types: signals.materialTypes,
    },
    target_locations_json: signals.locations,
    budget_range_json: signals.budgetRange,
    risk_appetite: null,
    excluded_criteria_json: existing?.excluded_criteria_json || [],
    confidence_json: { mandate: signals.confidence },
  };

  const request = existing?.id
    ? supabase.from("acquisition_mandates").update(payload).eq("id", existing.id)
    : supabase.from("acquisition_mandates").insert(payload);
  const { data, error } = await request.select("*").single();
  if (error || !data) throw new Error(`Failed to save acquisition mandate: ${error?.message || "unknown"}`);
  return data;
}

async function createOrUpdateOpportunity(supabase, { conversationId, workspaceId, phoneNumber, textBody, signals }) {
  const query = supabase
    .from("acquisition_opportunities")
    .select("*")
    .eq("phone_number", phoneNumber)
    .order("updated_at", { ascending: false })
    .limit(1);
  const scoped = workspaceId ? query.eq("workspace_id", workspaceId) : query.eq("originating_conversation_id", conversationId);
  const { data: existing, error: existingError } = await scoped.maybeSingle();
  if (existingError) throw new Error(`Failed to load acquisition opportunity: ${existingError.message}`);

  const screening = buildScreeningPayload(signals);
  const payload = {
    phone_number: phoneNumber,
    originating_conversation_id: conversationId,
    workspace_id: workspaceId,
    property_id: null,
    surface_key: null,
    stage: signals.recommendation === "insufficient_info" ? "needs_info" : signals.recommendation,
    source_channel: "whatsapp",
    result_source: workspaceId ? "zohal_native" : null,
    current_intent: textBody || null,
    budget_band: signals.budgetRange.max ? `${signals.budgetRange.min || signals.budgetRange.max}-${signals.budgetRange.max} SAR` : null,
    area_summary: signals.locations.join(", ") || null,
    financing_status: null,
    viewing_readiness: null,
    assigned_operator_id: null,
    title: buildOpportunityTitle(signals, textBody),
    summary: screening.next_action,
    metadata_json: {
      latest_message: textBody,
      screening,
      broker_draft: buildBrokerDraft("en", signals),
      property_type: signals.propertyType,
      material_types: signals.materialTypes,
      locations: signals.locations,
    },
    living_interface_inquiry_id: null,
    opportunity_kind: signals.opportunityKind,
    acquisition_focus: signals.acquisitionFocus,
    screening_readiness: signals.missingInfo.length ? "needs_info" : "screened",
    missing_info_json: signals.missingInfo,
  };

  const request = existing?.id
    ? supabase.from("acquisition_opportunities").update(payload).eq("id", existing.id)
    : supabase.from("acquisition_opportunities").insert(payload);
  const { data, error } = await request.select("*").single();
  if (error || !data) throw new Error(`Failed to save acquisition opportunity: ${error?.message || "unknown"}`);
  return data;
}

async function createOrUpdateAcquisitionThread(supabase, { opportunityId, workspaceId, threadKind, title, summary, metadata }) {
  if (!opportunityId || !workspaceId) return null;
  const { data: existing, error: existingError } = await supabase
    .from("acquisition_threads")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .eq("thread_kind", threadKind)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to load acquisition thread: ${existingError.message}`);
  const payload = {
    opportunity_id: opportunityId,
    workspace_id: workspaceId,
    thread_kind: threadKind,
    status: "active",
    title,
    summary,
    metadata_json: metadata || {},
  };
  const request = existing?.id
    ? supabase.from("acquisition_threads").update(payload).eq("id", existing.id)
    : supabase.from("acquisition_threads").insert(payload);
  const { data, error } = await request.select("*").single();
  if (error || !data) throw new Error(`Failed to save acquisition thread: ${error?.message || "unknown"}`);
  return data;
}

async function insertAcquisitionEvent(supabase, payload) {
  const { data, error } = await supabase
    .from("acquisition_events")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to insert acquisition event: ${error?.message || "unknown"}`);
  return data;
}

async function ensureAcquisitionArtifacts(supabase, { opportunity, signals, workspaceId }) {
  if (!opportunity?.id) return;
  const screening = buildScreeningPayload(signals);
  const claimRows = [
    ["property_type", signals.propertyType, signals.propertyType === "unknown" ? "uncertain" : "counterparty_provided"],
    ["locations", signals.locations, signals.locations.length ? "counterparty_provided" : "uncertain"],
    ["budget_range", signals.budgetRange, signals.budgetRange.max ? "counterparty_provided" : "uncertain"],
    ["screening_recommendation", screening.recommendation, "modeled_output"],
  ].map(([factKey, value, basis]) => ({
    opportunity_id: opportunity.id,
    workspace_id: workspaceId,
    fact_key: factKey,
    value_json: { value },
    basis_label: basis,
    confidence: signals.confidence,
    source_channel: "whatsapp",
    evidence_refs_json: [],
  }));

  await supabase.from("acquisition_claims").insert(claimRows);
  await supabase.from("acquisition_scenarios").insert({
    opportunity_id: opportunity.id,
    workspace_id: workspaceId,
    scenario_kind: "base",
    title: "Base scenario",
    assumptions_json: {
      budget_range: signals.budgetRange,
      missing_information: signals.missingInfo,
    },
    outputs_json: {
      recommendation: signals.recommendation,
      confidence: signals.confidence,
    },
    editable: true,
  });

  if (signals.missingInfo.length) {
    await supabase.from("acquisition_diligence_items").insert(
      signals.missingInfo.map((item) => ({
        opportunity_id: opportunity.id,
        workspace_id: workspaceId,
        title: humanize("en", item),
        item_type: "missing_info",
        priority: item === "budget_or_asking_price" || item === "source_document_or_listing_text" ? "high" : "medium",
        status: "open",
        owner_kind: "broker",
        evidence_refs_json: [],
      })),
    );
  }
}

function buildImportRequest({ body, conversation, workspaceSession }) {
  const activeWorkspaceId = normalizeUuid(conversation?.active_workspace_id || workspaceSession?.workspace_id);
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

async function handleAcquisitionRoute({ supabase, conversation, body, language, signals, route, workspaceSession }) {
  const workspaceId = normalizeUuid(conversation.active_workspace_id || workspaceSession?.workspace_id);
  const workspace = await loadWorkspaceSummary(supabase, workspaceId);
  const userId = normalizeUuid(conversation.linked_profile_id || workspaceSession?.user_id);
  const textBody = normalizeText(body.text_body);
  const phoneNumber = normalizePhone(body.phone_number);

  const mandate = route.mode === "mandate_intake"
    ? await createOrUpdateMandate(supabase, { workspaceId, userId, phoneNumber, textBody, signals })
    : null;

  const opportunity = route.mode === "mandate_intake"
    ? null
    : await createOrUpdateOpportunity(supabase, {
        conversationId: conversation.id,
        workspaceId,
        phoneNumber,
        textBody,
        signals,
      });

  if (opportunity?.id) {
    await ensureAcquisitionArtifacts(supabase, { opportunity, signals, workspaceId });
  }

  const thread = opportunity?.id && workspaceId
    ? await createOrUpdateAcquisitionThread(supabase, {
        opportunityId: opportunity.id,
        workspaceId,
        threadKind: route.mode === "screening" ? "screening" : "broker",
        title: buildOpportunityTitle(signals, textBody),
        summary: textBody || null,
        metadata: { recommendation: signals.recommendation, confidence: signals.confidence },
      })
    : null;

  if (opportunity?.id && workspaceId) {
    await insertAcquisitionEvent(supabase, {
      opportunity_id: opportunity.id,
      acquisition_thread_id: thread?.id || null,
      workspace_id: workspaceId,
      event_type: route.mode,
      event_direction: "inbound",
      body_text: textBody || null,
      media_json: body.media || [],
      event_payload: buildScreeningPayload(signals),
    });
  }

  const nextConversation = await upsertConversation(supabase, {
    id: conversation.id,
    channel: "whatsapp",
    phone_number: phoneNumber,
    mode: route.mode,
    language,
    active_workspace_id: workspaceId,
    active_opportunity_id: opportunity?.id || conversation.active_opportunity_id || null,
    active_acquisition_thread_id: thread?.id || conversation.active_acquisition_thread_id || null,
    awaiting_upload_kind: "none",
    linked_profile_id: conversation.linked_profile_id || userId,
    last_user_goal: textBody || conversation.last_user_goal || null,
    state_json: {
      ...(conversation.state_json || {}),
      active_mandate_id: mandate?.id || conversation.state_json?.active_mandate_id || null,
      active_opportunity_id: opportunity?.id || conversation.active_opportunity_id || null,
      active_acquisition_thread_id: thread?.id || conversation.active_acquisition_thread_id || null,
      acquisition_signals: signals,
    },
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });

  return {
    mode: route.mode,
    conversation: nextConversation,
    side_effects: [
      mandate?.id ? "mandate_saved" : null,
      opportunity?.id ? "opportunity_saved" : null,
      signals.missingInfo.length ? "diligence_items_created" : null,
    ].filter(Boolean),
    outbound_messages: [{
      type: "text",
      body: [
        buildAcquisitionReply({ language, mode: route.mode, workspace, signals }),
        route.mode === "screening" || signals.missingInfo.length ? buildBrokerDraft(language, signals) : null,
      ].filter(Boolean).join("\n\n"),
    }],
    crm_updates: opportunity ? { opportunity_id: opportunity.id, acquisition_thread_id: thread?.id || null } : null,
    import_request: null,
  };
}

async function handleDocumentIngestion({ supabase, conversation, body, language, workspaceSession }) {
  const importRequest = buildImportRequest({ body, conversation, workspaceSession });
  if (!importRequest) {
    return {
      mode: "document_ingestion",
      conversation,
      side_effects: ["media_missing_import_context"],
      outbound_messages: [{
        type: "text",
        body: chooseCopy(
          language,
          "I need a linked workspace before I can import that file into the acquisition workspace.",
          "أحتاج مساحة عمل مرتبطة قبل أن أستورد الملف داخل مساحة الاستحواذ.",
        ),
      }],
      crm_updates: null,
      import_request: null,
    };
  }
  const nextConversation = await upsertConversation(supabase, {
    ...conversation,
    mode: "document_ingestion",
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });
  return {
    mode: "document_ingestion",
    conversation: nextConversation,
    side_effects: ["import_requested"],
    outbound_messages: [],
    crm_updates: null,
    import_request: importRequest,
  };
}

async function orchestrateWhatsappMessage({ supabase, body }) {
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
        mode: body.conversation_snapshot?.mode || "mandate_intake",
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
    mode: "mandate_intake",
    language: detectLanguageFromText(body.text_body, "auto"),
    active_workspace_id: normalizeUuid(workspaceSession?.workspace_id),
    active_opportunity_id: null,
    active_acquisition_thread_id: null,
    awaiting_upload_kind: "none",
    linked_profile_id: normalizeUuid(workspaceSession?.user_id),
    last_user_goal: null,
    state_json: {},
    last_inbound_message_id: null,
    last_message_at: null,
  });

  const textBody = normalizeText(body.text_body);
  const language = detectLanguageFromText(textBody, seededConversation.language);
  const hasMedia = Array.isArray(body.media) && body.media.length > 0;
  const signals = extractAcquisitionSignals(textBody, body.media || []);

  const inboundEvent = await insertConversationEvent(supabase, {
    conversation_id: seededConversation.id,
    workspace_id: normalizeUuid(seededConversation.active_workspace_id || workspaceSession?.workspace_id),
    opportunity_id: normalizeUuid(seededConversation.state_json?.active_opportunity_id || seededConversation.active_opportunity_id),
    acquisition_thread_id: normalizeUuid(seededConversation.state_json?.active_acquisition_thread_id || seededConversation.active_acquisition_thread_id),
    event_type: hasMedia ? "inbound_media" : "inbound_text",
    event_direction: "inbound",
    message_id: messageId,
    result_source: null,
    event_payload: {
      text_body: textBody || null,
      media: body.media || [],
      timestamp: body.timestamp || null,
      message_type: body.message_type || null,
      acquisition_signals: signals,
    },
  });

  const route = decideWhatsappMode({ textBody, hasMedia, conversation: seededConversation, workspaceSession });

  const result = route.mode === "document_ingestion"
    ? await handleDocumentIngestion({ supabase, conversation: seededConversation, body, language, workspaceSession })
    : await handleAcquisitionRoute({ supabase, conversation: seededConversation, body, language, signals, route, workspaceSession });

  for (const outbound of result.outbound_messages || []) {
    await insertConversationEvent(supabase, {
      conversation_id: result.conversation.id,
      workspace_id: normalizeUuid(result.conversation.active_workspace_id),
      opportunity_id: normalizeUuid(result.conversation.state_json?.active_opportunity_id || result.conversation.active_opportunity_id),
      acquisition_thread_id: normalizeUuid(result.conversation.state_json?.active_acquisition_thread_id || result.conversation.active_acquisition_thread_id),
      event_type: "outbound_text",
      event_direction: "outbound",
      message_id: null,
      result_source: null,
      event_payload: { body: outbound.body, type: outbound.type },
    });
  }

  return {
    handled: true,
    mode: result.mode,
    conversation_updates: {
      conversation_id: result.conversation.id,
      inbound_event_id: inboundEvent.id,
      mode: result.conversation.mode,
      language: result.conversation.language,
      active_workspace_id: result.conversation.active_workspace_id,
      active_opportunity_id: result.conversation.active_opportunity_id,
      active_acquisition_thread_id: result.conversation.active_acquisition_thread_id,
      awaiting_upload_kind: result.conversation.awaiting_upload_kind,
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
    const response = await orchestrateWhatsappMessage({ supabase, body, requestId, log });
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
