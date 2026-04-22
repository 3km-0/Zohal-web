import { requireInternalCaller } from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient } from "../runtime/supabase.js";

const WHATSAPP_MODES = new Set([
  "discovery",
  "property_context",
  "project_intake",
  "workspace_context",
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
  "to",
  "for",
  "with",
  "in",
  "at",
  "of",
  "and",
  "or",
  "on",
  "this",
  "that",
  "it",
  "we",
  "you",
  "our",
  "need",
  "want",
  "help",
  "please",
  "can",
  "could",
  "project",
  "job",
  "renovation",
  "remodel",
  "work",
  "ابي",
  "ابغى",
  "أبي",
  "أبغى",
  "اريد",
  "أريد",
  "محتاج",
  "احتاج",
  "أحتاج",
  "هذا",
  "هذه",
  "في",
  "على",
  "من",
  "الى",
  "إلى",
  "مع",
  "عن",
  "لو",
  "سمحت",
  "ممكن",
  "نحتاج",
  "مشروع",
  "شغل",
  "ترميم",
]);

const PROJECT_INTAKE_KEYWORDS = [
  "renovate",
  "renovation",
  "remodel",
  "fit out",
  "fit-out",
  "fitout",
  "contractor",
  "boq",
  "drawing",
  "drawings",
  "quote",
  "quotation",
  "scope",
  "permit",
  "approval",
  "variation",
  "change order",
  "revised",
  "revision",
  "missing",
  "explain this quote",
  "kitchen",
  "bathroom",
  "villa",
  "office",
  "site photos",
  "ترميم",
  "تشطيب",
  "تجديد",
  "مقاول",
  "مقاولات",
  "مخطط",
  "مخططات",
  "رسومات",
  "مقايسة",
  "عرض سعر",
  "تسعيرة",
  "نطاق",
  "تصريح",
  "اعتماد",
  "اعتمادات",
  "مراجعة",
  "تعديل",
  "تغييرات",
  "مفقود",
  "ما الناقص",
];

const WORKSPACE_CONTEXT_KEYWORDS = [
  "latest version",
  "what changed",
  "change",
  "changed",
  "compare",
  "revision",
  "revised",
  "missing",
  "exclude",
  "excluded",
  "included",
  "quote",
  "boq",
  "scope",
  "permit",
  "approval",
  "variation",
  "continue",
  "continue the permit",
  "show me the latest",
  "latest drawing",
  "latest boq",
  "آخر نسخة",
  "آخر إصدار",
  "وش تغير",
  "ما تغير",
  "قارن",
  "مقارنة",
  "مراجعة",
  "تعديل",
  "ناقص",
  "استبعاد",
  "مشمول",
  "غير مشمول",
  "عرض السعر",
  "المقايسة",
  "النطاق",
  "التصريح",
  "الاعتماد",
  "التغيير",
  "كمل",
  "كمّل",
];

const PROGRESSION_KEYWORDS = [
  "permit",
  "submit",
  "submission",
  "approval",
  "operator",
  "review",
  "handoff",
  "escalate",
  "variation",
  "claim",
  "evidence",
  "site visit",
  "inspect",
  "urgent",
  "تصريح",
  "اعتماد",
  "اعتمادات",
  "مراجعة",
  "مشغل",
  "المشغل",
  "تصعيد",
  "تسليم",
  "مطالبة",
  "أدلة",
  "ادلة",
  "زيارة موقع",
  "مستعجل",
  "عاجل",
];

const DRAWING_KEYWORDS = ["drawing", "drawings", "plan", "plans", "elevation", "layout", "مخطط", "مخططات", "رسومات"];
const BOQ_KEYWORDS = ["boq", "bill of quantities", "bill quantities", "مقايسة", "كميات"];
const QUOTE_KEYWORDS = ["quote", "quotation", "pricing", "عرض سعر", "تسعيرة", "سعر"];
const PERMIT_DOC_KEYWORDS = ["permit", "approval", "license", "submission", "تصريح", "اعتماد", "رخصة"];
const SITE_PHOTO_KEYWORDS = ["photo", "photos", "site photo", "site photos", "image", "images", "صورة", "صور", "صور الموقع"];
const CHANGE_EVIDENCE_KEYWORDS = ["variation", "change", "revised", "revision", "claim", "evidence", "تغيير", "تعديل", "مراجعة", "أدلة", "ادلة"];
const VOICE_NOTE_KEYWORDS = ["voice", "voice note", "audio", "صوت", "ملاحظة صوتية", "رسالة صوتية"];

const DEFAULT_MISSING_ITEMS = {
  renovation: ["drawings", "site_photos", "scope_boundaries"],
  fit_out: ["drawings", "boq", "material_selections"],
  permit_support: ["permit_docs", "drawings", "site_photos"],
  variation_review: ["change_evidence", "revised_drawings", "prior_scope"],
  quote_explanation: ["quote_docs", "drawings", "scope_boundaries"],
  general_contracting: ["drawings", "site_photos", "project_brief"],
};

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

function findFirstKeyword(text, keywords) {
  const lower = normalizeText(text).toLowerCase();
  return keywords.find((keyword) => lower.includes(keyword.toLowerCase())) || null;
}

function parseLocationHints(text) {
  const tokens = tokenize(text);
  const knownCities = [
    "riyadh",
    "jeddah",
    "khobar",
    "dammam",
    "mecca",
    "makkah",
    "medina",
    "madinah",
    "الرياض",
    "جدة",
    "الخبر",
    "الدمام",
    "مكة",
    "المدينة",
  ];
  return [...new Set(tokens.filter((token) => knownCities.includes(token)).slice(0, 4))];
}

function parseProjectKind(text) {
  const lower = normalizeText(text).toLowerCase();
  if (/(permit|approval|submission|تصريح|اعتماد|رخصة)/i.test(lower)) return "permit_support";
  if (/(variation|change order|claim|evidence|تغيير|مطالبة|أدلة|ادلة)/i.test(lower)) return "variation_review";
  if (/(quote|quotation|pricing|عرض سعر|تسعيرة)/i.test(lower)) return "quote_explanation";
  if (/(fit out|fit-out|fitout|تشطيب|تجهيز مكتب|تأثيث)/i.test(lower)) return "fit_out";
  if (/(renovate|renovation|remodel|ترميم|تجديد)/i.test(lower)) return "renovation";
  return "general_contracting";
}

function parseAssetType(text) {
  const lower = normalizeText(text).toLowerCase();
  if (/(office|commercial|retail|warehouse|مكتب|تجاري|محل|مستودع)/i.test(lower)) return "commercial";
  if (/(villa|apartment|flat|house|kitchen|bathroom|فيلا|شقة|منزل|مطبخ|حمام)/i.test(lower)) return "residential";
  return "unknown";
}

function parseProjectStage(text) {
  const lower = normalizeText(text).toLowerCase();
  if (/(revised|revision|variation|change|updated|آخر نسخة|تعديل|تغيير|مراجعة)/i.test(lower)) return "active_update";
  if (/(permit|approval|submission|تصريح|اعتماد)/i.test(lower)) return "permit_flow";
  if (/(quote|quotation|pricing|عرض سعر|تسعيرة)/i.test(lower)) return "quote_review";
  if (/(urgent|asap|today|tomorrow|مستعجل|عاجل|اليوم|بكرة|غدًا)/i.test(lower)) return "urgent";
  return "new_intake";
}

function parseUrgency(text) {
  const lower = normalizeText(text).toLowerCase();
  if (/(urgent|asap|today|tomorrow|this week|مستعجل|عاجل|اليوم|بكرة|غدًا|هذا الأسبوع)/i.test(lower)) return "high";
  return "normal";
}

function inferMaterialTypes(text, media = []) {
  const inferred = new Set();
  if (listIncludesKeyword(text, DRAWING_KEYWORDS)) inferred.add("drawings");
  if (listIncludesKeyword(text, BOQ_KEYWORDS)) inferred.add("boq");
  if (listIncludesKeyword(text, QUOTE_KEYWORDS)) inferred.add("quote_docs");
  if (listIncludesKeyword(text, PERMIT_DOC_KEYWORDS)) inferred.add("permit_docs");
  if (listIncludesKeyword(text, SITE_PHOTO_KEYWORDS)) inferred.add("site_photos");
  if (listIncludesKeyword(text, CHANGE_EVIDENCE_KEYWORDS)) inferred.add("change_evidence");
  if (listIncludesKeyword(text, VOICE_NOTE_KEYWORDS)) inferred.add("voice_notes");

  for (const item of Array.isArray(media) ? media : []) {
    const mime = normalizeText(item?.mime_type).toLowerCase();
    if (!mime) continue;
    if (mime.startsWith("image/")) inferred.add("site_photos");
    if (mime.startsWith("audio/")) inferred.add("voice_notes");
    if (mime.includes("pdf") || mime.includes("document") || mime.includes("word")) {
      inferred.add("quote_docs");
    }
  }

  return [...inferred];
}

function determineWorkflowFocus(text, projectKind, materialTypes) {
  if (projectKind === "permit_support") return "permit_support";
  if (projectKind === "variation_review") return "variation_review";
  if (projectKind === "quote_explanation") return "quote_explanation";
  if (materialTypes.includes("boq") || materialTypes.includes("quote_docs")) return "scope_alignment";
  if (materialTypes.includes("drawings") || materialTypes.includes("site_photos")) return "workspace_setup";
  return "project_intake";
}

function computeMissingItems({ projectKind, materialTypes, assetType, stage }) {
  const baseline = DEFAULT_MISSING_ITEMS[projectKind] || DEFAULT_MISSING_ITEMS.general_contracting;
  const missing = baseline.filter((item) => !materialTypes.includes(item));

  if (assetType === "commercial" && !materialTypes.includes("drawings")) {
    missing.push("dimensions");
  }
  if (stage === "active_update" && !materialTypes.includes("change_evidence")) {
    missing.push("change_evidence");
  }
  return [...new Set(missing)];
}

function computeWorkspaceReadiness({ linkedWorkspaceId, materialTypes, textBody, projectKind }) {
  if (linkedWorkspaceId) return "linked_workspace";
  if (materialTypes.length >= 2) return "ready_to_route";
  if (projectKind === "permit_support" || projectKind === "variation_review") return "needs_more_context";
  if (normalizeText(textBody).length >= 20) return "draft_ready";
  return "needs_more_context";
}

export function extractProjectSignals(text, media = []) {
  const normalized = normalizeText(text);
  const projectKind = parseProjectKind(normalized);
  const assetType = parseAssetType(normalized);
  const stage = parseProjectStage(normalized);
  const urgency = parseUrgency(normalized);
  const locationHints = parseLocationHints(normalized);
  const materialTypes = inferMaterialTypes(normalized, media);
  const workflowFocus = determineWorkflowFocus(normalized, projectKind, materialTypes);
  const tokens = tokenize(normalized).slice(0, 12);

  return {
    projectKind,
    assetType,
    stage,
    urgency,
    locationHints,
    materialTypes,
    workflowFocus,
    tokens,
  };
}

function detectProgressionUploadKind(text, media = []) {
  if (listIncludesKeyword(text, DRAWING_KEYWORDS)) return "drawings";
  if (listIncludesKeyword(text, BOQ_KEYWORDS)) return "boq";
  if (listIncludesKeyword(text, QUOTE_KEYWORDS)) return "quote_docs";
  if (listIncludesKeyword(text, PERMIT_DOC_KEYWORDS)) return "permit_docs";
  if (listIncludesKeyword(text, SITE_PHOTO_KEYWORDS)) return "site_photos";
  if (listIncludesKeyword(text, CHANGE_EVIDENCE_KEYWORDS)) return "change_evidence";
  if (listIncludesKeyword(text, VOICE_NOTE_KEYWORDS)) return "voice_notes";
  if (Array.isArray(media) && media.some((item) => normalizeText(item?.mime_type).toLowerCase().startsWith("image/"))) {
    return "site_photos";
  }
  return "none";
}

export function decideWhatsappMode({
  textBody,
  hasMedia,
  conversation,
  workspaceSession,
}) {
  const text = normalizeText(textBody);
  const activeMode = WHATSAPP_MODES.has(conversation?.mode) ? conversation.mode : "project_intake";

  if (hasMedia) {
    if (conversation?.awaiting_upload_kind && conversation.awaiting_upload_kind !== "none") {
      return { handled: true, mode: "progression", reason: "awaiting_upload" };
    }
    if (conversation?.linked_workspace_id || workspaceSession?.workspace_id) {
      return { handled: true, mode: "document_ingestion", reason: "workspace_bound_media" };
    }
    return { handled: true, mode: activeMode, reason: "media_without_workspace" };
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
    (conversation?.linked_workspace_id || workspaceSession?.workspace_id) &&
    (listIncludesKeyword(text, WORKSPACE_CONTEXT_KEYWORDS) || activeMode === "workspace_context")
  ) {
    return { handled: true, mode: "workspace_context", reason: "workspace_context_keywords" };
  }

  if (listIncludesKeyword(text, PROJECT_INTAKE_KEYWORDS)) {
    return { handled: true, mode: "project_intake", reason: "project_intake_keywords" };
  }

  if (workspaceSession?.workspace_id) {
    return { handled: false, mode: null, reason: "legacy_workspace_text" };
  }

  return { handled: true, mode: activeMode, reason: "project_default" };
}

function buildProjectTitle(signals) {
  const parts = [];
  if (signals.assetType && signals.assetType !== "unknown") parts.push(signals.assetType);
  parts.push(signals.projectKind);
  return parts.filter(Boolean).join("_");
}

function humanizeMissingItem(language, item) {
  const labels = {
    drawings: chooseCopy(language, "drawings", "المخططات"),
    boq: chooseCopy(language, "BOQ", "المقايسة"),
    quote_docs: chooseCopy(language, "quote or pricing file", "عرض السعر أو ملف التسعير"),
    permit_docs: chooseCopy(language, "permit documents", "مستندات التصريح"),
    site_photos: chooseCopy(language, "site photos", "صور الموقع"),
    change_evidence: chooseCopy(language, "change evidence", "أدلة التغيير"),
    dimensions: chooseCopy(language, "dimensions", "الأبعاد"),
    material_selections: chooseCopy(language, "material selections", "اختيارات المواد"),
    scope_boundaries: chooseCopy(language, "scope boundaries", "حدود النطاق"),
    revised_drawings: chooseCopy(language, "revised drawings", "المخططات المعدلة"),
    prior_scope: chooseCopy(language, "prior approved scope", "النطاق السابق المعتمد"),
    project_brief: chooseCopy(language, "brief project note", "ملخص قصير للمشروع"),
  };
  return labels[item] || item;
}

function humanizeStage(language, stage) {
  const labels = {
    new_intake: chooseCopy(language, "new intake", "بداية مشروع"),
    active_update: chooseCopy(language, "active update", "تحديث على مشروع قائم"),
    permit_flow: chooseCopy(language, "permit flow", "مسار تصريح"),
    quote_review: chooseCopy(language, "quote review", "مراجعة عرض سعر"),
    urgent: chooseCopy(language, "urgent follow-up", "متابعة عاجلة"),
  };
  return labels[stage] || stage;
}

function humanizeWorkflow(language, workflowFocus) {
  const labels = {
    project_intake: chooseCopy(language, "project intake", "بدء المشروع"),
    scope_alignment: chooseCopy(language, "scope alignment", "مواءمة النطاق"),
    quote_explanation: chooseCopy(language, "quote explanation", "شرح عرض السعر"),
    permit_support: chooseCopy(language, "permit support", "دعم التصريح"),
    variation_review: chooseCopy(language, "variation review", "مراجعة التغيير"),
    workspace_setup: chooseCopy(language, "workspace setup", "تهيئة مساحة العمل"),
  };
  return labels[workflowFocus] || workflowFocus;
}

function buildProjectIntakeReply({ language, workspace, signals, missingItems, workspaceReadiness }) {
  const summary = [];
  summary.push(
    chooseCopy(
      language,
      `I understand this as a ${humanizeWorkflow(language, signals.workflowFocus)} request for a ${signals.assetType === "unknown" ? "project" : signals.assetType} ${signals.projectKind.replace(/_/g, " ")}.`,
      `أفهم هذا كطلب ${humanizeWorkflow(language, signals.workflowFocus)} لمشروع ${signals.projectKind.replace(/_/g, " ")} ${signals.assetType === "unknown" ? "" : signals.assetType === "commercial" ? "تجاري" : "سكني"}.`,
    ),
  );

  if (signals.locationHints.length) {
    summary.push(
      chooseCopy(
        language,
        `Location hints: ${signals.locationHints.join(", ")}.`,
        `مؤشرات الموقع: ${signals.locationHints.join("، ")}.`,
      ),
    );
  }

  summary.push(
    chooseCopy(
      language,
      `Current stage looks like ${humanizeStage(language, signals.stage)}.`,
      `المرحلة الحالية تبدو ${humanizeStage(language, signals.stage)}.`,
    ),
  );

  if (workspace?.name) {
    summary.push(
      chooseCopy(
        language,
        `I can keep working inside the workspace "${workspace.name}" and attach new materials there.`,
        `أقدر أكمل داخل مساحة العمل "${workspace.name}" وأربط المواد الجديدة بها.`,
      ),
    );
  } else {
    summary.push(
      chooseCopy(
        language,
        workspaceReadiness === "ready_to_route" || workspaceReadiness === "draft_ready"
          ? "There is enough context to draft a useful workspace lane once the core files land."
          : "We can keep this moving without heavy intake first, then tighten the workspace once the core files arrive.",
        workspaceReadiness === "ready_to_route" || workspaceReadiness === "draft_ready"
          ? "فيه سياق كافٍ لبدء مسار مساحة عمل مفيد بمجرد وصول الملفات الأساسية."
          : "نقدر نمشي بالمشروع بدون استمارة ثقيلة أولاً، ثم نثبّت مساحة العمل بعد وصول الملفات الأساسية.",
      ),
    );
  }

  if (missingItems.length) {
    const missing = missingItems.slice(0, 3).map((item) => humanizeMissingItem(language, item)).join(language === "ar" ? "، " : ", ");
    summary.push(
      chooseCopy(
        language,
        `Most useful next items: ${missing}.`,
        `أكثر العناصر فائدة الآن: ${missing}.`,
      ),
    );
  }

  summary.push(
    chooseCopy(
      language,
      "If you want, send drawings, BOQ, quote, site photos, or revised files and I’ll organize the next step around them.",
      "إذا أردت، أرسل المخططات أو المقايسة أو عرض السعر أو صور الموقع أو النسخ المعدلة وسأرتب الخطوة التالية حولها.",
    ),
  );

  return summary.join("\n\n");
}

function buildWorkspaceContextReply({ language, workspace, signals, missingItems }) {
  const lines = [];
  if (workspace?.name) {
    lines.push(
      chooseCopy(
        language,
        `Continuing inside workspace "${workspace.name}".`,
        `نكمل داخل مساحة العمل "${workspace.name}".`,
      ),
    );
  }

  lines.push(
    chooseCopy(
      language,
      `Primary lane right now: ${humanizeWorkflow(language, signals.workflowFocus)}.`,
      `المسار الأهم الآن: ${humanizeWorkflow(language, signals.workflowFocus)}.`,
    ),
  );

  if (missingItems.length) {
    lines.push(
      chooseCopy(
        language,
        `Still likely missing: ${missingItems.slice(0, 3).map((item) => humanizeMissingItem(language, item)).join(", ")}.`,
        `ما يزال غالبًا ناقصًا: ${missingItems.slice(0, 3).map((item) => humanizeMissingItem(language, item)).join("، ")}.`,
      ),
    );
  }

  lines.push(
    chooseCopy(
      language,
      "You can ask me what changed, what is excluded, what is still missing, or continue the permit / quote / revision flow.",
      "تقدر تسألني ما الذي تغيّر، وما المستبعد، وما الذي ما يزال ناقصًا، أو نكمل مسار التصريح أو عرض السعر أو المراجعة.",
    ),
  );
  return lines.join("\n\n");
}

function buildProgressionReply({ language, uploadKind, stage }) {
  if (uploadKind !== "none") {
    return chooseCopy(
      language,
      `Understood. Send the ${humanizeMissingItem(language, uploadKind)} here and I’ll attach them to the project case and update the workspace lane.`,
      `تمام. أرسل ${humanizeMissingItem(language, uploadKind)} هنا وسأربطها بملف المشروع وأحدث مسار مساحة العمل.`,
    );
  }

  return chooseCopy(
    language,
    `I opened this as a project case in ${stage.replace(/_/g, " ")} mode. I can help next with scope clarification, quote review, permit support, variation evidence, or operator follow-up.`,
    `فتحت هذا كحالة مشروع في وضع ${stage.replace(/_/g, " ")}. أقدر أساعدك الآن في توضيح النطاق أو مراجعة عرض السعر أو دعم التصريح أو أدلة التغيير أو المتابعة التشغيلية.`,
  );
}

function buildUploadAcknowledgementReply({ language, uploadKind }) {
  return chooseCopy(
    language,
    `Received. I attached the ${humanizeMissingItem(language, uploadKind)} to the project case and kept the timeline updated.`,
    `وصلت. ربطت ${humanizeMissingItem(language, uploadKind)} بحالة المشروع وحدّثت الخط الزمني.`,
  );
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

async function loadProjectProfile(supabase, phoneNumber) {
  const { data, error } = await supabase
    .from("whatsapp_buyer_profiles")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  if (error) throw new Error(`Failed to load WhatsApp profile memory: ${error.message}`);
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

async function upsertProjectProfile(supabase, payload) {
  const { data, error } = await supabase
    .from("whatsapp_buyer_profiles")
    .upsert(payload, { onConflict: "phone_number" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to upsert WhatsApp profile memory: ${error?.message || "unknown"}`);
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

function buildProfilePatch({ existingProfile, phoneNumber, linkedProfileId, language, signals, missingItems }) {
  const previous = existingProfile?.profile_json && typeof existingProfile.profile_json === "object"
    ? existingProfile.profile_json
    : {};
  const priorLocations = Array.isArray(previous.location_hints) ? previous.location_hints : [];
  const mergedLocations = [...new Set([...priorLocations, ...signals.locationHints].filter(Boolean))].slice(0, 8);
  const priorMaterials = Array.isArray(previous.material_types) ? previous.material_types : [];
  const mergedMaterials = [...new Set([...priorMaterials, ...signals.materialTypes].filter(Boolean))].slice(0, 12);

  return {
    phone_number: phoneNumber,
    linked_profile_id: normalizeUuid(linkedProfileId),
    preferred_language: language,
    intent: existingProfile?.intent || "unknown",
    financing_interest: existingProfile?.financing_interest || "unknown",
    readiness_score: Math.max(
      Number(existingProfile?.readiness_score || 0),
      signals.materialTypes.length >= 2 ? 0.65 : signals.tokens.length >= 4 ? 0.35 : 0.15,
    ),
    profile_json: {
      ...previous,
      project_kind: signals.projectKind,
      asset_type: signals.assetType,
      project_stage: signals.stage,
      workflow_focus: signals.workflowFocus,
      urgency: signals.urgency,
      location_hints: mergedLocations,
      material_types: mergedMaterials,
      missing_items: missingItems,
      last_query_tokens: signals.tokens,
    },
    confidence_json: {
      ...(existingProfile?.confidence_json && typeof existingProfile.confidence_json === "object"
        ? existingProfile.confidence_json
        : {}),
      project_kind: signals.projectKind === "general_contracting" ? 0.45 : 0.8,
      asset_type: signals.assetType === "unknown" ? 0.3 : 0.75,
      material_types: signals.materialTypes.length ? 0.8 : 0.2,
      location_hints: signals.locationHints.length ? 0.65 : 0.15,
    },
    summary: `${signals.projectKind.replace(/_/g, " ")} · ${signals.workflowFocus.replace(/_/g, " ")}`,
  };
}

function deriveCaseStage(workflowFocus, uploadKind) {
  if (uploadKind === "permit_docs" || workflowFocus === "permit_support") return "permit_ready";
  if (uploadKind === "change_evidence" || workflowFocus === "variation_review") return "variation_review";
  if (uploadKind === "quote_docs" || uploadKind === "boq" || workflowFocus === "quote_explanation") return "quote_review";
  if (workflowFocus === "scope_alignment" || workflowFocus === "workspace_setup") return "scoping";
  return "intake";
}

async function createOrUpdateProjectCase(supabase, payload) {
  const conversationId = normalizeUuid(payload.conversation_id);
  const workspaceId = normalizeUuid(payload.workspace_id);
  const phoneNumber = normalizePhone(payload.phone_number);
  if (!phoneNumber) return null;

  let query = supabase
    .from("buyer_opportunities")
    .select("*")
    .eq("phone_number", phoneNumber)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  if (conversationId) query = query.eq("conversation_id", conversationId);

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) {
    throw new Error(`Failed to load project case: ${existingError.message}`);
  }

  const nextPayload = {
    phone_number: phoneNumber,
    conversation_id: conversationId,
    workspace_id: workspaceId,
    property_id: null,
    surface_key: null,
    stage: payload.stage || "intake",
    source_channel: "whatsapp",
    result_source: workspaceId ? "zohal_native" : null,
    current_intent: payload.current_intent || null,
    budget_band: null,
    area_summary: null,
    financing_status: null,
    viewing_readiness: null,
    assigned_operator_id: normalizeUuid(payload.assigned_operator_id),
    summary: payload.summary || null,
    metadata_json: payload.metadata_json || {},
    marketing_inquiry_id: null,
    project_kind: payload.project_kind || null,
    workflow_focus: payload.workflow_focus || null,
    workspace_readiness: payload.workspace_readiness || null,
    missing_items_json: payload.missing_items_json || [],
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("buyer_opportunities")
      .update(nextPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(`Failed to update project case: ${error?.message || "unknown"}`);
    }
    return data;
  }

  const { data, error } = await supabase
    .from("buyer_opportunities")
    .insert(nextPayload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert project case: ${error?.message || "unknown"}`);
  }
  return data;
}

async function insertCaseMatch(supabase, payload) {
  const { error } = await supabase
    .from("buyer_opportunity_matches")
    .insert(payload);
  if (error) {
    throw new Error(`Failed to insert project case match: ${error.message}`);
  }
}

async function insertCaseActivity(supabase, payload) {
  const { data, error } = await supabase
    .from("buyer_opportunity_activities")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert project case activity: ${error?.message || "unknown"}`);
  }
  return data;
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

async function handleProjectIntake({
  supabase,
  conversation,
  projectProfile,
  body,
  language,
  signals,
  missingItems,
  workspaceReadiness,
}) {
  const workspace = await loadWorkspaceSummary(
    supabase,
    normalizeUuid(conversation.linked_workspace_id),
  );

  const nextConversation = await upsertConversation(supabase, {
    id: conversation.id,
    channel: "whatsapp",
    phone_number: body.phone_number,
    mode: "project_intake",
    language,
    active_surface_key: null,
    active_property_id: null,
    active_search_id: null,
    awaiting_upload_kind: "none",
    last_result_set_id: null,
    linked_profile_id: conversation.linked_profile_id || null,
    linked_workspace_id: conversation.linked_workspace_id || null,
    last_user_goal: normalizeText(body.text_body) || conversation.last_user_goal || null,
    state_json: {
      ...(conversation.state_json || {}),
      project_signals: signals,
      missing_items: missingItems,
      workspace_readiness: workspaceReadiness,
      active_workspace_snapshot: workspace,
    },
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });

  const profilePatch = buildProfilePatch({
    existingProfile: projectProfile,
    phoneNumber: body.phone_number,
    linkedProfileId: conversation.linked_profile_id,
    language,
    signals,
    missingItems,
  });
  await upsertProjectProfile(supabase, profilePatch);

  const projectCase = await createOrUpdateProjectCase(supabase, {
    phone_number: body.phone_number,
    conversation_id: nextConversation.id,
    workspace_id: nextConversation.linked_workspace_id || null,
    stage: deriveCaseStage(signals.workflowFocus, "none"),
    current_intent: normalizeText(body.text_body) || null,
    summary: buildProjectTitle(signals).replace(/_/g, " "),
    metadata_json: {
      latest_message: normalizeText(body.text_body),
      material_types: signals.materialTypes,
      location_hints: signals.locationHints,
      urgency: signals.urgency,
    },
    project_kind: signals.projectKind,
    workflow_focus: signals.workflowFocus,
    workspace_readiness: workspaceReadiness,
    missing_items_json: missingItems,
  });

  if (projectCase?.id && nextConversation.linked_workspace_id && workspace?.name) {
    await insertCaseMatch(supabase, {
      opportunity_id: projectCase.id,
      workspace_id: nextConversation.linked_workspace_id,
      property_id: null,
      surface_key: null,
      result_source: "zohal_native",
      external_candidate_id: null,
      label: workspace.name,
      match_payload: {
        kind: "workspace",
        workspace_id: workspace.id,
        workspace_name: workspace.name,
        workflow_focus: signals.workflowFocus,
      },
    });
  }

  if (projectCase?.id && nextConversation.linked_workspace_id) {
    await insertCaseActivity(supabase, {
      opportunity_id: projectCase.id,
      workspace_id: nextConversation.linked_workspace_id,
      activity_type: "project_intake",
      direction: "inbound",
      body_text: normalizeText(body.text_body) || null,
      media_json: body.media || [],
      activity_payload: {
        workflow_focus: signals.workflowFocus,
        project_kind: signals.projectKind,
        missing_items: missingItems,
      },
    });
  }

  return {
    mode: "project_intake",
    conversation: nextConversation,
    side_effects: ["project_profile_updated", workspaceReadiness],
    outbound_messages: [{
      type: "text",
      body: buildProjectIntakeReply({
        language,
        workspace,
        signals,
        missingItems,
        workspaceReadiness,
      }),
    }],
    crm_updates: projectCase ? { opportunity_id: projectCase.id } : null,
    import_request: null,
  };
}

async function handleWorkspaceContext({
  supabase,
  conversation,
  body,
  language,
  signals,
  missingItems,
}) {
  const workspace = await loadWorkspaceSummary(
    supabase,
    normalizeUuid(conversation.linked_workspace_id),
  );

  const nextConversation = await upsertConversation(supabase, {
    id: conversation.id,
    channel: "whatsapp",
    phone_number: conversation.phone_number,
    mode: "workspace_context",
    language,
    active_surface_key: null,
    active_property_id: null,
    active_search_id: null,
    awaiting_upload_kind: "none",
    last_result_set_id: null,
    linked_profile_id: conversation.linked_profile_id || null,
    linked_workspace_id: conversation.linked_workspace_id || null,
    last_user_goal: normalizeText(body.text_body) || conversation.last_user_goal || null,
    state_json: {
      ...(conversation.state_json || {}),
      project_signals: signals,
      missing_items: missingItems,
      active_workspace_snapshot: workspace,
    },
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });

  return {
    mode: "workspace_context",
    conversation: nextConversation,
    side_effects: ["workspace_context_ready"],
    outbound_messages: [{
      type: "text",
      body: buildWorkspaceContextReply({
        language,
        workspace,
        signals,
        missingItems,
      }),
    }],
    crm_updates: null,
    import_request: null,
  };
}

async function handleProgression({
  supabase,
  conversation,
  projectProfile,
  body,
  language,
  signals,
  missingItems,
  workspaceReadiness,
}) {
  const uploadKind = detectProgressionUploadKind(body.text_body, body.media || []);
  const stage = deriveCaseStage(signals.workflowFocus, uploadKind);
  const projectCase = await createOrUpdateProjectCase(supabase, {
    phone_number: body.phone_number,
    conversation_id: conversation.id,
    workspace_id: conversation.linked_workspace_id || null,
    stage,
    current_intent: normalizeText(body.text_body) || projectProfile?.summary || null,
    summary: normalizeText(body.text_body) || buildProjectTitle(signals).replace(/_/g, " "),
    metadata_json: {
      latest_message: normalizeText(body.text_body),
      upload_kind: uploadKind,
      urgency: signals.urgency,
    },
    project_kind: signals.projectKind,
    workflow_focus: signals.workflowFocus,
    workspace_readiness: workspaceReadiness,
    missing_items_json: missingItems,
  });

  if (projectCase?.id && conversation.linked_workspace_id) {
    await insertCaseActivity(supabase, {
      opportunity_id: projectCase.id,
      workspace_id: conversation.linked_workspace_id,
      activity_type: uploadKind === "none" ? "progression_request" : uploadKind,
      direction: "inbound",
      body_text: normalizeText(body.text_body) || null,
      media_json: body.media || [],
      activity_payload: {
        workflow_focus: signals.workflowFocus,
        stage,
      },
    });
  }

  const nextConversation = await upsertConversation(supabase, {
    id: conversation.id,
    channel: "whatsapp",
    phone_number: conversation.phone_number,
    mode: "progression",
    language,
    active_surface_key: null,
    active_property_id: null,
    active_search_id: null,
    awaiting_upload_kind: uploadKind,
    last_result_set_id: null,
    linked_profile_id: conversation.linked_profile_id || null,
    linked_workspace_id: conversation.linked_workspace_id || null,
    last_user_goal: normalizeText(body.text_body) || conversation.last_user_goal || null,
    state_json: {
      ...(conversation.state_json || {}),
      active_opportunity_id: projectCase?.id || null,
      project_signals: signals,
      missing_items: missingItems,
      awaiting_upload_kind: uploadKind,
    },
    last_inbound_message_id: normalizeText(body.message_id) || null,
    last_message_at: new Date().toISOString(),
  });

  return {
    mode: "progression",
    conversation: nextConversation,
    side_effects: ["project_case_upserted"],
    outbound_messages: [{
      type: "text",
      body: buildProgressionReply({ language, uploadKind, stage }),
    }],
    crm_updates: projectCase ? { opportunity_id: projectCase.id } : null,
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
          "I don’t have an active project case ready for uploads yet. Tell me whether you want help with scope, quote, permit, or revisions first.",
          "لا يوجد عندي ملف مشروع جاهز للمرفقات بعد. قل لي أولاً هل تريد المساعدة في النطاق أو عرض السعر أو التصريح أو المراجعات.",
        ),
      }],
      crm_updates: null,
      import_request: null,
    };
  }

  const media = Array.isArray(body.media) ? body.media : [];
  const uploadKind = conversation.awaiting_upload_kind || detectProgressionUploadKind(body.text_body, media);

  await insertCaseActivity(supabase, {
    opportunity_id: opportunityId,
    workspace_id: conversation.linked_workspace_id,
    activity_type: uploadKind || "upload",
    direction: "inbound",
    body_text: normalizeText(body.text_body) || null,
    media_json: media,
    activity_payload: {
      source_message_id: normalizeText(body.message_id) || null,
      upload_kind: uploadKind || "none",
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
    side_effects: ["project_upload_attached"],
    outbound_messages: [{
      type: "text",
      body: buildUploadAcknowledgementReply({ language, uploadKind }),
    }],
    crm_updates: { opportunity_id: opportunityId },
    import_request: null,
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
        mode: body.conversation_snapshot?.mode || "project_intake",
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
    mode: "project_intake",
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

  const projectProfile = await loadProjectProfile(supabase, phoneNumber);
  const textBody = normalizeText(body.text_body);
  const language = detectLanguageFromText(textBody, seededConversation.language);
  const hasMedia = Array.isArray(body.media) && body.media.length > 0;
  const signals = extractProjectSignals(textBody, body.media || []);
  const missingItems = computeMissingItems({
    projectKind: signals.projectKind,
    materialTypes: signals.materialTypes,
    assetType: signals.assetType,
    stage: signals.stage,
  });
  const workspaceReadiness = computeWorkspaceReadiness({
    linkedWorkspaceId: seededConversation.linked_workspace_id || workspaceSession?.workspace_id,
    materialTypes: signals.materialTypes,
    textBody,
    projectKind: signals.projectKind,
  });

  const inboundEvent = await insertConversationEvent(supabase, {
    conversation_id: seededConversation.id,
    workspace_id: normalizeUuid(seededConversation.linked_workspace_id || workspaceSession?.workspace_id),
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
      project_signals: signals,
    },
  });

  const route = decideWhatsappMode({
    textBody,
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
            "I need a linked workspace before I can import that file into the project timeline here.",
            "أحتاج مساحة عمل مرتبطة قبل أن أستورد هذا الملف داخل خط المشروع هنا.",
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
          "I received the file. Tell me if this is drawings, BOQ, quote docs, permit docs, site photos, or change evidence. If it belongs in a linked workspace, I can import it there too.",
          "وصلني الملف. قل لي هل هو مخططات أو مقايسة أو عرض سعر أو مستندات تصريح أو صور موقع أو أدلة تغيير. وإذا كان يجب ربطه بمساحة عمل مرتبطة فأقدر أستوره هناك أيضًا.",
        ),
      }],
      crm_updates: null,
      import_request: null,
    };
  } else if (route.mode === "progression") {
    result = await handleProgression({
      supabase,
      conversation: seededConversation,
      projectProfile,
      body,
      language,
      signals,
      missingItems,
      workspaceReadiness,
    });
  } else if (route.mode === "workspace_context") {
    result = await handleWorkspaceContext({
      supabase,
      conversation: seededConversation,
      body,
      language,
      signals,
      missingItems,
    });
  } else {
    result = await handleProjectIntake({
      supabase,
      conversation: seededConversation,
      projectProfile,
      body,
      language,
      signals,
      missingItems,
      workspaceReadiness,
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
