# 自适应轻量速查 / Adaptive quick-look popup

## 范围与结论 / Scope and conclusion

2026-10-27，基线为 `1e25976`（上轮 Cantrip 风格改造）。这是一次针对已确认空间冗余的聚焦优化，不是全站重构。只改弹窗 renderer 的情境样式与提示显隐；不增加依赖，不改窗口尺寸配置、主进程定位、认证、请求、提示词、历史存储或用户设置。

Baseline: `1e25976`, the previous Cantrip-inspired refresh. This is a focused popup refinement, not a full frontend audit. Only contextual renderer styling and help visibility change; no new dependencies, sizing configuration, native positioning, authentication, requests, prompts, history-storage or user-settings changes.

**保留更好的阅读体验，回收与当前任务无关的编辑器空间。**

**Keep the improved reading experience; reclaim editor space that is not needed yet.**

## 证据与取舍 / Evidence and trade-offs

复用 [上轮报告及截图](../ui-refresh/README.md)，并查看 `f2bd8aa` 的原始样式确认旧版与 Cantrip 改造的差异。上轮同一回答的原生窗口从 419 px 增至 553 px：

- **保留的增长：**正文从 13.5 px / 1.66 行距提升到 14 px / 1.72，更清楚的段落和原文层级、更易操作的关闭按钮，以及每个回答自己的复制/重新生成操作。没有为了回到旧高度撤销这些改善。
- **确认的冗余：**没有草稿时，追问区仍为 91 px，包含完整输入框、额外边距和 23 px 常驻键盘提示；一个短原文也因标签独占一行和容器边距占到 57.375 px。
- **不随意删除横向信息：**模型标识和耗时不额外独占一行，删除它们不能解决垂直空间问题，本轮保留。思考过程继续默认折叠。

The existing evidence and original `f2bd8aa` styles establish the trade-off: improved 14 px / 1.72 answer typography, hierarchy and contextual actions are retained. The redundant growth is the always-expanded 91 px follow-up area (including 23 px of persistent help) and a separate-line source badge. Inline model/timing metadata is not removed just to make the UI look smaller.

### 按意图自适应 / Adapt to intent

1. **只读答案：**底部仍有明确的“继续追问…”单行入口和发送控件，不折叠成难发现的图标，也不要求先点击“展开”。无草稿时不常驻显示键盘教程。
2. **开始追问：**聚焦只改变边框，不改变原生窗口高度；输入草稿才显示发送/换行提示。多行按原有逻辑增高，到上限后内部滚动。
3. **正在生成：**停止按钮保持原位。可以提前写下一问，Enter 不并发提交；完成、复制、重新生成不会丢草稿。没有以 busy/focus 状态自动折叠输入框。
4. **复杂回答与历史：**仍自然增长到用户高度上限，随后正文滚动。向上阅读后不强制跳底；多行草稿不遮住“回到最新”。不自动折叠历史轮次。
5. **原文：**短标签与原文同行，保留低对比背景和强调线。长原文仍完整换行，不新增隐藏全文的规则。

Read-only mode keeps a discoverable one-line follow-up entry. Focus changes its border, not its geometry; a real draft reveals help and grows naturally. Generation keeps Stop and editable drafts. Long answers respect the existing cap and scroll intent; history remains expanded. Short source labels share a row with their text, without hiding long source material.

## 原生前后对比 / Native before-and-after

[对比拼图 / Comparison](comparison.png)

| 同内容、480 px 宽 / Same content at 480 px width | 基线 / Before | 本轮打包版 / Packaged after | 说明 / Notes |
|---|---:|---:|---|
| 短术语解释 / Short definition | 336 px | 268 px | 节省 68 px / Saves 68 px |
| 上轮同一测试回答 / Same existing fixture answer | 553 px | 485 px | 节省 68 px / Saves 68 px |
| 有一行追问草稿 / One-line draft | 553 px | 508 px | 提示按需出现 / Help appears on demand |
| 两轮回答＋草稿 / Two turns and a draft | 560 px | 560 px | 不强求更小，正文可视区域增加 19 px / Retains the cap, adds 19 px of reading space |

原生高度单位是 macOS 逻辑像素；Retina 截图为 2×。原始截图保持不变；拼图仅裁除透明外缘、遮掉圆角外的桌面背景并等比缩放，不是重新绘制界面。回答来自明确的本地 SSE fixture，不是线上模型输出，也没有消耗线上模型额度。before 与 after 的窗口配置、内容和测试入口相同。

Native heights use macOS logical pixels; Retina captures are 2×. Originals remain unchanged. The comparison only crops transparent margins, masks desktop pixels outside rounded corners, and rescales genuine captures; it does not redraw the UI. A labelled local SSE fixture provides identical content; these are not online-model results and consume no model quota.

### 空间拆解 / Measured layout

| 部位 / Region | Before | After |
|---|---:|---:|
| 标题栏 / Header | 45 px | 45 px |
| 短原文框 / Short source context | 57.375 px | 33.375 px |
| 回答正文 / Existing fixture answer | 233.703 px | 233.703 px |
| 回答操作 / Answer actions | 28 px | 28 px |
| 无草稿追问区 / Idle follow-up | 91 px | 49 px |
| 有草稿追问区 / Draft follow-up | 91 px | 72 px |

原文框少 24 px、其后间隔少 2 px、无草稿追问区少 42 px，共 68 px。不是通过压缩正文或操作命中区域实现的。也没有把 485 px 设为新固定值：短回答、长回答和草稿都由内容自然决定高度。

The 68 px reduction comes from source context (24 px), its following gap (2 px) and idle composer chrome (42 px), not answer compression or smaller action targets. The resulting height is measured, not a new fixed-size rule.

### 证据文件 / Evidence files

- [改前同一回答 / Before answer](before/answer.png) → [打包版改后 / Packaged after](packaged/answer.png)
- [改前短术语 / Before short](before/short.png) → [打包版改后 / Packaged short](packaged/short.png)
- [打包版空白输入 / Packaged empty input](packaged/empty.png)
- [打包版追问草稿 / Packaged draft](packaged/draft.png)
- [打包版连续追问 / Packaged follow-up](packaged/follow-up.png)
- [打包版长内容历史阅读＋多行草稿 / Long history and multiline draft](packaged/long-reading.png)
- [打包版深色英文 340×200 / Dark English 340×200](packaged/dark-minimum.png)
- 逐区域测量 / Per-region geometry: [before](before/metrics.json), [packaged after](packaged/metrics.json)

## 验证 / Verification

| 检查 / Check | 实际结果 / Actual result |
|---|---|
| 新行为 RED → GREEN / New behavior first fails, then passes | 单测先观察常驻 help 预期失败；原生基线先观察“单行追问”“原文同行”两项失败 / Unit help assertion and both native layout expectations failed before implementation |
| `npm run test:unit` | 31/31 |
| `npm run typecheck` | 通过 / Passed |
| `npm run build` | 通过 / Passed |
| `python3 tests/adaptive_popup_e2e.py --screenshots <dir>` | 开发版首轮 16/16 / Initial dev suite 16/16 |
| `npx electron-builder --dir --mac --arm64 --publish never` | 通过，afterPack ad-hoc 签名成功 / Built and ad-hoc signed |
| `codesign --verify --deep --strict release/mac-arm64/AskThis.app` | 通过 / Passed |
| `python3 tests/adaptive_popup_e2e.py --packaged --screenshots <dir>` | 扩充后的打包版 20/20 / Expanded packaged suite 20/20 |

打包版聚焦回归包含：空白输入焦点与零请求、空态可读性、无草稿轻量入口、原文同行、正文字号行距不变、聚焦不跳高、草稿提示、生成期间 Enter 防并发、完成保留草稿和焦点、assistant 上下文、复制不关窗、重新生成不增轮/不丢草稿、正文前停止与再生成入口、长内容上限与滚动、多行草稿不拉走历史位置、“回到最新”不遮挡并能恢复跟随、短回答无空白撑高、340×200 深色英文控件不裁切。

The focused packaged regression covers input focus/no accidental requests, contextual sizing, unchanged reading typography, stable focus geometry, draft protection, conversation context, copy/regenerate/early-stop, long-answer scrolling, reading-position preservation, Back to latest, and dark/narrow/minimum-height controls.

避免重复已充分覆盖且代码未改的测试：沿用上轮全屏 Space、真实系统拼音、选区读取及完整错误流程的证据。本轮保留 IME-aware handlers、主进程、请求与滚动跟随逻辑；没有声称再次完整执行这些原生测试。Windows/Linux、第三方输入法未真机复测。

Existing fullscreen-Space, real Pinyin, selection-capture and full error-path evidence is reused because those paths were not changed. No claim is made that they were all rerun. Windows/Linux and third-party IMEs were not device-tested this round.

## 交付与恢复 / Delivery and recovery

- 可运行本地构建 / Runnable local build: `release/mac-arm64/AskThis.app`。
- `/Applications/AskThis.app` 保持原安装；测试结束已恢复启动。没有安装替换、版本升级、push、tag 或发布。原有未跟踪的 `docs/ui-refresh.zip` 保留未动。
- 用户 `config.json` 与加密 `secrets.dat` 测试前后 SHA-256 一致；测试仅使用临时 user-data，并恢复原剪贴板和鼠标位置。测试进程与本地服务已退出。
- 恢复本轮前端可从 `1e25976` 取回 `src/renderer/src/popup/App.tsx`、`styles.css`；旧截图与上轮报告均保留。测试、文档可独立移除，不涉及用户数据迁移。

The installed application is unchanged and was relaunched after testing. No version bump, push, tag or publication. User config and encrypted-secret hashes match before/after; temporary test data/processes/server are cleaned up and clipboard/pointer restored. Renderer changes are recoverable from baseline `1e25976`; no user-data migration is involved.
