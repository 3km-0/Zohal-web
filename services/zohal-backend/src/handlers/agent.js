import { createHash, randomUUID } from "node:crypto";
import { requireInternalCaller } from "../runtime/internal-auth.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient } from "../runtime/supabase.js";

const CHANNELS = new Set(["whatsapp", "email", "slack", "telegram", "sms", "other"]);
const CONTACT_ROLES = new Set(["seller", "broker", "source", "lawyer", "contractor", "inspector", "valuer", "advisor", "operator", "other"]);
const OUTBOX_STATUSES = new Set(["pending", "blocked_consent_required", "blocked_approval_required", "blocked_template_required", "ready", "sent", "failed", "cancelled"]);
const GUEST_CANDIDATE_LIMIT = 2;
const PRIVATE_SUBMISSION_HINTS = ["private", "off-market", "off market", "exclusive", "confidential", "seller direct", "صفقة خاصة", "خاص", "مباشر"];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUuid(value) {
  return normalizeText(value).toLowerCase() || null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeChannel(value) {
  const channel = normalizeText(value).toLowerCase();
  return CHANNELS.has(channel) ? channel : "other";
}

function normalizeAddress(channel, value) {
  const raw = normalizeText(value);
  if (channel === "whatsapp" || channel === "sms") {
    const digits = raw.replace(/[^\d]/g, "");
    return digits ? `+${digits}` : "";
  }
  if (channel === "email") return raw.toLowerCase();
  return raw;
}

function redactAddress(channel, value) {
  const normalized = normalizeAddress(channel, value);
  if (!normalized) return "";
  if (channel === "whatsapp" || channel === "sms") {
    const digits = normalized.replace(/[^\d]/g, "");
    if (digits.length <= 4) return normalized;
    return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }
  if (channel === "email") {
    const [name, domain] = normalized.split("@");
    return domain ? `${name.slice(0, 2)}***@${domain}` : "***";
  }
  return normalized.slice(0, 4) ? `${normalized.slice(0, 4)}***` : "***";
}

function syntheticEmailForAddress(channel, address) {
  const hash = createHash("sha256")
    .update(`${channel}:${normalizeAddress(channel, address)}`)
    .digest("hex")
    .slice(0, 24);
  return `agent+${hash}@guest.zohal.app`;
}

function titleFromText(text, fallback = "Acquisition candidate") {
  const first = normalizeText(text).split(/\s+/).slice(0, 9).join(" ");
  return first || fallback;
}

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ""));
}

function detectLanguage(text, fallback = "en") {
  if (hasArabic(text)) return "ar";
  if (normalizeText(text)) return "en";
  return fallback === "ar" || fallback === "en" ? fallback : "en";
}

function chooseCopy(language, english, arabic) {
  return language === "ar" ? arabic : english;
}

function listIncludes(text, words) {
  const lower = normalizeText(text).toLowerCase();
  return words.some((word) => lower.includes(word.toLowerCase()));
}

function inferMode({ textBody, media, conversation }) {
  const text = normalizeText(textBody);
  const hasMedia = Array.isArray(media) && media.length > 0;
  if (hasMedia) {
    if (conversation?.state_json?.awaiting_contractor_upload) return "contractor_coordination";
    return "document_ingestion";
  }
  if (listIncludes(text, ["contractor", "inspection", "quote", "renovation", "مقاول", "فحص", "ترميم"])) {
    return "contractor_coordination";
  }
  if (listIncludes(text, ["buy box", "mandate", "criteria", "looking for", "budget", "ميزانية", "تفويض", "أبغى أشتري"])) {
    return "mandate_intake";
  }
  if (listIncludes(text, ["screen", "worth", "pursue", "pass", "evaluate", "حلل", "قيّم", "يستاهل"])) {
    return "screening";
  }
  if (listIncludes(text, ["broker", "listing", "deal", "property", "villa", "apartment", "land", "وسيط", "عقار", "فيلا", "صفقة"])) {
    return "opportunity_submission";
  }
  return conversation?.workspace_id ? "workspace_coordination" : "mandate_intake";
}

function parseBudget(text) {
  const normalized = normalizeText(text).replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(m|mn|million|مليون|k|thousand|ألف|الف)?/gi)];
  const values = matches.map((match) => {
    const base = Number(match[1]);
    const unit = String(match[2] || "").toLowerCase();
    if (!Number.isFinite(base)) return null;
    if (["m", "mn", "million", "مليون"].includes(unit)) return base * 1_000_000;
    if (["k", "thousand", "ألف", "الف"].includes(unit)) return base * 1_000;
    return base >= 10_000 ? base : null;
  }).filter(Boolean);
  if (!values.length) return {};
  return { min: Math.min(...values), max: Math.max(...values), currency: "SAR" };
}

function inferPropertyType(text) {
  if (/(villa|فيلا)/i.test(text)) return "villa";
  if (/(apartment|flat|شقة)/i.test(text)) return "apartment";
  if (/(land|plot|أرض|ارض)/i.test(text)) return "land";
  if (/(building|عمارة|مبنى)/i.test(text)) return "building";
  if (/(office|commercial|retail|مكتب|تجاري)/i.test(text)) return "commercial";
  return null;
}

function extractSignals(textBody, media = []) {
  const text = normalizeText(textBody);
  const propertyType = inferPropertyType(text);
  const budgetRange = parseBudget(text);
  const hasPhotos = media.some((item) => normalizeText(item?.mime_type).startsWith("image/")) || /(photo|image|صور|صورة)/i.test(text);
  const hasDocument = media.some((item) => /pdf|document|word/i.test(normalizeText(item?.mime_type))) || /(deed|pdf|document|صك|مستند|ملف)/i.test(text);
  const missing = [];
  if (!propertyType) missing.push("property_type");
  if (!budgetRange.max) missing.push("budget_or_asking_price");
  if (!hasPhotos) missing.push("photos");
  if (!hasDocument && text.length < 80) missing.push("source_document_or_listing_text");
  return {
    property_type: propertyType,
    budget_range: budgetRange,
    material_types: [hasPhotos ? "photos" : null, hasDocument ? "source_document" : null].filter(Boolean),
    missing_info: missing,
    confidence: Math.max(0.2, Math.min(0.85, 0.65 - missing.length * 0.08)),
    recommendation: missing.length >= 3 ? "insufficient_info" : "watch",
  };
}

function sourceFingerprint({ channel, address, textBody, sourceUrl }) {
  const seed = [
    normalizeChannel(channel),
    normalizeAddress(channel, address),
    normalizeText(sourceUrl).toLowerCase(),
    normalizeText(textBody).toLowerCase().slice(0, 240),
  ].join("|");
  return createHash("sha256").update(seed).digest("hex");
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertOne(supabase, table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error || !data) throw new Error(`Failed to insert ${table}: ${error?.message || "unknown"}`);
  return data;
}

async function upsertOne(supabase, table, payload, onConflict) {
  const { data, error } = await supabase.from(table).upsert(payload, { onConflict }).select("*").single();
  if (error || !data) throw new Error(`Failed to upsert ${table}: ${error?.message || "unknown"}`);
  return data;
}

async function ensureContactAndChannel(supabase, { channel, address, ownerUserId = null, organizationId = null, displayName = null }) {
  const normalized = normalizeAddress(channel, address);
  if (!normalized) {
    const error = new Error("Missing sender address");
    error.statusCode = 400;
    throw error;
  }

  const existingChannel = await maybeSingle(
    supabase.from("acquisition_contact_channels").select("*, contact:acquisition_contacts(*)").eq("channel", channel).eq("normalized_address", normalized),
  );
  if (existingChannel?.id) {
    await supabase.from("acquisition_contact_channels").update({ last_inbound_at: nowIso() }).eq("id", existingChannel.id);
    return {
      contact: existingChannel.contact || await maybeSingle(supabase.from("acquisition_contacts").select("*").eq("id", existingChannel.contact_id)),
      contactChannel: { ...existingChannel, last_inbound_at: nowIso() },
    };
  }

  const contact = await insertOne(supabase, "acquisition_contacts", {
    owner_user_id: ownerUserId,
    organization_id: organizationId,
    display_name: displayName || `${channel} ${redactAddress(channel, normalized)}` || "Contact",
    contact_kind: "unknown",
    status: ownerUserId ? "active" : "pending_approval",
    preferred_language: "auto",
    metadata_json: { created_from_channel: channel },
  });
  const contactChannel = await insertOne(supabase, "acquisition_contact_channels", {
    contact_id: contact.id,
    channel,
    address,
    normalized_address: normalized,
    consent_status: "unknown",
    approved_for_inbound: false,
    approved_for_outbound: false,
    approved_for_private_submission: false,
    last_inbound_at: nowIso(),
  });
  return { contact, contactChannel };
}

async function resolveOrCreateGuestWorkspace(supabase, { channel, address }) {
  if (channel !== "whatsapp") return { profile: null, workspace: null, created: false };
  const phone = normalizeAddress(channel, address);
  const existing = await maybeSingle(
    supabase.from("profiles").select("*").eq("whatsapp_phone_number", phone),
  );
  if (existing?.id) {
    const workspace = await maybeSingle(
      supabase.from("workspaces").select("*").eq("owner_id", existing.id).eq("workspace_type", "personal").limit(1),
    );
    return { profile: existing, workspace, created: false };
  }

  const userId = randomUUID();
  const profile = await insertOne(supabase, "profiles", {
    id: userId,
    email: syntheticEmailForAddress(channel, address),
    display_name: `WhatsApp Guest ${redactAddress(channel, address)}`,
    whatsapp_phone_number: phone,
    is_guest: true,
    subscription_tier: "free",
    subscription_status: "active",
  });
  const org = await insertOne(supabase, "organizations", {
    name: "WhatsApp Guest Workspace",
    owner_id: profile.id,
    plan_tier: "free",
  });
  await insertOne(supabase, "organization_members", {
    org_id: org.id,
    user_id: profile.id,
    role: "owner",
  });
  const workspace = await insertOne(supabase, "workspaces", {
    org_id: org.id,
    owner_id: profile.id,
    name: "WhatsApp Intake",
    workspace_type: "personal",
    status: "active",
    description: "Guest acquisition intake from WhatsApp",
  });
  await insertOne(supabase, "workspace_members", {
    workspace_id: workspace.id,
    user_id: profile.id,
    role: "owner",
  });
  return { profile, workspace, created: true };
}

async function resolveWorkspaceContext(supabase, { body, contact, contactChannel }) {
  const workspaceSession = body.workspace_session_snapshot && typeof body.workspace_session_snapshot === "object"
    ? body.workspace_session_snapshot
    : null;
  const snapshot = body.conversation_snapshot && typeof body.conversation_snapshot === "object"
    ? body.conversation_snapshot
    : null;

  const workspaceId = normalizeUuid(body.workspace_id || snapshot?.active_workspace_id || workspaceSession?.workspace_id);
  const userId = normalizeUuid(body.user_id || snapshot?.linked_profile_id || workspaceSession?.user_id);
  if (workspaceId || userId) {
    const workspace = workspaceId
      ? await maybeSingle(supabase.from("workspaces").select("*").eq("id", workspaceId))
      : null;
    if (workspace?.id && userId && workspace.owner_id !== userId) {
      const membership = await maybeSingle(
        supabase.from("workspace_members").select("*").eq("workspace_id", workspace.id).eq("user_id", userId).limit(1),
      );
      if (!membership?.id) {
        const error = new Error("Workspace is not accessible to this agent caller");
        error.statusCode = 403;
        throw error;
      }
    }
    return { workspace, userId, isGuest: Boolean(body.is_guest), guestCreated: false };
  }

  if (contact?.owner_user_id) {
    const ownerProfile = await maybeSingle(
      supabase.from("profiles").select("*").eq("id", contact.owner_user_id).limit(1),
    );
    const ownedWorkspace = await maybeSingle(
      supabase.from("workspaces").select("*").eq("owner_id", contact.owner_user_id).eq("workspace_type", "personal").limit(1),
    );
    if (ownedWorkspace?.id) {
      return {
        workspace: ownedWorkspace,
        userId: contact.owner_user_id,
        isGuest: ownerProfile?.is_guest === true,
        guestCreated: false,
      };
    }
  }

  const guest = await resolveOrCreateGuestWorkspace(supabase, {
    channel: normalizeChannel(body.channel),
    address: contactChannel?.normalized_address || body.sender?.address,
  });
  if (guest.profile?.id && contact?.id && !contact.owner_user_id) {
    await supabase.from("acquisition_contacts").update({
      owner_user_id: guest.profile.id,
      organization_id: guest.workspace?.org_id || null,
      status: "active",
    }).eq("id", contact.id);
  }
  return {
    workspace: guest.workspace,
    userId: guest.profile?.id || null,
    isGuest: Boolean(guest.profile?.is_guest ?? true),
    guestCreated: guest.created,
  };
}

async function loadAgentConversation(supabase, channel, externalThreadId) {
  return await maybeSingle(
    supabase.from("agent_conversations").select("*").eq("channel", channel).eq("external_thread_id", externalThreadId),
  );
}

async function upsertAgentConversation(supabase, payload) {
  return await upsertOne(supabase, "agent_conversations", payload, "channel,external_thread_id");
}

async function countGuestCandidates(supabase, workspaceId) {
  if (!workspaceId) return 0;
  const { data, error } = await supabase
    .from("acquisition_candidate_opportunities")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data || []).length;
}

async function createCandidate(supabase, { workspaceId, userId, contact, contactChannel, body, signals, isGuest }) {
  if (isGuest && await countGuestCandidates(supabase, workspaceId) >= GUEST_CANDIDATE_LIMIT) {
    return { blocked: true, reason: "guest_candidate_limit" };
  }
  const textBody = normalizeText(body.message?.text_body || body.text_body);
  const fingerprint = sourceFingerprint({
    channel: body.channel,
    address: contactChannel?.normalized_address || body.sender?.address,
    textBody,
    sourceUrl: body.source_url,
  });
  const candidate = await upsertOne(supabase, "acquisition_candidate_opportunities", {
    workspace_id: workspaceId,
    search_run_id: null,
    mandate_id: normalizeUuid(body.mandate_id),
    investor_id: isGuest ? null : userId,
    source: contactChannel?.approved_for_private_submission && body.channel === "whatsapp"
      ? "broker_whatsapp"
      : "user_provided_listing",
    source_url: normalizeText(body.source_url) || null,
    source_fingerprint: fingerprint,
    limited_evidence_snapshot_json: {
      channel: body.channel,
      contact_id: contact?.id || null,
      contact_channel_id: contactChannel?.id || null,
      text_excerpt: textBody.slice(0, 500),
      media_count: Array.isArray(body.message?.media) ? body.message.media.length : 0,
      source_authority: contactChannel?.approved_for_private_submission ? "approved_source_contact" : "guest_or_unapproved_source",
    },
    title: titleFromText(textBody),
    property_type: signals.property_type,
    asking_price: signals.budget_range?.max || null,
    photo_refs_json: [],
    short_description: textBody.slice(0, 1000) || null,
    terms_policy: "unknown",
    screening_decision: signals.recommendation,
    screening_output_json: {
      decision: signals.recommendation,
      confidence: signals.confidence >= 0.75 ? "high" : signals.confidence >= 0.45 ? "medium" : "low",
      reasons: ["Submitted through acquisition agent.", contactChannel?.approved_for_private_submission ? "Source contact is approved for private submissions." : "Source contact is not approved for private submissions."],
      missingInformation: signals.missing_info.map((item) => ({ type: item, title: item.replace(/_/g, " ") })),
      nextAction: { type: signals.missing_info.length ? "request_info" : "create_workspace", label: signals.missing_info.length ? "Request missing information" : "Promote candidate" },
    },
    status: signals.missing_info.length ? "needs_info" : "watch",
  }, "workspace_id,source_fingerprint");

  await insertOne(supabase, "acquisition_claims", {
    candidate_id: candidate.id,
    workspace_id: workspaceId,
    fact_key: "agent_submission",
    value_json: {
      property_type: signals.property_type,
      budget_range: signals.budget_range,
      material_types: signals.material_types,
    },
    basis_label: contactChannel?.approved_for_private_submission ? "counterparty_provided" : "uncertain",
    confidence: signals.confidence,
    source_channel: body.channel,
    evidence_refs_json: [{ agent_contact_id: contact?.id || null, provider_message_id: body.message?.provider_message_id || null }],
  });

  if (signals.missing_info.length) {
    await supabase.from("acquisition_diligence_items").insert(signals.missing_info.map((item) => ({
      candidate_id: candidate.id,
      workspace_id: workspaceId,
      title: item.replace(/_/g, " "),
      item_type: "missing_info",
      priority: item === "source_document_or_listing_text" ? "high" : "medium",
      status: "open",
      owner_kind: "broker",
      evidence_refs_json: [{ agent_contact_id: contact?.id || null }],
    })));
  }

  return { candidate };
}

async function ensureFolder(supabase, { workspaceId, parentId = null, name, folderKind, opportunityId = null, analysisPolicy = "manual", sensitivityLevel = "standard" }) {
  if (!workspaceId) return null;
  const query = supabase.from("workspace_folders").select("*").eq("workspace_id", workspaceId).eq("name", name).limit(1);
  const existing = await maybeSingle(parentId ? query.eq("parent_id", parentId) : query);
  if (existing?.id) return existing;
  return await insertOne(supabase, "workspace_folders", {
    workspace_id: workspaceId,
    parent_id: parentId,
    name,
    folder_kind: folderKind,
    related_opportunity_id: opportunityId,
    sensitivity_level: sensitivityLevel,
    analysis_policy: analysisPolicy,
  });
}

async function resolveImportRequest(supabase, { body, workspace, userId, conversation, contact, agentEvent }) {
  const media = Array.isArray(body.message?.media) ? body.message.media[0] : null;
  if (!media?.url || !workspace?.id || !userId) return null;
  const opportunityId = normalizeUuid(body.opportunity_id || conversation?.opportunity_id);
  const uploadKind = normalizeText(body.upload_kind || body.awaiting_upload_kind || conversation?.state_json?.awaiting_upload_kind) || "property_docs";
  let folderId = null;
  if (uploadKind.includes("finance")) {
    const buyerRoot = await ensureFolder(supabase, { workspaceId: workspace.id, name: "Buyer", folderKind: "buyer_root", analysisPolicy: "none" });
    const financing = await ensureFolder(supabase, {
      workspaceId: workspace.id,
      parentId: buyerRoot?.id || null,
      name: "Secure Financing",
      folderKind: "buyer_secure_financing",
      sensitivityLevel: "financial",
      analysisPolicy: "buyer_readiness_financing",
    });
    folderId = financing?.id || null;
  } else {
    const propertiesRoot = await ensureFolder(supabase, { workspaceId: workspace.id, name: "Properties", folderKind: "acquisition_property_root", analysisPolicy: "none" });
    const title = opportunityId
      ? `Opportunity ${opportunityId.slice(0, 8)}`
      : "WhatsApp Intake";
    const propertyFolder = await ensureFolder(supabase, {
      workspaceId: workspace.id,
      parentId: propertiesRoot?.id || null,
      name: title,
      folderKind: "acquisition_property",
      opportunityId,
      analysisPolicy: "acquisition_property",
    });
    folderId = propertyFolder?.id || null;
  }
  return {
    user_id: userId,
    workspace_id: workspace.id,
    phone_number: body.channel === "whatsapp" ? normalizeAddress("whatsapp", body.sender?.address) : null,
    file_url: media.url,
    file_name: normalizeText(media.file_name || media.filename) || null,
    mime_type: normalizeText(media.mime_type) || "application/octet-stream",
    folder_id: folderId,
    source_message_id: normalizeText(body.message?.provider_message_id) || null,
    media_auth_header: normalizeText(media.auth_header) || null,
    opportunity_id: opportunityId,
    contact_id: contact?.id || null,
    agent_event_id: agentEvent?.id || null,
    upload_kind: uploadKind,
  };
}

async function prepareExternalAction(supabase, { body, workspace, contact, contactChannel, opportunityId, actionType = "send_outreach", messageIntent = "acquisition_followup", messageBody }) {
  const approvalStatus = ["draft", "pending", "approved", "rejected", "executed", "cancelled"].includes(body.approval_status)
    ? body.approval_status
    : "pending";
  const approval = await insertOne(supabase, "external_action_approvals", {
    workspace_id: workspace?.id || null,
    opportunity_id: opportunityId || null,
    action_type: actionType,
    acquisition_action_id: messageIntent,
    draft_payload_json: {
      channel: body.channel,
      contact_id: contact?.id || null,
      contact_channel_id: contactChannel?.id || null,
      body: messageBody,
    },
    approval_status: approvalStatus,
    requested_by: workspace?.owner_id || null,
  });
  const templateKey = normalizeText(body.template_key);
  const hasOpenSession = body.has_open_session === true || body.whatsapp_session_open === true;
  let status = "ready";
  if (contactChannel?.consent_status !== "opted_in" || !contactChannel?.approved_for_outbound) {
    status = "blocked_consent_required";
  } else if (approval.approval_status !== "approved") {
    status = "blocked_approval_required";
  } else if (body.channel === "whatsapp" && !hasOpenSession && !templateKey) {
    status = "blocked_template_required";
  }
  if (!OUTBOX_STATUSES.has(status)) status = "pending";
  const outbox = await insertOne(supabase, "agent_outbox_messages", {
    workspace_id: workspace?.id || null,
    opportunity_id: opportunityId || null,
    contact_id: contact?.id || null,
    contact_channel_id: contactChannel?.id || null,
    approval_id: approval.id,
    channel: body.channel,
    message_intent: messageIntent,
    body: messageBody,
    template_key: templateKey || null,
    template_payload_json: body.template_payload_json || {},
    status,
    metadata_json: { manual_url: buildManualChannelUrl(body.channel, contactChannel?.normalized_address, messageBody) },
  });
  return { approval, outbox };
}

function buildManualChannelUrl(channel, address, body) {
  if (channel === "whatsapp") {
    const digits = normalizeAddress(channel, address).replace(/[^\d]/g, "");
    if (!digits) return null;
    const text = encodeURIComponent(normalizeText(body));
    return `https://wa.me/${digits}${text ? `?text=${text}` : ""}`;
  }
  return null;
}

function clipWhatsappBody(value, maxChars = 4096) {
  const body = normalizeText(value);
  return body.length <= maxChars ? body : `${body.slice(0, maxChars - 1).trimEnd()}...`;
}

async function sendWhatsappOutboxMessage({ contactChannel, message, requestId }) {
  const phoneNumberId = normalizeText(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken = normalizeText(process.env.WHATSAPP_ACCESS_TOKEN);
  const graphVersion = normalizeText(process.env.WHATSAPP_GRAPH_VERSION) || "v24.0";
  const to = normalizeAddress("whatsapp", contactChannel?.normalized_address || contactChannel?.address).replace(/^\+/, "");
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID not configured");
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN not configured");
  if (!to) throw new Error("Invalid WhatsApp recipient");

  const payload = message.template_key
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: message.template_key,
          language: { code: message.template_payload_json?.language_code || "en" },
          ...(Array.isArray(message.template_payload_json?.components)
            ? { components: message.template_payload_json.components }
            : {}),
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: clipWhatsappBody(message.body) },
      };
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    body: JSON.stringify(payload),
  });
  const responseJson = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(responseJson).slice(0, 240)}`);
  }
  return responseJson?.messages?.[0]?.id || null;
}

async function requestContractorEvaluation(supabase, { body, workspace, contact, contactChannel, conversation }) {
  const opportunityId = normalizeUuid(body.opportunity_id || conversation?.opportunity_id);
  if (!workspace?.id || !opportunityId) return { blocked: true, reason: "missing_opportunity" };
  await upsertOne(supabase, "acquisition_opportunity_participants", {
    opportunity_id: opportunityId,
    contact_id: contact.id,
    role: "contractor",
    is_primary: true,
    status: "active",
    source_channel: body.channel,
    metadata_json: { requested_from_agent: true },
  }, "opportunity_id,contact_id,role");
  const thread = await insertOne(supabase, "acquisition_threads", {
    opportunity_id: opportunityId,
    workspace_id: workspace.id,
    thread_kind: "diligence",
    status: "waiting_on_inputs",
    title: "Contractor evaluation",
    summary: "Contractor inspection or quote requested through the agent.",
    metadata_json: { contact_id: contact.id, channel: body.channel },
  });
  await insertOne(supabase, "acquisition_diligence_items", {
    opportunity_id: opportunityId,
    workspace_id: workspace.id,
    title: "Contractor inspection report",
    item_type: "contractor_clarification",
    priority: "high",
    status: "requested",
    owner_kind: "contractor",
    evidence_refs_json: [{ contact_id: contact.id, acquisition_thread_id: thread.id }],
  });
  const messageBody = normalizeText(body.message?.text_body || body.text_body) ||
    "Please share your inspection availability, scope notes, and any renovation quote documents for this property.";
  const action = await prepareExternalAction(supabase, {
    body,
    workspace,
    contact,
    contactChannel,
    opportunityId,
    actionType: "request_contractor_evaluation",
    messageIntent: "request_contractor_evaluation",
    messageBody,
  });
  return { thread, ...action };
}

async function runOutbox(supabase, body = {}) {
  const channel = normalizeChannel(body.channel || "whatsapp");
  const requestId = normalizeText(body.request_id);
  const { data, error } = await supabase
    .from("agent_outbox_messages")
    .select("*")
    .eq("channel", channel)
    .eq("status", "ready")
    .limit(Number(body.limit || 20));
  if (error) throw error;
  const sent = [];
  const failed = [];
  for (const message of data || []) {
    try {
      let providerMessageId = null;
      if (message.channel === "whatsapp") {
        const contactChannel = message.contact_channel_id
          ? await maybeSingle(supabase.from("acquisition_contact_channels").select("*").eq("id", message.contact_channel_id))
          : null;
        providerMessageId = await sendWhatsappOutboxMessage({ contactChannel, message, requestId });
      } else {
        providerMessageId = `recorded-${message.id}`;
      }
      await supabase.from("agent_outbox_messages").update({
        status: "sent",
        provider_message_id: providerMessageId || `sent-${message.id}`,
        failure_reason: null,
      }).eq("id", message.id);
      if (message.contact_channel_id) {
        await supabase.from("acquisition_contact_channels").update({ last_outbound_at: nowIso() }).eq("id", message.contact_channel_id);
      }
      sent.push(message.id);
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      await supabase.from("agent_outbox_messages").update({
        status: "failed",
        failure_reason: failureReason.slice(0, 500),
      }).eq("id", message.id);
      failed.push({ id: message.id, reason: failureReason });
    }
  }
  return { sent_count: sent.length, sent_ids: sent, failed_count: failed.length, failures: failed };
}

export async function orchestrateAgentEvent({ supabase, body }) {
  const channel = normalizeChannel(body.channel || "whatsapp");
  const senderAddress = normalizeText(body.sender?.address || body.phone_number || body.from);
  const message = body.message && typeof body.message === "object"
    ? body.message
    : {
      provider_message_id: body.message_id,
      text_body: body.text_body,
      media: body.media,
      timestamp: body.timestamp,
      message_type: body.message_type,
    };
  const externalThreadId = normalizeText(body.external_thread_id || senderAddress);
  const textBody = normalizeText(message.text_body);
  const language = detectLanguage(textBody, body.language);
  const { contact, contactChannel } = await ensureContactAndChannel(supabase, {
    channel,
    address: senderAddress,
    ownerUserId: normalizeUuid(body.user_id || body.workspace_session_snapshot?.user_id),
    displayName: body.sender?.display_name,
  });

  const workspaceContext = await resolveWorkspaceContext(supabase, {
    body: { ...body, channel, sender: { ...(body.sender || {}), address: senderAddress } },
    contact,
    contactChannel,
  });
  const existingConversation = await loadAgentConversation(supabase, channel, externalThreadId);
  const mode = inferMode({ textBody, media: message.media, conversation: existingConversation });
  const workspace = workspaceContext.workspace;
  const userId = workspaceContext.userId;
  const conversation = await upsertAgentConversation(supabase, {
    id: existingConversation?.id,
    channel,
    external_thread_id: externalThreadId,
    workspace_id: workspace?.id || normalizeUuid(body.workspace_id) || existingConversation?.workspace_id || null,
    opportunity_id: normalizeUuid(body.opportunity_id || existingConversation?.opportunity_id),
    mandate_id: normalizeUuid(body.mandate_id || existingConversation?.mandate_id),
    contact_id: contact?.id || null,
    linked_profile_id: userId || existingConversation?.linked_profile_id || null,
    buyer_entity_id: normalizeUuid(body.buyer_entity_id || existingConversation?.buyer_entity_id),
    mode,
    state_json: {
      ...(existingConversation?.state_json || {}),
      is_guest: workspaceContext.isGuest,
      guest_created: workspaceContext.guestCreated,
      last_text_excerpt: textBody.slice(0, 500),
    },
    last_message_at: nowIso(),
  }, "channel,external_thread_id");

  const agentEvent = await insertOne(supabase, "agent_events", {
    conversation_id: conversation.id,
    workspace_id: conversation.workspace_id,
    opportunity_id: conversation.opportunity_id,
    contact_id: contact?.id || null,
    channel,
    direction: "inbound",
    event_type: Array.isArray(message.media) && message.media.length ? "inbound_media" : "inbound_text",
    provider_message_id: normalizeText(message.provider_message_id) || null,
    safe_payload_json: {
      text_excerpt: textBody.slice(0, 500),
      media_count: Array.isArray(message.media) ? message.media.length : 0,
      message_type: message.message_type || body.message_type || null,
    },
  });

  const sideEffects = [];
  const outboundMessages = [];
  let importRequest = null;
  let crmUpdates = null;

  if (mode === "document_ingestion" || mode === "contractor_coordination" && Array.isArray(message.media) && message.media.length) {
    importRequest = await resolveImportRequest(supabase, {
      body: { ...body, channel, sender: { ...(body.sender || {}), address: senderAddress }, message },
      workspace,
      userId,
      conversation,
      contact,
      agentEvent,
    });
    if (importRequest) {
      sideEffects.push("import_requested");
      outboundMessages.push({
        type: "text",
        body: chooseCopy(language, "I received the file and queued it into the acquisition workspace.", "استلمت الملف وأضفته إلى مساحة الاستحواذ للمعالجة."),
      });
    } else {
      outboundMessages.push({
        type: "text",
        body: chooseCopy(language, "I need a linked workspace before I can import this file.", "أحتاج مساحة عمل مرتبطة قبل استيراد هذا الملف."),
      });
    }
  } else if (mode === "contractor_coordination") {
    const contractor = await requestContractorEvaluation(supabase, {
      body: { ...body, channel, sender: { ...(body.sender || {}), address: senderAddress }, message },
      workspace,
      contact,
      contactChannel,
      conversation,
    });
    if (contractor.blocked) {
      outboundMessages.push({ type: "text", body: "I need an active opportunity before I can request a contractor inspection." });
    } else {
      sideEffects.push("contractor_evaluation_prepared");
      crmUpdates = { opportunity_id: conversation.opportunity_id, acquisition_thread_id: contractor.thread?.id || null, outbox_id: contractor.outbox?.id || null };
      outboundMessages.push({ type: "text", body: "I prepared the contractor inspection request and queued it for consent/approval before delivery." });
    }
  } else if (mode === "mandate_intake") {
    const signals = extractSignals(textBody, message.media || []);
    const mandate = await upsertOne(supabase, "acquisition_mandates", {
      workspace_id: workspace?.id || null,
      user_id: workspaceContext.isGuest ? null : userId,
      status: "active",
      title: titleFromText(textBody, "Acquisition mandate"),
      buy_box_json: { latest_text: textBody, phone_number: channel === "whatsapp" ? normalizeAddress(channel, senderAddress) : null, property_type: signals.property_type },
      budget_range_json: signals.budget_range,
      target_locations_json: [],
      confidence_json: { agent: signals.confidence },
    }, "workspace_id,title");
    sideEffects.push("mandate_saved");
    await upsertAgentConversation(supabase, { ...conversation, mandate_id: mandate.id, state_json: { ...(conversation.state_json || {}), active_mandate_id: mandate.id } }, "channel,external_thread_id");
    outboundMessages.push({ type: "text", body: chooseCopy(language, "I captured this as an acquisition mandate.", "سجلت هذا كتفويض استحواذ.") });
  } else {
    const signals = extractSignals(textBody, message.media || []);
    const canSubmitPrivate = contactChannel?.approved_for_private_submission === true;
    const isLinkedOwner = Boolean(body.workspace_session_snapshot?.user_id || body.conversation_snapshot?.linked_profile_id || body.user_id);
    const wantsPrivateSubmission = listIncludes(textBody, PRIVATE_SUBMISSION_HINTS);
    if (wantsPrivateSubmission && !canSubmitPrivate && !isLinkedOwner) {
      sideEffects.push("private_submission_blocked");
      outboundMessages.push({
        type: "text",
        body: chooseCopy(language, "I captured your message, but this number is not approved to submit private deals yet. You can still claim a workspace to continue with public listing intake.", "سجلت رسالتك، لكن هذا الرقم غير معتمد لإرسال صفقات خاصة حتى الآن. يمكنك مطالبة مساحة عمل للمتابعة بإدخال عروض عامة."),
      });
    } else if (!canSubmitPrivate && !workspaceContext.isGuest && !isLinkedOwner) {
      sideEffects.push("submission_blocked_unlinked_contact");
      outboundMessages.push({
        type: "text",
        body: chooseCopy(language, "I captured your message, but this number is not linked to an approved workspace yet.", "سجلت رسالتك، لكن هذا الرقم غير مرتبط بمساحة عمل معتمدة بعد."),
      });
    } else {
      const result = await createCandidate(supabase, {
        workspaceId: workspace?.id || null,
        userId,
        contact,
        contactChannel,
        body: { ...body, channel, sender: { ...(body.sender || {}), address: senderAddress }, message },
        signals,
        isGuest: workspaceContext.isGuest,
      });
      if (result.blocked) {
        sideEffects.push(result.reason);
        outboundMessages.push({ type: "text", body: "Guest intake is limited to two candidate submissions. Please claim your workspace to continue." });
      } else {
        sideEffects.push("candidate_saved");
        crmUpdates = { candidate_id: result.candidate.id };
        await upsertAgentConversation(supabase, { ...conversation, state_json: { ...(conversation.state_json || {}), active_candidate_id: result.candidate.id } }, "channel,external_thread_id");
        outboundMessages.push({
          type: "text",
          body: chooseCopy(
            language,
            `I captured this as an acquisition candidate. Current screen: ${signals.recommendation.replace(/_/g, " ")}.`,
            `سجلت هذا كمرشح استحواذ. الفرز الحالي: ${signals.recommendation.replace(/_/g, " ")}.`,
          ),
        });
      }
    }
  }

  return {
    handled: true,
    mode,
    conversation,
    contact,
    contact_channel: contactChannel,
    side_effects: sideEffects,
    outbound_messages: outboundMessages,
    import_request: importRequest,
    crm_updates: crmUpdates,
  };
}

export async function handleAgentOrchestrate(req, res, { requestId, log, readJsonBody, supabase = createServiceClient() }) {
  try {
    requireInternalCaller(req.headers);
    const body = await readJsonBody(req);
    const response = await orchestrateAgentEvent({ supabase, body, requestId, log });
    return sendJson(res, 200, { ...response, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    log?.error?.("Agent orchestrator failed", { error: error instanceof Error ? error.message : String(error) });
    return sendJson(res, error.statusCode || 500, {
      error: error instanceof Error ? error.message : "internal_server_error",
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
}

export async function handleAgentOutboxRun(req, res, { requestId, log, readJsonBody, supabase = createServiceClient() }) {
  try {
    requireInternalCaller(req.headers);
    const body = await readJsonBody(req);
    const response = await runOutbox(supabase, body);
    return sendJson(res, 200, { ...response, request_id: requestId, execution_plane: "gcp" });
  } catch (error) {
    log?.error?.("Agent outbox run failed", { error: error instanceof Error ? error.message : String(error) });
    return sendJson(res, error.statusCode || 500, {
      error: error instanceof Error ? error.message : "internal_server_error",
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
}

export const __test = {
  countGuestCandidates,
  createCandidate,
  ensureContactAndChannel,
  extractSignals,
  inferMode,
  orchestrateAgentEvent,
  prepareExternalAction,
  requestContractorEvaluation,
  resolveOrCreateGuestWorkspace,
  runOutbox,
};
