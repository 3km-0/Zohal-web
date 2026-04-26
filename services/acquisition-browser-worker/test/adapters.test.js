import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AqarBrowsingAdapter } from "../src/adapters/aqar.js";
import { BayutBrowsingAdapter } from "../src/adapters/bayut.js";
import { __test as workerTest, runAdapter } from "../src/worker.js";

test("Aqar adapter parses search cards and detail page into candidate", () => {
  const searchHtml = `
    <a href="/123456">Villa in North Riyadh SAR 3,200,000 area 360 sqm</a>
    <a href="https://example.com/ignore">Ignore</a>
  `;
  const cards = AqarBrowsingAdapter.parseSearchResults(searchHtml);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].source, "aqar");
  assert.match(cards[0].source_url, /aqar\.fm/);

  const detail = AqarBrowsingAdapter.parseListingDetail(`
    <h1>Villa district Al Arid Riyadh</h1>
    <p>Villa for sale SAR 3,200,000 area 360 sqm 5 beds 4 baths</p>
    <img src="/photo.jpg" />
  `, cards[0].source_url);

  assert.equal(detail.source, "aqar");
  assert.equal(detail.asking_price, 3200000);
  assert.equal(detail.area_sqm, 360);
  assert.equal(detail.bedroom_count, 5);
  assert.equal(detail.photo_refs_json.length, 1);
  assert.ok(detail.source_fingerprint);
});

test("Aqar adapter recognizes Arabic sale villa cards", () => {
  const cards = AqarBrowsingAdapter.parseSearchResults(`
    <a href="/987654321">فيلا للبيع في حي العارض، الرياض 3,400,000 ريال 375 م²</a>
    <a href="/555555">شقة للايجار في الرياض 120,000 ريال 140 م²</a>
  `);

  assert.equal(cards.length, 1);
  assert.match(cards[0].title, /العارض/);
});

test("Bayut adapter ignores fallback/similar-property pages", () => {
  const cards = BayutBrowsingAdapter.parseSearchResults(`
    <h1>Sorry, we couldn't find the page</h1>
    <h2>Similar Properties</h2>
    <a href="/en/property/details-999.html">A notable apartment in Jeddah SAR 900000</a>
  `);

  assert.equal(cards.length, 0);
});

test("Bayut adapter parses search cards and detail page into candidate", () => {
  const searchHtml = `
    <a href="/en/property/details-1.html">Villa for-sale in Riyadh SAR 4m</a>
  `;
  const cards = BayutBrowsingAdapter.parseSearchResults(searchHtml);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].source, "bayut");

  const detail = BayutBrowsingAdapter.parseListingDetail(`
    <h1>Villa district Hittin Riyadh</h1>
    <section>Price SAR 4m area 420 sqm 6 bedrooms 5 bathrooms</section>
  `, cards[0].source_url);

  assert.equal(detail.source, "bayut");
  assert.equal(detail.asking_price, 4000000);
  assert.equal(detail.area_sqm, 420);
  assert.equal(detail.property_type, "villa");
});

test("adapter marks gated marketplace contact as missing access metadata", () => {
  const detail = AqarBrowsingAdapter.parseListingDetail(`
    <h1>Villa district Al Arid Riyadh</h1>
    <p>Villa for sale SAR 3,200,000 area 360 sqm 5 beds 4 baths</p>
    <button>Sign in to view broker WhatsApp contact</button>
  `, "https://sa.aqar.fm/123456");

  assert.equal(detail.contact_access_json.status, "requires_sign_in");
  assert.equal(detail.limited_evidence_snapshot_json.contact_access.reason, "broker_contact_gated");
});

test("runAdapter records bounded artifacts and drift warnings for empty result pages", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "zohal-browser-artifacts-"));
  process.env.ACQUISITION_BROWSER_ARTIFACT_DIR = artifactDir;
  const page = {
    async goto(url) {
      this.url = url;
    },
    async waitForTimeout() {},
    async content() {
      return "<html><main>No listings here</main></html>";
    },
    async screenshot() {},
    async close() {},
  };
  const browser = {
    async newPage() {
      return page;
    },
  };
  const adapter = {
    source: "fixture",
    buildSearchUrl() {
      return "https://example.test/search";
    },
    parseSearchResults() {
      return [];
    },
  };

  const result = await runAdapter({
    adapter,
    mandate: {},
    searchRun: { id: "search_run_1", limits_json: {} },
    limits: workerTest.normalizeLimits({}),
    browser,
  });

  assert.equal(result.adapter_run.status, "completed_with_warnings");
  assert.equal(result.adapter_run.error_json.drift_signal, "no_search_cards_extracted");
  assert.equal(result.adapter_run.limited_snapshot_refs_json.length, 1);
  assert.equal(result.adapter_run.limited_snapshot_refs_json[0].text, "No listings here");
});

test("worker run limits clamp unsafe values", () => {
  assert.deepEqual(
    workerTest.normalizeLimits({
      max_result_pages_per_source: 99,
      max_detail_pages_per_source: -1,
      per_source_timeout_ms: 1,
      per_run_timeout_ms: 999999,
    }),
    {
      max_result_pages_per_source: 3,
      max_detail_pages_per_source: 1,
      per_source_timeout_ms: 10000,
      per_run_timeout_ms: 300000,
    },
  );
});
