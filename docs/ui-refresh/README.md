# 速查弹窗体验改进 / Quick-look experience refresh

## 范围与设计 / Scope and design

基线是 `f2bd8aa`（v0.1.4 后的临时目录测试修正），不是重新建设 GPT 订阅桥接。本轮只调整弹窗前端、文案和对应回归；未新增运行依赖，未改认证、请求协议、用户配置 schema 或历史存储。

Baseline: `f2bd8aa`, following v0.1.4. This changes the popup renderer, copy and regression tests only. No new runtime dependencies, authentication changes, request-protocol changes, configuration migrations or history-storage changes.

参考 [Cantrip 原生输入栏](https://github.com/FlyingViet/cantrip/blob/main/Sources/Cantrip/LauncherView.swift) 的键盘优先、轻量模型标识和按情境出现的操作；不复制其工作区、标签页或 agent 功能。

Inspired by Cantrip's keyboard-first native input bar, subtle model identification and contextual controls—not its workspace, tabs or agent features.

### 主要变化 / What changed

- **无选区直接输入：**去掉重复提示和底部关闭按钮，输入框成为空态主体；有明确发送按钮。Enter 发送，Shift+Enter 换行，Esc 退出。
  **Empty capture:** a focused composer, explicit Send button, Enter to send, Shift+Enter for a new line and Esc to dismiss.
- **读取与回答层级：**原文放在低对比上下文区，回答成为视觉主体；思考过程仍可展开。模型信息降为辅助信息，保留拖动区域。
  **Reading hierarchy:** quieter source context, clearer answer typography, collapsible reasoning, secondary model information and a retained drag region.
- **连续追问：**首问即使由手动输入开始，随后也正确显示追问提示。生成期间可以编辑下一问，但不会自动排队或并发发送；完成时不清空草稿、不主动抢焦点。
  **Follow-ups:** manual and captured questions converge on the same conversation flow. Draft while generating; send explicitly once ready. Completion preserves the draft and does not force focus.
- **长回答：**在底部时跟随新内容；向上滚动后停止跟随，提供“回到最新”。按钮随输入框高度定位，不遮挡多行草稿。
  **Long streams:** follow at the bottom, respect scrolling up, and resume explicitly with Back to latest. Its position follows composer height.
- **情境操作：**复制属于对应回答，复制后保留对话；最后一轮可重新生成，停止在首个正文 token 之前也保留入口；错误仍可重试或打开设置。
  **Contextual actions:** per-answer copy without closing the conversation; regenerate the latest turn, including a stop before the first text token; retain error recovery.
- **边界布局：**浅色、深色、中英文、340 px 窄窗与 200 px 最小高度均检查；多行输入在小高度下内部滚动，不裁掉发送和键盘提示。
  **Layout boundaries:** checked light/dark, Chinese/English, 340 px width and the 200 px minimum height. Smaller cards scroll the draft internally instead of clipping controls.

## 真实视觉证据 / Native screenshots

截图来自真实 macOS 窗口和原生操作，不是网页效果图。回答来自明确标注的本地 SSE 测试服务，用于可复现的布局与交互检查，不代表线上模型输出。旧版来自独立 detached worktree；新版截图来自 ad-hoc 签名打包版。

These are real macOS window captures, not design mockups. Answers come from a labelled local SSE fixture, not an online model. Before captures use a detached baseline worktree; after captures use the signed packaged build.

[改前／改后截图拼图 / Before-and-after comparison](comparison.png)

| 场景 / Scenario | 改前 / Before | 改后 / After |
|---|---|---|
| 无选区 / Empty capture | [截图](before-empty.png) | [截图](after-empty.png) |
| 选区首答 / Selection answer | [截图](before-answer.png) | [截图](after-answer.png) |
| 连续追问 / Follow-up | [截图](before-follow-up.png) | [截图](after-follow-up.png) |

边界证据 / Boundary evidence:

- [向上阅读历史与多行输入 / Reading history with a multiline draft](after-reading-history.png)
- [340×200 深色英文窗口 / Dark English 340×200 card](after-dark-narrow.png)
- [真正全屏 Space 上唤起 / Popup over a native fullscreen Space](after-fullscreen.png)

## 实际验证 / Verification

| 检查 / Check | 结果 / Result |
|---|---|
| `npm run test:unit` | 30/30 |
| `npm run typecheck` | 通过 / Passed |
| `npm run build` | 通过 / Passed |
| `python3 tests/e2e.py` | 9/9 |
| `python3 tests/manual_input_e2e.py` | 9/9 |
| `python3 tests/experience_e2e.py --screenshots <目录>` | 26/26 |
| 同上三项加 `--packaged` / All three with `--packaged` | 9/9、9/9、26/26 |
| `electron-builder --dir --mac --arm64 --publish never` | 构建成功 / Built |
| `codesign --verify --deep --strict release/mac-arm64/AskThis.app` | 通过 / Passed |

原生检查包含：全局快捷键、有/无选区、空输入不请求且不查询旧剪贴板、系统键盘焦点、真实按键追问、请求内保留 assistant 上下文、生成中草稿、复制、重新生成、Shift+Enter、多行自适应、向上滚动不跳回、全屏 Space、系统拼音 composition 事件、Enter 确认组词不提交、下一次 Enter 提交、候选选择输入“你好”、候选期 Esc 不关窗和非组词 Esc 关闭。

Native checks include hotkeys, empty/selected capture, no stale-clipboard query, actual keyboard focus, follow-up context, draft preservation, copy/regenerate, multiline input, scroll intent, native fullscreen Spaces and real system Pinyin composition/Enter/Esc/candidate behavior.

新增行为测试先观察失败再修复。复审发现并修复：空正文停止后的重新生成入口、正常完成但正文为空（含仅输出 reasoning）的重新生成入口、小高度多行裁切，以及“回到最新”覆盖增长中的输入区。测试驱动自身的事件异步、设置窗口 preload 就绪和真实无选区条件也已修正；没有通过放宽预期来掩盖应用错误。

New behavior tests were observed failing before implementation. Review findings fixed: regeneration after stopping before text, regeneration after an empty or reasoning-only completion, clipping at minimum height and overlap of Back to latest with a growing composer. Test-driver timing, settings-preload readiness and a truly empty selection were corrected as well.

## 保留项与限制 / Preservation and limitations

- GPT-6 Luna 订阅桥接、模型请求协议及首答/追问线上验证沿用已有成果；本轮没有重复消耗模型额度。测试服务只证明请求/渲染/上下文链路，不能冒充线上模型重测。
  Existing GPT-6 Luna bridge and online verification remain unchanged. No online model quota was spent here; local fixtures do not constitute a new online verification.
- 用户 `config.json` 与 `secrets.dat` 测试前后 SHA-256 一致。历史文件在早期检查中一致；最终核对时多出一条非测试内容、模型为 GPT-6 Luna 的记录，因此不再声称历史文件字节不变。本轮没有回滚或清空历史，也未改历史存储代码。新增记录不匹配本轮测试输入或 mock 回答；已有 mock 历史条目时间均早于本轮审查。测试只使用隔离 user-data，恢复剪贴板及输入源。
  User configuration and encrypted secrets are hash-checked unchanged. History initially matched but the final check observed a new non-fixture GPT-6 Luna entry, so byte-identical history is not claimed. History was not reset or rolled back; storage code is unchanged. Existing mock entries predate this audit. Tests use isolated user data and restore clipboard/input source.
- `/Applications/AskThis.app` 保留已发布版，避免静默改变正式安装与授权。改进版构建位于 `release/mac-arm64/AskThis.app`；没有推送、打 tag、发布或升级版本号。
  The installed release remains untouched. The local improved build is at `release/mac-arm64/AskThis.app`. No push, tag, publication or version bump.
- 原生验收是本机 macOS arm64 与系统拼音；Windows/Linux 和第三方中文输入法没有真机验收。极小窗口优先保留输入控件，回答区域需滚动；不增加队列、会话持久化或重型聊天工作区。
  Native coverage is macOS arm64 with system Pinyin—not Windows/Linux or third-party IMEs. Very small cards prioritize input controls and scroll answers. No queues, persistent sessions or heavyweight chat workspace were added.

复跑 UI 测试前退出其它 AskThis 实例，释放同一全局快捷键；结束后恢复正式实例。测试需要已授权 Hammerspoon 和已构建应用；不会替用户修改系统隐私权限。

Quit other AskThis instances before rerunning native tests to avoid hotkey contention, then restore the installed app. Tests require authorized Hammerspoon and a built app; they do not modify system privacy permissions.
