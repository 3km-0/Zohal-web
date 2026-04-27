import { createHash } from "node:crypto";

export function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function boundedTextSnapshot(html, limit = 1200) {
  return redactSensitiveText(stripTags(html)).slice(0, Math.max(120, Math.min(3000, Number(limit) || 1200)));
}

export function stripTags(html) {
  return normalizeText(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

export function redactSensitiveText(value) {
  return normalizeText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?966|0)?\s*5(?:[\s.-]?\d){8}\b/g, "[redacted-sa-mobile]")
    .replace(/\b(?:\+?\d[\s.-]?){9,15}\b/g, "[redacted-phone]");
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
  const rawMultiline = String(text || "");
  const raw = normalizeText(rawMultiline);
  const normalized = raw.replace(/,/g, "");
  const million = normalized.match(/(\d+(?:\.\d+)?)\s*(m|mn|million|مليون)/i);
  if (million) return Math.round(Number(million[1]) * 1_000_000);
  const currencyPatterns = [
    /(?:sar|ريال|ر\.س|§|⃁)\s*([\d,]{5,})/i,
    /([\d,]{5,})\s*(?:sar|ريال|ر\.س|§|⃁)/i,
  ];
  for (const line of rawMultiline.split(/\s*\n+\s*/)) {
    for (const pattern of currencyPatterns) {
      const match = line.match(pattern);
      if (match) return Number(match[1].replace(/,/g, ""));
    }
  }
  for (const pattern of currencyPatterns) {
    const match = raw.match(pattern);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  const fallback = normalized.match(/\b(\d{5,})\b/i);
  return fallback ? Number(fallback[1]) : null;
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
  if (/(villa|فيلا|فلل|فلة)/i.test(value)) return "villa";
  if (/(apartment|flat|شقة)/i.test(value)) return "apartment";
  if (/(land|plot|أرض|ارض)/i.test(value)) return "land";
  if (/(building|عمارة|مبنى)/i.test(value)) return "building";
  if (/(office|retail|commercial|مكتب|تجاري)/i.test(value)) return "commercial";
  return null;
}

export function detectCity(text) {
  const value = normalizeText(text);
  if (/(riyadh|الرياض)/i.test(value)) return "Riyadh";
  if (/(jeddah|جدة)/i.test(value)) return "Jeddah";
  if (/(dammam|الدمام)/i.test(value)) return "Dammam";
  if (/(khobar|الخبر)/i.test(value)) return "Khobar";
  return null;
}

export function detectDistrict(text) {
  const value = normalizeText(text);
  const arabic = value.match(/حي\s+([^,،\n]{2,36})/u);
  if (arabic) return normalizeText(arabic[1]);
  const english = value.match(/\b(?:district|neighborhood|neighbourhood)\s*[:\-]?\s*([\p{L}\p{N}\s-]{2,36})/iu);
  if (english) return normalizeText(english[1]);
  const bayutLocation = value.match(/\b([A-Z][A-Za-z\s-]{2,30}),\s*(?:North|South|East|West|Central)?\s*Riyadh\b/);
  return bayutLocation ? normalizeText(bayutLocation[1]) : null;
}

export function detectContactGate(html) {
  const text = stripTags(html).toLowerCase();
  const patterns = [
    /sign\s*in[^.]{0,80}(phone|contact|whatsapp|agent|broker)/i,
    /log\s*in[^.]{0,80}(phone|contact|whatsapp|agent|broker)/i,
    /(phone|contact|whatsapp|agent|broker)[^.]{0,80}(sign\s*in|log\s*in)/i,
    /(رقم|الهاتف|واتساب|تواصل|اتصل)[^.]{0,80}(تسجيل|الدخول)/i,
    /(تسجيل|الدخول)[^.]{0,80}(رقم|الهاتف|واتساب|تواصل|اتصل)/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

export function detectVisibleContact(html) {
  const text = stripTags(html);
  const hasPhone = /(?:\+?966|0)?\s*5(?:[\s.-]?\d){8}\b/.test(text) ||
    /\b(?:\+?\d[\s.-]?){9,15}\b/.test(text);
  const hasWhatsApp = /whatsapp|واتساب|واتس/i.test(text);
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  if (!hasPhone && !hasWhatsApp && !hasEmail) return null;
  return {
    status: "available_via_authenticated_session",
    phone_visible: hasPhone,
    whatsapp_visible: hasWhatsApp,
    email_visible: hasEmail,
    raw_contact_storage: "not_stored",
  };
}

export function extractPhotoRefs(html, baseUrl, limit = 8) {
  const refs = [];
  const seen = new Set();
  const add = (raw) => {
    const url = absoluteUrl(raw, baseUrl);
    if (!url || seen.has(url)) return;
    if (!/^https?:\/\//i.test(url)) return;
    if (/\.(svg|gif)(?:$|[?#])/i.test(url)) return;
    if (/(logo|icon|avatar|user|placeholder|sprite|grid)\.(?:png|jpe?g|webp|svg)/i.test(url)) return;
    if (!/\.(?:png|jpe?g|webp|avif)(?:$|[?#])/i.test(url)) return;
    seen.add(url);
    refs.push(url);
  };
  for (const match of String(html || "").matchAll(/<img\b[^>]*(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) {
    add(match[1]);
  }
  for (const match of String(html || "").matchAll(/["'](https?:\/\/[^"']+\.(?:png|jpe?g|webp|avif)(?:\?[^"']*)?)["']/gi)) {
    add(match[1]);
  }
  return refs.slice(0, Math.max(0, Number(limit) || 8));
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
  const area = content.match(/(\d+(?:\.\d+)?)\s*(sqm|sq\.?\s*m\.?|m2|m²|م2|م²|متر)/i);
  const beds = content.match(/(\d+)\s*(bed|beds|bedroom|غرف|غرفة)/i);
  const baths = content.match(/(\d+)\s*(bath|bathroom|دورات|حمام)/i);
  const propertyType = detectPropertyType(content);
  const district = detectDistrict(content);
  const city = detectCity(content);
  const candidate = {
    source,
    source_url: sourceUrl,
    title: normalizeText(title) || normalizeText(content).slice(0, 80),
    asking_price: askingPrice,
    city,
    district,
    property_type: propertyType,
    area_sqm: area ? Number(area[1]) : null,
    bedroom_count: beds ? Number(beds[1]) : null,
    bathroom_count: baths ? Number(baths[1]) : null,
    short_description: redactSensitiveText(text).slice(0, 500) || null,
    terms_policy: "unknown",
    captured_at: capturedAt,
    limited_evidence_snapshot_json: {
      text: redactSensitiveText(text).slice(0, 1200),
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
