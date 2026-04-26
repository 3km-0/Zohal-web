import {
  absoluteUrl,
  candidateFromText,
  detectContactGate,
  extractLinks,
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
    const buyBox = mandate?.buy_box_json && typeof mandate.buy_box_json === "object" ? mandate.buy_box_json : {};
    const path = /villa|فيلا|فلل/i.test(String(buyBox.property_type || ""))
      ? "/فلل-للبيع"
      : "/عقارات";
    const query = primaryDistrict(mandate) || mandateQuery(mandate) || "العارض";
    const url = new URL(path, BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("page", String(limits.page || 1));
    return url.toString();
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
    candidate.photo_refs_json = [...String(html || "").matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi)]
      .map((match) => absoluteUrl(match[1], BASE_URL))
      .slice(0, 8);
    if (detectContactGate(html)) {
      candidate.limited_evidence_snapshot_json = {
        ...candidate.limited_evidence_snapshot_json,
        contact_access: {
          status: "requires_sign_in",
          reason: "broker_contact_gated",
        },
      };
      candidate.contact_access_json = candidate.limited_evidence_snapshot_json.contact_access;
    }
    return candidate;
  },
};
