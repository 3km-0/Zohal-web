import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAskConversationHistoryResponse,
  buildAskConversationListResponse,
  buildChatMessageResponse,
  buildExplainResponse,
  normalizeUuid,
  streamErrorMessage,
} from "../src/handlers/search-agent.js";

test("search-agent helpers normalize UUID-like values", () => {
  assert.equal(normalizeUuid(" ABC-DEF "), "abc-def");
  assert.equal(normalizeUuid(null), "");
});

test("ask conversation list preserves legacy item envelope", () => {
  assert.deepEqual(buildAskConversationListResponse({
    conversations: [{
      id: "conv-1",
      title: "",
      workspace_id: "ws-1",
      updated_at: "2026-04-29T10:00:00.000Z",
    }],
    explanations: [{
      conversation_id: "conv-1",
      input_text: "What changed?",
      response_text: "The term changed.",
      created_at: "2026-04-29T10:01:00.000Z",
    }],
    workspaces: [{ id: "ws-1", name: "Deals" }],
  }), {
    items: [{
      id: "conv-1",
      title: "What changed?",
      workspace_id: "ws-1",
      workspace_name: "Deals",
      updated_at: "2026-04-29T10:00:00.000Z",
      preview: "What changed?",
      last_message_at: "2026-04-29T10:01:00.000Z",
    }],
  });
});

test("ask conversation history expands stored assistant rows into chat transcript", () => {
  assert.deepEqual(buildAskConversationHistoryResponse({
    conversation: {
      id: "conv-1",
      title: "Ask",
      workspace_id: "ws-1",
      updated_at: "2026-04-29T10:00:00.000Z",
    },
    explanations: [{
      id: "exp-1",
      input_text: "Question",
      response_text: "Answer",
      created_at: "2026-04-29T10:01:00.000Z",
      context_chunks: ['{"document_id":"doc-1","document_title":"Lease","page_number":1,"quote":"Clause","chunk_id":"chunk-1"}'],
    }],
  }), {
    conversation: {
      id: "conv-1",
      title: "Ask",
      workspace_id: "ws-1",
      updated_at: "2026-04-29T10:00:00.000Z",
    },
    messages: [
      {
        id: "exp-1-user",
        role: "user",
        content: "Question",
        created_at: "2026-04-29T10:01:00.000Z",
        citations: [],
      },
      {
        id: "exp-1-assistant",
        role: "assistant",
        content: "Answer",
        created_at: "2026-04-29T10:01:00.000Z",
        citations: [{
          document_id: "doc-1",
          document_title: "Lease",
          page_number: 1,
          quote: "Clause",
          chunk_id: "chunk-1",
        }],
      },
    ],
  });
});

test("chat response keeps both old AI service and current document chat envelopes", () => {
  assert.deepEqual(buildChatMessageResponse({
    conversationId: "conv-1",
    messageId: "msg-1",
    responseText: "Hello",
    responseHtml: "<p>Hello</p>",
    requestType: "chat",
    createdAt: "2026-04-29T10:01:00.000Z",
    requestId: "req-1",
  }), {
    conversation_id: "conv-1",
    request_id: "req-1",
    response: {
      id: "msg-1",
      response_text: "Hello",
      response_html: "<p>Hello</p>",
    },
    message: {
      id: "msg-1",
      role: "assistant",
      content: "Hello",
      content_html: "<p>Hello</p>",
      request_type: "chat",
      created_at: "2026-04-29T10:01:00.000Z",
    },
  });
});

test("explain response preserves iOS explanation envelope with GCP metadata", () => {
  assert.deepEqual(buildExplainResponse({
    explanation: { id: "exp-1", response_text: "Explained" },
    currentCount: 2,
    dailyLimit: 25,
    requestId: "req-exp",
  }), {
    explanation: { id: "exp-1", response_text: "Explained" },
    can_explain: true,
    current_count: 2,
    daily_limit: 25,
    request_id: "req-exp",
    execution_plane: "gcp",
  });
});

test("workspace agent stream errors prefer user-facing limit messages", () => {
  assert.equal(streamErrorMessage({
    message: "limit_exceeded",
    response: { message: "You have reached your included usage. Upgrade your plan for more." },
  }), "You have reached your included usage. Upgrade your plan for more.");
  assert.equal(streamErrorMessage(new Error("Ask failed")), "Ask failed");
});
