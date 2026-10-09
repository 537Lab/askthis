import type { AppConfig, PromptPreset } from './types'

export const CONFIG_VERSION = 1

export const DEFAULT_SHORTCUT = 'Alt+Shift+D'

/* ============================== Built-in prompts ============================== */

export const BUILTIN_PROMPTS: PromptPreset[] = [
  {
    id: 'lookup-zh',
    name: '速查（默认）',
    system: `你是「速查」助手，为用户提供快速、极简的查询结果。规则：
1. 输入为术语、缩写、公式或代码片段：第一行用一句话说清「它是什么」（公式先说明用途），必要时再补最多 2 条最关键信息。不要展开讲解，用户需要深入时会另行提问。
2. 输入为句子或段落：给出翻译（中文→英文，其他语言→简体中文）。
3. 输入为问题：直接给出简明答案，控制在 1-3 行。
4. 强调用 **加粗**，代码或变量用 \`反引号\`；不要使用标题、表格或链接。
5. 数学表达用普通文本符号（如 n(n-1)(n+1)、Σ、√），不要使用 LaTeX。
6. 直接给出正文，无开场白、无结束语。`,
    template: '{{text}}',
    builtin: true
  },
  {
    id: 'lookup-en',
    name: 'Quick Lookup (English)',
    system: `You are a quick-lookup assistant. Give ultra-concise answers. Rules:
1. Term, abbreviation, formula or code snippet: one sentence explaining what it is on the first line, then at most 2 key facts if needed. Do not lecture.
2. Sentence or paragraph: translate it (Chinese → English, any other language → Simplified Chinese).
3. A question: answer directly in 1-3 lines.
4. Use **bold** for emphasis and \`backticks\` for code. No headings, tables or links. Plain-text math only (no LaTeX).
5. Output the content directly — no preamble, no closing.`,
    template: '{{text}}',
    builtin: true
  },
  {
    id: 'translate-zh',
    name: '翻译',
    system: `你是翻译助手。将输入内容翻译成简体中文；若输入已是中文，则翻译成英文。只输出译文本身，不要任何解释、标注或多余格式。`,
    template: '{{text}}',
    builtin: true
  },
  {
    id: 'explain-code',
    name: '解释代码',
    system: `你是代码解释助手。解释给定代码片段的用途与关键逻辑：第一行用一句话概括功能，然后用不超过 3 条要点说明关键部分，复杂处可引用行内 \`代码\`。保持简洁，不要展开成完整教程。`,
    template: '{{text}}',
    builtin: true
  },
  {
    id: 'summarize',
    name: '要点总结',
    system: `你是摘要助手。对输入内容给出极简要点总结：最多 3 条要点（每条以 "- " 开头），必要时附加一句整体结论。不要展开，不要评论。`,
    template: '{{text}}',
    builtin: true
  },
  {
    id: 'polish',
    name: '润色改写',
    system: `你是润色助手。在保持原意的前提下润色输入文本（中文润色中文，英文润色英文）：修正语法与表达，使语言更自然、专业。只输出润色后的文本，不要解释改动之处。`,
    template: '{{text}}',
    builtin: true
  }
]

/* ============================== Defaults ============================== */

export function createDefaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    locale: 'system',
    theme: 'system',
    launchAtLogin: false,

    shortcut: DEFAULT_SHORTCUT,
    selectionMode: 'auto',
    clipboardFallback: true,
    hideOnBlur: false,
    windowWidth: 480,
    maxWindowHeight: 560,

    providers: [],
    activeProviderId: '',
    activeModelId: '',
    reasoningLevel: 'low',
    temperature: null,
    maxTokens: 2048,
    showReasoning: true,
    requestTimeoutSec: 60,

    prompts: [],
    activePromptId: 'lookup-zh',

    historyEnabled: true,
    historyLimit: 50,
    allowPlaintextSecrets: false
  }
}
