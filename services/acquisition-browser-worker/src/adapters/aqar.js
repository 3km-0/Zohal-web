import {
  absoluteUrl,
  candidateFromText,
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

export const AqarBrowsingAdapter = {
  source: "aqar",
  buildSearchUrl(mandate, limits = {}) {
    const query = mandateQuery(mandate) || "riyadh villa";
    const url = new URL("/عقارات", BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("page", String(limits.page || 1));
    return url.toString();
  },
  parseSearchResults(html, baseUrl = BASE_URL) {
    return extractLinks(html, baseUrl, /aqar\.fm/i)
      .filter((link) => /\/(عقار|listing|property|real-estate)|\/\d{4,}/i.test(link.url))
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
    return candidate;
  },
};
