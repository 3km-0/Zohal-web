export type AcquisitionUiOpportunity = {
  stage?: string | null;
  title?: string | null;
  summary?: string | null;
  area_summary?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

export type AcquisitionScenarioSeed = {
  price: number;
  renovation: number;
  rent: number;
  vacancy: number;
  hold: number;
  appreciation: number;
};

const TITLE_NOISE_PATTERNS = [
  /\b(whatsapp|للبيع|for sale|عقار|aqar|bayut|haraj)\b/gi,
  /\s+/g,
];

export function acquisitionMetadataValue(item: AcquisitionUiOpportunity | null | undefined, keys: string[]): unknown {
  const metadata = item?.metadata_json ?? {};
  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== null) return metadata[key];
  }
  return undefined;
}

export function acquisitionMetadataString(item: AcquisitionUiOpportunity | null | undefined, keys: string[]): string | null {
  const value = acquisitionMetadataValue(item, keys);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function acquisitionMetadataNumber(item: AcquisitionUiOpportunity | null | undefined, keys: string[]): number | null {
  const value = acquisitionMetadataValue(item, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function photoRefsForOpportunity(item: AcquisitionUiOpportunity | null | undefined): string[] {
  const value = acquisitionMetadataValue(item, ['photo_refs', 'photoRefs', 'photos', 'image_urls']);
  const refs = Array.isArray(value) ? value : [];
  return [...new Set(refs
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => /^https?:\/\//i.test(entry))
    .filter((entry) => !/\.(svg|gif)(?:$|[?#])/i.test(entry))
  )].slice(0, 8);
}

export function cleanListingTitle(value: string | null | undefined): string | null {
  let title = `${value ?? ''}`.replace(/https?:\/\/\S+/gi, '').trim();
  if (!title) return null;
  for (const pattern of TITLE_NOISE_PATTERNS) {
    title = title.replace(pattern, ' ');
  }
  title = title.replace(/[|•]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  return title.length > 92 ? `${title.slice(0, 89).trim()}...` : title;
}

export function displayTitleForOpportunity(item: AcquisitionUiOpportunity | null | undefined): string | null {
  const explicit = acquisitionMetadataString(item, ['display_title', 'displayTitle']);
  if (explicit) return explicit;

  const propertyType = acquisitionMetadataString(item, ['property_type', 'asset_type']);
  const district = acquisitionMetadataString(item, ['district', 'neighborhood']);
  const city = acquisitionMetadataString(item, ['city']);
  const place = [district, city].filter(Boolean).join(', ');
  if (propertyType && place) return `${propertyType} in ${place}`;
  if (propertyType) return propertyType;
  if (place) return place;

  return cleanListingTitle(item?.title) || cleanListingTitle(acquisitionMetadataString(item, ['title', 'name'])) || cleanListingTitle(item?.summary);
}

export function progressStepIndexForStage(stage: string | null | undefined): number {
  switch (stage) {
    case 'submitted':
      return 1;
    case 'screening':
    case 'needs_info':
    case 'watch':
    case 'pursue':
    case 'workspace_created':
      return 2;
    case 'visit_requested':
    case 'quote_requested':
      return 3;
    case 'formal_diligence':
      return 4;
    case 'offer':
    case 'offer_drafted':
    case 'offer_submitted':
    case 'negotiation':
      return 5;
    case 'closed':
      return 6;
    default:
      return 0;
  }
}

export function seedScenarioFromOpportunity(item: AcquisitionUiOpportunity | null | undefined): AcquisitionScenarioSeed {
  const price = acquisitionMetadataNumber(item, ['price', 'asking_price', 'acquisition_price', 'purchase_price']) ?? 1_500_000;
  return {
    price,
    renovation: acquisitionMetadataNumber(item, ['renovation_budget', 'capex', 'estimated_capex']) ?? 0,
    rent: acquisitionMetadataNumber(item, ['monthly_rent', 'rent', 'expected_monthly_rent']) ?? Math.max(3500, Math.round(price * 0.0036)),
    vacancy: acquisitionMetadataNumber(item, ['vacancy', 'vacancy_rate']) ?? 7,
    hold: acquisitionMetadataNumber(item, ['hold_period', 'hold_years']) ?? 5,
    appreciation: acquisitionMetadataNumber(item, ['appreciation', 'annual_appreciation']) ?? 4,
  };
}
