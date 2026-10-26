# AskThis

> 选中就问，没选中就直接写。—— 桌面上的轻量 AI 速查卡片。

在阅读、写作或看代码时，按下 **`⌥⇧D`（macOS）/ `Alt+Shift+D`（Windows、Linux）**，不用先打开聊天窗口。

| 有一段文字想查 | 有一个问题想问 |
| --- | --- |
| **选中文字 → 按快捷键 → 看回答** | **不选文字 → 按快捷键 → 输入 → `Enter`** |
| 解释术语、翻译段落、读懂代码 | 空白输入框自动聚焦，也可以手动粘贴文字 |

默认自动模式下，没有选区就等待你输入，**不会把旧剪贴板内容自动发给 AI**。

**[下载最新版本](https://github.com/537Lab/askthis/releases/latest)** · [零基础上手](docs/quick-start.zh-CN.md) · [更新日志](CHANGELOG.md) · [反馈问题](https://github.com/537Lab/askthis/issues)

![无选区时的 AskThis：打开空白输入卡片，直接键入问题](docs/images/manual-input.png)

自带 API 密钥，连接你选择的 AI 服务；也可使用 Ollama / LM Studio 本地模型。AskThis 无需注册账号，无遥测。云端 API 费用由服务商单独收取。

## 一个快捷键，两种用法

- **选中即问**：读取当前应用里的文字，在光标旁显示速查卡片；支持继续追问。
- **直接输入（v0.1.4）**：没有选区时打开空白卡片并聚焦输入框；输入后按 `Enter` 发送，按 `Esc` 关闭。
- **剪贴板由你决定**：可以在输入框里手动粘贴后发送；需要直接查询剪贴板时，在设置 → 通用中显式选择「仅使用剪贴板」。
- **回答不用等整段**：流式输出，支持停止、重新生成、复制结果，以及可折叠的思考过程（取决于模型）。
- **模型与提示词可换**：多服务商、兼容 API、自定义提示词，以及速查、翻译、代码解释、总结、润色等预设。
- **留在自己的桌面**：浅色 / 深色主题，中文 / English 界面，本机历史记录。

> **能力边界：** AskThis 处理文字，不含截图识字 / OCR。图片、扫描件或无法选中文字的界面，需要先自行提取文字，再粘贴提问。文字捕获取决于目标应用及系统权限，并非每个应用都能直接读取。

## 下载与安装

到 **[Releases 下载页](https://github.com/537Lab/askthis/releases/latest)**，展开 **Assets**，选择你的安装包；不需要下载 Source code。

| 平台 | 选择哪个文件 | 验证范围 |
| --- | --- | --- |
| macOS · Apple Silicon | 名称含 `arm64` 的 `.dmg` | macOS 是当前主要验证平台；不代表所有芯片与系统版本都已覆盖 |
| macOS · Intel | 名称含 `x64` 的 `.dmg` | 同上；请按芯片类型选包 |
| Windows | `setup` 安装版 / `portable` 便携版 `.exe` | 旧版已真机验证安装、启动与快捷键；**v0.1.4 新交互待真机复验** |
| Linux | `.AppImage` / `.deb` | 提供构建；**尚未真机验证** |

### 首次打开

- **macOS**：打开 `.dmg`，把 AskThis 拖到「应用程序」，再从那里启动。发行版没有 Apple Developer ID 签名与公证；系统可能拦截。请先确认来自本仓库，再按系统的「打开」/「仍要打开」提示操作。详细步骤见[新手教程](docs/quick-start.zh-CN.md#2-下载安装)。
- **Windows**：运行安装包；若出现 SmartScreen 提示，请先确认来源，再选择「更多信息 → 仍要运行」。
- **macOS 权限**：读取选区需要「辅助功能」权限。安装新版本后可能需要重新授权；若只切换开关无效，请移除旧条目、重新添加 `/Applications/AskThis.app`，开启权限后重启 AskThis。钥匙串也可能要求你重新确认访问。

## 第一次使用

1. **启动 AskThis**。手动启动会打开设置；之后它常驻菜单栏 / 托盘。
2. **连接模型**。设置 → 模型服务，选择服务，保存自己的 API 密钥，点「获取模型列表」并选定模型。本地服务按其配置填写。
3. **先试直接输入**。取消文字选区，按 `⌥⇧D` / `Alt+Shift+D`，输入「用一句话解释什么是递归」，按 `Enter`。
4. **再试选中即问**。在网页或文档中选中一个词，再按同一快捷键。macOS 若提示权限，请按提示授权并重启。

### 日常操作

| 想做什么 | 怎么做 |
| --- | --- |
| 查选中文字 | 选中文字 → 按快捷键（默认自动模式） |
| 直接提问 | 无选区 → 按快捷键 → 输入 → `Enter` |
| 查询复制来的内容 | 打开空白卡片 → 手动粘贴 → `Enter` |
| 始终只输入、不读取选区 | 设置 → 通用 → 内容获取方式 → 手动输入 |
| 显式读取剪贴板 | 设置 → 通用 → 内容获取方式 → 仅使用剪贴板 |
| 继续追问 | 在卡片底部输入 → `Enter` |
| 复制答案 | 点「复制结果」（随后卡片关闭） |
| 关闭卡片 | `Esc`、右上 ✕ 或「关闭」；输入法选词时先处理候选词 |
| 修改快捷键 | 设置 → 快捷键与交互 |

## 服务商与模型

支持 OpenAI、Anthropic、DeepSeek、Google Gemini、OpenRouter、Moonshot（Kimi）、智谱 GLM、硅基流动、xAI、Ollama / LM Studio，以及自定义 OpenAI / Anthropic 兼容端点。

- **先选服务，再选模型**：优先使用「获取模型列表」确认当前账号可用的模型。预设只是起点，模型供应情况以服务商为准。
- **推理强度**：提供关闭 / 低 / 中 / 高 / 最高档位，按服务商映射参数；实际支持程度取决于模型与网关。
- **自定义端点**：填写服务商提供的 API 地址（OpenAI 兼容地址通常以 `/v1` 结尾）、密钥和模型 ID。兼容程度以端点实现为准。

<details>
<summary>推理参数映射（进阶）</summary>

| 服务商 | 推理参数 |
| --- | --- |
| OpenAI / Gemini / Kimi / GLM / xAI / 硅基流动 | `reasoning_effort`（取值按服务商映射） |
| DeepSeek | `reasoning_effort` + 关闭时发 `thinking: disabled` |
| Anthropic | `output_config.effort` + adaptive thinking |
| OpenRouter | `reasoning: { effort }` |
| 本地（Ollama / LM Studio） | 不发送 |

</details>

## 隐私与安全

- **发送什么**：选中文字会直接用于查询；手动输入 / 粘贴的文字在你按 `Enter` 后发送。显式剪贴板模式会读取并查询剪贴板文字。
- **发到哪里**：请求直接发给你配置的模型服务，不经过 AskThis 自建中转。使用云服务时，请自行确认其数据政策，避免发送敏感内容。
- **本机保存**：历史记录保存在本机。API 密钥使用系统安全存储加密；安全存储不可用时仅保存在内存，不静默降级成明文。
- **自定义请求头**：保存在 `config.json` 中，**不是加密字段**。凭据优先填入 API 密钥栏。
- **剪贴板与选区**：默认自动模式不提交旧剪贴板；读取选区时仍可能模拟复制并恢复之前的纯文本剪贴板，不能保证完整恢复图片等非文本内容。若要避免选区捕获与复制动作，请选择「手动输入」。
- **网络**：请求跟随系统代理设置；AskThis 不含统计、崩溃上报或遥测。

## 常见问题与平台限制

- **快捷键没反应？** 可能与其他应用冲突。到设置 → 快捷键与交互更换；注册失败时页面会显示警告。
- **没有选文字，为什么是空白卡片？** 这是 v0.1.4 默认行为，不是故障。直接输入或粘贴，按 `Enter` 才发送。升级后不会继续自动查询旧剪贴板。
- **有选区却没有自动回答？** 目标应用可能不提供可读取的文本，或系统权限未生效。先手动复制、打开卡片并粘贴；macOS 另查辅助功能权限。
- **Windows / Linux 的选区捕获？** Windows 优先使用 UI Automation；Linux X11 依赖 `xdotool`。复制回退可能向当前窗口发送 `Ctrl+C`，在终端中可能中断进程；建议在终端使用「手动输入」。Wayland 不直接捕获选区，可手动粘贴或显式使用剪贴板模式；全局快捷键也受桌面环境限制。
- **代理环境下失败？** 请确认代理软件启用「系统代理」，并检查 API 密钥、服务余额和模型权限。

## 从源码构建

要求：Node.js 20.19+（推荐 22 LTS）、npm 10+。

```bash
git clone https://github.com/537Lab/askthis.git askthis && cd askthis
npm install
npm run dev          # 开发模式（HMR）
npm run typecheck    # 类型检查（主进程 + 渲染进程）
npm run build        # 生产构建到 out/
npm run pack:mac     # 打包 macOS；Windows / Linux 用 pack:win / pack:linux
```

`package.json` 中的 `allowScripts` 声明了需要运行安装脚本的依赖；若包管理器提示，请先核对再批准。

<details>
<summary>项目结构</summary>

```text
src/
├── main/        Electron 主进程：窗口、托盘、选区捕获、模型请求与本机存储
├── preload/     contextBridge API（window.api）
├── shared/      类型、服务商预设、i18n、默认值
└── renderer/    React 界面：速查卡片与设置
```

</details>

## 文档与贡献

- [中文新手教程](docs/quick-start.zh-CN.md) · [English documentation](README.en.md) · [English quick start](docs/quick-start.md)
- 欢迎提交 [Issue](https://github.com/537Lab/askthis/issues) 或 [PR](CONTRIBUTING.md)。尤其欢迎 Windows / Linux 真机报告：请附系统版本、应用版本、内容获取方式与复现步骤。
- [更新日志](CHANGELOG.md) · [MIT 许可证](LICENSE)
