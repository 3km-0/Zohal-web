import { createClient } from "@supabase/supabase-js";
import {
  createChatCompletion,
  resolveAIProvider,
} from "../analysis/ai-provider.js";
import { sendJson } from "../runtime/http.js";
import { createServiceClient, getSupabaseUrl } from "../runtime/supabase.js";

const VALID_ICONS = [
  "folder.fill",
  "doc.text.fill",
  "book.fill",
  "chart.bar.fill",
  "briefcase.fill",
  "graduationcap.fill",
  "building.2.fill",
  "person.2.fill",
  "banknote.fill",
  "gearshape.fill",
  "hammer.fill",
  "heart.fill",
  "star.fill",
  "lightbulb.fill",
  "archivebox.fill",
];

const VALID_COLORS = [
  "#2d8878",
  "#c9973e",
  "#3b82f6",
  "#22c55e",
  "#8b5cf6",
  "#ef4444",
  "#f97316",
  "#06b6d4",
  "#ec4899",
  "#6366f1",
];

const OPS_ACTIONS = new Set([
  "pressure-strip",
  "list-open-issues",
  "list-vendor-followups",
  "list-escalations",
]);

const ISSUE_FILTERS = new Set(["all", "overdue", "awaiting_vendor", "sla_breach"]);

function getAnonKey() {
  const value = String(process.env.SUPABASE_ANON_KEY || "").trim();
  if (!value) throw new Error("SUPABASE_ANON_KEY not configured");
  return value;
}

function authHeader(req) {
  return String(req.headers.authorization || req.headers.Authorization || "");
}

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
}

function createUserClient(req) {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: authHeader(req) } },
    auth: { persistSession: false },
  });
}

async function getAuthenticatedContext(req) {
  const token = stripBearer(authHeader(req));
  if (!token) throw makeError("Missing authorization token", 401);
  const client = createUserClient(req);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) throw makeError("Invalid authorization token", 401);
  return { client, userId: normalizeUuid(data.user.id) };
}

export function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeString(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function makeError(message, statusCode = 500, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}

function safeError(res, requestId, error) {
  return sendJson(res, error.statusCode || 500, {
    ok: false,
    error: error.message || "Internal server error",
    message: error.message || "Internal server error",
    details: error.details,
    request_id: requestId,
    execution_plane: "gcp",
  });
}

async function requireWorkspaceAccess(supabase, workspaceId, userId) {
  const [{ data: owned }, { data: member }] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_id", userId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!owned?.id && !member?.id) throw makeError("forbidden", 403);
}

async function loadWorkspacePropertyIds(supabase, workspaceId) {
  const { data, error } = await supabase
    .from("workspaces")
    .select("primary_property_id, properties:primary_property_id(id, name)")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const ids = [];
  const namesById = new Map();
  const id = normalizeUuid(data?.primary_property_id);
  if (id) {
    ids.push(id);
    const name = normalizeString(data?.properties?.name);
    if (name) namesById.set(id, name);
  }
  return { ids, namesById };
}

export function computeUrgencyBucket({ slaDueAt, priority, status }) {
  const normalizedStatus = String(status || "").toLowerCase();
  const normalizedPriority = String(priority || "").toLowerCase();
  if (
    normalizedPriority === "urgent" ||
    normalizedPriority === "high" ||
    normalizedStatus === "sla_breach"
  ) {
    return "urgent";
  }
  if (slaDueAt) {
    const due = new Date(slaDueAt).getTime();
    if (!Number.isNaN(due)) {
      const hoursUntil = (due - Date.now()) / (60 * 60 * 1000);
      if (hoursUntil < 0) return "urgent";
      if (hoursUntil < 24) return "today";
      if (hoursUntil < 24 * 7) return "this_week";
    }
  }
  return "backlog";
}

function buildResponsibilityBadge(workOrder) {
  const responsibility = workOrder?.metadata_json?.responsibility;
  if (!responsibility) return null;
  const normalized = String(responsibility).toLowerCase();
  if (normalized.includes("tenant")) return "Tenant pays";
  if (normalized.includes("owner")) return "Owner pays";
  if (normalized.includes("vendor") || normalized.includes("warranty")) return "Vendor warranty";
  return null;
}

function buildSlaBadge(slaDueAt) {
  if (!slaDueAt) return null;
  const due = new Date(slaDueAt).getTime();
  if (Number.isNaN(due)) return null;
  const ms = due - Date.now();
  if (ms < 0) return "SLA breached";
  const hoursUntil = ms / (60 * 60 * 1000);
  if (hoursUntil < 24) return `Due in ${Math.max(1, Math.round(hoursUntil))}h`;
  return `Due in ${Math.round(hoursUntil / 24)}d`;
}

function buildWarrantyBadge(workOrder, vendorContracts) {
  const componentId = workOrder?.component_id;
  if (!componentId) return null;
  const covering = vendorContracts.find((row) =>
    row.component_id === componentId && row.contract_status === "active"
  );
  return covering ? "Vendor warranty" : null;
}

function buildDispatchReadinessBadge(workOrder) {
  const hasVendor = Boolean(workOrder?.assigned_vendor_id);
  const hasSchedule = Boolean(workOrder?.scheduled_at);
  const hasContact = Boolean(
    workOrder?.metadata_json?.contact_phone || workOrder?.metadata_json?.access_notes,
  );
  if (hasVendor && (hasSchedule || hasContact)) return "Ready to dispatch";
  if (!hasVendor) return "Needs vendor";
  return "Missing schedule/access";
}

export function buildPressureStripEnvelope({ strip, requestId }) {
  const data = {
    ...strip,
    open_count: strip.open_count ?? strip.open ?? 0,
    overdue_count: strip.overdue_count ?? strip.overdue ?? 0,
    awaiting_vendor_count: strip.awaiting_vendor_count ?? strip.awaiting_vendor ?? 0,
    sla_breach_count: strip.sla_breach_count ?? strip.sla_breach ?? 0,
  };
  return {
    ok: true,
    data: { data },
    request_id: requestId,
    execution_plane: "gcp",
  };
}

function buildOpsListEnvelope({ data, requestId }) {
  return {
    ok: true,
    data: {
      data,
      count: data.length,
    },
    request_id: requestId,
    execution_plane: "gcp",
  };
}

async function listWorkspaceOpenIssues({ supabase, workspaceId, filter, limit }) {
  const boundedLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
  const { ids: propertyIds, namesById } = await loadWorkspacePropertyIds(supabase, workspaceId);
  if (propertyIds.length === 0) return [];

  const [workOrdersRes, vendorContractsRes, vendorsRes, componentsRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, property_id, component_id, assigned_vendor_id, work_order_code, category, priority, status, sla_due_at, scheduled_at, created_at, metadata_json",
      )
      .in("property_id", propertyIds)
      .not("status", "in", "(completed,cancelled,archived)")
      .order("created_at", { ascending: false })
      .limit(boundedLimit),
    supabase
      .from("vendor_contracts")
      .select("id, property_id, component_id, vendor_id, contract_status")
      .in("property_id", propertyIds),
    supabase.from("vendors").select("id, display_name"),
    supabase.from("property_components").select("id, name").in("property_id", propertyIds),
  ]);
  if (workOrdersRes.error) throw new Error(workOrdersRes.error.message);
  if (vendorContractsRes.error) throw new Error(vendorContractsRes.error.message);
  if (vendorsRes.error) throw new Error(vendorsRes.error.message);
  if (componentsRes.error) throw new Error(componentsRes.error.message);

  const vendorContracts = vendorContractsRes.data || [];
  const vendorById = new Map((vendorsRes.data || []).map((row) => [row.id, row.display_name]));
  const componentById = new Map((componentsRes.data || []).map((row) => [row.id, row.name]));

  const rows = [];
  for (const wo of workOrdersRes.data || []) {
    const urgency = computeUrgencyBucket({
      slaDueAt: wo.sla_due_at,
      priority: wo.priority,
      status: wo.status,
    });
    const badgeCandidates = [
      buildResponsibilityBadge(wo),
      buildWarrantyBadge(wo, vendorContracts),
      buildSlaBadge(wo.sla_due_at),
      buildDispatchReadinessBadge(wo),
    ].filter(Boolean);

    if (filter === "overdue") {
      const sla = wo.sla_due_at ? new Date(wo.sla_due_at).getTime() : 0;
      if (!sla || sla > Date.now()) continue;
    } else if (filter === "awaiting_vendor") {
      if (!String(wo.status || "").toLowerCase().includes("awaiting")) continue;
    } else if (filter === "sla_breach") {
      if (!badgeCandidates.includes("SLA breached")) continue;
    }

    rows.push({
      id: wo.id,
      title: wo.work_order_code || wo.category || "Work order",
      summary: wo.work_order_code || wo.category || "Work order",
      property_id: wo.property_id,
      property_name: namesById.get(wo.property_id) ?? null,
      component_name: wo.component_id ? componentById.get(wo.component_id) ?? null : null,
      vendor_name: wo.assigned_vendor_id ? vendorById.get(wo.assigned_vendor_id) ?? null : null,
      vendor_id: wo.assigned_vendor_id ?? null,
      status: wo.status,
      priority: wo.priority || urgency,
      urgency,
      sla_due_at: wo.sla_due_at ?? null,
      scheduled_at: wo.scheduled_at ?? null,
      badges: badgeCandidates,
      source: "work_order",
      opened_at: wo.created_at ?? null,
    });
  }
  return rows;
}

async function listWorkspaceVendorFollowups({ supabase, workspaceId }) {
  const { ids: propertyIds, namesById } = await loadWorkspacePropertyIds(supabase, workspaceId);
  if (propertyIds.length === 0) return [];

  const { data: workOrders, error } = await supabase
    .from("work_orders")
    .select("id, property_id, assigned_vendor_id, status, updated_at, metadata_json")
    .in("property_id", propertyIds)
    .ilike("status", "%awaiting%");
  if (error) throw new Error(error.message);

  const vendorIds = Array.from(new Set(
    (workOrders || []).map((row) => row.assigned_vendor_id).filter(Boolean),
  ));
  if (vendorIds.length === 0) return [];

  const { data: vendors, error: vendorsError } = await supabase
    .from("vendors")
    .select("id, display_name")
    .in("id", vendorIds);
  if (vendorsError) throw new Error(vendorsError.message);
  const vendorNameById = new Map((vendors || []).map((row) => [row.id, row.display_name]));

  const rows = [];
  for (const wo of workOrders || []) {
    if (!wo.assigned_vendor_id) continue;
    const lastTs = wo.updated_at ? new Date(wo.updated_at).getTime() : 0;
    const elapsedHours = lastTs > 0 ? Math.floor((Date.now() - lastTs) / (60 * 60 * 1000)) : 0;
    if (elapsedHours < 24) continue;
    const whatTheyOwe =
      String(wo.status || "").replace(/^awaiting[_\s]?/i, "").trim() || "response";
    rows.push({
      id: wo.id,
      vendor_id: wo.assigned_vendor_id,
      vendor_name: vendorNameById.get(wo.assigned_vendor_id) ?? "Vendor",
      what_they_owe: whatTheyOwe,
      elapsed_hours: elapsedHours,
      related_work_order_id: wo.id,
      related_property_id: wo.property_id ?? null,
      work_order_id: wo.id,
      property_name: namesById.get(wo.property_id) ?? null,
      summary: whatTheyOwe,
      last_event_at: wo.updated_at ?? null,
      waiting_days: Math.max(1, Math.floor(elapsedHours / 24)),
    });
  }
  rows.sort((a, b) => b.elapsed_hours - a.elapsed_hours);
  return rows;
}

async function listWorkspaceEscalations({ supabase, workspaceId }) {
  const { ids: propertyIds, namesById } = await loadWorkspacePropertyIds(supabase, workspaceId);
  const { data, error } = await supabase
    .from("issues_current")
    .select("id, summary, payload_json, created_at, status, lineage_json")
    .eq("workspace_id", workspaceId)
    .eq("status", "needs_review")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []).map((issue) => {
    const propertyId = normalizeUuid(issue.lineage_json?.property_id);
    return {
      id: issue.id,
      summary: issue.summary || "Escalation requires review",
      property_name: propertyId && propertyIds.includes(propertyId)
        ? namesById.get(propertyId) ?? null
        : null,
      reason: issue.summary || "Escalation requires review",
      raised_at: issue.created_at ?? null,
      linked_issue_id: issue.id,
      linked_property_id: propertyId || null,
      created_at: issue.created_at ?? null,
      payload_summary: issue.payload_json ?? {},
    };
  });
}

async function getWorkspacePressureStrip({ supabase, workspaceId }) {
  const { ids: propertyIds } = await loadWorkspacePropertyIds(supabase, workspaceId);
  if (propertyIds.length === 0) {
    return {
      open: 0,
      overdue: 0,
      awaiting_vendor: 0,
      sla_breach: 0,
      computed_at: new Date().toISOString(),
    };
  }
  const { data, error } = await supabase
    .from("work_orders")
    .select("id, status, sla_due_at")
    .in("property_id", propertyIds)
    .not("status", "in", "(completed,cancelled,archived)");
  if (error) throw new Error(error.message);

  const now = Date.now();
  let open = 0;
  let overdue = 0;
  let awaiting = 0;
  let slaBreach = 0;
  for (const row of data || []) {
    open += 1;
    const status = String(row.status || "").toLowerCase();
    if (status.includes("awaiting")) awaiting += 1;
    if (row.sla_due_at) {
      const due = new Date(row.sla_due_at).getTime();
      if (!Number.isNaN(due) && due < now) {
        overdue += 1;
        slaBreach += 1;
      }
    }
  }
  return {
    open,
    overdue,
    awaiting_vendor: awaiting,
    sla_breach: slaBreach,
    computed_at: new Date().toISOString(),
  };
}

export async function handleWorkspaceOpsCockpit(req, res, { requestId, readJsonBody }) {
  try {
    const { client, userId } = await getAuthenticatedContext(req);
    const body = await readJsonBody(req).catch(() => ({}));
    const action = String(body.action || "").trim();
    const workspaceId = normalizeUuid(body.workspace_id);
    if (!OPS_ACTIONS.has(action)) {
      throw makeError("invalid_or_missing_action", 400, { allowed: Array.from(OPS_ACTIONS) });
    }
    if (!workspaceId) throw makeError("missing_workspace_id", 400);
    await requireWorkspaceAccess(client, workspaceId, userId);

    switch (action) {
      case "pressure-strip": {
        const strip = await getWorkspacePressureStrip({ supabase: client, workspaceId });
        return sendJson(res, 200, buildPressureStripEnvelope({ strip, requestId }));
      }
      case "list-open-issues": {
        const filter = ISSUE_FILTERS.has(String(body.filter || "all")) ? body.filter : "all";
        const data = await listWorkspaceOpenIssues({
          supabase: client,
          workspaceId,
          filter,
          limit: body.limit,
        });
        return sendJson(res, 200, buildOpsListEnvelope({ data, requestId }));
      }
      case "list-vendor-followups": {
        const data = await listWorkspaceVendorFollowups({ supabase: client, workspaceId });
        return sendJson(res, 200, buildOpsListEnvelope({ data, requestId }));
      }
      case "list-escalations": {
        const data = await listWorkspaceEscalations({ supabase: client, workspaceId });
        return sendJson(res, 200, buildOpsListEnvelope({ data, requestId }));
      }
      default:
        throw makeError("invalid_or_missing_action", 400);
    }
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

function buildDocumentList(documents) {
  return documents.map((doc, index) => {
    const parts = [`${index + 1}. "${doc.title}"`];
    if (doc.document_type && doc.document_type !== "other") {
      parts.push(`(type: ${doc.document_type})`);
    }
    if (doc.detected_subject) parts.push(`[subject: ${doc.detected_subject}]`);
    return parts.join(" ");
  }).join("\n");
}

export function mapOrganizationSuggestion({ workspaceId, documents, aiSuggestion }) {
  const docIdMap = documents.reduce((acc, doc, index) => {
    acc[index + 1] = doc.id;
    return acc;
  }, {});
  const suggestedFolders = (aiSuggestion.folders || []).map((folder) => ({
    name: folder.name || "Untitled Folder",
    icon: VALID_ICONS.includes(folder.icon) ? folder.icon : "folder.fill",
    color: VALID_COLORS.includes(folder.color) ? folder.color : "#2d8878",
    document_ids: (folder.document_numbers || []).map((num) => docIdMap[num]).filter(Boolean),
    reasoning: folder.reasoning || "",
  }));
  const unassignedIds = (aiSuggestion.unassigned || [])
    .map((num) => docIdMap[num])
    .filter(Boolean);
  const assignedIds = new Set(suggestedFolders.flatMap((folder) => folder.document_ids));
  const missingIds = documents
    .map((doc) => doc.id)
    .filter((id) => !assignedIds.has(id) && !unassignedIds.includes(id));
  return {
    success: true,
    workspace_id: workspaceId,
    suggested_folders: suggestedFolders,
    unassigned_document_ids: [...unassignedIds, ...missingIds],
    reasoning: aiSuggestion.overall_reasoning || "Documents organized by content and type.",
    confidence: aiSuggestion.confidence || 0.8,
    request_id: undefined,
    execution_plane: "gcp",
  };
}

export async function handleSuggestOrganization(req, res, { requestId, readJsonBody, log }) {
  try {
    const { client, userId } = await getAuthenticatedContext(req);
    const body = await readJsonBody(req);
    const workspaceId = normalizeUuid(body.workspace_id);
    const requestedUserId = normalizeUuid(body.user_id);
    const includeExistingFolders = body.include_existing_folders !== false;
    if (!workspaceId || !requestedUserId) {
      throw makeError("Missing workspace_id or user_id", 400);
    }
    await requireWorkspaceAccess(client, workspaceId, userId);

    const supabase = createServiceClient();
    let query = supabase
      .from("documents")
      .select("id, title, document_type, detected_subject, original_filename, folder_id, created_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (!includeExistingFolders) query = query.is("folder_id", null);
    const { data: documents, error } = await query;
    if (error) throw makeError("Failed to fetch documents", 500);

    if (!documents || documents.length === 0) {
      return sendJson(res, 200, {
        success: true,
        workspace_id: workspaceId,
        suggested_folders: [],
        unassigned_document_ids: [],
        reasoning: "No documents found in workspace to organize.",
        confidence: 1.0,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    if (documents.length === 1) {
      return sendJson(res, 200, {
        success: true,
        workspace_id: workspaceId,
        suggested_folders: [],
        unassigned_document_ids: [documents[0].id],
        reasoning: "Only one document found - no organization needed.",
        confidence: 1.0,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    const docList = buildDocumentList(documents);
    const provider = resolveAIProvider({ workspaceId });
    log?.info?.("suggest-organization provider selected", { provider });
    const systemPrompt = `You are an expert document organizer. Analyze documents and suggest a logical folder structure.

RULES:
1. Suggest 2-5 folders maximum (fewer is better if documents are similar)
2. Group by theme, subject, type, or purpose - whatever makes most sense
3. Folder names should be concise but descriptive (2-4 words max)
4. Every document must be assigned to exactly one folder
5. If a document doesn't fit any group, it goes in "unassigned"

AVAILABLE ICONS (SF Symbols):
${VALID_ICONS.join(", ")}

AVAILABLE COLORS (hex):
${VALID_COLORS.join(", ")}

OUTPUT FORMAT (JSON only, no explanation):
{
  "folders": [
    {
      "name": "Folder Name",
      "icon": "folder.fill",
      "color": "#2d8878",
      "document_numbers": [1, 2, 3],
      "reasoning": "Brief explanation"
    }
  ],
  "unassigned": [4, 5],
  "overall_reasoning": "Brief explanation of the organization strategy",
  "confidence": 0.85
}`;
    const userPrompt = `Organize these ${documents.length} documents into a logical folder structure:

${docList}

Return JSON only.`;
    const completion = await createChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }, {
      workspaceId,
      requestId,
    });

    const responseText = completion?.choices?.[0]?.message?.content || "{}";
    let aiSuggestion;
    try {
      aiSuggestion = JSON.parse(responseText);
    } catch {
      throw makeError("Failed to parse AI suggestion", 500);
    }
    const response = mapOrganizationSuggestion({ workspaceId, documents, aiSuggestion });
    response.request_id = requestId;
    return sendJson(res, 200, response);
  } catch (error) {
    return safeError(res, requestId, error);
  }
}
