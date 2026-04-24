import test from "node:test";
import assert from "node:assert/strict";
import { AqarBrowsingAdapter } from "../src/adapters/aqar.js";
import { BayutBrowsingAdapter } from "../src/adapters/bayut.js";
import { __test as workerTest } from "../src/worker.js";

test("Aqar adapter parses search cards and detail page into candidate", () => {
  const searchHtml = `
    <a href="/123456">Villa in North Riyadh SAR 3,200,000</a>
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
