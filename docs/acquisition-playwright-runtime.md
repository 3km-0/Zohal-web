# Acquisition Playwright Runtime

Status: V2 public browsing proof + opt-in auth state
Last updated: 2026-04-27

This document describes the current public-source acquisition browsing proof:

`buy box -> search run -> public source candidates -> screening/ranking -> promoted opportunity -> workspace`

It covers the backend Playwright worker, the fetch contract, ranking behavior,
photo handling, and market-data enrichment hooks.

## Runtime Components

- `services/acquisition-browser-worker`
  - Runs Playwright Chromium in a bounded backend worker.
  - Owns source adapters for public marketplace pages.
  - Captures bounded evidence artifacts for each run.
- `services/zohal-backend`
  - Creates mandates and search runs.
  - Invokes the browser worker.
  - Upserts candidates, screens/ranks them, and promotes eligible candidates.
- `e2e/acquisition-flow.spec.ts`
  - Proves a staging workspace can render buy box, candidates, a promoted
    opportunity, and the fetched listing URL.

## Current Sources

V2 supports public browsing by default:

- `aqar`
- `bayut`

Marketplace auth is opt-in per source through Playwright storage-state files.
The worker does not store marketplace passwords and does not perform credential
login. An operator signs in manually once, saves a bounded Playwright
`storageState` JSON file, and configures the worker to load it.

Supported auth env vars:

- `ACQUISITION_BROWSER_AUTH_STATE_AQAR=/secure/path/aqar.json`
- `ACQUISITION_BROWSER_AUTH_STATE_BAYUT=/secure/path/bayut.json`
- `ACQUISITION_BROWSER_AUTH_STATE_DIR=/secure/path`
  - fallback lookup: `<dir>/aqar.json`, `<dir>/bayut.json`

Local capture helper:

```bash
cd services/acquisition-browser-worker
npm run auth:capture -- --source aqar
npm run auth:capture -- --source bayut
```

The helper opens Chromium headed, waits for the operator to sign in manually,
then saves the storage-state file under `artifacts/auth-state/` by default. That
directory is gitignored.

If contact details remain gated, the candidate continues but gets a
`needs_contact_access` diligence item. If signed-in browsing makes contact UI
visible, the worker records contact availability metadata only; raw phone,
WhatsApp, and email text is redacted from bounded artifacts and screenshots are
skipped for authenticated contexts.

## How Search Is Filtered

The worker now tries to drive the marketplace's own public search/filter UI
before falling back to a deterministic source URL. Adapter runs record the
chosen `search_mode`:

- `ui_filter`: Playwright interacted with the source UI and parsed the
  resulting page.
- `ui_filter_public_path_fallback`: Playwright started with the source UI, but
  the final search click stalled, so the adapter loaded the equivalent public
  filtered route.
- `url_fallback`: the source UI did not respond within bounds, so the worker
  loaded the deterministic source URL instead.
- `url`: the adapter has no UI-driving path.

The fallback is intentional. Marketplace frontends are frequently changed,
localized, modal-heavy, and asynchronous. A failed click must create an adapter
warning, not hang or silently fail the acquisition run.

For Aqar:

1. Playwright opens the public Aqar homepage.
2. It clicks the category filter that matches the buy box, such as
   `فلل للبيع`, `شقق للبيع`, `أراضي للبيع`, or `عمائر للبيع`.
3. It clicks the visible city filter when available, such as `الرياض`.
4. For known districts, it loads Aqar's public filtered route, such as
   `/فلل-للبيع/الرياض/شمال-الرياض/حي-العارض`.
   This is still source-side filtering: the resulting page shows the active
   marketplace breadcrumbs and filters.
5. The adapter parses public listing-card links.
6. It filters cards that look like sale/villa cards with visible price and area.
7. It ranks cards before detail-page fetches using source-visible text:
   - property type
   - sale intent
   - city
   - target district aliases such as `Al Arid` / `العارض`

For Bayut:

1. Playwright opens the public Bayut homepage.
2. It clicks `للبيع` when the control is visible.
3. It fills the public location input with the buy-box location.
4. It clicks a location suggestion when available, then triggers search.
5. If the interactive search link stalls, the adapter loads a deterministic
   Arabic public search URL such as
   `/للبيع/فلل/الرياض/شمال-الرياض/العارض/`.
6. It rejects fallback pages such as "not found" or "similar properties".
7. It accepts English and Arabic Bayut detail URL patterns.

## How Many Listings Are Fetched

The search run limits control breadth:

- `max_result_pages_per_source`: currently clamped to 1-3
- `max_detail_pages_per_source`: currently clamped to 1-20
- `per_source_timeout_ms`
- `per_run_timeout_ms`

The smoke proof usually sets `max_detail_pages_per_source` to 5. That means the
worker can fetch up to five detail pages per source, then the backend promotes
the best eligible candidate. Fetching more than one detail page is intentional:
marketplace order is not trusted as buy-box fit.

## Candidate Fetch Contract

From public listing pages, the worker can currently extract:

- source
- source URL
- title
- asking price
- city
- district
- property type
- area sqm
- bedroom count when visible
- bathroom count when visible
- short bounded text snapshot
- photo URL references
- contact-gated status when the page indicates sign-in is required
- source fingerprint for idempotent upsert

The worker also captures bounded run artifacts:

- search URL
- captured timestamp
- cards seen
- detail pages fetched
- candidates created
- drift signal when a source page renders but no candidates are extracted
- bounded text snapshot
- screenshot reference for search and first detail page

The runtime must not store full raw HTML dumps, secrets, marketplace credentials,
or signed-in broker contacts in Playwright artifacts. Bounded text snapshots
redact phone/email-like strings, and authenticated contexts skip screenshots.

## Ranking And Promotion

The deterministic mandate fit score currently evaluates:

- city match
- district match
- property type match
- budget match
- over-budget penalty
- hard mismatches for wrong city or wrong property type

Candidates are returned and promoted by fit score, not by marketplace order.
If no live candidate passes mandate fit and fixture fallback is disabled, the
smoke command fails instead of promoting the wrong deal.

## Photos

Adapters collect public listing image URLs into `candidate.photo_refs_json`.
Promotion copies those URLs into:

- `acquisition_opportunities.metadata_json.photo_refs`
- `acquisition_opportunities.metadata_json.photoRefs`

The workspace photo tab renders those public image URLs when present. The
adapter filters out logos, icons, SVGs, placeholders, and obvious UI assets.

Photo URLs are references to the public marketplace image CDN. V2 does not copy
or rehost marketplace images.

## Market Data Enrichment

The product spec calls for market context: comparable signals, price per square
meter context, valuation signals, liquidity/demand indicators, and data gaps.

The preferred source for this lane is an operator-provided market CSV, not a
live third-party API. CSV files should be treated as evidence sources with their
own import snapshot, schema mapping, provenance, and version.

Recommended CSV ingestion shape:

- Store the original CSV in object storage, not directly in a table. The
  current operator source is GCS:
  `gs://zohal-saudi/Market Indicators/KSA/`.
- Persist an immutable `acquisition_market_data_imports` row with GCS bucket,
  object path, row count, headers, checksum, uploaded timestamp, source label,
  geography coverage, and import status.
- Normalize rows into `acquisition_market_observations` for analysis.
- Keep every normalized row linked to its import and original row number so
  every market claim can be traced back to the exact source file.
- match opportunities to comparable rows by city, district, property type, area
  band, date, and price-per-square-meter
- write derived market context as `acquisition_claims` with
  `source_channel = market_csv` and `basis_label = market_signal`

Useful normalized fields:

- city
- district
- property type
- transaction date
- transaction price
- area sqm
- price per sqm
- source row ID
- data source label
- confidence/provenance notes

Why both Storage and tables:

- Storage preserves the exact file you provide, which is the evidence artifact.
- Tables make ranking fast and queryable. Postgres can index city, district,
  property type, date, area, and price per square meter.
- Keeping both prevents provenance loss while avoiding slow CSV parsing during
  every acquisition run.

Supabase tables:

- `acquisition_market_data_imports`
  - `id`
  - `workspace_id` or `org_id`
  - `source_label`
  - `external_storage_provider`
  - `external_bucket`
  - `external_object_path`
  - `external_uri`
  - `sha256`
  - `headers_json`
  - `schema_mapping_json`
  - `geography_scope_json`
  - `row_count`
  - `imported_by`
  - `status`
  - `created_at`
- `acquisition_market_observations`
  - `id`
  - `import_id`
  - `workspace_id` or `org_id`
  - `source_row_number`
  - `external_row_id`
  - `observation_kind`
  - `city`
  - `district`
  - `neighborhood`
  - `property_type`
  - `observed_at`, `period_start`, `period_end`
  - `transaction_price`, `asking_price`, `rent_price`
  - `area_sqm`
  - `price_per_sqm`, `median_price_per_sqm`, `average_price_per_sqm`
  - `transaction_count`, `listing_count`, `supply_count`, `demand_count`
  - `metric_key`, `metric_value`, `metric_unit`
  - `bedroom_count`
  - `bathroom_count`
  - `raw_row_json`
  - `quality_json`

This is intentionally a normalized observation model rather than a single
Riyadh-only comparable schema. The Riyadh sample can populate the same tables
as later Jeddah, Dammam, Khobar, or national indicator files.

Current imported GCS source set:

- `Rental indicators for Cities in Riyadh region.csv`: 4,486 rental indicator
  observations
- `Sales transaction indicators in Makkah 1st Q 2024.csv`: 428 sales
  observations
- `Sales transaction indicators in Riyadh 1st Q 2024.csv`: 522 sales
  observations
- `Sales transaction indicators in Riyadh 2nd Q 2024.csv`: 499 sales
  observations
- `Sales transaction indicators in Riyadh 4th Q 2024.csv`: 525 sales
  observations
- `quarter_report SI.csv`: 32,730 historical/national sales observations

Total current normalized observations: 39,190 across 6 imports.

Example acquisition match now available for `الرياض / العارض / villa`:

- 2024 Q4: 218 deeds, average `7,366.42 SAR/sqm`, range
  `6,200-9,413.58 SAR/sqm`
- 2024 Q2: 187 deeds, average `8,581.42 SAR/sqm`, range
  `7,028.16-10,048 SAR/sqm`
- 2024 Q1: 216 deeds, average `8,204.40 SAR/sqm`, range
  `7,053.20-9,267.84 SAR/sqm`

The existing `POST /api/acquisition/v1/opportunities/:id/enrich` endpoint keeps
a placeholder `market_csv` claim until the CSV importer and comparable matcher
are implemented.

Restb.ai remains the planned condition/photo-analysis lane and is not called
unless a provider is configured in a later pass.
