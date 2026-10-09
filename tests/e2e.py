#!/usr/bin/env python3
"""
AskThis end-to-end test.

Runs the app against a local mock OpenAI-compatible server, so no real API key
is needed. Verifies the full query pipeline: trigger -> streaming answer ->
follow-up -> stop -> error handling.

Usage:
    python3 tests/e2e.py                    # test the dev build
    python3 tests/e2e.py --packaged         # test the packaged app
    python3 tests/e2e.py --trigger 'hs ...' # custom trigger command

Requirements: the app has been built (`npm run build`); on macOS a trigger
command that presses the global shortcut (defaults to the Hammerspoon CLI).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import websocket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_DATA = os.path.expanduser('~/Library/Application Support/askthis')
CONFIG = os.path.join(USER_DATA, 'config.json')
MOCK_PORT = 8788
CDP_PORT = 9222


def _find_hs():
    """Locate the Hammerspoon CLI (used to press the global shortcut)."""
    env = os.environ.get('ASKTHIS_HS_CLI')
    if env:
        return env
    for candidate in (
        '~/Applications/Hammerspoon.app/Contents/Frameworks/hs/hs',
        '/Applications/Hammerspoon.app/Contents/Frameworks/hs/hs',
    ):
        path = os.path.expanduser(candidate)
        if os.path.exists(path):
            return path
    return 'hs'  # rely on PATH


HS = _find_hs()

RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ''))
    return ok


# ============================== mock server ==============================

class MockHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.endswith('/models'):
            body = json.dumps({'data': [{'id': 'mock-1'}]}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length) or b'{}')
        except Exception:
            body = {}
        messages = body.get('messages', [])
        last_user = next((m.get('content', '') for m in reversed(messages) if m.get('role') == 'user'), '')

        if 'ERROR' in last_user:
            payload = json.dumps({'error': {'message': 'mock internal error'}}).encode()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if 'SLOW' in last_user:
            time.sleep(30)

        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'close')
        self.end_headers()
        reply = f'MOCK-REPLY: {last_user[:40]}'
        try:
            for i in range(0, len(reply), 8):
                chunk = {'choices': [{'delta': {'content': reply[i:i + 8]}, 'index': 0}]}
                self.wfile.write(f'data: {json.dumps(chunk)}\n\n'.encode())
                self.wfile.flush()
                time.sleep(0.03)
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # client aborted (stop test) — fine


def start_mock():
    server = ThreadingHTTPServer(('127.0.0.1', MOCK_PORT), MockHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


# ============================== CDP helpers ==============================

class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, timeout=30, origin=f'http://127.0.0.1:{CDP_PORT}')
        self.mid = 0

    def ev(self, expr):
        self.mid += 1
        self.ws.send(json.dumps({
            'id': self.mid, 'method': 'Runtime.evaluate',
            'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True, 'timeout': 25000},
        }))
        deadline = time.time() + 30
        while time.time() < deadline:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.mid:
                r = msg.get('result', {})
                if 'exceptionDetails' in r:
                    return f"[JS ERR] {r['exceptionDetails'].get('text')}"
                return r.get('result', {}).get('value')
        return '[TIMEOUT]'

    def close(self):
        self.ws.close()


def find_popup_target(timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json/list', timeout=3))
            for t in targets:
                if 'popup.html' in (t.get('url') or ''):
                    return t
        except Exception:
            pass
        time.sleep(0.5)
    return None


def trigger_shortcut(cmd):
    subprocess.run(cmd, shell=True, capture_output=True, timeout=10)


def wait_turn_answer(cdp, turn_index, contains, timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        txt = cdp.ev(f'(document.querySelectorAll(".turn__a")[{turn_index}]||{{}}).textContent || ""') or ''
        busy = cdp.ev('!!document.querySelector(".cursor")')
        if contains in txt and not busy:
            return txt
        time.sleep(0.6)
    return None


# ============================== main ==============================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packaged', action='store_true', help='test the packaged app instead of dev build')
    parser.add_argument('--trigger', default=f'"{HS}" -c \'hs.eventtap.keyStroke({{"alt","shift"}},"f",0)\'',
                        help='shell command that presses the global shortcut')
    args = parser.parse_args()

    app_cmd = (
        [os.path.join(ROOT, 'release/mac-arm64/AskThis.app/Contents/MacOS/AskThis')]
        if args.packaged else
        [os.path.join(ROOT, 'node_modules/.bin/electron'), '.']
    )

    print('== AskThis e2e ==')
    print('1. starting mock server on', MOCK_PORT)
    mock = start_mock()

    print('2. pointing config at the mock provider')
    backup = CONFIG + '.e2e-backup'
    if os.path.exists(CONFIG):
        shutil.copy(CONFIG, backup)
    cfg = json.load(open(CONFIG)) if os.path.exists(CONFIG) else {}
    providers = [p for p in cfg.get('providers', []) if p.get('id') != 'e2e-mock']
    providers.insert(0, {
        'id': 'e2e-mock', 'name': 'E2E Mock', 'kind': 'openai-compatible',
        'baseUrl': f'http://127.0.0.1:{MOCK_PORT}/v1',
        'models': [{'id': 'mock-1', 'reasoning': False}], 'reasoningStyle': 'none',
    })
    cfg['providers'] = providers
    cfg['activeProviderId'] = 'e2e-mock'
    cfg['activeModelId'] = 'mock-1'
    cfg['selectionMode'] = 'clipboard'
    json.dump(cfg, open(CONFIG, 'w'), ensure_ascii=False, indent=2)

    print('3. launching app:', ' '.join(app_cmd))
    env = dict(os.environ)
    proc = subprocess.Popen(
        app_cmd + [f'--remote-debugging-port={CDP_PORT}', '--remote-allow-origins=*'],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env,
    )

    try:
        target = find_popup_target()
        if check('popup target appears (pre-warm)', bool(target)):
            run_tests(args, target)
    except Exception as exc:
        check('e2e run completed without exceptions', False, str(exc))
    return finish(mock, backup, proc)


def run_tests(args, target):

        cdp = CDP(target['webSocketDebuggerUrl'])
        # clear clipboard; then trigger with nothing selected -> clipboard fallback disabled? we set clipboard mode
        subprocess.run('printf "e2e first question" | pbcopy', shell=True)

        print('4. trigger -> first answer')
        trigger_shortcut(args.trigger)
        got = wait_turn_answer(cdp, 0, 'MOCK-REPLY')
        check('first answer streams and renders', bool(got), (got or '')[:60])

        print('5. follow-up')
        cdp.ev('''(() => {
          const input = document.querySelector('.composer__input');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'second question');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return 'sent';
        })()''')
        got2 = wait_turn_answer(cdp, 1, 'MOCK-REPLY')
        check('follow-up renders as second turn', bool(got2), (got2 or '')[:60])
        check('two turns present', cdp.ev('document.querySelectorAll(".turn").length') == 2)

        print('6. stop mid-stream')
        cdp.ev('''(() => {
          const input = document.querySelector('.composer__input');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'SLOW please');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return 'sent';
        })()''')
        time.sleep(1.5)
        cdp.ev('Array.from(document.querySelectorAll(".foot .at-btn")).find(b=>b.textContent.includes("停止"))?.click()')
        time.sleep(1.2)
        stopped = cdp.ev('!!document.querySelector(".turn__note")')
        check('stop button aborts the request', bool(stopped))

        print('7. error handling (HTTP 500)')
        cdp.ev('''(() => {
          const input = document.querySelector('.composer__input');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'ERROR case');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return 'sent';
        })()''')
        deadline = time.time() + 15
        err_text = None
        while time.time() < deadline:
            err_text = cdp.ev('(document.querySelector(".turn__error")||{}).textContent || ""')
            if err_text and 'mock internal error' in err_text:
                break
            time.sleep(0.6)
        check('error from provider is shown', bool(err_text and 'mock internal error' in err_text), (err_text or '')[:60])

        cdp.close()


def finish(mock, backup, proc):
    print('8. cleanup')
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    mock.shutdown()
    if os.path.exists(backup):
        shutil.move(backup, CONFIG)
        print('   config restored')
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print(f'== RESULT: {passed}/{total} passed ==')
    for name, ok, detail in RESULTS:
        if not ok:
            print(f'   FAILED: {name} {detail}')
    return 0 if passed == total and total > 0 else 1


if __name__ == '__main__':
    sys.exit(main())
