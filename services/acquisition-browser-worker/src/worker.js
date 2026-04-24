import { AqarBrowsingAdapter } from "./adapters/aqar.js";
import { BayutBrowsingAdapter } from "./adapters/bayut.js";

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

async function fetchPageHtml(page, url, timeout) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.waitForTimeout(600);
  return await page.content();
}

export async function runAdapter({ adapter, mandate, searchRun, limits, browser }) {
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
  const page = await browser.newPage();
  try {
    const searchUrl = adapter.buildSearchUrl(mandate, limits);
    const searchHtml = await fetchPageHtml(page, searchUrl, limits.per_source_timeout_ms);
    const cards = adapter.parseSearchResults(searchHtml, searchUrl)
      .slice(0, limits.max_detail_pages_per_source);
    adapterRun.cards_seen = cards.length;
    for (const card of cards) {
      try {
        const detailHtml = await fetchPageHtml(page, card.source_url, limits.per_source_timeout_ms);
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
    adapterRun.status = "completed";
  } catch (error) {
    adapterRun.status = "failed";
    adapterRun.failure_count += 1;
    adapterRun.error_json = {
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close().catch(() => {});
    adapterRun.completed_at = new Date().toISOString();
  }
  return { candidates, adapter_run: adapterRun };
}

export async function runSearch({ searchRun, mandate }) {
  const limits = normalizeLimits(searchRun.limits_json);
  const sources = Array.isArray(searchRun.sources_json) && searchRun.sources_json.length
    ? searchRun.sources_json
    : ["aqar", "bayut"];
  const selected = sources.map((source) => ADAPTERS[source]).filter(Boolean);
  return await withBrowser(async (browser) => {
    const candidates = [];
    const adapterRuns = [];
    for (const adapter of selected) {
      const result = await runAdapter({ adapter, mandate, searchRun, limits, browser });
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
  normalizeLimits,
};
