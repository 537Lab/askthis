# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-28

### Added

- **In-card quick switcher & Settings shortcut**: click the prompt/model pill in the popup header to switch prompt presets, active provider/model, or reasoning level on the fly and optionally re-run the current lookup without leaving the card; added a direct Settings gear icon in the header.
- **卡片内快速切换与直达设置**：点击弹窗顶栏的提示词/模型标签，即可就地切换提示词预设、服务商与模型、推理强度并一键重新生成，无需离开卡片；顶栏右上角新增设置直达入口。
- **Per-block code copy**: fenced code blocks now show a subtle language label and a one-click Copy Code button (`DOMPurify` still strips non-`language-*` classes, images, scripts, and raw HTML).
- **代码块一键复制**：回答中的代码块新增语言标识与一键复制按钮（`DOMPurify` 仅允许 `<code>` 保留安全的 `language-*` 类名，继续严格拦截图片、脚本与原生 HTML）。
- **Dedicated local History tab**: search across questions, multi-turn follow-ups, answers, models, and prompts; inspect full multi-turn conversations rendered in Markdown; copy answers or delete single entries inline; sessions now aggregate follow-ups and regenerations instead of creating duplicate entries.
- **独立「历史记录」管理视图**：支持按提问、追问、回答、模型与提示词实时搜索；展开查看完整多轮 Markdown 对话，支持复制或单条内联删除；同一会话的追问与重新生成自动聚合更新，不再产生重复条目。
- **Keyboard workflow & long-source folding**: added `⌘,` / `Ctrl+,` (Settings), `⌘R` / `Ctrl+R` (regenerate latest turn, also preventing accidental browser reload), `⌘⇧C` / `Ctrl+Shift+C` (copy latest answer), and Esc-first dismissal of the quick switcher; long captured excerpts fold cleanly at 4 lines while preserving full DOM text.
- **键盘流与长原文折叠**：支持 `⌘,` / `Ctrl+,` 打开设置、`⌘R` / `Ctrl+R` 重新生成（同时拦截浏览器刷新白屏）、`⌘⇧C` / `Ctrl+Shift+C` 复制最新回答，以及 `Esc` 优先收起快切浮层；超长原文默认 4 行折叠并可随时展开，保留完整文本。
- **Settings completeness & config backup**: added API kind selector (`OpenAI compatible` / `Anthropic compatible`), API key visibility toggle, model list search filter and one-click "Set active", inline confirmation replacing `window.confirm`, config JSON export/import (excluding secrets), and one-click diagnostics copy in About.
- **设置完善与配置备份**：模型服务补全接口类型选择、密钥显隐切换、模型列表筛选与一键「设为当前」；全站改用克制的内联二次确认替代浏览器原生弹窗；支持无密钥配置导出/导入及关于页一键复制诊断信息。

### Changed & Fixed

- **Real-time config sync & popup bounds**: `ConfigStore` changes now broadcast `config:changed` to both popup and settings windows and resize/clamp the popup immediately; replaced the `programmaticMoves` counter with coordinate/time-window matching (`expectedOrigin`) so user drags are never swallowed after height changes.
- **配置实时同步与弹窗拖拽修复**：设置变更即时同步至弹窗与设置窗口并按新宽高钳制屏幕边界；将 `programmaticMoves` 计数改为坐标与时间窗比对，彻底解决窗口纵向增长后首次用户拖拽可能被吞掉的问题。
- **AI streaming & protocol hardening**: properly classify mid-stream user aborts (`AbortError`) and timeouts, flush multi-byte UTF-8 decoder buffers at EOF, omit `temperature` when Anthropic adaptive `thinking` is active, parse `reasoning_text`, sanitize custom headers against CRLF and `Content-Type` overrides, normalize `NO_MODEL` and localized `done.incomplete` notices, and coalesce streaming deltas via `requestAnimationFrame`.
- **AI 协议与流式性能加固**：完善流中途取消与超时异常分类，修复流末尾多字节 UTF-8 解码残留，修复 Anthropic 启用 `thinking` 时携带 `temperature` 的兼容问题，过滤自定义请求头 CRLF 与 `Content-Type` 覆盖，将断流提示改为通过 `done.incomplete` 前端本地化，并通过 `requestAnimationFrame` 合批刷新流式输出。
- **Windows & Settings polish**: Windows UIA capture now distinguishes confirmed empty selections (`ASKTHIS_EMPTY`) from unsupported windows (`ASKTHIS_UNKNOWN`) to skip unnecessary `Ctrl+C` polling; hidden the redundant default menu bar on Windows/Linux Settings windows; Settings window background matches dark mode on creation to eliminate white flash.
- **Windows 与跨平台体验优化**：Windows UIA 选区捕获明确区分「确认空选区」与「不支持 UIA」，在支持 UIA 的窗口无选区时跳过无意义的 `Ctrl+C` 等待；Windows/Linux 设置窗隐藏多余默认菜单栏；深色模式下设置窗初始化即匹配深色背景，消除闪烁。

### Verification / 验证范围

- Unit tests **55/55**, both TypeScript checks (`node` + `web`), and production build (`electron-vite build`) passed. / 单元测试 **55/55**、主进程与渲染进程类型检查、生产构建全部通过。
- Isolated macOS Electron visual & focus regression (`tests/source_presentation_e2e.py`): **18/18** passed; macOS packaged `arm64` build ad-hoc signed and verified with `codesign --verify --deep --strict`. / macOS 隔离真实 Electron 视觉与焦点回归 **18/18** 通过；macOS `arm64` 打包版完成 ad-hoc 签名并严格校验通过。
- Windows UIA empty-selection handling is covered by unit tests; Windows and Linux hardware re-verification remains pending. / Windows UIA 空选区逻辑已覆盖单测，Windows 与 Linux 真机复验待补充。

## [0.1.5] - 2026-11-04

See the [bilingual release notes](docs/releases/v0.1.5.md) and [verification summary](docs/releases/verification-v0.1.5.json).

详见[双语 Release 说明](docs/releases/v0.1.5.md)与[验收摘要](docs/releases/verification-v0.1.5.json)。

### Added

- Multiline drafts with `Shift+Enter`, an explicit Send action, and an editable draft during generation. Sending remains explicit after completion or stopping; no queue or concurrent request is added.
- 多行草稿支持 `Shift+Enter` 换行与发送按钮；生成中仍可编辑下一问，完成或停止后再主动发送，不增加队列或并发请求。
- Respect reading position during streams: scrolling up pauses following; “Back to latest” resumes it.
- 流式回答尊重阅读位置：向上滚动后暂停跟随，点「回到最新」恢复。

### Changed

- A more readable quick-look hierarchy with a compact single-line follow-up entry. Keyboard help appears for a draft; focus alone does not resize the popup. Source text wraps on the answer's reading edge without decorative boxes or accent rails; input focus uses a neutral thin border.
- 改进速查阅读层级，保留紧凑单行追问入口，草稿出现时再显示键盘提示，仅聚焦不撑高窗口。原文沿答案阅读边缘自然换行，移除装饰框与强调线，输入焦点改为中性细边框。
- Per-answer Copy keeps the conversation open instead of closing the card; Regenerate stays with the latest turn and preserves drafts.
- 复制改为每条答案独立操作，复制后保留卡片；重新生成属于最后一轮，保留已有草稿。
- Adopted the approved B2 “Dialogue a” identity across the application icon, popup header, settings and native tray, preserving the approved SVG geometry.
- 采用已确认的 B2「对话 a」标志，统一应用图标、弹窗标题栏、设置页与原生托盘，保留已确认 SVG 几何。
- Updated both READMEs, beginner guides and release scope to distinguish v0.1.5 improvements from existing selection lookup, no-selection input (v0.1.4), providers, streaming and local history.
- 同步中英文 README、新手文档与发布范围，区分 v0.1.5 改进和已有的选区查询、无选区输入（v0.1.4）、服务商、流式回答及本机历史。

### Fixed

- Ship native tray/icon resources at their runtime paths; use the macOS template mark and the matching full-color tray icon on Windows/Linux.
- 修正原生托盘与图标资源的打包路径；macOS 使用单色模板标志，Windows/Linux 使用同款彩色应用图标。
- Preserve regeneration after stopping before the first answer token, or after an empty / reasoning-only completion. Small-window drafts scroll internally instead of clipping controls.
- 首个正文 token 前停止、空正文 / 仅思考过程完成后仍可重新生成；小窗口中的多行草稿内部滚动，避免裁掉操作控件。
- macOS: lower the popup from `screen-saver` to `floating` so native IME candidates are not hidden, retaining NSPanel, fullscreen-Space visibility and non-activating selection reveal. This round's separate packaged native checks cover system Pinyin / Shuangpin on desktop and fullscreen, not all IMEs.
- macOS：将弹窗由 `screen-saver` 降至 `floating`，避免挡住候选栏；保留 NSPanel、全屏 Space 可见性与选区查询非激活唤出。本轮独立打包版原生回归覆盖桌面 / 全屏下的系统拼音与双拼，不泛化到全部输入法。
- macOS Settings: restore window dragging through the top 30 px blank strip and sidebar title without turning form controls into drag areas.
- macOS 设置窗：通过顶部 30 px 空白区和侧栏标题恢复拖动，不将表单控件变成拖动区。

### Verification / 验证范围

- Unit tests **36/36**, both TypeScript checks and the production build passed. / 单测 **36/36**、主进程与界面类型检查、生产构建通过。
- Current packaged Mac native checks: **25/25** IME / desktop / real-fullscreen checks and **6/6** Settings-drag checks. IME coverage is system Pinyin / Shuangpin only. / 当前打包版 Mac 原生回归：输入法、桌面与真实全屏 **25/25**，设置窗拖动 **6/6**；输入法范围仅系统拼音 / 双拼。
- Windows v0.1.4–v0.1.5 interactions need hardware re-testing; Linux is not hardware-validated. / Windows v0.1.4–v0.1.5 交互待真机复验；Linux 未真机验收。
- [Verification summary / 验收摘要](docs/releases/verification-v0.1.5.json). Current app screenshots use local demo answers, not online-model performance results. / 新版实际界面截图使用本地示例回答，不是线上模型性能测试。

## [0.1.4] - 2026-10-26

### Added

- No-selection input: use the same shortcut (`Alt+Shift+D` / `⌥⇧D`) to open an empty, focused input card, type a question and press Enter to send; Esc closes the card.
- 无选区直接输入：沿用同一快捷键打开空白卡片，输入框自动聚焦，键入后按 Enter 发送，Esc 关闭。

### Changed

- Automatic capture now queries selected text when available and otherwise waits for typed or pasted input, rather than submitting old clipboard contents. Explicit Clipboard only mode remains available.
- 自动模式有选区就查询，未获取选区时等待输入或手动粘贴，不再自动提交旧剪贴板；仍保留显式「仅使用剪贴板」模式。
- Refreshed the Chinese and English homepages and beginner guides with download guidance, the two input flows, upgrade notes, privacy boundaries and platform verification scope. No OCR / screenshot recognition is included; the new interactions still need Windows / Linux hardware validation.
- 完善中英文首页与新手教程：补充下载指引、两种提问流程、升级说明、隐私边界及平台验证范围。当前不含 OCR / 截图识字；新交互仍需 Windows / Linux 真机验证。

## [0.1.3] - 2026-10-13

### Fixed

- Popup: the quick-look card now appears over macOS fullscreen apps — verified end-to-end in a real fullscreen Space. The fix combines: an NSPanel window type (`type: 'panel'`), the `screen-saver` level with `relativeLevel` 1, re-asserting the overlay behaviour on every reveal, and `moveTop()` after showing. Previously the card only ever appeared on the desktop Space while a fullscreen app was active

  Historical implementation note: v0.1.5 replaces the high window level with `floating` to preserve IME candidate visibility while retaining the fullscreen-Space mechanism. / 历史实现说明：v0.1.5 保留全屏 Space 机制，但将过高窗口层级改为 `floating`，避免遮挡输入法候选栏。

## [0.1.2] - 2026-10-11

### Fixed

- Popup: Esc no longer closes the card while an IME composition is active (e.g. pinyin candidate selection)
- Popup: with "Show reasoning" off, the thinking phase keeps showing the progress indicator instead of a blank card
- Popup: a notice is now shown when captured text was truncated, avoiding silent cut-offs
- Settings: clearing query history asks for confirmation first
- Settings: Esc closes the "Add provider" modal

## [0.1.1] - 2026-10-10

### Fixed

- Launching the app manually now surfaces the settings window instead of appearing to do nothing; login-item starts stay silent in the background
- macOS: re-opening the app from the Dock/Finder brings the settings window to front

### Changed

- Security hardening: all renderer permission requests are denied; raw server error details stay in the local log only
- e2e default trigger synced to the default shortcut (Alt+Shift+D)

## [0.1.0] - 2026-10-09

### Added

- Global hotkey (default `Alt+Shift+D` / `⌥⇧D`) to look up selected text or clipboard content in any app
- Quick-look popup with streaming answers, follow-up questions and a full conversation flow
- Multi-provider support: OpenAI, Anthropic, DeepSeek, Google Gemini, OpenRouter, Moonshot, Zhipu, SiliconFlow, xAI, Ollama, LM Studio, plus custom OpenAI/Anthropic-compatible endpoints
- Reasoning level control (off / low / medium / high / max) mapped per provider
- Built-in prompt presets (quick lookup, translation, code explanation, summarization, polishing) with full customization
- Settings window (general, providers, prompts, shortcut & interaction, about) with light/dark themes and zh/en UI
- Local history, stored on device only; API keys encrypted with the OS keychain
- Cross-platform support: macOS, Windows, Linux
