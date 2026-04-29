import { createServer } from "node:http";
import {
  handleAnalysisExportReport,
  handleAnalysisReduce,
  handleAnalysisPromotePrivateLivePublic,
  handleAnalysisStart,
  handleAnalysisTask,
} from "./handlers/analysis.js";
import {
  handleAcquisitionApi,
  handleAcquisitionInternal,
  isAcquisitionApiRoute,
} from "./handlers/acquisition.js";
import {
  handleAgentOrchestrate,
  handleAgentOutboxRun,
} from "./handlers/agent.js";
import {
  handleWorkspaceAutomationRunNow,
  handleWorkspaceAutomations,
} from "./handlers/automations.js";
import { handleConvertToPdf } from "./handlers/convert-to-pdf.js";
import {
  handleLibraryDownload,
  handleLibraryList,
} from "./handlers/library.js";
import {
  handleDocumentDeleteEmbeddings,
  handleIngestionChunk,
  handleIngestionClassify,
  handleIngestionCleanupVectors,
  handleIngestionDeleteEmbeddings,
  handleIngestionEmbed,
  handleIngestionExtractInsights,
  handleIngestionExtractText,
  handleIngestionFetchOcr,
  handleIngestionReconcileStatus,
  handleIngestionRunTextPipeline,
  handleIngestionStart,
  handleIngestionStartOcr,
  handleIngestionTask,
} from "./handlers/ingestion.js";
import {
  handleFetchApiSource,
  handleGoogleDriveImport,
  handleOneDriveImport,
  handleWhatsappChannelStatus,
  handleWhatsappImport,
  handleWorkspaceApiConnections,
} from "./handlers/integrations.js";
import {
  handleDocumentDownloadUrl,
  handleDocumentSourceUploadUrl,
  handleDocumentUploadUrl,
  handleEnterpriseDataLocalityRegions,
  handleMathpixToken,
  handleSupportTicketCreate,
} from "./handlers/utility.js";
import {
  handleExportAuditPack,
  handleExportCalendar,
  handleExportContractReport,
} from "./handlers/exports.js";
import {
  handleEnterpriseProvisionRegion,
  handleEnterpriseProvisioningStatus,
  handleOrgInviteAccept,
  handleOrgInviteCreate,
  handleOrgInviteRevoke,
  handleWorkspaceMemberAdd,
  handleWorkspaceMemberRemove,
  handleWorkspaceMembersList,
  handleWorkspaceMemberUpdateRole,
} from "./handlers/team-admin.js";
import {
  handleSuggestOrganization,
  handleWorkspaceOpsCockpit,
} from "./handlers/operations.js";
import {
  handleAskConversations,
  handleAskWorkspace,
  handleChat,
  handleExplain,
  handleSemanticSearch,
  handleUnifiedSearch,
  handleWorkspaceAgent,
} from "./handlers/search-agent.js";
import {
  handleTemplatesCreate,
  handleTemplatesCreateVersion,
  handleTemplatesGet,
  handleTemplatesList,
  handleTemplatesPublish,
} from "./handlers/templates.js";
import { handleWhatsappOrchestrate } from "./handlers/whatsapp.js";
import { sendJson, sendOptions, getRequestId, readJsonBody } from "./runtime/http.js";
import { createLogger } from "./runtime/logging.js";

const port = Number(process.env.PORT || 8080);

const server = createServer(async (req, res) => {
  const requestId = getRequestId(req);
  const log = createLogger("zohal-backend", requestId);

  try {
    if (req.method === "OPTIONS") {
      return sendOptions(res);
    }

    const url = new URL(req.url || "/", "http://localhost");

    if (
      req.method === "GET" &&
      (url.pathname === "/healthz" ||
        url.pathname === "/status" ||
        url.pathname === "/readyz")
    ) {
      return sendJson(res, 200, {
        ok: true,
        request_id: requestId,
        execution_plane: "gcp",
      });
    }

    if (req.method === "POST" && url.pathname === "/convert-to-pdf") {
      return await handleConvertToPdf(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/documents/download-url") {
      return await handleDocumentDownloadUrl(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/documents/upload-url") {
      return await handleDocumentUploadUrl(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/documents/source-upload-url") {
      return await handleDocumentSourceUploadUrl(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/documents/delete-embeddings") {
      return await handleDocumentDeleteEmbeddings(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/support/tickets") {
      return await handleSupportTicketCreate(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/mathpix/token") {
      return await handleMathpixToken(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/integrations/google-drive/import") {
      return await handleGoogleDriveImport(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/integrations/onedrive/import") {
      return await handleOneDriveImport(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/integrations/whatsapp/import") {
      return await handleWhatsappImport(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/integrations/whatsapp/channel-status") {
      return await handleWhatsappChannelStatus(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/integrations/api-connections") {
      return await handleWorkspaceApiConnections(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/integrations/fetch-api-source") {
      return await handleFetchApiSource(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/chat") {
      return await handleChat(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/explain") {
      return await handleExplain(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/search/semantic") {
      return await handleSemanticSearch(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/search/unified") {
      return await handleUnifiedSearch(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ask/workspace") {
      return await handleAskWorkspace(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ask/conversations") {
      return await handleAskConversations(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/agent") {
      return await handleWorkspaceAgent(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/automations") {
      return await handleWorkspaceAutomations(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/automations/run-now") {
      return await handleWorkspaceAutomationRunNow(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/enterprise/data-locality/regions") {
      return await handleEnterpriseDataLocalityRegions(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/enterprise/provision-region") {
      return await handleEnterpriseProvisionRegion(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/enterprise/provisioning-status") {
      return await handleEnterpriseProvisioningStatus(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/members/list") {
      return await handleWorkspaceMembersList(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/members/add") {
      return await handleWorkspaceMemberAdd(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/members/update-role") {
      return await handleWorkspaceMemberUpdateRole(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/members/remove") {
      return await handleWorkspaceMemberRemove(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/ops-cockpit") {
      return await handleWorkspaceOpsCockpit(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/workspace/suggest-organization") {
      return await handleSuggestOrganization(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/org/invites/create") {
      return await handleOrgInviteCreate(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/org/invites/accept") {
      return await handleOrgInviteAccept(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/org/invites/revoke") {
      return await handleOrgInviteRevoke(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/library/list") {
      return await handleLibraryList(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/library/download") {
      return await handleLibraryDownload(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/templates/list") {
      return await handleTemplatesList(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/templates/get") {
      return await handleTemplatesGet(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/templates/create") {
      return await handleTemplatesCreate(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/templates/create-version") {
      return await handleTemplatesCreateVersion(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/templates/publish") {
      return await handleTemplatesPublish(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/exports/contract-report") {
      return await handleExportContractReport(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/exports/calendar") {
      return await handleExportCalendar(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/exports/audit-pack") {
      return await handleExportAuditPack(req, res, { requestId, log, readJsonBody });
    }

    if (isAcquisitionApiRoute(req.method, url.pathname)) {
      return await handleAcquisitionApi(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (url.pathname.startsWith("/internal/acquisition/")) {
      return await handleAcquisitionInternal(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/analysis/start") {
      return await handleAnalysisStart(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/analysis/tasks") {
      return await handleAnalysisTask(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/analysis/reduce") {
      return await handleAnalysisReduce(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/analysis/export-report") {
      return await handleAnalysisExportReport(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/analysis/private-live/promote-public-unlisted") {
      return await handleAnalysisPromotePrivateLivePublic(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/start") {
      return await handleIngestionStart(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/extract-text") {
      return await handleIngestionExtractText(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/run-text-pipeline") {
      return await handleIngestionRunTextPipeline(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/start-ocr") {
      return await handleIngestionStartOcr(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/fetch-ocr") {
      return await handleIngestionFetchOcr(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/chunk") {
      return await handleIngestionChunk(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/embed") {
      return await handleIngestionEmbed(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/classify") {
      return await handleIngestionClassify(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/extract-insights") {
      return await handleIngestionExtractInsights(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/reconcile-status") {
      return await handleIngestionReconcileStatus(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/delete-embeddings") {
      return await handleIngestionDeleteEmbeddings(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/cleanup-vectors") {
      return await handleIngestionCleanupVectors(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/ingestion/tasks") {
      return await handleIngestionTask(req, res, { requestId, log, readJsonBody });
    }

    if (req.method === "POST" && url.pathname === "/internal/whatsapp/orchestrate") {
      return await handleWhatsappOrchestrate(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/internal/agent/orchestrate") {
      return await handleAgentOrchestrate(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    if (req.method === "POST" && url.pathname === "/internal/agent/outbox/run") {
      return await handleAgentOutboxRun(req, res, {
        requestId,
        log,
        readJsonBody,
      });
    }

    return sendJson(res, 404, {
      error: "Not found",
      request_id: requestId,
      execution_plane: "gcp",
    });
  } catch (error) {
    log.error("Unhandled request error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return sendJson(res, 500, {
      error: "Internal server error",
      request_id: requestId,
      execution_plane: "gcp",
    });
  }
});

server.listen(port, () => {
  console.log(JSON.stringify({
    level: "info",
    service: "zohal-backend",
    message: "Server listening",
    port,
  }));
});
