import { AqarBrowsingAdapter } from "./adapters/aqar.js";
import { BayutBrowsingAdapter } from "./adapters/bayut.js";
import { access } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { boundedTextSnapshot } from "./adapters/shared.js";

const ADAPTERS = {
  aqar: AqarBrowsingAdapter,
  bayut: BayutBrowsingAdapter,
};

function normalizeLimits(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    max_result_pages_per_source: Math.max(1, Math.min(3, Number(input.max_result_pages_per_source || 1))),
    max_detail_pages_per_source: Math.max(1, Math.min(20, Number(input.max_detail_pages_per_source || 8))),
    per_source_timeout_ms: Math.max(10_000, Math.min(120_000, Number(input.per_source_timeout_ms || 45_000))),
    per_run_timeout_ms: Math.max(30_000, Math.min(300_000, Number(input.per_run_timeout_ms || 120_000))),
  };
}

async function withBrowser(fn) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

function authEnvKey(source) {
  return `ACQUISITION_BROWSER_AUTH_STATE_${String(source || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

async function resolveAuthStatePath(source) {
  const direct = String(process.env[authEnvKey(source)] || "").trim();
  const directory = String(process.env.ACQUISITION_BROWSER_AUTH_STATE_DIR || "").trim();
  const fallback = directory ? join(directory, `${source}.json`) : "";
  const candidate = direct || fallback;
  if (!candidate) return null;
  try {
    await access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

async function newAdapterContext(browser, adapterRun) {
  const storageState = await resolveAuthStatePath(adapterRun.source);
  const context = storageState
    ? await browser.newContext({ storageState })
    : await browser.newContext();
  adapterRun.auth_json = storageState
    ? { mode: "storage_state", status: "loaded", source: adapterRun.source }
    : { mode: "public", status: "not_configured", source: adapterRun.source };
  adapterRun.error_json = {
    ...adapterRun.error_json,
    auth_mode: adapterRun.auth_json.mode,
    auth_status: adapterRun.auth_json.status,
  };
  return context;
}

async function fetchPageHtml(page, url, timeout) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.waitForTimeout(600);
  return await page.content();
}

function normalizeUrlForSuppression(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function suppressedUrlSetForSource(suppressedCandidates = [], source) {
  return new Set(
    (Array.isArray(suppressedCandidates) ? suppressedCandidates : [])
      .filter((candidate) => !candidate.source || candidate.source === source)
      .map((candidate) => normalizeUrlForSuppression(candidate.source_url))
      .filter(Boolean),
  );
}

function filterSuppressedCards(cards, suppressedCandidates, source) {
  const suppressedUrls = suppressedUrlSetForSource(suppressedCandidates, source);
  if (!suppressedUrls.size) return { cards, suppressedCount: 0 };
  const filtered = cards.filter((card) => !suppressedUrls.has(normalizeUrlForSuppression(card.source_url)));
  return { cards: filtered, suppressedCount: cards.length - filtered.length };
}

async function loadSearchPage({ page, adapter, mandate, limits }) {
  const searchUrl = adapter.buildSearchUrl(mandate, limits);
  if (typeof adapter.applySearchFilters !== "function") {
    return {
      url: searchUrl,
      html: await fetchPageHtml(page, searchUrl, limits.per_source_timeout_ms),
      mode: "url",
      warnings: [],
    };
  }
  try {
    const result = await adapter.applySearchFilters(page, mandate, limits);
    if (!result?.html) throw new Error("UI filter returned no HTML");
    return {
      url: result.url || page.url() || searchUrl,
      html: result.html,
      mode: result.mode || "ui_filter",
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    };
  } catch (error) {
    return {
      url: searchUrl,
      html: await fetchPageHtml(page, searchUrl, limits.per_source_timeout_ms),
      mode: "url_fallback",
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function artifactBaseDir() {
  return String(process.env.ACQUISITION_BROWSER_ARTIFACT_DIR || "artifacts/browser-worker").trim();
}

function safeId(value) {
  return String(value || "run").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "run";
}

async function captureRunArtifact({ page, adapterRun, searchRun, kind, url, html }) {
  const runId = safeId(searchRun.id || searchRun.mandate_id || crypto.randomUUID());
  const source = safeId(adapterRun.source);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(artifactBaseDir(), runId);
  await mkdir(dir, { recursive: true });
  let screenshotPath = null;
  const canCaptureScreenshot = adapterRun.auth_json?.mode !== "storage_state";
  if (canCaptureScreenshot) {
    screenshotPath = join(dir, `${source}-${kind}-${stamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);
  }
  const snapshot = {
    source: adapterRun.source,
    kind,
    source_url: url,
    captured_at: new Date().toISOString(),
    text: boundedTextSnapshot(html),
  };
  if (screenshotPath) {
    adapterRun.screenshot_refs_json.push({
      source: adapterRun.source,
      kind,
      path: screenshotPath,
      captured_at: snapshot.captured_at,
    });
  } else {
    adapterRun.limited_snapshot_refs_json.push({
      source: adapterRun.source,
      kind: `${kind}_screenshot`,
      captured_at: snapshot.captured_at,
      status: "skipped_authenticated_context",
    });
  }
  adapterRun.limited_snapshot_refs_json.push(snapshot);
}

export async function runAdapter({ adapter, mandate, searchRun, limits, browser, suppressedCandidates = [] }) {
  const startedAt = new Date().toISOString();
  const candidates = [];
  const adapterRun = {
    source: adapter.source,
    status: "running",
    cards_seen: 0,
    detail_pages_fetched: 0,
    candidates_created: 0,
    failure_count: 0,
    screenshot_refs_json: [],
    limited_snapshot_refs_json: [],
    error_json: {},
    started_at: startedAt,
  };
  let context = null;
  let page = null;
  try {
    context = await newAdapterContext(browser, adapterRun);
    page = await context.newPage();
    const searchPage = await loadSearchPage({ page, adapter, mandate, limits });
    const searchUrl = searchPage.url;
    const searchHtml = searchPage.html;
    adapterRun.error_json = {
      ...adapterRun.error_json,
      search_mode: searchPage.mode,
      ...(searchPage.warnings.length ? { search_warnings: searchPage.warnings } : {}),
    };
    await captureRunArtifact({ page, adapterRun, searchRun, kind: "search", url: searchUrl, html: searchHtml });
    const parsedCards = adapter.parseSearchResults(searchHtml, searchUrl);
    const suppression = filterSuppressedCards(parsedCards, suppressedCandidates, adapter.source);
    const cards = suppression.cards.slice(0, limits.max_detail_pages_per_source);
    adapterRun.cards_seen = cards.length;
    if (suppression.suppressedCount > 0) {
      adapterRun.error_json = {
        ...adapterRun.error_json,
        suppressed_cards: suppression.suppressedCount,
      };
    }
    if (cards.length === 0) {
      adapterRun.status = "completed_with_warnings";
      adapterRun.error_json = {
        ...adapterRun.error_json,
        drift_signal: "no_search_cards_extracted",
        search_url: searchUrl,
      };
    }
    for (const card of cards) {
      try {
        const detailHtml = await fetchPageHtml(page, card.source_url, limits.per_source_timeout_ms);
        if (adapterRun.detail_pages_fetched === 0) {
          await captureRunArtifact({ page, adapterRun, searchRun, kind: "detail", url: card.source_url, html: detailHtml });
        }
        const candidate = adapter.parseListingDetail(detailHtml, card.source_url);
        candidates.push({
          ...candidate,
          search_run_id: searchRun.id,
          mandate_id: searchRun.mandate_id,
          workspace_id: searchRun.workspace_id,
          investor_id: searchRun.user_id,
        });
        adapterRun.detail_pages_fetched += 1;
      } catch (error) {
        adapterRun.failure_count += 1;
        adapterRun.error_json = {
          ...adapterRun.error_json,
          last_detail_error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    adapterRun.candidates_created = candidates.length;
    if (cards.length > 0 && candidates.length === 0) {
      adapterRun.status = "completed_with_warnings";
      adapterRun.error_json = {
        ...adapterRun.error_json,
        drift_signal: "cards_seen_but_no_candidates_created",
      };
    } else if (adapterRun.status === "running") {
      adapterRun.status = "completed";
    }
  } catch (error) {
    adapterRun.status = "failed";
    adapterRun.failure_count += 1;
    adapterRun.error_json = {
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page?.close().catch(() => {});
    await context?.close().catch(() => {});
    adapterRun.completed_at = new Date().toISOString();
  }
  return { candidates, adapter_run: adapterRun };
}

export async function runSearch({ searchRun, mandate, suppressedCandidates = [] }) {
  const limits = normalizeLimits(searchRun.limits_json);
  const sources = Array.isArray(searchRun.sources_json) && searchRun.sources_json.length
    ? searchRun.sources_json
    : ["aqar", "bayut"];
  const selected = sources.map((source) => ADAPTERS[source]).filter(Boolean);
  return await withBrowser(async (browser) => {
    const candidates = [];
    const adapterRuns = [];
    for (const adapter of selected) {
      const result = await runAdapter({ adapter, mandate, searchRun, limits, browser, suppressedCandidates });
      candidates.push(...result.candidates);
      adapterRuns.push(result.adapter_run);
    }
    return {
      candidates,
      adapter_runs: adapterRuns,
    };
  });
}

export const __test = {
  filterSuppressedCards,
  normalizeLimits,
  normalizeUrlForSuppression,
  resolveAuthStatePath,
};
