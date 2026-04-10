import type { TemplateLibraryGroup, TemplateLibraryPlaybookLike } from '@/types/templates';
export type { TemplateLibraryGroup, TemplateLibraryPlaybookLike } from '@/types/templates';

type TemplateDefinition = {
  canonicalName: string;
  group: Exclude<TemplateLibraryGroup, 'custom'>;
  rank: number;
  emoji: string;
  description: string;
  descriptionAr: string;
  aliases?: string[];
  variant?: boolean;
  hidden?: boolean;
};

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    canonicalName: 'Public Company Intelligence Workspace',
    group: 'zohal_templates',
    rank: 10,
    emoji: '📈',
    description:
      'Filings, earnings decks, and transcripts turned into a traceable public-company intelligence surface.',
    descriptionAr: 'حوّل الإفصاحات والعروض إلى مساحة ذكاء لشركة عامة قابلة للتتبع.',
    aliases: ['Investor Reporting Dashboard'],
  },
  {
    canonicalName: 'Saudi Family Office Portfolio Monitor',
    group: 'zohal_templates',
    rank: 20,
    emoji: '🏢',
    description:
      'Board packs, IC memos, and portfolio updates turned into a multi-company portfolio monitor.',
    descriptionAr: 'حزم مجالس الإدارة وتحديثات المحفظة في رقابة محفظة لعائلة مستثمرة.',
    aliases: ['Portfolio Monitoring Workspace'],
  },
  {
    canonicalName: 'Startup CFO Workspace',
    group: 'zohal_templates',
    rank: 30,
    emoji: '💰',
    description:
      'Accounting exports, bank data, board decks, and forecasts turned into BvA, runway, and covenant surfaces.',
    descriptionAr: 'مساحة للمدير المالي مع الميزانية والاحتياطي والعهد.',
  },
  {
    canonicalName: 'SMB Cash Flow Workspace',
    group: 'zohal_templates',
    rank: 40,
    emoji: '💳',
    description:
      'Receipts, invoices, and bank activity turned into SMB cash flow, AP/AR, and reconciliation views.',
    descriptionAr: 'تدفقات نقدية للمنشآت الصغيرة من الإيصالات والبنك.',
  },
  {
    canonicalName: 'Freelancer Financial Clarity Workspace',
    group: 'zohal_templates',
    rank: 50,
    emoji: '🧑‍💻',
    description:
      'Client contracts, invoices, and bank feeds turned into pipeline, AR, and tax-reserve clarity.',
    descriptionAr: 'وضوح مالي للمستقلين من الفواتير والعقود.',
  },
  {
    canonicalName: 'PE Diligence Data Room Workspace',
    group: 'zohal_templates',
    rank: 60,
    emoji: '🗂️',
    description:
      'Data rooms and deal sets turned into diligence dashboards, risks, checklists, and claim-to-evidence views.',
    descriptionAr: 'غرف بيانات للفحص الاستثماري مع المخاطر والقوائم.',
  },
  {
    canonicalName: 'Real Estate Portfolio Tracker',
    group: 'zohal_templates',
    rank: 70,
    emoji: '🏡',
    description:
      'Leases, rent rolls, and opex turned into yield, expiry, arrears, and NOI portfolio views.',
    descriptionAr: 'تتبع محفظة عقارية من العقود والإيجارات.',
  },
  {
    canonicalName: 'Fund Reporting Workspace',
    group: 'zohal_templates',
    rank: 80,
    emoji: '💼',
    description:
      'LP letters, capital accounts, and fund reports turned into performance, flows, and narrative-change views.',
    descriptionAr: 'تقارير الصناديق والمساهمين مع الأداء والتدفقات.',
  },
  {
    canonicalName: 'Quant Research Workspace',
    group: 'zohal_templates',
    rank: 90,
    emoji: '📊',
    description:
      'Market, alt, and fundamental inputs turned into signals, backtests, risk surfaces, and lineage.',
    descriptionAr: 'بحث كمي لربط بيانات السوق مع تحليل الإشارات والمخاطر.',
  },
  {
    canonicalName: 'Retail & F&B Margin Workspace',
    group: 'zohal_templates',
    rank: 100,
    emoji: '🍽️',
    description:
      'POS and supplier spend turned into branch margins, COGS pressure, and payables visibility.',
    descriptionAr: 'هوامش التجزئة والمطاعم من نقاط البيع والموردين.',
  },
];


const NAME_TO_DEFINITION = new Map<string, TemplateDefinition>();
for (const definition of TEMPLATE_DEFINITIONS) {
  NAME_TO_DEFINITION.set(definition.canonicalName.toLowerCase(), definition);
  for (const alias of definition.aliases || []) {
    NAME_TO_DEFINITION.set(alias.toLowerCase(), definition);
  }
}

const TEMPLATE_ID_TO_DEFINITION = new Map<string, TemplateDefinition>([
  ['investor_reporting_dashboard', TEMPLATE_DEFINITIONS[0]],
  ['family_office_portfolio_monitor', TEMPLATE_DEFINITIONS[1]],
  ['startup_cfo_workspace', TEMPLATE_DEFINITIONS[2]],
  ['smb_cash_flow_workspace', TEMPLATE_DEFINITIONS[3]],
  ['freelancer_financial_clarity_workspace', TEMPLATE_DEFINITIONS[4]],
  ['pe_diligence_data_room_workspace', TEMPLATE_DEFINITIONS[5]],
  ['real_estate_portfolio_tracker', TEMPLATE_DEFINITIONS[6]],
  ['fund_reporting_workspace', TEMPLATE_DEFINITIONS[7]],
  ['quant_research_workspace', TEMPLATE_DEFINITIONS[8]],
  ['retail_fnb_margin_workspace', TEMPLATE_DEFINITIONS[9]],
]);

function specMeta(playbook: TemplateLibraryPlaybookLike): Record<string, unknown> {
  return playbook.current_version?.spec_json?.meta &&
    typeof playbook.current_version.spec_json.meta === 'object' &&
    !Array.isArray(playbook.current_version.spec_json.meta)
    ? (playbook.current_version.spec_json.meta as Record<string, unknown>)
    : {};
}

function canonicalProfile(playbook: TemplateLibraryPlaybookLike): Record<string, unknown> {
  return playbook.current_version?.spec_json?.canonical_profile &&
    typeof playbook.current_version.spec_json.canonical_profile === 'object' &&
    !Array.isArray(playbook.current_version.spec_json.canonical_profile)
    ? (playbook.current_version.spec_json.canonical_profile as Record<string, unknown>)
    : {};
}

function canonicalIdentity(playbook: TemplateLibraryPlaybookLike): Record<string, unknown> {
  const profile = canonicalProfile(playbook);
  return profile.identity && typeof profile.identity === 'object' && !Array.isArray(profile.identity)
    ? (profile.identity as Record<string, unknown>)
    : {};
}

function canonicalPositioning(playbook: TemplateLibraryPlaybookLike): Record<string, unknown> {
  const profile = canonicalProfile(playbook);
  return profile.positioning && typeof profile.positioning === 'object' && !Array.isArray(profile.positioning)
    ? (profile.positioning as Record<string, unknown>)
    : {};
}

function metaLibrarySection(playbook: TemplateLibraryPlaybookLike): string {
  return String(specMeta(playbook).library_section || '').trim().toLowerCase();
}

function isHiddenDefinition(definition: TemplateDefinition | null): boolean {
  return definition?.hidden === true;
}

export function isHiddenSystemPlaybook(playbook: TemplateLibraryPlaybookLike): boolean {
  const section = metaLibrarySection(playbook);
  if (section === 'deprecated') return true;
  const metaHidden = specMeta(playbook).library_hidden;
  if (metaHidden === true) return true;
  return isHiddenDefinition(resolveTemplateDefinition(playbook));
}

export function resolveTemplateDefinition(playbookOrName: TemplateLibraryPlaybookLike | string) {
  if (typeof playbookOrName === 'string') {
    return NAME_TO_DEFINITION.get(String(playbookOrName || '').trim().toLowerCase()) || null;
  }
  const playbook = playbookOrName;
  const byName = NAME_TO_DEFINITION.get(String(playbook.name || '').trim().toLowerCase());
  if (byName) return byName;
  const templateId = playbook.current_version?.spec_json?.template_id;
  if (typeof templateId === 'string' && templateId.trim()) {
    return TEMPLATE_ID_TO_DEFINITION.get(templateId.trim().toLowerCase()) || null;
  }
  return null;
}

export function getTemplateAliases(playbook: TemplateLibraryPlaybookLike): string[] {
  const metaAliases = specMeta(playbook).aliases;
  const canonicalAliases = canonicalIdentity(playbook).aliases;
  const aliases = Array.isArray(metaAliases)
    ? metaAliases.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const canonical = Array.isArray(canonicalAliases)
    ? canonicalAliases.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const mapped = resolveTemplateDefinition(playbook)?.aliases || [];
  return Array.from(new Set([playbook.name, ...aliases, ...canonical, ...mapped]));
}

export function playbookMatchesName(playbook: TemplateLibraryPlaybookLike, candidate: string): boolean {
  const normalized = String(candidate || '').trim().toLowerCase();
  return getTemplateAliases(playbook).some((name) => name.toLowerCase() === normalized);
}

export function getTemplateGroup(playbook: TemplateLibraryPlaybookLike): TemplateLibraryGroup {
  if (!playbook.is_system_preset) return 'custom';
  return 'zohal_templates';
}

export function isVariantPlaybook(playbook: TemplateLibraryPlaybookLike): boolean {
  void playbook;
  return false;
}

export function getTemplateRank(playbook: TemplateLibraryPlaybookLike): number {
  const meta = specMeta(playbook);
  return typeof meta.library_rank === 'number'
    ? meta.library_rank
    : resolveTemplateDefinition(playbook)?.rank || Number.MAX_SAFE_INTEGER;
}

export function getTemplateEmoji(playbook: TemplateLibraryPlaybookLike): string {
  if (!playbook.is_system_preset) return '📝';
  const canonicalEmoji = String(canonicalIdentity(playbook).icon_emoji || '').trim();
  if (canonicalEmoji) return canonicalEmoji;
  return resolveTemplateDefinition(playbook)?.emoji || '📋';
}

export function getTemplateDescription(playbook: TemplateLibraryPlaybookLike, locale: 'en' | 'ar'): string {
  if (!playbook.is_system_preset) {
    return locale === 'ar' ? 'قالب مخصص' : 'Custom template';
  }
  const meta = specMeta(playbook);
  const localizedMeta = locale === 'ar' ? meta.description_ar : meta.description;
  if (typeof localizedMeta === 'string' && localizedMeta.trim()) return localizedMeta.trim();
  const positioning = canonicalPositioning(playbook);
  const canonicalPurpose = locale === 'ar'
    ? String(positioning.purpose_ar || '').trim()
    : String(positioning.purpose || '').trim();
  if (canonicalPurpose) return canonicalPurpose;
  const definition = resolveTemplateDefinition(playbook);
  if (!definition) return locale === 'ar' ? 'استخراج بدرجة دليل لهذا النوع من المستندات.' : 'Evidence-grade extraction for this document type.';
  return locale === 'ar' ? definition.descriptionAr : definition.description;
}

export function getTemplateRecommendedDocumentTypes(playbook: TemplateLibraryPlaybookLike): string[] {
  const positioningTypes = canonicalPositioning(playbook).recommended_document_types;
  if (Array.isArray(positioningTypes)) {
    return positioningTypes.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  }
  const metaTypes = specMeta(playbook).recommended_document_types;
  if (Array.isArray(metaTypes)) {
    return metaTypes.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

export function getTemplateGroupLabel(group: TemplateLibraryGroup, locale: 'en' | 'ar'): string {
  if (locale === 'ar') {
    switch (group) {
      case 'zohal_templates':
        return 'القوالب';
      case 'specializations':
        return 'القوالب';
      case 'custom':
        return 'قوالبك';
    }
  }
  switch (group) {
    case 'zohal_templates':
      return 'Templates';
    case 'specializations':
      return 'Templates';
    case 'custom':
      return 'Your Templates';
  }
}

export function sortSystemPlaybooks<T extends TemplateLibraryPlaybookLike>(playbooks: T[]): T[] {
  return [...playbooks].sort((a, b) => {
    const aVariant = isVariantPlaybook(a) ? 1 : 0;
    const bVariant = isVariantPlaybook(b) ? 1 : 0;
    if (aVariant !== bVariant) return aVariant - bVariant;

    const rankDiff = getTemplateRank(a) - getTemplateRank(b);
    if (rankDiff !== 0) return rankDiff;

    return a.name.localeCompare(b.name);
  });
}

export function groupSystemPlaybooks<T extends TemplateLibraryPlaybookLike>(playbooks: T[]) {
  const groups: Array<Exclude<TemplateLibraryGroup, 'custom'>> = ['zohal_templates'];
  const sorted = sortSystemPlaybooks(
    playbooks.filter((playbook) => playbook.is_system_preset && !isHiddenSystemPlaybook(playbook))
  );
  return groups.map((group) => ({
    group,
    playbooks: sorted.filter((playbook) => getTemplateGroup(playbook) === group),
  })).filter((entry) => entry.playbooks.length > 0);
}
