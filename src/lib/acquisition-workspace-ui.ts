export type AcquisitionUiOpportunity = {
  id?: string | null;
  stage?: string | null;
  title?: string | null;
  summary?: string | null;
  missing_info_json?: unknown;
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

export type AcquisitionActionId =
  | 'add_listing_evidence'
  | 'request_missing_documents'
  | 'schedule_visit'
  | 'request_contractor_evaluation'
  | 'upload_property_document'
  | 'upload_financing_document'
  | 'share_financing_packet'
  | 'activate_buyer_broker'
  | 'prepare_offer'
  | 'send_offer'
  | 'pass_property'
  | 'close_property';

export type AcquisitionPrimaryAction = {
  action_id: AcquisitionActionId;
  stage: string;
  label: string;
  result: string;
  adapter: 'files' | 'whatsapp' | 'calendar' | 'contractor' | 'readiness' | 'brokerage' | 'offer' | 'decision';
  blocked: boolean;
  blocker_reason?: string | null;
  secondary_action_id?: AcquisitionActionId | null;
};

export type AcquisitionActionContext = {
  opportunity?: AcquisitionUiOpportunity | null;
  hasReadinessProfile?: boolean;
  brokerageActive?: boolean;
  activeFinancingConsentCount?: number;
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

export function acquisitionMissingItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (typeof item === 'string' && item.trim()) return item.trim();
      return key;
    }).filter(Boolean);
  }
  return [];
}

export function resolvePrimaryAcquisitionAction(context: AcquisitionActionContext): AcquisitionPrimaryAction {
  const stage = context.opportunity?.stage || 'submitted';
  const missing = acquisitionMissingItems(context.opportunity?.missing_info_json);
  const hasReadiness = Boolean(context.hasReadinessProfile);
  const brokerageActive = Boolean(context.brokerageActive);
  const consented = (context.activeFinancingConsentCount ?? 0) > 0;

  if (!context.opportunity?.id) {
    return {
      action_id: 'add_listing_evidence',
      stage: 'submitted',
      label: 'Add listing evidence',
      result: 'Creates a property folder and starts property analysis.',
      adapter: 'files',
      blocked: false,
    };
  }

  if (!hasReadiness) {
    return {
      action_id: 'upload_financing_document',
      stage,
      label: 'Upload proof of funds',
      result: 'Stores financing documents privately and starts buyer readiness. Zohal does not underwrite credit.',
      adapter: 'readiness',
      blocked: false,
      secondary_action_id: 'add_listing_evidence',
    };
  }

  if (missing.length > 0 || stage === 'needs_info' || stage === 'screening' || stage === 'pursue' || stage === 'workspace_created') {
    return {
      action_id: 'request_missing_documents',
      stage,
      label: 'Ask broker for missing documents',
      result: 'Creates a broker document request and records it in Communication.',
      adapter: 'whatsapp',
      blocked: false,
      secondary_action_id: 'upload_property_document',
    };
  }

  if (stage === 'visit_requested') {
    return {
      action_id: 'request_contractor_evaluation',
      stage,
      label: 'Request contractor inspection',
      result: 'Creates an inspection request and waits for the contractor report.',
      adapter: 'contractor',
      blocked: false,
    };
  }

  if (stage === 'quote_requested' || stage === 'formal_diligence') {
    return {
      action_id: 'upload_property_document',
      stage,
      label: 'Upload property document',
      result: 'Runs property document analysis and flags discrepancies.',
      adapter: 'files',
      blocked: false,
    };
  }

  if (!brokerageActive) {
    return {
      action_id: 'activate_buyer_broker',
      stage,
      label: 'Hire buyer broker',
      result: 'Records buyer-side authority before negotiation actions.',
      adapter: 'brokerage',
      blocked: false,
    };
  }

  if (!consented) {
    return {
      action_id: 'share_financing_packet',
      stage,
      label: 'Share financing docs',
      result: 'Requires explicit consent and a no-underwriting acknowledgement before sharing.',
      adapter: 'readiness',
      blocked: false,
    };
  }

  if (stage === 'negotiation' || stage === 'offer' || stage === 'offer_drafted' || stage === 'offer_submitted') {
    return {
      action_id: 'send_offer',
      stage,
      label: 'Send offer',
      result: 'Sends the approved offer through the offer workflow.',
      adapter: 'offer',
      blocked: false,
      secondary_action_id: 'pass_property',
    };
  }

  if (stage === 'closed') {
    return {
      action_id: 'close_property',
      stage,
      label: 'Close property',
      result: 'Records the completed acquisition decision.',
      adapter: 'decision',
      blocked: false,
    };
  }

  return {
    action_id: 'schedule_visit',
    stage,
    label: 'Schedule visit',
    result: 'Creates a Google Calendar event and records the visit request.',
    adapter: 'calendar',
    blocked: false,
    secondary_action_id: 'pass_property',
  };
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
