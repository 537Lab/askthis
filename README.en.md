# AskThis

> Select it. Ask it. — a lightweight quick-look lens for your desktop.

**English** | [简体中文](README.md) · [Quick start guide](docs/quick-start.md)

AskThis is a tiny, always-available AI companion. Select any text in any app,
press a global shortcut (default `⌥⇧D` on macOS / `Alt+Shift+D` elsewhere), and
get an instant, ultra-concise explanation, translation or answer in a floating
card next to your cursor — with follow-up questions when you need them.

Built with Electron + React. Bring your own API key. No accounts, no telemetry,
no lock-in.

<!-- Screenshots: add docs/screenshot-popup.png here before publishing -->

## Features

- **One shortcut, any app** — works over every application, no window switching.
- **Selection-first** — reads the text you selected (Accessibility API on
  macOS, UI Automation on Windows) and falls back to the clipboard only when
  you allow it.
- **Streaming answers** with a collapsible reasoning section, follow-up
  questions, regenerate, stop, and one-click copy.
- **Multi-provider** — OpenAI, Anthropic, DeepSeek, Google Gemini, OpenRouter,
  Moonshot (Kimi), Zhipu GLM, SiliconFlow, xAI, Ollama / LM Studio, or any
  custom OpenAI/Anthropic-compatible endpoint.
- **Reasoning level control** (off / low / medium / high / max) mapped
  correctly per provider and model.
- **Custom prompts** — six built-in presets (lookup, translation, code
  explanation, summary, polish) plus full customization.
- **Light & dark themes**, Chinese / English UI.
- **Local-only history**, stored on your machine; API keys encrypted with the
  OS keychain (Keychain / DPAPI / libsecret).

## Install

Download the latest release for your platform from the **Releases** page.

| Platform | Package | Status |
| --- | --- | --- |
| macOS (Apple Silicon / Intel) | `.dmg` | ✅ Tested |
| Windows | `.exe` (NSIS installer / portable) | ✅ Install, launch & shortcut verified on real hardware (2026-10) |
| Linux | `.AppImage` / `.deb` | 🧪 Built, not yet verified on real hardware |

> **Note:** release builds are unsigned (this is an open-source project without
> code-signing certificates).
> - macOS: right-click the app → Open, or run
>   `xattr -dr com.apple.quarantine /Applications/AskThis.app` once.
> - Windows: if SmartScreen warns, choose "More info" → "Run anyway".
> - **Upgrade note (macOS):** after installing a new version, if the hotkey
>   can't read selected text, re-enable AskThis once in System Settings →
>   Privacy & Security → Accessibility (unsigned-app limitation: each new
>   build needs a one-time re-authorization).

## Quick start

1. Launch AskThis — it lives in the menu bar / tray and registers the global
   shortcut. On macOS, grant **Accessibility** permission when asked (needed to
   read the text you select).
2. Open **Settings → Providers**, pick a service (DeepSeek and OpenAI are
   pre-created), paste your API key, and use **Fetch models** to pick a model.
3. Select some text anywhere, press the shortcut, and read.

### Everyday usage

| Action | How |
| --- | --- |
| Look something up | Select text → press the shortcut |
| Ask something yourself | Press the shortcut with nothing selected → type |
| Follow up | Type in the card's input and press Enter |
| Copy the answer | Click "Copy" (the card closes afterwards) |
| Close the card | `Esc`, the ✕ button, or click "Close" |
| Re-ask / retry | "Regenerate" button |
| Change provider/model | Settings → Providers |
| Change the shortcut | Settings → Shortcut & Interaction |

## Providers & models

Provider presets ship with verified current model lists (checked against
official docs, 2026-10). The reasoning-level control is adapted per provider:

| Provider | Reasoning parameter |
| --- | --- |
| OpenAI / Gemini / Kimi / GLM / xAI / SiliconFlow | `reasoning_effort` (values mapped per provider) |
| DeepSeek | `reasoning_effort` + `thinking: disabled` when off |
| Anthropic | `output_config.effort` + adaptive thinking |
| OpenRouter | unified `reasoning: { effort }` object |
| Local (Ollama / LM Studio) | none (not sent) |

Any OpenAI-compatible endpoint works: choose **Custom (OpenAI-compatible)**,
set the base URL (usually ends in `/v1`), the key and the model id. Extra
request headers can be added if your gateway needs them.

## Privacy & security

- **Your data path:** captured text → the AI provider *you* configured. Nothing
  goes anywhere else. There is no analytics, no crash reporting, no phone-home.
- **API keys** are encrypted with the operating system's secure storage and
  never exposed to the UI layer (the settings window only ever sees a masked
  hint). If the OS keychain is unavailable, keys are kept in memory only —
  AskThis never silently downgrades to plaintext storage.
- **Custom request headers** (Providers → Custom headers) are stored in
  `config.json` in plain text — do not put credentials there unless your
  gateway requires it; prefer the API key field.
- **Clipboard care:** when AskThis reads a selection it restores your previous
  clipboard text afterwards, and it never overwrites non-text clipboard
  content. Clipboard fallback can be disabled entirely in Settings → General.
- **Network requests** go through the OS proxy settings automatically.

## Building from source

Requirements: Node.js 20.19+ (22 LTS recommended), npm 10+.

```bash
git clone https://github.com/537Lab/askthis.git askthis && cd askthis
npm install
npm run dev          # development (HMR)
npm run typecheck    # type-check main + renderer
npm run build        # production build into out/
npm run pack:mac     # package for macOS (.dmg/.zip)  [pack:win, pack:linux]
```

The project pins which dependencies may run install scripts
(`allowScripts` in package.json); newer npm versions will ask you to approve
them — they are the standard Electron/esbuild/fsevents postinstalls.

## Project structure

```
src/
├── main/        Electron main process — windows, tray, selection capture,
│   │            AI client (streaming), config & history stores
├── preload/     contextBridge API (window.api)
├── shared/      Types, provider presets, i18n, defaults
└── renderer/    React UI — popup (quick-look card) + settings window
```

## Troubleshooting

- **Nothing happens on the shortcut** — the combo may be taken by another app;
  change it in Settings → Shortcut & Interaction. The settings page shows a
  warning if registration fails.
- **"Accessibility permission required" card** — macOS: System Settings →
  Privacy & Security → Accessibility → enable AskThis.
- **Requests fail behind a proxy** — AskThis uses the system proxy; make sure
  your proxy app is running in "system proxy" mode.
- **Windows/Linux quirks** — selection capture uses UI Automation (Windows) or
  `xdotool` (Linux X11); Wayland sessions fall back to clipboard mode. On these
  platforms the fallback path briefly sends a copy keystroke (Ctrl+C) to the
  frontmost window — in a terminal that keystroke also reaches the shell
  (SIGINT), so avoid triggering it there with nothing selected.

## Contributing

PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Especially valuable:
real-hardware testing reports for Windows and Linux.

## License

[MIT](LICENSE)
