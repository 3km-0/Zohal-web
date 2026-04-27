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

const BASE_URL = "https://sa.aqar.fm";

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

function primaryDistrict(mandate = {}) {
  const buyBox = mandate.buy_box_json && typeof mandate.buy_box_json === "object" ? mandate.buy_box_json : {};
  const locations = Array.isArray(mandate.target_locations_json) ? mandate.target_locations_json : [];
  return normalizeText(buyBox.district || locations[0] || "");
}

function buyBox(mandate = {}) {
  return mandate.buy_box_json && typeof mandate.buy_box_json === "object" ? mandate.buy_box_json : {};
}

function aqarCategoryLabel(mandate = {}) {
  const propertyType = String(buyBox(mandate).property_type || "").toLowerCase();
  if (/apartment|شقة|شقق/.test(propertyType)) return "شقق للبيع";
  if (/land|plot|أرض|ارض/.test(propertyType)) return "أراضي للبيع";
  if (/building|عمارة|مبنى/.test(propertyType)) return "عمائر للبيع";
  if (/retail|commercial|محل|تجاري/.test(propertyType)) return "محلات للبيع";
  return "فلل للبيع";
}

function cityLabel(mandate = {}) {
  const value = normalizeComparable(buyBox(mandate).city || mandate.target_city || "");
  if (/jeddah|جده/.test(value)) return "جدة";
  if (/dammam|الدمام/.test(value)) return "الدمام";
  if (/khobar|الخبر/.test(value)) return "الخبر";
  if (/makkah|mecca|مكه/.test(value)) return "مكة المكرمة";
  if (/madinah|medina|المدينه/.test(value)) return "المدينة المنورة";
  return "الرياض";
}

function aqarCategoryPath(mandate = {}) {
  const category = aqarCategoryLabel(mandate);
  if (category === "شقق للبيع") return "شقق-للبيع";
  if (category === "أراضي للبيع") return "أراضي-للبيع";
  if (category === "عمائر للبيع") return "عمائر-للبيع";
  if (category === "محلات للبيع") return "محلات-للبيع";
  return "فلل-للبيع";
}

function knownDistrictPath(mandate = {}) {
  const city = cityLabel(mandate);
  const value = normalizeComparable(primaryDistrict(mandate) || mandateQuery(mandate));
  if (city !== "الرياض") return "";
  if (/al arid|alarid|العارض/.test(value)) return "شمال-الرياض/حي-العارض";
  if (/narjis|النرجس/.test(value)) return "شمال-الرياض/حي-النرجس";
  if (/malqa|الملقا/.test(value)) return "شمال-الرياض/حي-الملقا";
  if (/hittin|حطين/.test(value)) return "شمال-الرياض/حي-حطين";
  if (/yasmin|الياسمين/.test(value)) return "شمال-الرياض/حي-الياسمين";
  return "";
}

function buildFilteredPath(mandate = {}) {
  const category = aqarCategoryPath(mandate);
  const city = cityLabel(mandate);
  const district = knownDistrictPath(mandate);
  return [category, city, district].filter(Boolean).join("/");
}

function normalizeComparable(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function targetAliasesFromUrl(baseUrl) {
  const aliases = new Set();
  try {
    const parsed = new URL(baseUrl);
    const query = normalizeComparable(parsed.searchParams.get("q") || "");
    if (query.includes("al arid") || query.includes("alarid")) aliases.add("العارض");
    if (query.includes("riyadh")) aliases.add("الرياض");
    if (query.includes("jeddah")) aliases.add("جده");
    query.split(/\s+/).filter((part) => part.length > 2).forEach((part) => aliases.add(part));
  } catch {
    // Ignore malformed search URLs; extraction can still proceed without query ranking.
  }
  return [...aliases].filter(Boolean);
}

function scoreSearchCard(link, targetAliases) {
  const text = normalizeComparable(`${decodeURIComponent(link.url)} ${link.text}`);
  let score = 0;
  if (/فيلا|فلل|villa/.test(text)) score += 20;
  if (/للبيع|for sale/.test(text)) score += 10;
  if (/الرياض|riyadh/.test(text)) score += 20;
  for (const alias of targetAliases) {
    if (alias && text.includes(alias)) score += alias === "العارض" ? 80 : 25;
  }
  return score;
}

export const AqarBrowsingAdapter = {
  source: "aqar",
  buildSearchUrl(mandate, limits = {}) {
    const url = new URL(`/${buildFilteredPath(mandate) || "عقارات"}`, BASE_URL);
    url.searchParams.set("page", String(limits.page || 1));
    return url.toString();
  },
  async applySearchFilters(page, mandate, limits = {}) {
    const warnings = [];
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: limits.per_source_timeout_ms });
    await page.waitForTimeout(700);

    const category = aqarCategoryLabel(mandate);
    const categoryLink = page.getByRole("link", { name: category, exact: true }).first();
    if (await categoryLink.count().catch(() => 0)) {
      await categoryLink.click({ timeout: 8_000 }).catch((error) => {
        throw new Error(`aqar_ui_category_filter_failed:${error.message}`);
      });
    } else {
      await page.locator(`a:has-text("${category}")`).first().click({ timeout: 8_000 }).catch((error) => {
        throw new Error(`aqar_ui_category_filter_failed:${error.message}`);
      });
    }
    await page.waitForLoadState("domcontentloaded", { timeout: limits.per_source_timeout_ms }).catch(() => {});
    await page.waitForTimeout(700);

    const city = cityLabel(mandate);
    const cityLink = page.getByRole("link", { name: new RegExp(`${city}`) }).first();
    if (await cityLink.count().catch(() => 0)) {
      await cityLink.click({ timeout: 6_000 }).catch((error) => {
        warnings.push(`aqar_city_filter_failed:${error.message}`);
      });
      await page.waitForLoadState("domcontentloaded", { timeout: limits.per_source_timeout_ms }).catch(() => {});
      await page.waitForTimeout(700);
    } else {
      warnings.push(`aqar_city_filter_not_visible:${city}`);
    }

    const districtPath = knownDistrictPath(mandate);
    if (districtPath) {
      await page.goto(new URL(`/${buildFilteredPath(mandate)}`, BASE_URL).toString(), {
        waitUntil: "domcontentloaded",
        timeout: limits.per_source_timeout_ms,
      });
      await page.waitForTimeout(700);
      warnings.push(`aqar_district_loaded_from_public_filter_path:${districtPath}`);
    } else if (primaryDistrict(mandate)) {
      warnings.push(`aqar_district_refined_by_zohal_ranker:${primaryDistrict(mandate)}`);
    }
    return {
      url: page.url(),
      html: await page.content(),
      warnings,
    };
  },
  parseSearchResults(html, baseUrl = BASE_URL) {
    const targetAliases = targetAliasesFromUrl(baseUrl);
    const seen = new Set();
    return extractLinks(html, baseUrl, /aqar\.fm/i)
      .filter((link) =>
        /(?:\/|-)\d{6,}(?:$|[/?#])/i.test(link.url) &&
        /(للبيع|for sale|فيلا|فلل|villa)/i.test(`${link.url} ${link.text}`) &&
        /(?:§|ريال|ر\.س|\d[\d,]{4,})/i.test(link.text) &&
        /(م²|م2|sqm|m2)/i.test(link.text)
      )
      .filter((link) => {
        if (seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
      })
      .sort((left, right) => scoreSearchCard(right, targetAliases) - scoreSearchCard(left, targetAliases))
      .slice(0, 30)
      .map((link) => ({
        source: "aqar",
        source_url: link.url,
        title: link.text || "Aqar listing",
      }));
  },
  parseListingDetail(html, url) {
    const titleMatch = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = stripTags(titleMatch ? titleMatch[1] : "") || "Aqar listing";
    const text = stripTags(html);
    const candidate = candidateFromText({
      source: "aqar",
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
