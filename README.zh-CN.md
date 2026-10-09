# AskThis

> 选中，问它。—— 桌面上的轻量速查透镜。

[English](README.md) | **简体中文** · [新手教程](docs/quick-start.zh-CN.md)

AskThis 是一个随时待命的 AI 小助手：在任意应用里选中一段文字，按下全局快捷键
（macOS 默认 `⌥⇧D`，其他系统 `Alt+Shift+D`），光标旁就会弹出一张悬浮卡片，
即时给出极简的解释、翻译或答案——需要时还能继续追问。

基于 Electron + React 构建。自带 API 密钥即可使用。无账号、无遥测、无锁定。

<!-- 发布前在此补充截图：docs/screenshot-popup.png -->

## 功能特性

- **一个快捷键，全应用可用**——无需切换窗口，覆盖在任何软件之上。
- **优先读取选中文本**（macOS 用辅助功能 API，Windows 用 UI Automation），
  仅在允许时才回退到剪贴板。
- **流式回答**，带可折叠的思考过程、追问、重新生成、停止、一键复制。
- **多服务商支持**——OpenAI、Anthropic、DeepSeek、Google Gemini、OpenRouter、
  Moonshot (Kimi)、智谱 GLM、硅基流动、xAI、Ollama / LM Studio，以及任意
  OpenAI / Anthropic 兼容的自定义端点。
- **推理强度控制**（关闭/低/中/高/最高），按服务商与模型正确映射参数。
- **自定义提示词**——内置六套预设（速查、翻译、代码解释、要点总结、润色）
  并支持完全自定义。
- **浅色 / 深色主题**，中文 / English 界面。
- **历史记录仅存本机**；API 密钥使用系统钥匙串加密存储
  （Keychain / DPAPI / libsecret）。

## 安装

从 **Releases** 页面下载对应平台的最新版本。

| 平台 | 安装包 | 状态 |
| --- | --- | --- |
| macOS（Apple Silicon / Intel） | `.dmg` | ✅ 已实测 |
| Windows | `.exe`（安装版 / 便携版） | 🧪 已构建，未在真机验证 |
| Linux | `.AppImage` / `.deb` | 🧪 已构建，未在真机验证 |

> **说明：** 发布版未做代码签名（开源项目无签名证书）。
> - macOS：右键点应用 →「打开」，或执行一次
>   `xattr -dr com.apple.quarantine /Applications/AskThis.app`。
> - Windows：若 SmartScreen 提示，选择「更多信息」→「仍要运行」。

## 快速上手

1. 启动 AskThis——它驻留在菜单栏 / 托盘并注册全局快捷键。macOS 首次会请求
   **辅助功能**权限（读取选中文本需要）。
2. 打开**设置 → 模型服务**，选择一个服务（已预置 DeepSeek 与 OpenAI），
   粘贴 API 密钥，点「获取模型列表」选择模型。
3. 在任意位置选中文字，按下快捷键即可。

### 日常操作

| 操作 | 方式 |
| --- | --- |
| 速查 | 选中文字 → 按快捷键 |
| 主动提问 | 无选中时按快捷键 → 直接输入 |
| 追问 | 在卡片输入框输入后回车 |
| 复制答案 | 点「复制结果」（随后卡片自动关闭） |
| 关闭卡片 | `Esc`、右上 ✕ 或「关闭」按钮 |
| 重新生成 / 重试 | 「重新生成」按钮 |
| 更换服务 / 模型 | 设置 → 模型服务 |
| 修改快捷键 | 设置 → 快捷键与交互 |

## 服务商与模型

内置预设带有经过核实的当前模型列表（对照官方文档，2026-10）。推理档位按
服务商适配：

| 服务商 | 推理参数 |
| --- | --- |
| OpenAI / Gemini / Kimi / GLM / xAI / 硅基流动 | `reasoning_effort`（取值按服务商映射） |
| DeepSeek | `reasoning_effort` + 关闭时发 `thinking: disabled` |
| Anthropic | `output_config.effort` + adaptive thinking |
| OpenRouter | 统一的 `reasoning: { effort }` 对象 |
| 本地（Ollama / LM Studio） | 不发送 |

任何 OpenAI 兼容端点都可使用：选择「自定义（OpenAI 兼容）」，填 API 地址
（通常以 `/v1` 结尾）、密钥和模型 ID；网关需要时可添加自定义请求头。

## 隐私与安全

- **数据流向：** 捕获的文本 → 你配置的 AI 服务商。不经过任何其他地方。
  无统计、无崩溃上报、无回传。
- **API 密钥**使用操作系统安全存储加密，且从不暴露给界面层（设置窗口只能
  看到掩码提示）。系统钥匙串不可用时，密钥仅保存在内存中——AskThis 绝不
  静默降级为明文存储。
- **自定义请求头**（模型服务 → 自定义请求头）以明文保存在 `config.json` 中
  ——除非你的网关要求，否则不要在这里填写凭据；请优先使用 API 密钥字段。
- **剪贴板保护：** 读取选中文本后会恢复你之前的剪贴板文本，绝不覆盖非文本
  剪贴板内容；剪贴板回退可随时在 设置 → 通用 中关闭。
- **网络请求**自动走系统代理设置。

## 从源码构建

要求：Node.js 20.19+（推荐 22 LTS）、npm 10+。

```bash
git clone https://github.com/537Lab/askthis.git askthis && cd askthis
npm install
npm run dev          # 开发模式（HMR）
npm run typecheck    # 类型检查（主进程 + 渲染进程）
npm run build        # 生产构建到 out/
npm run pack:mac     # 打包 macOS（.dmg/.zip）  [pack:win、pack:linux]
```

项目在 package.json 中固定了允许运行安装脚本的依赖（`allowScripts`）；
新版 npm 会要求你批准——这些都是 Electron/esbuild/fsevents 的标准安装脚本。

## 项目结构

```
src/
├── main/        Electron 主进程——窗口、托盘、选中文本捕获、
│   │            AI 客户端（流式）、配置与历史存储
├── preload/     contextBridge API（window.api）
├── shared/      类型、服务商预设、i18n、默认值
└── renderer/    React 界面——popup（速查卡）+ 设置窗口
```

## 常见问题

- **按快捷键没反应**——可能被其他应用占用；到 设置 → 快捷键与交互 更换。
  注册失败时该页会显示警告。
- **提示需要辅助功能权限**——macOS：系统设置 → 隐私与安全性 → 辅助功能 →
  勾选 AskThis。
- **代理环境下请求失败**——AskThis 走系统代理；请确认代理软件处于
  「系统代理」模式。
- **Windows / Linux 说明**——选中文本捕获在 Windows 使用 UI Automation、
  Linux X11 使用 `xdotool`；Wayland 会话回退到剪贴板模式。这些平台的回退
  路径会向最前台窗口短暂发送一次复制按键（Ctrl+C）——在终端中该按键也会
  到达 shell（SIGINT），因此请避免在终端里无选中内容时触发。

## 参与贡献

欢迎 PR——见 [CONTRIBUTING.md](CONTRIBUTING.md)。特别需要：Windows 与
Linux 的真机测试报告。

## 许可证

[MIT](LICENSE)
