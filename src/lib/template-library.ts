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
    canonicalName: 'Contract Compliance Workspace',
    group: 'zohal_templates',
    rank: 10,
    emoji: '📋',
    description: 'Broad contract intelligence and actionability across agreements, amendments, notices, obligations, and review priorities.',
    descriptionAr: 'مساحة عمل شاملة لامتثال العقود تجمع الاتفاقيات والتعديلات والإشعارات والالتزامات وأولويات المراجعة.',
    aliases: ['Contract Compliance Review', 'General Contract Analysis'],
  },
  {
    canonicalName: 'Investor Reporting Dashboard',
    group: 'zohal_templates',
    rank: 20,
    emoji: '📈',
    description: 'Turn annual reports, filings, and recurring reporting sets into traceable investor-facing dashboards.',
    descriptionAr: 'حوّل التقارير السنوية والإفصاحات إلى لوحة تقارير استثمارية قابلة للتتبع.',
  },
  {
    canonicalName: 'Product Specification Catalog',
    group: 'zohal_templates',
    rank: 30,
    emoji: '🧰',
    description: 'Convert technical PDFs and product sheets into searchable, comparable product surfaces.',
    descriptionAr: 'حوّل المواصفات الفنية وملفات PDF إلى كتالوج مواصفات قابل للبحث والمقارنة.',
  },
  {
    canonicalName: 'Research Synthesis Site',
    group: 'zohal_templates',
    rank: 40,
    emoji: '🧠',
    description: 'Turn a corpus of papers and reports into an evolving synthesis surface with evidence and gaps.',
    descriptionAr: 'حوّل مجموعة الأوراق والتقارير إلى موقع توليف بحثي يتتبع الأدلة والفجوات.',
  },
  {
    canonicalName: 'Course Learning Surface',
    group: 'zohal_templates',
    rank: 50,
    emoji: '🎓',
    description: 'Turn course documents into an interactive study, schedule, and assignment portal.',
    descriptionAr: 'حوّل مستندات المقررات إلى بوابة تعلم تفاعلية للدراسة والجدول والمهام.',
  },
  {
    canonicalName: 'Policy & Regulatory Surface',
    group: 'zohal_templates',
    rank: 60,
    emoji: '📚',
    description: 'Turn versioned policy or regulatory corpora into navigable, update-aware compliance portals.',
    descriptionAr: 'حوّل مجموعات السياسات واللوائح المرقمة إلى بوابة تنظيمية قابلة للتصفح وتتبع التحديثات.',
    aliases: ['Policy & Regulatory Compliance Review'],
  },
  {
    canonicalName: 'Healthcare Record Surface',
    group: 'zohal_templates',
    rank: 70,
    emoji: '🩺',
    description: 'Turn longitudinal healthcare documents into navigable summaries, timelines, and follow-up views.',
    descriptionAr: 'حوّل السجلات الصحية الطولية إلى واجهة ملخصات وجداول زمنية ومتابعات قابلة للتصفح.',
  },
  {
    canonicalName: 'Logistics Operations Surface',
    group: 'zohal_templates',
    rank: 80,
    emoji: '🚚',
    description: 'Turn logistics document sets into status-aware operations portals with milestones and exceptions.',
    descriptionAr: 'حوّل مستندات اللوجستيات إلى بوابة عمليات تتتبع الحالة والمراحل والاستثناءات.',
  },
  {
    canonicalName: 'Renewal Radar',
    group: 'specializations',
    rank: 200,
    emoji: '🔁',
    description: 'Renewal windows, notice logic, deadline pressure, and next actions.',
    descriptionAr: 'نوافذ التجديد ومنطق الإشعار وضغط المواعيد والإجراءات القادمة.',
    aliases: ['Renewal Pack', 'Default (Renewal Pack)'],
    variant: true,
  },
  {
    canonicalName: 'Amendment Conflict Review',
    group: 'specializations',
    rank: 210,
    emoji: '🧩',
    description: 'Changed terms, override logic, and unresolved amendment conflicts.',
    descriptionAr: 'تغييرات الشروط ومنطق التغليب وتعارضات التعديلات غير المحسومة.',
    variant: true,
  },
  {
    canonicalName: 'Obligations Tracker',
    group: 'specializations',
    rank: 900,
    emoji: '✅',
    description: 'Owners, triggers, deadlines, and operational follow-up obligations.',
    descriptionAr: 'المالكون والمحفزات والمواعيد والالتزامات التشغيلية اللاحقة.',
    hidden: true,
  },
  {
    canonicalName: 'Playbook / Compliance Review',
    group: 'specializations',
    rank: 910,
    emoji: '🛡️',
    description: 'Deviations from templates, policies, and approval rules with evidence.',
    descriptionAr: 'انحرافات عن القواعد والسياسات ومتطلبات الموافقة مع أدلة داعمة.',
    hidden: true,
  },
  {
    canonicalName: 'Vendor Invoice Exceptions',
    group: 'specializations',
    rank: 220,
    emoji: '🧾',
    description: 'Invoice tie-outs, VAT issues, duplicate risk, and approval exceptions.',
    descriptionAr: 'مطابقات الفواتير ومشكلات الضريبة ومخاطر التكرار واستثناءات الموافقة.',
    variant: true,
  },
  {
    canonicalName: 'Vendor Onboarding Review',
    group: 'specializations',
    rank: 230,
    emoji: '📦',
    description: 'Supplier onboarding checks across registration, banking, and compliance documents.',
    descriptionAr: 'فحوصات تأهيل الموردين عبر التسجيل والبيانات البنكية ومستندات الامتثال.',
    variant: true,
  },
  {
    canonicalName: 'Commercial Lease Review',
    group: 'specializations',
    rank: 240,
    emoji: '🏠',
    description: 'Lease economics, renewal windows, notice terms, and landlord-tenant obligations.',
    descriptionAr: 'اقتصاديات الإيجار وفترات التجديد وشروط الإشعار والتزامات المؤجر والمستأجر.',
    aliases: ['Lease Review'],
    variant: true,
  },
  {
    canonicalName: 'Insurance Claims & Policy Review',
    group: 'specializations',
    rank: 920,
    emoji: '🩺',
    description: 'Coverage, exclusions, missing support, and claim-relevant discrepancies.',
    descriptionAr: 'التغطية والاستثناءات ونقص المستندات والتعارضات المؤثرة على المطالبة.',
    hidden: true,
  },
  {
    canonicalName: 'Employment Document Review',
    group: 'specializations',
    rank: 930,
    emoji: '👔',
    description: 'Compensation, role terms, termination language, and policy conformity.',
    descriptionAr: 'الأجر وشروط الدور ولغة الإنهاء والتوافق مع السياسات.',
    hidden: true,
  },
  {
    canonicalName: 'Vendor / SaaS Contract Review',
    group: 'specializations',
    rank: 250,
    emoji: '💻',
    description: 'A vendor-focused specialization of the broad contract compliance workspace.',
    descriptionAr: 'تخصص يركز على عقود الموردين والبرمجيات بوصفه امتداداً لمساحة عمل امتثال العقود.',
    variant: true,
  },
  {
    canonicalName: 'KSA Contract Checklist (Contract-Only)',
    group: 'specializations',
    rank: 260,
    emoji: '🇸🇦',
    description: 'A Saudi-specific checklist layered on the contract compliance workspace.',
    descriptionAr: 'قائمة تحقق سعودية مبنية على مساحة عمل امتثال العقود.',
    variant: true,
  },
];

const NAME_TO_DEFINITION = new Map<string, TemplateDefinition>();
for (const definition of TEMPLATE_DEFINITIONS) {
  NAME_TO_DEFINITION.set(definition.canonicalName.toLowerCase(), definition);
  for (const alias of definition.aliases || []) {
    NAME_TO_DEFINITION.set(alias.toLowerCase(), definition);
  }
}

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
  const name = typeof playbookOrName === 'string' ? playbookOrName : playbookOrName.name;
  return NAME_TO_DEFINITION.get(String(name || '').trim().toLowerCase()) || null;
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
  const section = metaLibrarySection(playbook);
  if (section === 'zohal_templates') return 'zohal_templates';
  if (section === 'specializations') return 'specializations';
  if (section === 'deprecated') return 'specializations';
  const specializationOf = String(canonicalPositioning(playbook).specialization_of || '').trim();
  if (specializationOf) return 'specializations';
  const meta = specMeta(playbook);
  const fromMeta = String(meta.library_group || '').trim().toLowerCase();
  if (fromMeta === 'zohal_templates' || fromMeta === 'specializations') {
    return fromMeta;
  }
  if (
    fromMeta === 'contract_operations' ||
    fromMeta === 'finance_operations' ||
    fromMeta === 'adjacent_domains' ||
    fromMeta === 'variants'
  ) {
    return isVariantPlaybook(playbook) ? 'specializations' : 'zohal_templates';
  }
  return resolveTemplateDefinition(playbook)?.group || 'zohal_templates';
}

export function isVariantPlaybook(playbook: TemplateLibraryPlaybookLike): boolean {
  const meta = specMeta(playbook);
  if (meta.is_variant === true) return true;
  return resolveTemplateDefinition(playbook)?.variant === true;
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
        return 'قوالب زحل';
      case 'specializations':
        return 'التخصصات';
      case 'custom':
        return 'قوالبك';
    }
  }
  switch (group) {
    case 'zohal_templates':
      return 'Zohal Templates';
    case 'specializations':
      return 'Specializations';
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
  const groups: Array<Exclude<TemplateLibraryGroup, 'custom'>> = ['zohal_templates', 'specializations'];
  const sorted = sortSystemPlaybooks(
    playbooks.filter((playbook) => playbook.is_system_preset && !isHiddenSystemPlaybook(playbook))
  );
  return groups.map((group) => ({
    group,
    playbooks: sorted.filter((playbook) => getTemplateGroup(playbook) === group),
  })).filter((entry) => entry.playbooks.length > 0);
}
