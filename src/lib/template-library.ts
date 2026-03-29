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
};

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    canonicalName: 'Contract Compliance Review',
    group: 'contract_operations',
    rank: 10,
    emoji: '📋',
    description: 'Broad contract review focused on verified obligations, compliance gaps, key terms, and review priorities.',
    descriptionAr: 'مراجعة شاملة للعقود تركز على الالتزامات الموثقة وفجوات الامتثال والشروط الأساسية وأولويات المراجعة.',
    aliases: ['General Contract Analysis'],
  },
  {
    canonicalName: 'Renewal Radar',
    group: 'contract_operations',
    rank: 20,
    emoji: '🔁',
    description: 'Renewal windows, notice logic, deadline pressure, and next actions.',
    descriptionAr: 'نوافذ التجديد ومنطق الإشعار وضغط المواعيد والإجراءات القادمة.',
    aliases: ['Renewal Pack', 'Default (Renewal Pack)'],
  },
  {
    canonicalName: 'Amendment Conflict Review',
    group: 'contract_operations',
    rank: 30,
    emoji: '🧩',
    description: 'Changed terms, override logic, and unresolved amendment conflicts.',
    descriptionAr: 'تغييرات الشروط ومنطق التغليب وتعارضات التعديلات غير المحسومة.',
  },
  {
    canonicalName: 'Obligations Tracker',
    group: 'contract_operations',
    rank: 40,
    emoji: '✅',
    description: 'Owners, triggers, deadlines, and operational follow-up obligations.',
    descriptionAr: 'المالكون والمحفزات والمواعيد والالتزامات التشغيلية اللاحقة.',
  },
  {
    canonicalName: 'Playbook / Compliance Review',
    group: 'contract_operations',
    rank: 50,
    emoji: '🛡️',
    description: 'Deviations from templates, policies, and approval rules with evidence.',
    descriptionAr: 'انحرافات عن القواعد والسياسات ومتطلبات الموافقة مع أدلة داعمة.',
  },
  {
    canonicalName: 'Vendor Invoice Exceptions',
    group: 'finance_operations',
    rank: 60,
    emoji: '🧾',
    description: 'Invoice tie-outs, VAT issues, duplicate risk, and approval exceptions.',
    descriptionAr: 'مطابقات الفواتير ومشكلات الضريبة ومخاطر التكرار واستثناءات الموافقة.',
  },
  {
    canonicalName: 'Vendor Onboarding Review',
    group: 'finance_operations',
    rank: 70,
    emoji: '📦',
    description: 'Supplier onboarding checks across registration, banking, and compliance documents.',
    descriptionAr: 'فحوصات تأهيل الموردين عبر التسجيل والبيانات البنكية ومستندات الامتثال.',
  },
  {
    canonicalName: 'Commercial Lease Review',
    group: 'adjacent_domains',
    rank: 80,
    emoji: '🏠',
    description: 'Lease economics, renewal windows, notice terms, and landlord-tenant obligations.',
    descriptionAr: 'اقتصاديات الإيجار وفترات التجديد وشروط الإشعار والتزامات المؤجر والمستأجر.',
    aliases: ['Lease Review'],
  },
  {
    canonicalName: 'Insurance Claims & Policy Review',
    group: 'adjacent_domains',
    rank: 90,
    emoji: '🩺',
    description: 'Coverage, exclusions, missing support, and claim-relevant discrepancies.',
    descriptionAr: 'التغطية والاستثناءات ونقص المستندات والتعارضات المؤثرة على المطالبة.',
  },
  {
    canonicalName: 'Employment Document Review',
    group: 'adjacent_domains',
    rank: 100,
    emoji: '👔',
    description: 'Compensation, role terms, termination language, and policy conformity.',
    descriptionAr: 'الأجر وشروط الدور ولغة الإنهاء والتوافق مع السياسات.',
  },
  {
    canonicalName: 'Vendor / SaaS Contract Review',
    group: 'variants',
    rank: 200,
    emoji: '💻',
    description: 'A vendor-focused specialization of the broad contract compliance review workflow.',
    descriptionAr: 'تخصص يركز على عقود الموردين والبرمجيات بوصفه امتداداً لمسار مراجعة امتثال العقود.',
    variant: true,
  },
  {
    canonicalName: 'KSA Contract Checklist (Contract-Only)',
    group: 'variants',
    rank: 210,
    emoji: '🇸🇦',
    description: 'A Saudi-specific checklist layered on the contract compliance review spine.',
    descriptionAr: 'قائمة تحقق سعودية مبنية على مسار مراجعة امتثال العقود.',
    variant: true,
  },
  {
    canonicalName: 'Policy & Regulatory Compliance Review',
    group: 'variants',
    rank: 220,
    emoji: '📚',
    description: 'A stricter DocSet-first compliance comparison against policy or regulatory references.',
    descriptionAr: 'مراجعة امتثال أكثر صرامة تعتمد على حزمة مستندات مقابل مراجع السياسات أو الأنظمة.',
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

export function resolveTemplateDefinition(playbookOrName: TemplateLibraryPlaybookLike | string) {
  const name = typeof playbookOrName === 'string' ? playbookOrName : playbookOrName.name;
  return NAME_TO_DEFINITION.get(String(name || '').trim().toLowerCase()) || null;
}

export function getTemplateAliases(playbook: TemplateLibraryPlaybookLike): string[] {
  const metaAliases = specMeta(playbook).aliases;
  const aliases = Array.isArray(metaAliases)
    ? metaAliases.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const mapped = resolveTemplateDefinition(playbook)?.aliases || [];
  return Array.from(new Set([playbook.name, ...aliases, ...mapped]));
}

export function playbookMatchesName(playbook: TemplateLibraryPlaybookLike, candidate: string): boolean {
  const normalized = String(candidate || '').trim().toLowerCase();
  return getTemplateAliases(playbook).some((name) => name.toLowerCase() === normalized);
}

export function getTemplateGroup(playbook: TemplateLibraryPlaybookLike): TemplateLibraryGroup {
  if (!playbook.is_system_preset) return 'custom';
  const meta = specMeta(playbook);
  const fromMeta = String(meta.library_group || '').trim().toLowerCase();
  if (
    fromMeta === 'contract_operations' ||
    fromMeta === 'finance_operations' ||
    fromMeta === 'adjacent_domains' ||
    fromMeta === 'variants'
  ) {
    return fromMeta;
  }
  return resolveTemplateDefinition(playbook)?.group || 'contract_operations';
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
  return resolveTemplateDefinition(playbook)?.emoji || '📋';
}

export function getTemplateDescription(playbook: TemplateLibraryPlaybookLike, locale: 'en' | 'ar'): string {
  if (!playbook.is_system_preset) {
    return locale === 'ar' ? 'قالب مخصص' : 'Custom template';
  }
  const meta = specMeta(playbook);
  const localizedMeta = locale === 'ar' ? meta.description_ar : meta.description;
  if (typeof localizedMeta === 'string' && localizedMeta.trim()) return localizedMeta.trim();
  const definition = resolveTemplateDefinition(playbook);
  if (!definition) return locale === 'ar' ? 'استخراج بدرجة دليل لهذا النوع من المستندات.' : 'Evidence-grade extraction for this document type.';
  return locale === 'ar' ? definition.descriptionAr : definition.description;
}

export function getTemplateGroupLabel(group: TemplateLibraryGroup, locale: 'en' | 'ar'): string {
  if (locale === 'ar') {
    switch (group) {
      case 'contract_operations':
        return 'عمليات العقود والاتفاقيات';
      case 'finance_operations':
        return 'المالية والمشتريات والعمليات';
      case 'adjacent_domains':
        return 'مجالات عالية القيمة مجاورة';
      case 'variants':
        return 'النسخ المتخصصة';
      case 'custom':
        return 'قوالبك';
    }
  }
  switch (group) {
    case 'contract_operations':
      return 'Contract and Agreement Operations';
    case 'finance_operations':
      return 'Finance, Procurement, and Operations';
    case 'adjacent_domains':
      return 'Adjacent High-Value Domains';
    case 'variants':
      return 'Variants';
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
  const groups: Array<Exclude<TemplateLibraryGroup, 'custom'>> = [
    'contract_operations',
    'finance_operations',
    'adjacent_domains',
    'variants',
  ];
  const sorted = sortSystemPlaybooks(playbooks.filter((playbook) => playbook.is_system_preset));
  return groups.map((group) => ({
    group,
    playbooks: sorted.filter((playbook) => getTemplateGroup(playbook) === group),
  })).filter((entry) => entry.playbooks.length > 0);
}
