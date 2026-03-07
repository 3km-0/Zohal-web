export type ChatModelOption = {
  id: string;
  title: string;
  shortTitle: string;
  provider: string;
  providerMark: string;
  featureKey:
    | 'balancedDrafting'
    | 'deepReasoning'
    | 'longContext'
    | 'toolWorkflows'
    | 'fastEverydayChat'
    | 'openSourceAlternative'
    | 'codeAndStructure'
    | 'multilingualReasoning';
  icon:
    | 'text'
    | 'brain'
    | 'context'
    | 'tools'
    | 'fast'
    | 'open'
    | 'code'
    | 'globe';
  isOpenSource: boolean;
};

export const DEFAULT_CHAT_MODEL_ID = 'google/gemini-3.1-pro-preview';

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    title: 'Claude Sonnet 4.6',
    shortTitle: 'Sonnet 4.6',
    provider: 'Anthropic',
    providerMark: 'A',
    featureKey: 'balancedDrafting',
    icon: 'text',
    isOpenSource: false,
  },
  {
    id: 'claude-opus-4-6',
    title: 'Claude Opus 4.6',
    shortTitle: 'Opus 4.6',
    provider: 'Anthropic',
    providerMark: 'A',
    featureKey: 'deepReasoning',
    icon: 'brain',
    isOpenSource: false,
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    title: 'Gemini 3.1 Pro',
    shortTitle: 'Gemini Pro',
    provider: 'Google',
    providerMark: 'G',
    featureKey: 'longContext',
    icon: 'context',
    isOpenSource: false,
  },
  {
    id: 'google/gemini-3.1-pro-preview-customtools',
    title: 'Gemini 3.1 Pro Tools',
    shortTitle: 'Gemini Tools',
    provider: 'Google',
    providerMark: 'G',
    featureKey: 'toolWorkflows',
    icon: 'tools',
    isOpenSource: false,
  },
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    title: 'Gemini 3.1 Flash-Lite',
    shortTitle: 'Gemini Flash',
    provider: 'Google',
    providerMark: 'G',
    featureKey: 'fastEverydayChat',
    icon: 'fast',
    isOpenSource: false,
  },
  {
    id: 'qwen/qwen3-235b-a22b-instruct-2507-maas',
    title: 'Qwen3 235B',
    shortTitle: 'Qwen3 235B',
    provider: 'Qwen',
    providerMark: 'Q',
    featureKey: 'openSourceAlternative',
    icon: 'open',
    isOpenSource: true,
  },
  {
    id: 'qwen/qwen3-coder-480b-a35b-instruct-maas',
    title: 'Qwen3 Coder 480B',
    shortTitle: 'Qwen Coder',
    provider: 'Qwen',
    providerMark: 'Q',
    featureKey: 'codeAndStructure',
    icon: 'code',
    isOpenSource: true,
  },
  {
    id: 'zai-org/glm-5-maas',
    title: 'GLM-5',
    shortTitle: 'GLM-5',
    provider: 'Z.AI',
    providerMark: 'Z',
    featureKey: 'multilingualReasoning',
    icon: 'globe',
    isOpenSource: false,
  },
];

export function findChatModelOption(modelId: string | null | undefined): ChatModelOption | null {
  if (!modelId) return null;
  return CHAT_MODEL_OPTIONS.find((option) => option.id === modelId) ?? null;
}
