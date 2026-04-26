import {
  absoluteUrl,
  candidateFromText,
  detectContactGate,
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
    return `${BASE_URL}/en/for-sale/properties/ksa/?query=${query}&page=${limits.page || 1}`;
  },
  parseSearchResults(html, baseUrl = BASE_URL) {
    const text = stripTags(html);
    if (/Sorry, we couldn't find the page|Similar Properties|Discover More Properties|Currently there are no properties/i.test(text)) {
      return [];
    }
    return extractLinks(html, baseUrl, /bayut\.sa/i)
      .filter((link) => /\/property\/details-\d+\.html/i.test(link.url))
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
