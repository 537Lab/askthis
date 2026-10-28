# B2 品牌接入验收 / B2 integration verification

2026-10-28 · 本地候选版本 / Local candidate **0.1.5**

## 已接入 / Integrated

- 应用图标：`build/icon.icns` 原样使用批准 B2 `app.icns`；PNG 同步用于跨平台构建。
- 标题栏、设置页侧栏、关于页：共享 `LogoIcon`，32px 及以下使用批准的 `small-mark.svg` 路径，较大尺寸使用 `mark.svg`；不改曲线、viewBox、位移或盒子尺寸。
- 主题适配：标志使用现有文字色 token，浅色黑、深色白；未修改 CSS、布局、输入或查询逻辑。
- macOS 托盘：16/32px 单色模板；Windows/Linux 托盘：批准的 32px 彩色应用图标。补齐 `extraResources`，确保打包后的资源真实存在于 `resourcePath()` 读取的位置。
- `scripts/generate-icons.py` 仅复制已验收导出并提取原 SVG 路径，标准库即可运行，不重绘设计。

## 实际执行 / Executed

- 原有 31 项单测基线通过；新增 3 项品牌单测分别经历预期失败后修复，总计 **34/34 通过**。
- `npm run typecheck` 与 `npm run build` 通过。
- `electron-builder --mac dmg --arm64 --publish never --config.directories.output=release/b2-local` 完成；afterPack ad-hoc 签名有效。
- 打包版 `codesign --verify --deep --strict` 通过。
- `tests/brand_integration_e2e.py` 通过：真实打包 payload 的 ICNS/native resources 逐字节一致，12/16/44px 渲染 SVG 几何精确匹配，浅深主题可读；本地 mock 查询成功，**不是线上 GPT 请求测试**。
- 独立审查指出固定 CDP 端口可能误连其他实例，现已改用本次临时 profile 的动态端口；连接前精确核验本次副本 URL、websocket 端点和实际 `location.href`，身份通过后才允许主题配置写入。9 项无 GUI 隔离回归通过，修复后真实打包版品牌验收重跑通过。
- 为避免测试 `launchAtLogin=false` 干扰用户真实 AskThis 登录项，在临时复制包上使用独有 bundle ID。保留原 CFBundleName（Electron helper 依赖它），重新 ad-hoc 签名；运行前校验 `app.asar` 和 ICNS 与原包一致。测试未注入替代 UI、没有改用户配置或调用用户密钥。
- 浅深主题三个品牌位置的实测对比度均大于 12:1。截图为实际打包版 renderer，见四张 PNG；完整数据见 `verification.json`。
- DMG 的 `hdiutil verify` 通过；只读挂载后校验包内 payload 与被测构建一致、ICNS 完全匹配 B2、深度严格签名通过。
- 未进行 Windows/Linux 或 Intel Mac 真机验收，不能把跨平台构建配置接入等同真机通过。

## 保护与安装 / Preservation and installation

- 旧安装版、旧资源、改前 patch 与私有配置/密钥备份在用户的 `Documents/Backups/askthis-b2-integration-*`；私有文件不进 Git、交付包或本报告。
- 35 个受保护文件摘要（已确认 B2、已有 popup CSS、用户配置/密钥和 GPT 桥文件）保持不变。
- 本轮**不替换 `/Applications/AskThis.app`**，避免仅为图标产生辅助功能/钥匙串重授权；当前正式安装仍是旧版。已提供可安装 DMG。
- 原有未提交 `src/renderer/src/popup/styles.css` 修改逐字节保留，不纳入本轮品牌提交；本地构建包含该已完成 UI。仅凭品牌提交 checkout 到全新干净树不能复现这一笔既有未提交 UI，正式发布前应另行归档/提交该现有工作。本轮不悄悄把既有工作归入品牌提交。
- 测试进程、临时 app/profile 已清理，前台已恢复。未读写 Codex 工作链路，未改桥接配置，未注册正式登录项，未推送、打标签或发布。

## 构建与发布边界 / Artifact and release scope

`release/b2-local/AskThis-0.1.5-arm64.dmg`

SHA-256: `bd1a0eed390f389a898c6bdcc6b23ff3c08817746ce9583830065a99a346cd04`

**macOS Apple Silicon 本地可安装候选已通过本轮品牌验收。** 尚不是已公开发布版本；正式多平台发布前需保存既有 UI 工作、执行对应平台 CI/验收并确认发布范围。现有 ad-hoc 签名不等于 Apple Developer ID 签名或公证，仍沿用项目现有 Gatekeeper 说明。

## English summary

B2 is now wired into the application icon, native tray and all existing shared brand marks. Approved geometry and exports are unchanged. Existing UI source and user secrets/configuration/GPT bridge remain untouched. All 34 unit tests, type checks, build, focused packaged light/dark checks and DMG integrity/mounted-payload checks passed on macOS arm64.

The installed app has intentionally not been replaced. The DMG is a locally installable candidate, not a public release or notarized build. Windows/Linux/Intel Mac were not hardware-tested. The pre-existing uncommitted popup stylesheet remains untouched and outside this brand-only commit; save that existing work before producing a clean-checkout public release.
