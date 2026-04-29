import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createChatCompletion, createEmbedding, resolveAIProvider } from "../runtime/ai-provider.js";
import { sendJson } from "../runtime/http.js";
import { isInternalCaller } from "../runtime/internal-auth.js";
import { createServiceClient, getSupabaseUrl } from "../runtime/supabase.js";

const ASK_MODEL = String(process.env.OPENAI_ASK_MODEL || process.env.OPENAI_CONTRACT_MODEL || "gpt-5.4").trim();
const CHAT_MODEL = String(process.env.OPENAI_CHAT_MODEL || "gpt-4o").trim();

function authHeader(req) {
  return String(req.headers.authorization || req.headers.Authorization || "");
}

function stripBearer(value) {
  const raw = String(value || "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice("bearer ".length).trim() : raw;
}

function getAnonKey() {
  const key = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!key) throw new Error("SUPABASE_ANON_KEY not configured");
  return key;
}

async function getUser(req) {
  const token = stripBearer(authHeader(req));
  if (!token) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  const client = createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error("Unauthorized");
    authError.statusCode = 401;
    throw authError;
  }
  return data.user;
}

async function requireUserOrInternal(req, userId) {
  if (isInternalCaller(req.headers)) return { id: userId || null, internal: true };
  return { ...(await getUser(req)), internal: false };
}

function normalizeUuid(value) {
  return String(value || "").trim().toLowerCase();
}

function safeError(res, requestId, error) {
  return sendJson(res, error.statusCode || 500, {
    error: error.message || "Internal server error",
    request_id: requestId,
    execution_plane: "gcp",
  });
}

async function assertWorkspaceAccess(supabase, workspaceId, userId) {
  if (!workspaceId) return true;
  const [{ data: membership }, { data: owned }] = await Promise.all([
    supabase.from("workspace_members").select("id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
    supabase.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", userId).maybeSingle(),
  ]);
  return Boolean(membership || owned);
}

async function accessibleWorkspaceIds(supabase, userId, workspaceId) {
  if (workspaceId) return [workspaceId];
  const [{ data: memberships }, { data: owned }] = await Promise.all([
    supabase.from("workspace_members").select("workspace_id").eq("user_id", userId),
    supabase.from("workspaces").select("id").eq("owner_id", userId),
  ]);
  return [...new Set([
    ...(memberships || []).map((row) => normalizeUuid(row.workspace_id)).filter(Boolean),
    ...(owned || []).map((row) => normalizeUuid(row.id)).filter(Boolean),
  ])];
}

function limitExceededResponse(result, metric, requestId) {
  return {
    ok: false,
    error_code: "limit_exceeded",
    request_id: requestId,
    error: "limit_exceeded",
    message: "You have reached your included usage. Upgrade your plan for more.",
    rate_limit: {
      metric,
      current: result?.current_count ?? result?.current ?? 0,
      limit: result?.limit ?? result?.daily_limit ?? 0,
      tier: result?.tier ?? "free",
      resets_at: result?.resets_at ?? null,
    },
  };
}

async function checkUsage(supabase, userId, metric, requestId) {
  const rpcName = metric === "ask" ? "check_and_increment_ask" : null;
  if (rpcName) {
    const { data, error } = await supabase.rpc(rpcName, { p_user_id: userId });
    if (!error && data && data.allowed === false) return { allowed: false, response: limitExceededResponse(data, metric, requestId) };
  }
  return { allowed: true };
}

function parseStoredCitations(contextChunks) {
  return (contextChunks || []).flatMap((item) => {
    if (typeof item !== "string" || !item.trim().startsWith("{")) return [];
    try {
      const parsed = JSON.parse(item);
      return parsed?.document_id ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

export function buildAskConversationListResponse({ conversations = [], explanations = [], workspaces = [] }) {
  const latestByConversation = new Map();
  for (const explanation of explanations || []) {
    const id = String(explanation.conversation_id || "");
    if (id && !latestByConversation.has(id)) latestByConversation.set(id, explanation);
  }
  const workspaceNameById = new Map((workspaces || []).map((workspace) => [String(workspace.id), String(workspace.name)]));
  return {
    items: (conversations || []).filter((conversation) => latestByConversation.has(String(conversation.id))).map((conversation) => {
      const latest = latestByConversation.get(String(conversation.id)) || {};
      return {
        id: conversation.id,
        title: conversation.title || latest.input_text || "Ask",
        workspace_id: conversation.workspace_id,
        workspace_name: conversation.workspace_id ? workspaceNameById.get(String(conversation.workspace_id)) ?? null : null,
        updated_at: conversation.updated_at,
        preview: latest.input_text || latest.response_text || "",
        last_message_at: latest.created_at || conversation.updated_at,
      };
    }),
  };
}

export function buildAskConversationHistoryResponse({ conversation, explanations = [] }) {
  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      workspace_id: conversation.workspace_id,
      updated_at: conversation.updated_at,
    },
    messages: (explanations || []).flatMap((row) => {
      const citations = parseStoredCitations(row.context_chunks || null);
      return [
        { id: `${row.id}-user`, role: "user", content: row.input_text, created_at: row.created_at, citations: [] },
        { id: `${row.id}-assistant`, role: "assistant", content: row.response_text, created_at: row.created_at, citations },
      ];
    }),
  };
}

export async function handleAskConversations(req, res, { requestId, readJsonBody, supabase = createServiceClient() }) {
  try {
    const user = await getUser(req);
    const body = await readJsonBody(req);
    const workspaceId = normalizeUuid(body.workspace_id) || null;
    if (workspaceId && !(await assertWorkspaceAccess(supabase, workspaceId, user.id))) {
      return sendJson(res, 403, { error: "Workspace access denied", request_id: requestId, execution_plane: "gcp" });
    }
    if (body.action === "list") {
      let query = supabase.from("conversations").select("id, title, workspace_id, updated_at, created_at").eq("user_id", user.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(30);
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      const { data: conversations, error } = await query;
      if (error) throw error;
      const ids = (conversations || []).map((item) => item.id);
      const { data: explanations } = ids.length ? await supabase.from("explanations").select("conversation_id, input_text, response_text, created_at, request_type, role").in("conversation_id", ids).eq("role", "assistant").in("request_type", ["ask", "chat"]).order("created_at", { ascending: false }) : { data: [] };
      const workspaceIds = [...new Set((conversations || []).map((item) => item.workspace_id).filter(Boolean))];
      const { data: workspaces } = workspaceIds.length ? await supabase.from("workspaces").select("id, name").in("id", workspaceIds) : { data: [] };
      return sendJson(res, 200, buildAskConversationListResponse({ conversations, explanations, workspaces }));
    }
    const conversationId = normalizeUuid(body.conversation_id);
    if (!conversationId) return sendJson(res, 400, { error: "Missing conversation_id", request_id: requestId, execution_plane: "gcp" });
    const { data: conversation } = await supabase.from("conversations").select("id, title, workspace_id, updated_at").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conversation) return sendJson(res, 404, { error: "Conversation not found", request_id: requestId, execution_plane: "gcp" });
    const { data: explanations, error } = await supabase.from("explanations").select("id, input_text, response_text, created_at, request_type, role, context_chunks").eq("conversation_id", conversationId).eq("role", "assistant").in("request_type", ["ask", "chat"]).order("created_at", { ascending: true });
    if (error) throw error;
    return sendJson(res, 200, buildAskConversationHistoryResponse({ conversation, explanations }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

function titleFromQuestion(question) {
  return String(question || "Ask").trim().split(/\s+/).slice(0, 8).join(" ") || "Ask";
}

async function ensureAskConversation({ supabase, conversationId, userId, workspaceId, documentId, title, contextText }) {
  const payload = {
    id: conversationId,
    user_id: userId,
    workspace_id: workspaceId || null,
    document_id: documentId || null,
    title,
    context_text: contextText || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("conversations").upsert(payload, { onConflict: "id" });
}

async function saveAskExplanation({ supabase, userId, conversationId, question, answer, modelUsed, latencyMs, citations = [], documentId = null }) {
  await supabase.from("explanations").insert({
    user_id: userId,
    conversation_id: conversationId,
    document_id: documentId,
    role: "assistant",
    request_type: "ask",
    input_text: question,
    response_text: answer,
    model_used: modelUsed,
    latency_ms: latencyMs,
    context_chunks: citations.map((citation) => JSON.stringify(citation)),
  });
}

async function lexicalSearch({ supabase, query, workspaceIds, documentIds = [], topK = 10 }) {
  const terms = String(query || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((term) => term.length >= 3).slice(0, 8);
  let db = supabase.from("document_chunks").select("id, document_id, workspace_id, page_number, content_text, language, documents!inner(title, deleted_at)").in("workspace_id", workspaceIds).limit(Math.max(topK * 8, 40));
  if (documentIds.length) db = db.in("document_id", documentIds.map(normalizeUuid));
  const { data, error } = await db;
  if (error) throw error;
  return (data || [])
    .filter((chunk) => chunk.documents?.deleted_at == null)
    .map((chunk) => {
      const text = String(chunk.content_text || "");
      const lower = text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      return { chunk, score };
    })
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      document_title: chunk.documents?.title || "Document",
      page_number: chunk.page_number || 1,
      content_text: chunk.content_text || "",
      content_preview: String(chunk.content_text || "").slice(0, 240),
      similarity: terms.length ? Math.min(0.99, 0.25 + score / terms.length) : 0.2,
      quality: score >= Math.max(2, Math.ceil(terms.length / 2)) ? "strong" : "good",
      language: chunk.language || "unknown",
    }));
}

async function semanticSearchCore({ req, body, requestId, supabase }) {
  const userId = normalizeUuid(body.user_id);
  const workspaceId = normalizeUuid(body.workspace_id) || null;
  const query = String(body.query || "").trim();
  if (!query || !userId) {
    const error = new Error("Missing required fields: query, user_id");
    error.statusCode = 400;
    throw error;
  }
  if (workspaceId && !(await assertWorkspaceAccess(supabase, workspaceId, userId))) {
    const error = new Error("Workspace access denied");
    error.statusCode = 403;
    throw error;
  }
  const workspaceIds = await accessibleWorkspaceIds(supabase, userId, workspaceId);
  if (!workspaceIds.length) {
    return { success: true, query, query_embedding_time_ms: 0, search_time_ms: 0, fetch_time_ms: 0, total_time_ms: 0, results_count: 0, results: [], execution_plane: "gcp" };
  }

  const totalStart = Date.now();
  const options = body.options || {};
  const topK = options.top_k || 20;
  const documentIds = Array.isArray(options.document_ids) ? options.document_ids : [];
  let embeddingMs = 0;
  let results = [];

  try {
    const embedStart = Date.now();
    const { data: configData } = await supabase.rpc("get_active_embedding_config", { p_workspace_id: workspaceId || workspaceIds[0] });
    const config = configData?.[0] || { model: "text-embedding-3-small" };
    const embedding = await createEmbedding({ model: config.model, input: query }, { requestId });
    embeddingMs = Date.now() - embedStart;
    const vector = embedding?.data?.[0]?.embedding;
    if (vector) {
      const { data } = await supabase.rpc("search_document_chunks", {
        query_embedding: vector,
        match_threshold: options.threshold || 0.15,
        match_count: topK,
        filter_workspace_ids: workspaceIds,
        filter_document_ids: documentIds.length ? documentIds : null,
      });
      results = (data || []).map((row) => ({
        chunk_id: row.chunk_id || row.id,
        document_id: row.document_id,
        document_title: row.document_title || row.title || "Document",
        page_number: row.page_number || 1,
        content_text: row.content_text || row.content || "",
        content_preview: String(row.content_text || row.content || "").slice(0, 240),
        similarity: Number(row.similarity || 0),
        quality: Number(row.similarity || 0) >= 0.75 ? "strong" : Number(row.similarity || 0) >= 0.4 ? "good" : "weak",
        language: row.language || "unknown",
      }));
    }
  } catch {
    results = [];
  }

  if (!results.length) {
    results = await lexicalSearch({ supabase, query, workspaceIds, documentIds, topK });
  }
  return {
    success: true,
    query,
    query_embedding_time_ms: embeddingMs,
    search_time_ms: Date.now() - totalStart - embeddingMs,
    fetch_time_ms: 0,
    total_time_ms: Date.now() - totalStart,
    results_count: results.length,
    results,
    execution_plane: "gcp",
  };
}

export async function handleSemanticSearch(req, res, { requestId, readJsonBody, supabase = createServiceClient() }) {
  try {
    const body = await readJsonBody(req);
    await requireUserOrInternal(req, normalizeUuid(body.user_id));
    const result = await semanticSearchCore({ req, body, requestId, supabase });
    return sendJson(res, 200, result);
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

async function askWorkspaceCore({ req, body, requestId, supabase }) {
  const totalStart = Date.now();
  const question = String(body.question || "").trim();
  const userId = normalizeUuid(body.user_id);
  const workspaceId = normalizeUuid(body.workspace_id) || null;
  if (!question || !userId) {
    const error = new Error("Missing required fields: question, user_id");
    error.statusCode = 400;
    throw error;
  }
  if (workspaceId && !(await assertWorkspaceAccess(supabase, workspaceId, userId))) {
    const error = new Error("Workspace access denied");
    error.statusCode = 403;
    throw error;
  }
  const usage = await checkUsage(supabase, userId, "ask", requestId);
  if (!usage.allowed) {
    const error = new Error("limit_exceeded");
    error.statusCode = 429;
    error.response = usage.response;
    throw error;
  }

  const options = body.options || {};
  const documentIds = options.document_ids || body.document_ids || [];
  const conversationId = normalizeUuid(body.conversation_id) || randomUUID();
  await ensureAskConversation({
    supabase,
    conversationId,
    userId,
    workspaceId,
    documentId: documentIds[0] || null,
    title: titleFromQuestion(question),
    contextText: question,
  });

  const retrievalStart = Date.now();
  const search = await semanticSearchCore({
    req,
    body: {
      query: question,
      user_id: userId,
      workspace_id: workspaceId,
      options: { top_k: options.top_k || body.top_k || 10, document_ids: documentIds, skip_usage_check: true },
    },
    requestId,
    supabase,
  });
  const retrievalMs = Date.now() - retrievalStart;
  if (!search.results.length) {
    const answer = "I couldn't find any relevant information in your documents to answer this question. Please make sure your documents have been processed, or try rephrasing your question.";
    await saveAskExplanation({ supabase, userId, conversationId, question, answer, modelUsed: "rag-no-results", latencyMs: retrievalMs, documentId: documentIds[0] || null }).catch(() => {});
    return { success: true, conversation_id: conversationId, question, answer, citations: [], confidence: 0, context_chunks_used: 0, retrieval_time_ms: retrievalMs, llm_time_ms: 0, total_time_ms: Date.now() - totalStart, execution_plane: "gcp" };
  }

  const context = search.results.map((result, index) => `[Source ${index + 1}: "${result.document_title}", Page ${result.page_number}]\n${result.content_text}\n---`).join("\n\n");
  const completionStart = Date.now();
  const completion = await createChatCompletion({
    model: ASK_MODEL,
    messages: [
      { role: "system", content: "You are Zohal. Answer only from the supplied document context. Cite sources as [Source N]. Return JSON: {\"answer\":string,\"citations_used\":number[],\"confidence\":number}." },
      { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION:\n${question}` },
    ],
    max_tokens: 1500,
    temperature: 0.3,
    response_format: { type: "json_object" },
  }, { requestId, workspaceId });
  const llmMs = Date.now() - completionStart;
  const raw = completion?.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { answer: raw, citations_used: [], confidence: 0.5 };
  }
  const citations = (parsed.citations_used || []).filter((idx) => idx > 0 && idx <= search.results.length).map((idx) => {
    const result = search.results[idx - 1];
    return {
      document_id: result.document_id,
      document_title: result.document_title,
      page_number: result.page_number,
      quote: String(result.content_text || "").slice(0, 200),
      chunk_id: result.chunk_id,
    };
  });
  const answer = String(parsed.answer || raw || "");
  await saveAskExplanation({
    supabase,
    userId,
    conversationId,
    question,
    answer,
    modelUsed: completion?.model || ASK_MODEL,
    latencyMs: llmMs,
    citations,
    documentId: documentIds[0] || null,
  }).catch(() => {});
  return {
    success: true,
    conversation_id: conversationId,
    question,
    answer,
    citations,
    confidence: Number(parsed.confidence || 0.5),
    context_chunks_used: search.results.length,
    retrieval_time_ms: retrievalMs,
    llm_time_ms: llmMs,
    total_time_ms: Date.now() - totalStart,
    source: "rag",
    execution_plane: "gcp",
  };
}

export async function handleAskWorkspace(req, res, { requestId, readJsonBody, supabase = createServiceClient() }) {
  try {
    const body = await readJsonBody(req);
    await requireUserOrInternal(req, normalizeUuid(body.user_id));
    const result = await askWorkspaceCore({ req, body, requestId, supabase });
    return sendJson(res, 200, result);
  } catch (error) {
    if (error.response) return sendJson(res, error.statusCode || 429, error.response);
    return safeError(res, requestId, error);
  }
}

function ndjson(res, event) {
  res.write(`${JSON.stringify(event)}\n`);
}

export async function handleWorkspaceAgent(req, res, { requestId, readJsonBody, supabase = createServiceClient() }) {
  function write(event) {
    ndjson(res, event);
  }

  try {
    const body = await readJsonBody(req);
    const user = await getUser(req);
    const workspaceId = normalizeUuid(body.workspace_id);
    const documentId = normalizeUuid(body.opened_document_id || body.document_id) || null;
    const conversationId = normalizeUuid(body.conversation_id) || randomUUID();

    if (workspaceId && !(await assertWorkspaceAccess(supabase, workspaceId, user.id))) {
      res.writeHead(403, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-cache",
        "access-control-allow-origin": "*",
      });
      return res.end(JSON.stringify({
        error: "Workspace access denied",
        request_id: requestId,
        execution_plane: "gcp",
      }));
    }

    res.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      "access-control-allow-origin": "*",
    });

    write({
      type: "run_started",
      conversation_id: conversationId,
      workspace_id: workspaceId || undefined,
      opened_document_id: documentId,
    });

    if (body.agent_action?.action_id) {
      const actionId = String(body.agent_action.action_id || "").trim();
      write({ type: "status", message: "Applying workspace action..." });

      if (actionId === "edit_sources") {
        const requestedIds = Array.isArray(body.agent_action?.payload?.included_document_ids)
          ? body.agent_action.payload.included_document_ids.map(normalizeUuid).filter(Boolean)
          : [];
        const { data: docs } = requestedIds.length
          ? await supabase
            .from("documents")
            .select("id,title,original_filename,document_type,processing_status")
            .in("id", requestedIds)
          : { data: [] };
        const included = (docs || []).map((doc) => ({
          document_id: doc.id,
          title: doc.title || doc.original_filename || "Document",
          document_type: doc.document_type || null,
          processing_status: doc.processing_status || null,
        }));
        write({
          type: "scope_candidate",
          included_sources: included,
          excluded_sources: [],
          primary_document_id: included[0]?.document_id || null,
        });
        const message = included.length
          ? `Updated the working source set to ${included.length} document${included.length === 1 ? "" : "s"}.`
          : "No source changes were applied.";
        write({ type: "answer_delta", delta: message });
      } else {
        const message = "This legacy workspace action has moved into the backend agent shell. Start a new analysis run from the Run panel when you want to change canonical Snapshot truth.";
        write({ type: "answer_delta", delta: message });
      }

      write({ type: "cta_set", ctas: [] });
      write({ type: "completed", conversation_id: conversationId, citations: [], run_ref: null });
      return res.end();
    }

    const question = String(body.question || body.message || "").trim();
    if (!question) {
      write({ type: "error", message: "Missing question" });
      write({ type: "completed", conversation_id: conversationId, citations: [] });
      return res.end();
    }

    write({ type: "status", message: "Searching workspace evidence..." });
    const result = await askWorkspaceCore({
      req,
      body: {
        ...body,
        question,
        user_id: user.id,
        workspace_id: workspaceId || body.workspace_id,
        document_id: documentId || body.document_id,
        conversation_id: conversationId,
      },
      requestId,
      supabase,
    });
    write({ type: "citations", citations: result.citations || [] });
    write({ type: "answer_delta", delta: result.answer || "" });
    write({ type: "cta_set", ctas: [] });
    write({
      type: "completed",
      conversation_id: result.conversation_id || conversationId,
      citations: result.citations || [],
      run_ref: null,
    });
    return res.end();
  } catch (error) {
    res.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      "access-control-allow-origin": "*",
    });
    ndjson(res, { type: "error", message: error.message || "Ask failed" });
    ndjson(res, { type: "completed", conversation_id: randomUUID(), citations: [] });
    return res.end();
  }
}

export function buildChatMessageResponse({ conversationId, messageId = null, responseText, responseHtml = null, requestType = "chat", createdAt, requestId }) {
  return {
    conversation_id: conversationId,
    request_id: requestId,
    response: {
      id: messageId,
      response_text: responseText,
      response_html: responseHtml,
    },
    message: {
      id: messageId,
      role: "assistant",
      content: responseText,
      content_html: responseHtml,
      request_type: requestType,
      created_at: createdAt,
    },
  };
}

export async function handleChat(req, res, { requestId, readJsonBody, supabase = createServiceClient() }) {
  try {
    await getUser(req);
    const body = await readJsonBody(req);
    const userId = normalizeUuid(body.user_id);
    const message = String(body.message || "").trim();
    if (!userId || !message) return sendJson(res, 400, { error: "Missing required fields: user_id and message", request_id: requestId, execution_plane: "gcp" });
    const conversationId = normalizeUuid(body.conversation_id) || randomUUID();
    const completion = await createChatCompletion({
      model: String(body.model || "").trim() || CHAT_MODEL,
      messages: [
        { role: "system", content: "You are Zohal, a helpful AI assistant integrated into a document workspace. Be concise, clear, and grounded in supplied context." },
        ...(body.context ? [{ role: "system", content: `Background context:\n${body.context}` }] : []),
        { role: "user", content: message },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    }, { requestId, providerOverride: body.provider_override, workspaceId: body.workspace_id || body.document_id || null });
    const text = completion?.choices?.[0]?.message?.content || "";
    const createdAt = new Date().toISOString();
    try {
      await supabase.from("explanations").insert({
        user_id: userId,
        conversation_id: conversationId,
        document_id: body.document_id || null,
        selection_id: body.selection_id || null,
        role: "assistant",
        request_type: body.request_type || "chat",
        input_text: message,
        response_text: text,
        model_used: completion?.model || CHAT_MODEL,
        prompt_tokens: Number(completion?.usage?.prompt_tokens || 0),
        completion_tokens: Number(completion?.usage?.completion_tokens || 0),
      });
    } catch {
      // Chat should still return if history persistence is temporarily unavailable.
    }
    return sendJson(res, 200, buildChatMessageResponse({ conversationId, responseText: text, requestType: body.request_type || "chat", createdAt, requestId }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export function buildExplainResponse({ explanation, currentCount = 0, dailyLimit = 0, requestId }) {
  return {
    explanation,
    can_explain: true,
    current_count: currentCount,
    daily_limit: dailyLimit,
    request_id: requestId,
    execution_plane: "gcp",
  };
}

export async function handleExplain(req, res, { requestId, readJsonBody, supabase = createServiceClient() }) {
  try {
    await getUser(req);
    const body = await readJsonBody(req);
    const userId = normalizeUuid(body.user_id);
    if (!userId || !body.document_id || !body.selection_id || !body.selected_text) {
      return sendJson(res, 400, { error: "Missing required fields: user_id, document_id, selection_id, selected_text", request_id: requestId, execution_plane: "gcp" });
    }
    const completion = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "You are a helpful tutor. Explain selected textbook content clearly. Return JSON: {\"text\":string,\"html\":string}." },
        { role: "user", content: `Context from page ${Number(body.page_number || 0) + 1}:\n${body.context || ""}\n\nSelected text:\n${body.selected_text}` },
      ],
      max_tokens: 1000,
      temperature: 0.7,
      response_format: { type: "json_object" },
    }, { requestId, workspaceId: body.document_id });
    const raw = completion?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { text: raw, html: null };
    }
    const row = {
      user_id: userId,
      selection_id: body.selection_id,
      document_id: body.document_id,
      request_type: body.request_type || "explain",
      input_text: body.selected_text,
      response_text: parsed.text || raw,
      response_html: parsed.html || null,
      book_anchor_page: body.page_number,
      model_used: completion?.model || CHAT_MODEL,
      prompt_tokens: Number(completion?.usage?.prompt_tokens || 0),
      completion_tokens: Number(completion?.usage?.completion_tokens || 0),
      latency_ms: 0,
      estimated_cost_cents: 0,
      follow_up_requested: false,
    };
    const { data } = await supabase.from("explanations").insert(row).select().single();
    return sendJson(res, 200, buildExplainResponse({ explanation: data || { ...row, id: null, created_at: new Date().toISOString() }, requestId }));
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export async function handleUnifiedSearch(req, res, { requestId, readJsonBody, supabase = createServiceClient() }) {
  try {
    await getUser(req);
    const body = await readJsonBody(req);
    const search = await semanticSearchCore({ req, body, requestId, supabase });
    let ai_answer = null;
    if (body.options?.include_answer !== false && search.results.length) {
      ai_answer = await askWorkspaceCore({
        req,
        body: {
          question: body.query,
          user_id: body.user_id,
          workspace_id: body.workspace_id,
          options: { top_k: body.options?.top_k || 6, document_ids: body.options?.document_ids || [] },
        },
        requestId,
        supabase,
      }).catch(() => null);
    }
    return sendJson(res, 200, {
      success: true,
      query: body.query,
      query_type: String(body.query || "").trim().endsWith("?") ? "question" : "search",
      results: search.results,
      results_count: search.results_count,
      search_results: search.results,
      search_results_count: search.results_count,
      ai_answer,
      insight_answer: null,
      insights: [],
      insights_time_ms: 0,
      search_time_ms: search.search_time_ms,
      ai_time_ms: ai_answer ? ai_answer.llm_time_ms || 0 : 0,
      total_time_ms: search.total_time_ms,
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    return safeError(res, requestId, error);
  }
}

export { normalizeUuid, resolveAIProvider };
