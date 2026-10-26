# AskThis

> Select to ask. Nothing selected? Just type. — a lightweight AI card for your desktop.

While reading, writing or browsing code, press **`⌥⇧D` (macOS) / `Alt+Shift+D` (Windows, Linux)**. No need to open a chat window first.

| Have text to look up? | Have a question to ask? |
| --- | --- |
| **Select text → shortcut → read the answer** | **Select nothing → shortcut → type → `Enter`** |
| Explain a term, translate a passage, understand code | The empty input gets focus; you can also paste text yourself |

In the default automatic mode, no selection means waiting for your input — **not automatically sending old clipboard contents to AI**.

**[Download the latest release](https://github.com/537Lab/askthis/releases/latest)** · [Beginner guide](docs/quick-start.md) · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/537Lab/askthis/issues)

![AskThis with no selection: an empty card ready for a typed question](docs/images/manual-input.png)

Bring your own API key and choose your AI service, or use local models through Ollama / LM Studio. No AskThis account or telemetry. Cloud API usage is billed separately by your provider.

## One shortcut, two ways to ask

- **Ask about a selection**: capture text from the current app and get an answer in a floating card near your cursor, with follow-ups.
- **Type directly (v0.1.4)**: with nothing selected, open an empty card with the input focused. Type and press `Enter` to send; press `Esc` to close.
- **Your clipboard, your choice**: paste into the input and send, or explicitly choose **Clipboard only** in Settings → General to query clipboard text directly.
- **Read as it streams**: stop, regenerate, copy, and view collapsible reasoning when the model provides it.
- **Choose models and prompts**: multiple providers, compatible APIs, custom prompts, and presets for lookup, translation, code explanation, summaries and polishing.
- **Keep it on your desktop**: light / dark themes, Chinese / English UI and local history.

> **Scope:** AskThis handles text, not screenshot recognition / OCR. For images, scanned pages or interfaces with no selectable text, extract the text yourself and paste it in. Selection capture depends on the app and system permissions; it does not work in every application.

## Download & install

Open **[Releases](https://github.com/537Lab/askthis/releases/latest)**, expand **Assets**, and choose your package — not Source code.

| Platform | Which file? | Verification scope |
| --- | --- | --- |
| macOS · Apple silicon | `.dmg` with `arm64` in its name | macOS is the primary validation platform; this does not imply coverage of every chip or OS version |
| macOS · Intel | `.dmg` with `x64` in its name | Same scope; choose the package matching your chip |
| Windows | `setup` installer / `portable` `.exe` | Earlier releases had install, launch and shortcut checks on real hardware; **v0.1.4 interactions still need hardware re-testing** |
| Linux | `.AppImage` / `.deb` | Builds provided; **not yet tested on real hardware** |

### First launch

- **macOS**: open the `.dmg`, drag AskThis into Applications, then launch it from there. Releases do not have Apple Developer ID signing or notarization, so macOS may block them. Verify the download came from this repository before following the system's Open / Open Anyway prompts. See the [beginner guide](docs/quick-start.md#2-download--install).
- **Windows**: run the installer. If SmartScreen warns, verify the source before choosing **More info → Run anyway**.
- **macOS permissions**: reading a selection requires Accessibility access. Updates may require permission again. If toggling it does not help, remove the old entry, re-add `/Applications/AskThis.app`, enable it, and restart AskThis. Keychain access may also need your confirmation again.

## First use

1. **Launch AskThis.** A manual launch opens Settings; the app then lives in the menu bar / tray.
2. **Connect a model.** In Settings → Providers, select a service, save your API key, click **Fetch models**, and select a model. Configure local services according to their setup.
3. **Try typing first.** Clear any text selection, press `⌥⇧D` / `Alt+Shift+D`, type “Explain recursion in one sentence”, and press `Enter`.
4. **Try a selection.** Select a word in a webpage or document and press the same shortcut. If macOS requests permission, grant it and restart.

### Everyday usage

| What you want | How |
| --- | --- |
| Look up selected text | Select text → shortcut (default automatic mode) |
| Ask a question | No selection → shortcut → type → `Enter` |
| Query text you copied | Open an empty card → paste → `Enter` |
| Always type; never capture a selection | Settings → General → Text capture → Manual input |
| Explicitly read the clipboard | Settings → General → Text capture → Clipboard only |
| Follow up | Type in the card's bottom input → `Enter` |
| Copy an answer | Click **Copy** (the card then closes) |
| Close the card | `Esc`, the top-right ✕, or **Close**; during IME composition, handle the candidate first |
| Change the shortcut | Settings → Shortcut & Interaction |

## Providers & models

Supports OpenAI, Anthropic, DeepSeek, Google Gemini, OpenRouter, Moonshot (Kimi), Zhipu GLM, SiliconFlow, xAI, Ollama / LM Studio, and custom OpenAI / Anthropic-compatible endpoints.

- **Choose a service, then a model**: use **Fetch models** to check what your account can access. Presets are a starting point; availability is determined by the provider.
- **Reasoning level**: off / low / medium / high / max, mapped per provider. Actual support depends on the model and gateway.
- **Custom endpoints**: enter your provider's API URL (OpenAI-compatible URLs usually end in `/v1`), key and model ID. Compatibility depends on the endpoint's implementation.

<details>
<summary>Reasoning parameter mapping (advanced)</summary>

| Provider | Reasoning parameter |
| --- | --- |
| OpenAI / Gemini / Kimi / GLM / xAI / SiliconFlow | `reasoning_effort` (values mapped per provider) |
| DeepSeek | `reasoning_effort` + `thinking: disabled` when off |
| Anthropic | `output_config.effort` + adaptive thinking |
| OpenRouter | `reasoning: { effort }` |
| Local (Ollama / LM Studio) | Not sent |

</details>

## Privacy & security

- **What is sent**: a captured selection is queried directly. Typed / pasted text is sent when you press `Enter`. Explicit clipboard mode reads and queries clipboard text.
- **Where it goes**: requests go directly to the model service you configured, not through an AskThis relay. Check your cloud provider's data policy before sending sensitive content.
- **Local storage**: history stays on your machine. API keys are encrypted with OS secure storage; if that storage is unavailable, keys stay in memory rather than silently falling back to plaintext.
- **Custom request headers**: stored in `config.json`, **not encrypted**. Prefer the API key field for credentials.
- **Clipboard and capture**: the default automatic mode does not submit old clipboard text. Selection capture may still simulate Copy and restore previous plain-text clipboard contents; complete restoration of images or other non-text formats is not guaranteed. Choose **Manual input** to avoid selection capture and copy actions.
- **Network**: requests follow the system proxy settings. There is no analytics, crash reporting or telemetry.

## Troubleshooting & platform limits

- **Shortcut does nothing?** Another app may have claimed it. Change it in Settings → Shortcut & Interaction; registration failures are shown there.
- **Empty card when nothing is selected?** This is intentional in v0.1.4. Type or paste, then press `Enter` to send. Upgrading no longer automatically queries old clipboard text.
- **Selected text produces no answer?** The app may not expose readable text, or permission may not be active. Copy manually, open the card and paste. On macOS, also check Accessibility access.
- **Windows / Linux capture?** Windows tries UI Automation first; Linux X11 needs `xdotool`. Copy fallback may send `Ctrl+C` to the active window, which can interrupt a terminal process; use **Manual input** in terminals. Wayland does not capture selections directly: paste manually or explicitly use clipboard mode. Global shortcuts also depend on the desktop environment.
- **Requests fail behind a proxy?** Enable your proxy app's **system proxy** mode, and check your API key, account balance and model access.

## Building from source

Requirements: Node.js 20.19+ (22 LTS recommended), npm 10+.

```bash
git clone https://github.com/537Lab/askthis.git askthis && cd askthis
npm install
npm run dev          # development (HMR)
npm run typecheck    # type-check main + renderer
npm run build        # production build into out/
npm run pack:mac     # macOS; use pack:win / pack:linux for Windows / Linux
```

`allowScripts` in `package.json` declares dependencies that need install scripts. If your package manager asks, review them before approving.

<details>
<summary>Project structure</summary>

```text
src/
├── main/        Electron: windows, tray, selection capture, model requests, local storage
├── preload/     contextBridge API (window.api)
├── shared/      Types, provider presets, i18n, defaults
└── renderer/    React: quick-look card and settings
```

</details>

## Documentation & contributing

- [Beginner guide](docs/quick-start.md) · [中文文档](README.md) · [中文新手教程](docs/quick-start.zh-CN.md)
- [Issues](https://github.com/537Lab/askthis/issues) and [PRs](CONTRIBUTING.md) welcome. Windows / Linux hardware reports are especially useful: include your OS, app version, text capture mode and reproduction steps.
- [Changelog](CHANGELOG.md) · [MIT license](LICENSE)
