# Contributing to AskThis

Thanks for your interest in improving AskThis! This document explains how to
set up the project and what we expect from contributions.

## Development setup

Requirements:

- Node.js 20.19+ (22 LTS recommended)
- npm 10+

```bash
git clone <your-fork-url> askthis
cd askthis
npm install
npm run dev
```

`npm run dev` starts electron-vite with HMR for the renderer and hot-restart
for the main process.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the app in development mode |
| `npm run typecheck` | Type-check main & renderer code |
| `npm run build` | Production build into `out/` |
| `npm run pack:dir` | Unpacked app build (fast packaging check) |
| `npm run pack:mac` / `pack:win` / `pack:linux` | Installers for a platform |

### Note on npm install scripts

This project pins the packages allowed to run install scripts in
`package.json` (`allowScripts`). If your npm version is older, scripts run by
default and everything works as usual. When upgrading a pinned dependency,
npm may ask you to re-approve it (`npm install-scripts approve <pkg>`).

## Project structure

```
src/
├── main/        # Electron main process (windows, tray, services, AI client)
├── preload/     # contextBridge API exposed to the renderer
├── shared/      # Types, config defaults, presets, i18n (used by both sides)
└── renderer/    # React UIs
    ├── popup     # the quick-look card
    └── settings  # the settings window
```

## Guidelines

- **Keep it small.** AskThis is meant to be a lightweight lens, not a chat
  platform. Features that don't serve the "select → shortcut → answer" flow
  need a strong case.
- **Security first.** The renderer never sees raw API keys and never talks to
  the network directly — all requests go through the main process
  (`src/main/ai/client.ts`). Keep it that way.
- **Type everything.** `npm run typecheck` must pass.
- **i18n.** All user-visible strings live in `src/shared/i18n.ts` with both
  `zh-CN` and `en-US` entries. Add both.
- **No telemetry.** Ever.
- Code style: match the existing code (2-space indent, no semicolons at line
  starts, single quotes in TS). We accept small, focused PRs.

## Submitting changes

1. Fork & create a feature branch (`feat/...`, `fix/...`).
2. Make your change; verify `npm run typecheck` and a manual smoke test of the
   popup flow.
3. Open a PR with a short description of **what** and **why**. Screenshots or
   a short recording help for UI changes.

## Reporting bugs

Please use the issue templates and include:

- OS and AskThis version (Settings → About)
- Which provider/model you were using (if relevant)
- Steps to reproduce, expected vs. actual behaviour
