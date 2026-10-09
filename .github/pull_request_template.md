Thanks for the PR! A few notes that make review fast:

- **Scope**: AskThis is intentionally small — it serves the "select → shortcut → answer" flow. Please describe *why* the change belongs here.
- **Checks**: `npm run typecheck` and `npm run build` must pass; for behaviour changes run `python3 tests/e2e.py` (uses a local mock server, no API key needed).
- **i18n**: user-visible strings go into `src/shared/i18n.ts` (both `zh-CN` and `en-US`).
- **Security**: the renderer never touches raw API keys or the network directly — keep it that way (see `src/main/ai/client.ts`).
- **Screenshots** help a lot for UI changes.
