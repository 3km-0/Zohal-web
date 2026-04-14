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
    aliases: ['Credit / Covenant Monitoring Workspace'],
  },
  {
    canonicalName: 'WhatsApp Receipts to SMB Cash Flow Workspace',
    group: 'zohal_templates',
    rank: 40,
    emoji: '💳',
    description:
      'Receipts, invoices, and bank activity turned into SMB cash flow, AP/AR, and reconciliation views.',
    descriptionAr: 'تدفقات نقدية للمنشآت الصغيرة من الإيصالات والبنك.',
    aliases: ['SMB Cash Flow Workspace'],
  },
  {
    canonicalName: 'PE Diligence Data Room Workspace',
    group: 'zohal_templates',
    rank: 50,
    emoji: '🗂️',
    description:
      'Data rooms and deal sets turned into diligence dashboards, risks, checklists, and claim-to-evidence views.',
    descriptionAr: 'غرف بيانات للفحص الاستثماري مع المخاطر والقوائم.',
  },
  {
    canonicalName: 'Real Estate Portfolio Tracker',
    group: 'zohal_templates',
    rank: 12,
    emoji: '🏡',
    description:
      'Asset Radar turns leases, rent rolls, ledgers, and tenant notices into expiry, arrears, vacancy, NOI drift, concentration, and asset memo views.',
    descriptionAr: 'Asset Radar يحوّل العقود وكشوف الإيجار والقيود إلى رؤية لمخاطر الأصل والمذكرة العقارية.',
    aliases: ['Asset Radar'],
  },
  {
    canonicalName: 'Quant Research Workspace',
    group: 'zohal_templates',
    rank: 70,
    emoji: '📊',
    description:
      'Market, alt, and fundamental inputs turned into signals, backtests, risk surfaces, and lineage.',
    descriptionAr: 'بحث كمي لربط بيانات السوق مع تحليل الإشارات والمخاطر.',
  },
  {
    canonicalName: 'Retail / F&B Owner Margin Intelligence Workspace',
    group: 'zohal_templates',
    rank: 80,
    emoji: '🍽️',
    description:
      'POS and supplier spend turned into branch margins, COGS pressure, and payables visibility.',
    descriptionAr: 'هوامش التجزئة والمطاعم من نقاط البيع والموردين.',
    aliases: ['Retail & F&B Margin Workspace'],
  },
  {
    canonicalName: 'Board Pack Radar',
    group: 'zohal_templates',
    rank: 90,
    emoji: '🧭',
    description:
      'Board packs, management accounts, and lender reporting turned into period comparisons and exception monitoring.',
    descriptionAr: 'حزم المجالس والتقارير الإدارية إلى متابعة للفروقات والاستثناءات.',
  },
  {
    canonicalName: 'Import / Export Shipment Control Tower',
    group: 'zohal_templates',
    rank: 100,
    emoji: '🚚',
    description:
      'Shipment documents, carrier updates, and ERP records turned into milestone, delay, and reconciliation visibility.',
    descriptionAr: 'مستندات الشحن والتحديثات التشغيلية إلى برج تحكم وتتبع للشحنات.',
    aliases: ['Logistics Operations Interface', 'Logistics Operations Portal'],
  },
  {
    canonicalName: 'Customs & Trade Compliance Workspace',
    group: 'zohal_templates',
    rank: 110,
    emoji: '🛃',
    description:
      'Declarations, certificates, broker updates, and customs notices turned into a compliance and clearance workspace.',
    descriptionAr: 'التصاريح والشهادات وتحديثات الوسطاء إلى مساحة امتثال وتخليص جمركي.',
  },
  {
    canonicalName: 'Construction Materials & Site Delivery Workspace',
    group: 'zohal_templates',
    rank: 120,
    emoji: '🏗️',
    description:
      'POs, delivery notes, site receipts, and invoices turned into a live project-delivery and shortage monitor.',
    descriptionAr: 'أوامر الشراء وإشعارات التسليم إلى متابعة للموقع والتوريد والنواقص.',
  },
  {
    canonicalName: 'Lab Reports -> Patient Biomarker Dashboard',
    group: 'zohal_templates',
    rank: 130,
    emoji: '🧪',
    description:
      'Lab reports and clinician notes turned into biomarker trends, out-of-range monitoring, and follow-up visibility.',
    descriptionAr: 'تقارير المختبر والملاحظات الطبية إلى لوحة مؤشرات حيوية ومتابعة.',
    aliases: ['Healthcare Record Interface', 'Healthcare Record Surface'],
  },
  {
    canonicalName: 'Adaptive Quiz & Spaced Repetition Learning Workspace',
    group: 'zohal_templates',
    rank: 140,
    emoji: '🎓',
    description:
      'Textbooks, lecture notes, and student performance turned into adaptive quizzes and spaced repetition workflows.',
    descriptionAr: 'المواد الدراسية والأداء إلى اختبارات تكيفية ومراجعة متباعدة.',
    aliases: ['Course Learning Interface', 'Course Learning Portal'],
  },
  {
    canonicalName: 'Literature Review & Research Synthesis Workspace',
    group: 'zohal_templates',
    rank: 150,
    emoji: '📚',
    description:
      'Research papers, preprints, and annotations turned into a living synthesis with citation and gap analysis.',
    descriptionAr: 'الأوراق البحثية والملاحظات إلى مساحة مراجعة أدبية وتركيب بحثي حي.',
    aliases: ['Research Synthesis Interface', 'Research Synthesis Site'],
  },
  {
    canonicalName: 'Hospitality Night Audit Workspace',
    group: 'zohal_templates',
    rank: 160,
    emoji: '🏨',
    description:
      'Night audit reports, PMS exports, folios, and POS summaries turned into reconciliation and exception workflows.',
    descriptionAr: 'تقارير التدقيق الليلي وبيانات الفندق إلى متابعة للمطابقة والاستثناءات.',
  },
  {
    canonicalName: 'Private Markets Obligations & Liquidity Workspace',
    group: 'zohal_templates',
    rank: 165,
    emoji: '🏦',
    description:
      'Capital calls, distributions, side letters, notices, and manager updates turned into a maintained allocator obligations and liquidity workspace.',
    descriptionAr: 'مساحة التزامات وسيولة للأسواق الخاصة مبنية من النداءات والتوزيعات والإشعارات.',
    aliases: ['Private Markets Allocator Workspace', 'Allocator Obligations & Liquidity Workspace'],
  },
];

const PRIMARY_TEMPLATE_CANONICAL_NAME = 'Real Estate Portfolio Tracker';

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
  ['pe_diligence_data_room_workspace', TEMPLATE_DEFINITIONS[4]],
  ['real_estate_portfolio_tracker', TEMPLATE_DEFINITIONS[5]],
  ['quant_research_workspace', TEMPLATE_DEFINITIONS[6]],
  ['retail_fnb_margin_workspace', TEMPLATE_DEFINITIONS[7]],
  ['board_pack_radar', TEMPLATE_DEFINITIONS[8]],
  ['logistics_operations_interface', TEMPLATE_DEFINITIONS[9]],
  ['customs_trade_compliance_workspace', TEMPLATE_DEFINITIONS[10]],
  ['construction_materials_site_delivery_workspace', TEMPLATE_DEFINITIONS[11]],
  ['healthcare_record_interface', TEMPLATE_DEFINITIONS[12]],
  ['course_learning_interface', TEMPLATE_DEFINITIONS[13]],
  ['research_synthesis_interface', TEMPLATE_DEFINITIONS[14]],
  ['hospitality_night_audit_workspace', TEMPLATE_DEFINITIONS[15]],
  ['private_markets_obligations_liquidity_workspace', TEMPLATE_DEFINITIONS[16]],
  ['private_markets_allocator_workspace', TEMPLATE_DEFINITIONS[16]],
  ['portfolio_monitoring_workspace', TEMPLATE_DEFINITIONS[1]],
  ['credit_covenant_monitoring', TEMPLATE_DEFINITIONS[2]],
  ['research_synthesis_site', TEMPLATE_DEFINITIONS[14]],
  ['course_learning_portal', TEMPLATE_DEFINITIONS[13]],
  ['healthcare_record_surface', TEMPLATE_DEFINITIONS[12]],
  ['logistics_operations_portal', TEMPLATE_DEFINITIONS[9]],
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
  if (!definition) return false;
  if (definition.hidden === true) return true;
  return definition.canonicalName !== PRIMARY_TEMPLATE_CANONICAL_NAME;
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
