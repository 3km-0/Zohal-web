export type ChatModelOption = {
  id: string;
  title: string;
  shortTitle: string;
  provider: string;
  providerMark: string;
  routingProvider?: ChatModelProviderOverride;
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

export type ChatModelProviderOverride = 'openai' | 'vertex';

export const DEFAULT_CHAT_MODEL_ID = 'google/gemini-3.1-pro-preview';

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    id: 'gpt-5.2-pro',
    title: 'GPT-5.2 Pro',
    shortTitle: 'GPT-5.2 Pro',
    provider: 'OpenAI',
    providerMark: 'O',
    routingProvider: 'openai',
    featureKey: 'deepReasoning',
    icon: 'brain',
    isOpenSource: false,
  },
  {
    id: 'gpt-5.2',
    title: 'GPT-5.2',
    shortTitle: 'GPT-5.2',
    provider: 'OpenAI',
    providerMark: 'O',
    routingProvider: 'openai',
    featureKey: 'longContext',
    icon: 'context',
    isOpenSource: false,
  },
  {
    id: 'gpt-5-mini',
    title: 'GPT-5 mini',
    shortTitle: 'GPT-5 mini',
    provider: 'OpenAI',
    providerMark: 'O',
    routingProvider: 'openai',
    featureKey: 'fastEverydayChat',
    icon: 'fast',
    isOpenSource: false,
  },
  {
    id: 'claude-sonnet-4-6',
    title: 'Claude Sonnet 4.6',
    shortTitle: 'Sonnet 4.6',
    provider: 'Anthropic',
    providerMark: 'A',
    routingProvider: 'vertex',
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
    routingProvider: 'vertex',
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
    routingProvider: 'vertex',
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
    routingProvider: 'vertex',
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
    routingProvider: 'vertex',
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
    routingProvider: 'vertex',
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
    routingProvider: 'vertex',
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
    routingProvider: 'vertex',
    featureKey: 'multilingualReasoning',
    icon: 'globe',
    isOpenSource: false,
  },
];

export function findChatModelOption(modelId: string | null | undefined): ChatModelOption | null {
  if (!modelId) return null;
  return CHAT_MODEL_OPTIONS.find((option) => option.id === modelId) ?? null;
}

export function inferChatModelProviderOverride(
  modelId: string | null | undefined
): ChatModelProviderOverride | null {
  if (!modelId) return null;

  const known = findChatModelOption(modelId);
  if (known?.routingProvider) return known.routingProvider;

  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.startsWith('gpt') ||
    normalized.startsWith('chatgpt') ||
    /^o\d/.test(normalized)
  ) {
    return 'openai';
  }

  if (
    normalized.includes('/') ||
    normalized.includes('-maas') ||
    normalized.startsWith('claude') ||
    normalized.startsWith('anthropic/')
  ) {
    return 'vertex';
  }

  return null;
}
