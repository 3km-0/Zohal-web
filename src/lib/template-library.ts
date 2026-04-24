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
    canonicalName: 'Acquisition Workspace',
    group: 'zohal_templates',
    rank: 10,
    emoji: '🏡',
    description:
      'Acquisition Workspace turns mandates, broker submissions, source documents, scenarios, and diligence into an evidence-linked acquisition decision workspace.',
    descriptionAr: 'مساحة الاستحواذ تحول التفويضات وعروض الوسطاء والمستندات والسيناريوهات والعناية الواجبة إلى مساحة قرار مرتبطة بالأدلة.',
    aliases: ['Acquisition Workspace'],
  },
];

const PRIMARY_TEMPLATE_CANONICAL_NAME = 'Acquisition Workspace';

const NAME_TO_DEFINITION = new Map<string, TemplateDefinition>();
for (const definition of TEMPLATE_DEFINITIONS) {
  NAME_TO_DEFINITION.set(definition.canonicalName.toLowerCase(), definition);
  for (const alias of definition.aliases || []) {
    NAME_TO_DEFINITION.set(alias.toLowerCase(), definition);
  }
}

const TEMPLATE_ID_TO_DEFINITION = new Map<string, TemplateDefinition>([
  ['acquisition_workspace', TEMPLATE_DEFINITIONS[0]],
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
