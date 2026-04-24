import {
  absoluteUrl,
  candidateFromText,
  extractLinks,
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

export const BayutBrowsingAdapter = {
  source: "bayut",
  buildSearchUrl(mandate, limits = {}) {
    const query = encodeURIComponent(mandateQuery(mandate) || "riyadh villa");
    return `${BASE_URL}/en/saudi-arabia/properties-for-sale/?query=${query}&page=${limits.page || 1}`;
  },
  parseSearchResults(html, baseUrl = BASE_URL) {
    return extractLinks(html, baseUrl, /bayut\.sa/i)
      .filter((link) => /property|عقار|للبيع|for-sale/i.test(`${link.url} ${link.text}`))
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
    candidate.photo_refs_json = [...String(html || "").matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi)]
      .map((match) => absoluteUrl(match[1], BASE_URL))
      .slice(0, 8);
    return candidate;
  },
};
