import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON argument: ${error.message}`);
  }
}

function internalToken() {
  return [
    process.env.INTERNAL_FUNCTION_JWT,
    process.env.INTERNAL_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].map((value) => String(value || "").trim()).find(Boolean) || "";
}

function baseUrl(args) {
  return String(args.baseUrl || process.env.ACQUISITION_SERVICE_BASE_URL || process.env.ANALYSIS_SERVICE_BASE_URL || "http://localhost:8080")
    .trim()
    .replace(/\/+$/, "");
}

function headers(requestId) {
  const token = internalToken();
  if (!token) throw new Error("Missing INTERNAL_FUNCTION_JWT, INTERNAL_SERVICE_ROLE_KEY, or SUPABASE_SERVICE_ROLE_KEY");
  return {
    authorization: `Bearer ${token}`,
    apikey: token,
    "x-internal-function-jwt": token,
    "x-request-id": requestId,
    "content-type": "application/json",
  };
}

async function requestJson({ url, method = "GET", body, requestId }) {
  const response = await fetch(url, {
    method,
    headers: headers(requestId),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${url} failed (${response.status}): ${json.error || response.statusText}`);
  }
  return json;
}

function defaultBuyBox(args) {
  return parseJson(args.buyBoxJson, {
    property_type: "villa",
    city: "Riyadh",
    district: "Al Arid",
    renovation_appetite: "medium",
  });
}

function defaultBudget(args) {
  return parseJson(args.budgetJson, { min: 1500000, max: 4000000, currency: "SAR" });
}

function defaultLocations(args) {
  if (args.targetLocations) return String(args.targetLocations).split(",").map((item) => item.trim()).filter(Boolean);
  return ["Al Arid", "North Riyadh"];
}

function fixtureListing(args) {
  return {
    workspace_id: args.workspaceId,
    user_id: args.userId,
    source: "fixture",
    source_url: "https://example.test/zohal/acquisition-fixture",
    title: "Fixture villa district Al Arid Riyadh",
    asking_price: 3200000,
    city: "Riyadh",
    district: "Al Arid",
    property_type: "villa",
    area_sqm: 360,
    photo_refs_json: [
      "https://example.test/photo-1.jpg",
      "https://example.test/photo-2.jpg",
      "https://example.test/photo-3.jpg",
    ],
    text: "Fixture villa for sale SAR 3,200,000 area 360 sqm 5 beds 4 baths. Used only for acquisition smoke fallback.",
  };
}

function fitScore(candidate = {}) {
  return Number(candidate.screening_output_json?.fit?.score || 0);
}

function candidateIsEligible(candidate = {}) {
  const decision = String(candidate.screening_decision || candidate.screening_output_json?.decision || "").toLowerCase();
  return candidate.status !== "promoted" && decision !== "pass" && fitScore(candidate) >= 70;
}

function rankCandidates(candidates = []) {
  return [...candidates].sort((left, right) => {
    const rightEligible = candidateIsEligible(right) ? 1 : 0;
    const leftEligible = candidateIsEligible(left) ? 1 : 0;
    if (rightEligible !== leftEligible) return rightEligible - leftEligible;
    return fitScore(right) - fitScore(left);
  });
}

async function writeArtifact(artifact) {
  const dir = join(process.cwd(), "artifacts", "acquisition-smoke");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspaceId || !args.userId) {
    throw new Error("Usage: npm run smoke:acquisition:e2e -- --workspace-id <id> --user-id <id> [--sources aqar,bayut]");
  }

  const requestId = `acq-smoke-${crypto.randomUUID()}`;
  const serviceBaseUrl = baseUrl(args);
  const sources = String(args.sources || "aqar,bayut").split(",").map((item) => item.trim()).filter(Boolean);
  const limits = parseJson(args.limitsJson, {
    max_result_pages_per_source: 1,
    max_detail_pages_per_source: 3,
    per_source_timeout_ms: 30000,
    per_run_timeout_ms: 90000,
  });
  const warnings = [];

  const mandateResponse = await requestJson({
    url: `${serviceBaseUrl}/api/acquisition/v1/mandates`,
    method: "POST",
    requestId,
    body: {
      workspace_id: args.workspaceId,
      user_id: args.userId,
      title: args.title || "Playwright acquisition smoke mandate",
      buy_box: defaultBuyBox(args),
      target_locations: defaultLocations(args),
      budget_range: defaultBudget(args),
      risk_appetite: args.riskAppetite || "moderate",
    },
  });
  const mandate = mandateResponse.mandate;

  const searchRunResponse = await requestJson({
    url: `${serviceBaseUrl}/api/acquisition/v1/mandates/${mandate.id}/search-runs`,
    method: "POST",
    requestId,
    body: {
      sources,
      limits,
      query_description: args.queryDescription || mandate.title,
    },
  });
  const searchRun = searchRunResponse.search_run;

  const processed = await requestJson({
    url: `${serviceBaseUrl}/internal/acquisition/search-run`,
    method: "POST",
    requestId,
    body: { search_run_id: searchRun.id },
  });

  let candidatesResponse = await requestJson({
    url: `${serviceBaseUrl}/api/acquisition/v1/search-runs/${searchRun.id}/candidates`,
    requestId,
  });
  let candidates = candidatesResponse.candidates || [];

  if (!candidates.length && args.fixtureFallback !== "false") {
    warnings.push("No live candidates returned; used fixture listing fallback to prove backend promotion/workspace path.");
    const fixture = await requestJson({
      url: `${serviceBaseUrl}/api/acquisition/v1/intake/listing`,
      method: "POST",
      requestId,
      body: { ...fixtureListing(args), mandate_id: mandate.id },
    });
    candidates = [fixture.candidate];
  }

  candidates = rankCandidates(candidates);
  const selected = candidates.find(candidateIsEligible) || candidates.find((candidate) => candidate.status !== "promoted") || candidates[0] || null;
  if (!selected) {
    throw new Error("No candidate available to promote");
  }
  if (!candidateIsEligible(selected) && args.fixtureFallback === "false") {
    throw new Error(`No live candidate passed mandate fit; best_score=${fitScore(selected)} decision=${selected.screening_decision || selected.screening_output_json?.decision || "unknown"}`);
  }

  const promotedResponse = selected.status === "promoted"
    ? { candidate: selected, opportunity: { id: selected.promoted_opportunity_id } }
    : await requestJson({
      url: `${serviceBaseUrl}/api/acquisition/v1/candidates/${selected.id}/promote`,
      method: "POST",
      requestId,
      body: {},
    });
  const opportunity = promotedResponse.opportunity;
  const opportunityResponse = await requestJson({
    url: `${serviceBaseUrl}/api/acquisition/v1/opportunities/${opportunity.id}`,
    requestId,
  });

  const artifact = {
    ok: true,
    request_id: requestId,
    service_base_url: serviceBaseUrl,
    started_at: mandate.created_at || null,
    completed_at: new Date().toISOString(),
    workspace_id: args.workspaceId,
    mandate_id: mandate.id,
    search_run_id: searchRun.id,
    sources,
    processed_search_run: processed.search_run || null,
    adapter_runs: processed.adapter_runs || [],
    candidate_ids: candidates.map((candidate) => candidate.id),
    ranked_candidates: candidates.map((candidate) => ({
      id: candidate.id,
      source: candidate.source,
      title: candidate.title,
      source_url: candidate.source_url,
      decision: candidate.screening_decision || candidate.screening_output_json?.decision || null,
      fit_score: fitScore(candidate),
      fit: candidate.screening_output_json?.fit || null,
    })),
    selected_candidate_id: selected.id,
    promoted_opportunity_id: opportunity.id,
    opportunity,
    opportunity_detail: opportunityResponse.opportunity || null,
    workspace_url: `${String(args.appBaseUrl || process.env.E2E_BASE_URL || "").replace(/\/+$/, "")}/workspaces/${args.workspaceId}`,
    warnings,
  };

  const artifactPath = await writeArtifact(artifact);
  console.log(JSON.stringify({ ok: true, artifact_path: artifactPath, ...artifact }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
