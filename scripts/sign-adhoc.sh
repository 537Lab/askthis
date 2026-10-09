#!/bin/bash
# Ad-hoc sign a packaged macOS app with the entitlements Electron needs
# (JIT, unsigned executable memory, library validation).
#
# Usage: bash scripts/sign-adhoc.sh [path/to/AskThis.app]
# Default: release/mac-arm64/AskThis.app
#
# Why: unsigned/ad-hoc apps that lack these entitlements lose V8 JIT in the
# renderer, which on some macOS versions breaks GPU compositing (windows exist
# and render internally but never appear on screen).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/release/mac-arm64/AskThis.app}"
ENTITLEMENTS="$ROOT/node_modules/app-builder-lib/templates/entitlements.mac.plist"

if [ ! -d "$APP" ]; then
  echo "error: app not found: $APP" >&2
  exit 1
fi
if [ ! -f "$ENTITLEMENTS" ]; then
  echo "error: entitlements template not found: $ENTITLEMENTS" >&2
  exit 1
fi

echo "==> signing (ad-hoc + entitlements): $APP"
codesign --force --deep --sign - --entitlements "$ENTITLEMENTS" "$APP"

echo "==> verify:"
codesign -dv "$APP" 2>&1 | grep -E "Identifier|Signature|flags" || true
codesign --verify --verbose=1 "$APP" 2>&1 | tail -2 || true
echo "==> done"
