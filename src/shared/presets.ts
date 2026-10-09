import type { ProviderPreset } from './types'

/**
 * Built-in provider presets, verified against official docs on 2026-10-09.
 * Model lists are curated starting points — users can fetch the live list
 * from any OpenAI-compatible endpoint or edit models freely.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    reasoningStyle: 'effort',
    models: [
      { id: 'gpt-6-astra', label: 'GPT-6 Astra', reasoning: true },
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', reasoning: true },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', reasoning: true },
      { id: 'gpt-6-sol', label: 'GPT-6 Sol', reasoning: true },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    reasoningStyle: 'deepseek',
    models: [
      { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', reasoning: true },
      { id: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://platform.deepseek.com'
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    reasoningStyle: 'anthropic',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', reasoning: true },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', reasoning: true },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', reasoning: true },
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://console.anthropic.com'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    reasoningStyle: 'effort',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', reasoning: true },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', reasoning: true },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', reasoning: true },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', reasoning: true },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', reasoning: true },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    reasoningStyle: 'openrouter',
    models: [
      { id: 'openai/gpt-6-astra', label: 'OpenAI: GPT-6 Astra', reasoning: true },
      { id: 'anthropic/claude-opus-5.5', label: 'Anthropic: Claude Opus 5.5', reasoning: true },
      { id: 'google/gemini-3.8-flash', label: 'Google: Gemini 3.8 Flash', reasoning: true },
      { id: 'x-ai/grok-4.7', label: 'xAI: Grok 4.7', reasoning: true },
      { id: 'moonshotai/kimi-k3', label: 'MoonshotAI: Kimi K3', reasoning: true },
      { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek: V4.1 Flash', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    kind: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    reasoningStyle: 'effort',
    models: [
      { id: 'kimi-k3', label: 'Kimi K3', reasoning: true },
      { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', reasoning: false },
      { id: 'kimi-k2.7-code-highspeed', label: 'Kimi K2.7 Code Highspeed', reasoning: false },
      { id: 'kimi-k2.6', label: 'Kimi K2.6', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://platform.moonshot.cn'
  },
  {
    id: 'zhipu',
    name: 'Zhipu GLM',
    kind: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    reasoningStyle: 'effort',
    models: [
      { id: 'glm-5.3', label: 'GLM-5.3', reasoning: true },
      { id: 'glm-5.3-flash', label: 'GLM-5.3-Flash', reasoning: true },
      { id: 'glm-5.3-flashx', label: 'GLM-5.3-FlashX', reasoning: true },
      { id: 'glm-5.2', label: 'GLM-5.2', reasoning: true },
      { id: 'glm-5.1', label: 'GLM-5.1', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://open.bigmodel.cn'
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    kind: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    reasoningStyle: 'effort',
    models: [
      { id: 'deepseek-ai/DeepSeek-V4-Flash', label: 'DeepSeek-V4-Flash', reasoning: true },
      { id: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek-V4-Pro', reasoning: true },
      { id: 'zai-org/GLM-5.3', label: 'GLM-5.3', reasoning: true },
      { id: 'moonshotai/Kimi-K3', label: 'Kimi-K3', reasoning: true },
      { id: 'Qwen/Qwen3.6-27B', label: 'Qwen3.6-27B', reasoning: true }
    ],
    requiresKey: true,
    docsUrl: 'https://siliconflow.cn'
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    kind: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    reasoningStyle: 'effort',
    models: [
      { id: 'grok-4.7', label: 'Grok 4.7', reasoning: true },
      { id: 'grok-4.6', label: 'Grok 4.6', reasoning: true },
      { id: 'grok-4.5', label: 'Grok 4.5', reasoning: true },
      { id: 'grok-4.20', label: 'Grok 4.20', reasoning: false },
      { id: 'grok-build-0.1', label: 'Grok Build 0.1', reasoning: false }
    ],
    requiresKey: true,
    docsUrl: 'https://console.x.ai'
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    reasoningStyle: 'none',
    models: [],
    requiresKey: false
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    reasoningStyle: 'none',
    models: [],
    requiresKey: false
  },
  {
    id: 'custom-openai',
    name: 'Custom (OpenAI-compatible)',
    kind: 'openai-compatible',
    baseUrl: '',
    reasoningStyle: 'auto',
    models: [],
    requiresKey: true
  },
  {
    id: 'custom-anthropic',
    name: 'Custom (Anthropic-compatible)',
    kind: 'anthropic',
    baseUrl: '',
    reasoningStyle: 'anthropic',
    models: [],
    requiresKey: true
  }
]

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

/** Instantiate a provider config from a preset (fresh id, copied fields). */
export function providerFromPreset(preset: ProviderPreset): import('./types').ProviderConfig {
  return {
    id: `p-${preset.id}-${Math.random().toString(36).slice(2, 8)}`,
    name: preset.name,
    kind: preset.kind,
    baseUrl: preset.baseUrl,
    customHeaders: preset.headers ? { ...preset.headers } : undefined,
    models: preset.models.map((m) => ({ ...m })),
    reasoningStyle: preset.reasoningStyle
  }
}
