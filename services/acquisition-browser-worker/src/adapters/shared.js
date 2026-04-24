import { createHash } from "node:crypto";

export function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function stripTags(html) {
  return normalizeText(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

export function absoluteUrl(url, baseUrl) {
  const raw = normalizeText(url);
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

export function parseNumber(value) {
  const match = normalizeText(value).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function parsePrice(text) {
  const normalized = normalizeText(text).replace(/,/g, "");
  const million = normalized.match(/(\d+(?:\.\d+)?)\s*(m|mn|million|مليون)/i);
  if (million) return Math.round(Number(million[1]) * 1_000_000);
  const sar = normalized.match(/(?:sar|ريال|ر\.س)?\s*(\d{5,})/i);
  return sar ? Number(sar[1]) : null;
}

export function sourceFingerprint({ source, sourceUrl, title, district, askingPrice }) {
  return createHash("sha256")
    .update([
      normalizeText(source).toLowerCase(),
      normalizeText(sourceUrl).toLowerCase().replace(/\/+$/, ""),
      normalizeText(title).toLowerCase(),
      normalizeText(district).toLowerCase(),
      normalizeText(askingPrice),
    ].join("|"))
    .digest("hex");
}

export function detectPropertyType(text) {
  const value = normalizeText(text).toLowerCase();
  if (/(villa|فيلا)/i.test(value)) return "villa";
  if (/(apartment|flat|شقة)/i.test(value)) return "apartment";
  if (/(land|plot|أرض|ارض)/i.test(value)) return "land";
  if (/(building|عمارة|مبنى)/i.test(value)) return "building";
  if (/(office|retail|commercial|مكتب|تجاري)/i.test(value)) return "commercial";
  return null;
}

export function extractLinks(html, baseUrl, sourceHostPattern) {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || seen.has(url)) continue;
    if (sourceHostPattern && !sourceHostPattern.test(url)) continue;
    seen.add(url);
    links.push({ url, text: stripTags(match[2]) });
  }
  return links;
}

export function candidateFromText({ source, sourceUrl, title, text, capturedAt = new Date().toISOString() }) {
  const content = normalizeText(`${title || ""} ${text || ""}`);
  const askingPrice = parsePrice(content);
  const area = content.match(/(\d+(?:\.\d+)?)\s*(sqm|m2|م2|متر)/i);
  const beds = content.match(/(\d+)\s*(bed|beds|bedroom|غرف|غرفة)/i);
  const baths = content.match(/(\d+)\s*(bath|bathroom|دورات|حمام)/i);
  const propertyType = detectPropertyType(content);
  const districtMatch = content.match(/(?:district|حي)\s*[:\-]?\s*([\p{L}\p{N}\s-]{2,32})/iu);
  const city = /(riyadh|الرياض)/i.test(content) ? "Riyadh" : /(jeddah|جدة)/i.test(content) ? "Jeddah" : null;
  const candidate = {
    source,
    source_url: sourceUrl,
    title: normalizeText(title) || normalizeText(content).slice(0, 80),
    asking_price: askingPrice,
    city,
    district: districtMatch ? normalizeText(districtMatch[1]) : null,
    property_type: propertyType,
    area_sqm: area ? Number(area[1]) : null,
    bedroom_count: beds ? Number(beds[1]) : null,
    bathroom_count: baths ? Number(baths[1]) : null,
    short_description: normalizeText(text).slice(0, 500) || null,
    terms_policy: "unknown",
    captured_at: capturedAt,
    limited_evidence_snapshot_json: {
      text: normalizeText(text).slice(0, 1200),
      source_url: sourceUrl,
      captured_at: capturedAt,
    },
  };
  candidate.source_fingerprint = sourceFingerprint({
    source,
    sourceUrl,
    title: candidate.title,
    district: candidate.district,
    askingPrice,
  });
  return candidate;
}
