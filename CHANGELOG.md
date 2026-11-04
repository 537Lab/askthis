# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
