import {
  absoluteUrl,
  candidateFromText,
  detectContactGate,
  detectVisibleContact,
  extractLinks,
  extractPhotoRefs,
  normalizeText,
  stripTags,
} from "./shared.js";

const BASE_URL = "https://www.bayut.sa";

function mandateQuery(mandate = {}) {
  const buyBox = mandate.buy_box_json && typeof mandate.buy_box_json === "object" ? mandate.buy_box_json : {};
  const locations = Array.isArray(mandate.target_locations_json) ? mandate.target_locations_json : [];
  return normalizeText([
    buyBox.property_type,
    locations[0],
    buyBox.city,
    buyBox.district,
  ].filter(Boolean).join(" "));
}

function locationQuery(mandate = {}) {
  const box = buyBox(mandate);
  const locations = Array.isArray(mandate.target_locations_json) ? mandate.target_locations_json : [];
  return normalizeText([
    box.district,
    locations[0],
    box.city || mandate.target_city,
  ].filter(Boolean).join(" "));
}

function buyBox(mandate = {}) {
  return mandate.buy_box_json && typeof mandate.buy_box_json === "object" ? mandate.buy_box_json : {};
}

function normalizeComparable(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function citySegment(mandate = {}) {
  const value = normalizeComparable(buyBox(mandate).city || mandate.target_city || "");
  if (/jeddah|جده/.test(value)) return "جدة";
  if (/dammam|الدمام/.test(value)) return "الدمام";
  if (/khobar|الخبر/.test(value)) return "الخبر";
  return "الرياض";
}

function propertySegment(mandate = {}) {
  const value = normalizeComparable(buyBox(mandate).property_type || "");
  if (/apartment|شقه|شقق/.test(value)) return "شقق";
  if (/land|plot|ارض/.test(value)) return "اراضي-سكنية";
  if (/building|عماره|مبنى/.test(value)) return "عمائر-سكنية";
  return "فلل";
}

function knownRiyadhDistrictSegment(mandate = {}) {
  const value = normalizeComparable(buyBox(mandate).district || mandateQuery(mandate));
  if (/al arid|alarid|العارض/.test(value)) return "شمال-الرياض/العارض";
  if (/narjis|النرجس/.test(value)) return "شمال-الرياض/النرجس";
  if (/malqa|الملقا/.test(value)) return "شمال-الرياض/الملقا";
  if (/hittin|حطين/.test(value)) return "شمال-الرياض/حطين";
  if (/yasmin|الياسمين/.test(value)) return "شمال-الرياض/الياسمين";
  return "";
}

function bayutSearchPath(mandate = {}) {
  const city = citySegment(mandate);
  const property = propertySegment(mandate);
  const district = city === "الرياض" ? knownRiyadhDistrictSegment(mandate) : "";
  return ["/للبيع", property, city, district].filter(Boolean).join("/") + "/";
}

function isSpecificSearchUrl(url, mandate = {}) {
  const decoded = decodeURIComponent(String(url || ""));
  const expected = bayutSearchPath(mandate).split("/").filter(Boolean);
  return expected.every((part) => decoded.includes(part));
}

export const BayutBrowsingAdapter = {
  source: "bayut",
  buildSearchUrl(mandate, limits = {}) {
    const url = new URL(bayutSearchPath(mandate), BASE_URL);
    if (limits.page && Number(limits.page) > 1) url.searchParams.set("page", String(limits.page));
    return url.toString();
  },
  async applySearchFilters(page, mandate, limits = {}) {
    const warnings = [];
    let mode = "ui_filter";
    const query = locationQuery(mandate) || "Al Arid Riyadh";
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: limits.per_source_timeout_ms });
    await page.waitForTimeout(900);
    await page.locator('button[aria-label="For sale"]').click({ timeout: 4_000 }).catch(async (error) => {
      await page.locator("button").filter({ hasText: /^للبيع$/ }).first().click({ timeout: 2_000 }).catch(() => {
        warnings.push(`bayut_sale_filter_not_clicked:${error.message}`);
      });
    });
    const input = page.locator('input[placeholder="أدخل الموقع"]').first();
    await input.fill(query, { timeout: 8_000 }).catch((error) => {
      throw new Error(`bayut_location_filter_failed:${error.message}`);
    });
    await page.waitForTimeout(1_000);
    await page.locator("li button")
      .filter({ hasText: /العارض|الرياض|جدة|الدمام|الخبر|Riyadh|Arid/i })
      .first()
      .click({ timeout: 4_000 })
      .catch((error) => {
        warnings.push(`bayut_location_suggestion_not_clicked:${error.message}`);
      });
    await page.waitForTimeout(400);
    await page.locator('[aria-label="Find button"]').click({ timeout: 5_000 }).catch(async (error) => {
      await page.getByRole("button", { name: "Find button" }).click({ timeout: 2_000 }).catch(async () => {
        warnings.push(`bayut_search_button_not_clicked:${error.message}`);
        mode = "ui_filter_public_path_fallback";
        await page.goto(new URL(bayutSearchPath(mandate), BASE_URL).toString(), {
          waitUntil: "domcontentloaded",
          timeout: limits.per_source_timeout_ms,
        });
      });
    });
    await page.waitForLoadState("domcontentloaded", { timeout: limits.per_source_timeout_ms }).catch(() => {});
    await page.waitForTimeout(1_500);
    if (!isSpecificSearchUrl(page.url(), mandate)) {
      warnings.push(`bayut_ui_search_url_not_specific:${decodeURIComponent(page.url())}`);
      mode = "ui_filter_public_path_fallback";
      await page.goto(new URL(bayutSearchPath(mandate), BASE_URL).toString(), {
        waitUntil: "domcontentloaded",
        timeout: limits.per_source_timeout_ms,
      });
      await page.waitForTimeout(1_500);
    }
    return {
      url: page.url(),
      html: await page.content(),
      mode,
      warnings,
    };
  },
  parseSearchResults(html, baseUrl = BASE_URL) {
    const text = stripTags(html);
    if (/Sorry, we couldn't find the page|Similar Properties|Discover More Properties|Currently there are no properties/i.test(text)) {
      return [];
    }
    return extractLinks(html, baseUrl, /bayut\.sa/i)
      .filter((link) => /(?:\/property\/details-\d+\.html|\/العقار\/تفاصيل-\d+\.html)/i.test(decodeURIComponent(link.url)))
      .filter((link, index, all) => all.findIndex((item) => item.url === link.url) === index)
      .slice(0, 30)
      .map((link) => ({
        source: "bayut",
        source_url: link.url,
        title: link.text || "Bayut listing",
      }));
  },
  parseListingDetail(html, url) {
    const titleMatch = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = stripTags(titleMatch ? titleMatch[1] : "") || "Bayut listing";
    const text = stripTags(html);
    const candidate = candidateFromText({
      source: "bayut",
      sourceUrl: absoluteUrl(url, BASE_URL),
      title,
      text,
    });
    candidate.photo_refs_json = extractPhotoRefs(html, BASE_URL, 8);
    if (detectContactGate(html)) {
      candidate.limited_evidence_snapshot_json = {
        ...candidate.limited_evidence_snapshot_json,
        contact_access: {
          status: "requires_sign_in",
          reason: "broker_contact_gated",
        },
      };
      candidate.contact_access_json = candidate.limited_evidence_snapshot_json.contact_access;
    } else {
      const visibleContact = detectVisibleContact(html);
      if (visibleContact) {
      candidate.limited_evidence_snapshot_json = {
        ...candidate.limited_evidence_snapshot_json,
        contact_access: visibleContact,
      };
      candidate.contact_access_json = candidate.limited_evidence_snapshot_json.contact_access;
      }
    }
    return candidate;
  },
};
