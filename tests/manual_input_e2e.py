#!/usr/bin/env python3
"""macOS UI regression: no selection -> focus -> type -> Enter -> answer.

Uses an isolated user-data directory and a local mock provider; never reads API
keys. Quit another AskThis instance first so the global hotkey is available.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

import e2e


def hs(code):
    return subprocess.check_output([e2e.HS, '-c', code], text=True, timeout=15)


def wait_for(fn, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(0.08)
    return None


def settings_target():
    targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{e2e.CDP_PORT}/json/list', timeout=3))
    return next((t for t in targets if 'settings.html' in t.get('url', '')), None)


class CountingHandler(e2e.MockHandler):
    requests = 0

    def do_POST(self):
        type(self).requests += 1
        super().do_POST()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packaged', action='store_true')
    parser.add_argument('--screenshot', help='save the actual rendered blank popup as PNG')
    args = parser.parse_args()
    tmp = tempfile.mkdtemp(prefix='askthis-manual-', dir=os.environ.get('TMPDIR'))
    mock = e2e.ThreadingHTTPServer(("127.0.0.1", e2e.MOCK_PORT), CountingHandler)
    threading.Thread(target=mock.serve_forever, daemon=True).start()
    hs('_askthisManualClipboard = hs.pasteboard.readAllData(); return "saved"')
    proc = None
    cdp = settings = None
    try:
        # Legacy auto config reproduces the previous accidental clipboard query.
        cfg = {'version': 1, 'locale': 'zh-CN', 'shortcut': 'Alt+Shift+D',
               'selectionMode': 'auto', 'clipboardFallback': True, 'launchAtLogin': False,
               'providers': [{'id': 'e2e-mock', 'name': 'Local test', 'kind': 'openai-compatible',
                              'baseUrl': f'http://127.0.0.1:{e2e.MOCK_PORT}/v1',
                              'models': [{'id': 'mock-1', 'reasoning': False}], 'reasoningStyle': 'none'}],
               'activeProviderId': 'e2e-mock', 'activeModelId': 'mock-1'}
        Path(tmp, 'config.json').write_text(json.dumps(cfg))
        executable = (os.path.join(e2e.ROOT, 'release/mac-arm64/AskThis.app/Contents/MacOS/AskThis')
                      if args.packaged else os.path.join(e2e.ROOT, 'node_modules/.bin/electron'))
        command = [executable] + ([] if args.packaged else ['.'])
        proc = subprocess.Popen(command + [f'--user-data-dir={tmp}', f'--remote-debugging-port={e2e.CDP_PORT}',
                                          '--remote-allow-origins=*'], cwd=e2e.ROOT,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target = e2e.find_popup_target()
        if not e2e.check('isolated popup starts', bool(target)):
            return 1
        if not target:
            return 1
        cdp = e2e.CDP(target['webSocketDebuggerUrl'])
        settings_info = wait_for(settings_target)
        if not settings_info:
            raise RuntimeError('Settings target did not appear')
        settings = e2e.CDP(settings_info['webSocketDebuggerUrl'])
        # Close only the test app settings window, not the user's windows.
        settings.ev('window.close()')
        settings.close()
        settings = None
        hs('hs.application.get("com.apple.finder"):activate(); hs.eventtap.keyStroke({}, "escape", 0); return "Finder foreground"')
        time.sleep(0.25)
        subprocess.run(['pbcopy'], input='STALE_CLIPBOARD_MUST_NOT_BE_QUERIED', text=True, check=True)
        t0 = time.monotonic()
        hs('hs.eventtap.keyStroke({"alt","shift"}, "d", 0); return "triggered"')
        focused = wait_for(lambda: cdp.ev('document.hasFocus() && document.activeElement?.classList.contains("composer__input")'), 6)
        elapsed = time.monotonic() - t0
        empty = cdp.ev('document.querySelectorAll(".turn").length === 0 && !!document.querySelector(".composer__input") && !document.querySelector(".composer__input").disabled')
        e2e.check('no selection opens an empty composer, not stale clipboard', empty is True)
        e2e.check('composer really owns keyboard focus', bool(focused), f'{elapsed:.3f}s incl. test driver')
        e2e.check('clipboard content is preserved', subprocess.check_output(['pbpaste'], text=True) == 'STALE_CLIPBOARD_MUST_NOT_BE_QUERIED')
        e2e.check('no API request is sent before manual submission', CountingHandler.requests == 0)
        if args.screenshot and empty:
            import base64
            cdp.mid += 1
            cdp.ws.send(json.dumps({'id': cdp.mid, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            while True:
                msg = json.loads(cdp.ws.recv())
                if msg.get('id') == cdp.mid:
                    Path(args.screenshot).write_bytes(base64.b64decode(msg['result']['data']))
                    break
        if empty and focused:
            cdp.ev('window.__keys=[]; document.addEventListener("keydown",e=>window.__keys.push({key:e.key,code:e.keyCode,composing:e.isComposing}))')
            hs('hs.eventtap.keyStrokes("entropy"); return "typed"')
            time.sleep(0.2)
            hs('hs.eventtap.keyStroke({}, "return", 0); return "submitted"')
            got = e2e.wait_turn_answer(cdp, 0, 'MOCK-REPLY: entropy')
            e2e.check('real keyboard typing and Enter produce an answer', bool(got), got or str(cdp.ev('({body:document.body.innerText,input:document.querySelector(".composer__input")?.value,focus:document.hasFocus(),keys:window.__keys})')))
            # A composing Enter must confirm the IME candidate, not submit.
            count = cdp.ev('document.querySelectorAll(".turn").length')
            request_count = CountingHandler.requests
            cdp.ev('''(() => { const i=document.querySelector('.composer__input');
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'中文术语');
              i.dispatchEvent(new Event('input',{bubbles:true}));
              i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})); })()''')
            time.sleep(0.2)
            e2e.check('IME composing Enter does not send a query', cdp.ev('document.querySelectorAll(".turn").length') == count and CountingHandler.requests == request_count)
            hs('hs.eventtap.keyStroke({}, "escape", 0); return "closed"')
            time.sleep(0.2)
            e2e.check('Esc dismisses the popup', cdp.ev('document.hasFocus()') is False)
            # Real editable app + real selection: exercise the native AX path.
            fixture = Path(tmp, 'askthis-selection-fixture.txt')
            fixture.write_text('entropy selected term', encoding='utf-8')
            subprocess.run(['open', '-a', 'TextEdit', str(fixture)], check=True)
            time.sleep(0.8)
            hs('hs.application.get("com.apple.TextEdit"):activate(); return "activated"')
            time.sleep(0.3)
            hs('hs.eventtap.keyStroke({"cmd"}, "a", 0); return "selected"')
            time.sleep(0.15)
            hs('hs.eventtap.keyStroke({"alt","shift"}, "d", 0); return "query selection"')
            selected = e2e.wait_turn_answer(cdp, 0, 'MOCK-REPLY: entropy selected term', timeout=8)
            e2e.check('real TextEdit selection still queries automatically', bool(selected), selected or str(cdp.ev('document.body.innerText')))
            hs('hs.eventtap.keyStroke({}, "escape", 0); return "dismissed"')
            subprocess.run(['osascript', '-e', 'tell application "TextEdit" to close (documents whose name is "askthis-selection-fixture.txt") saving no'], check=True, capture_output=True)
        return 0 if all(ok for _, ok, _ in e2e.RESULTS) else 1
    finally:
        if cdp:
            cdp.close()
        if settings:
            settings.close()
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        mock.shutdown()
        hs('if _askthisManualClipboard then hs.pasteboard.writeAllData(_askthisManualClipboard); _askthisManualClipboard=nil end; return "restored"')
        shutil.rmtree(tmp)
        print(f'RESULT: {sum(ok for _, ok, _ in e2e.RESULTS)}/{len(e2e.RESULTS)} passed')


if __name__ == '__main__':
    sys.exit(main())
