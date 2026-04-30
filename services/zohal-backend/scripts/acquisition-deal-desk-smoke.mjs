#!/usr/bin/env node
// End-to-end Deal Desk API smoke against a running zohal-backend service.
//
// Required:
//   ACQUISITION_SMOKE_BASE_URL=http://localhost:8080
//   ACQUISITION_SMOKE_WORKSPACE_ID=<workspace uuid>
//   INTERNAL_FUNCTION_JWT=<internal token>
//
// Optional:
//   ACQUISITION_SMOKE_MANDATE_ID=<mandate uuid>
//   ACQUISITION_SMOKE_OPPORTUNITY_IDS=<comma-separated opportunity uuids>

const baseUrl = String(process.env.ACQUISITION_SMOKE_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
const workspaceId = String(process.env.ACQUISITION_SMOKE_WORKSPACE_ID || "").trim();
const mandateId = String(process.env.ACQUISITION_SMOKE_MANDATE_ID || "").trim();
const token = String(process.env.INTERNAL_FUNCTION_JWT || process.env.INTERNAL_API_TOKEN || "").trim();

function fail(message) {
  process.stderr.write(`[deal-desk-smoke] FAIL - ${message}\n`);
  process.exit(1);
}

if (!workspaceId) fail("ACQUISITION_SMOKE_WORKSPACE_ID is required");
if (!token) fail("INTERNAL_FUNCTION_JWT or INTERNAL_API_TOKEN is required");

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: token,
      "x-internal-function-jwt": token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function redeemSession(redeemUrl, canonicalUrl) {
  if (!redeemUrl) return { cookie: null, baseUrl: canonicalUrl };
  const response = await fetch(redeemUrl, { method: "GET", redirect: "manual" });
  if (![301, 302, 303, 307, 308].includes(response.status)) {
    fail(`redeem_url did not redirect: HTTP ${response.status}`);
  }
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || null;
  if (!cookie) fail("redeem_url did not set an access cookie");
  const redirectLocation = response.headers.get("location");
  return {
    cookie,
    baseUrl: redirectLocation ? new URL(redirectLocation, redeemUrl).toString() : canonicalUrl,
  };
}

async function probeRoute(baseUrl, routePath, cookie) {
  const url = `${String(baseUrl || "").replace(/\/+$/, "")}${routePath}`;
  const response = await fetch(url, {
    method: "GET",
    headers: cookie ? { cookie } : {},
  });
  const html = await response.text().catch(() => "");
  if (!response.ok) fail(`${routePath || "/"} returned HTTP ${response.status}`);
  if (!html.includes("data-evidence-id")) fail(`${routePath || "/"} is missing evidence markers`);
  if (!html.includes("zdd-shell")) fail(`${routePath || "/"} is missing the Deal Desk Vector shell`);
}

const opportunityIds = String(process.env.ACQUISITION_SMOKE_OPPORTUNITY_IDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

process.stdout.write(`[deal-desk-smoke] creating Deal Desk for workspace ${workspaceId}\n`);
const created = await request(`/api/acquisition/v1/workspaces/${encodeURIComponent(workspaceId)}/deal-desk`, {
  ...(mandateId ? { mandate_id: mandateId } : {}),
  ...(opportunityIds.length ? { opportunity_ids: opportunityIds } : {}),
  language: "en",
  presentation_instruction: "Smoke proof: private mandate report with shortlist, scenarios, renovation exposure, notes, and proof.",
  delivery_hint: "smoke",
});

const reportId = created.report_id || created.data?.report_id;
const status = created.status || created.data?.status || "unknown";
const liveUrl = created.live_url || created.data?.live_url || "";
const redeemUrl = created.redeem_url || created.data?.redeem_url || "";
if (!reportId) fail(`missing report_id in response: ${JSON.stringify(created)}`);
if ((created.surface_family || created.data?.surface_family) !== "deal_desk") {
  fail(`unexpected surface_family: ${JSON.stringify(created)}`);
}
if (status !== "private_live") fail(`expected private_live status, got ${status}`);
if (!liveUrl) fail(`missing live_url in response: ${JSON.stringify(created)}`);
if (!redeemUrl) fail(`missing redeem_url in response: ${JSON.stringify(created)}`);
process.stdout.write(`[deal-desk-smoke] report_id=${reportId} status=${status}\n`);
process.stdout.write(`[deal-desk-smoke] live_url=${liveUrl}\n`);

await probeRoute(liveUrl, "", null);
process.stdout.write("[deal-desk-smoke] PASS - direct live URL renders without an access cookie\n");

const session = await redeemSession(redeemUrl, liveUrl);
for (const routePath of ["", "/opportunities", "/compare", "/scenario-lab", "/renovation", "/proof", "/notes"]) {
  await probeRoute(session.baseUrl, routePath, session.cookie);
}
process.stdout.write("[deal-desk-smoke] PASS - redeem URL renders all Deal Desk routes with evidence markers\n");

const note = await request(`/api/acquisition/v1/deal-desk/${encodeURIComponent(reportId)}/notes`, {
  note_kind: "preference",
  body: "Smoke note: preserve proof and prefer simpler tenancy stories next report.",
  viewer_ref: "deal-desk-smoke",
});
if (!(note.note?.id || note.data?.note?.id)) {
  fail(`missing note id in response: ${JSON.stringify(note)}`);
}
process.stdout.write(`[deal-desk-smoke] PASS - note stored for report ${reportId}\n`);
