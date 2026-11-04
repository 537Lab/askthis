#!/usr/bin/env python3
"""Real macOS IME z-order regression. Isolated profile, distinct shortcut, local SSE.
Requires PyObjC Quartz, Hammerspoon and the dependencies from e2e.py.
--probe-level is diagnostic only: changes the test window via Node inspector.
"""
import argparse
import json
import os
import plistlib
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from typing import Any

import Quartz  # type: ignore[import-not-found]
import e2e
from manual_input_e2e import hs, wait_for, settings_target
from source_presentation_e2e import SourceHandler


def windows() -> list[dict[str, Any]]:
    return [{k: dict(w[k]) if k == 'kCGWindowBounds' else w.get(k) for k in ['kCGWindowNumber', 'kCGWindowOwnerName',
            'kCGWindowOwnerPID', 'kCGWindowLayer', 'kCGWindowBounds']}
            for w in Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, 0)]


def intersects(a, b):
    return (max(a['X'], b['X']) < min(a['X'] + a['Width'], b['X'] + b['Width']) and
            max(a['Y'], b['Y']) < min(a['Y'] + a['Height'], b['Y'] + b['Height']))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--screenshots', required=True)
    parser.add_argument('--probe-level')
    parser.add_argument('--packaged', action='store_true')
    parser.add_argument('--executable')
    args = parser.parse_args()
    shots = Path(args.screenshots).resolve()
    shots.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='askthis-ime-', dir=os.environ.get('TMPDIR')))
    e2e.CDP_PORT = 9240
    e2e.RESULTS.clear()
    SourceHandler.requests = []
    proc = cdp = inspector = server = None
    source = hs('return hs.keycodes.currentSourceID()').strip()
    hs('_askthisIMEClipboard=hs.pasteboard.readAllData(); _askthisIMEPointer=hs.mouse.absolutePosition(); _askthisIMEFront=hs.application.frontmostApplication(); return "saved"')
    fixture = tmp / 'askthis-ime-fixture.txt'
    fixture.write_text('Input method overlay fixture.')
    metrics = {}
    try:
        if hs('return tostring(hs.caffeinate.sessionProperties().CGSSessionScreenIsLocked or false)').strip() != 'false':
            raise RuntimeError('Screen is locked')
        server = e2e.ThreadingHTTPServer(('127.0.0.1', 0), SourceHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cfg = {'version': 2, 'locale': 'zh-CN', 'theme': 'light',
               'shortcut': 'Ctrl+Alt+Shift+9', 'launchAtLogin': False,
               'selectionMode': 'clipboard', 'historyEnabled': False,
               'windowWidth': 480, 'maxWindowHeight': 560,
               'providers': [{'id': 'fixture', 'name': 'Local IME fixture',
                              'kind': 'openai-compatible',
                              'baseUrl': f'http://127.0.0.1:{server.server_port}/v1',
                              'models': [{'id': 'local-fixture', 'reasoning': False}],
                              'reasoningStyle': 'none'}],
               'activeProviderId': 'fixture', 'activeModelId': 'local-fixture'}
        (tmp / 'config.json').write_text(json.dumps(cfg))
        packaged = args.packaged or bool(args.executable)
        exe = args.executable or str(Path(e2e.ROOT) / ('release/mac-arm64/AskThis.app/Contents/MacOS/AskThis' if packaged else 'node_modules/.bin/electron'))
        if packaged:
            # setLoginItemSettings is OS-global even with a separate user-data dir.
            # Give the test copy a unique identity; retain CFBundleName for helpers.
            bundle = Path(exe).parents[2]
            isolated = tmp / 'AskThis.app'
            subprocess.run(['ditto', str(bundle), str(isolated)], check=True)
            info_path = isolated / 'Contents/Info.plist'
            info = plistlib.loads(info_path.read_bytes())
            info['CFBundleIdentifier'] = 'com.askthis.ime-regression'
            info_path.write_bytes(plistlib.dumps(info))
            subprocess.run(['codesign', '--force', '--deep', '--sign', '-', '--entitlements', str(Path(e2e.ROOT) / 'node_modules/app-builder-lib/templates/entitlements.mac.plist'), str(isolated)], check=True, capture_output=True)
            payload = Path('Contents/Resources/app.asar')
            assert hashlib.sha256((bundle / payload).read_bytes()).digest() == hashlib.sha256((isolated / payload).read_bytes()).digest()
            exe = str(isolated / 'Contents/MacOS/AskThis')
        proc = subprocess.Popen([exe] + ([] if packaged else ['.']) + [f'--user-data-dir={tmp}', f'--remote-debugging-port={e2e.CDP_PORT}', '--remote-allow-origins=*', '--inspect=9241'], cwd=e2e.ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target = e2e.find_popup_target()
        if not target:
            raise RuntimeError('No isolated popup target')
        cdp = e2e.CDP(target['webSocketDebuggerUrl'])
        info = wait_for(settings_target)
        if not info:
            raise RuntimeError('No settings target')
        settings = e2e.CDP(info['webSocketDebuggerUrl'])
        wait_for(lambda: settings.ev('!!window.api?.config'))
        settings.ev('window.close()')
        settings.close()
        main_target = json.load(urllib.request.urlopen('http://127.0.0.1:9241/json/list', timeout=3))[0]
        inspector = e2e.CDP(main_target['webSocketDebuggerUrl'])
        native_pid = inspector.ev('process.pid')
        main_win = 'process.mainModule.require("electron").BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("popup.html"))'

        def native(expr):
            result = inspector.ev('(()=>{const w=' + main_win + ';return ' + expr + '})()')
            if isinstance(result, str) and result.startswith('[JS ERR]'):
                raise RuntimeError('Main inspector expression failed: ' + expr)
            return result

        def key(mods, key_name):
            hs('hs.eventtap.keyStroke(' + json.dumps(mods).replace('[', '{').replace(']', '}') + ',' + json.dumps(key_name) + ',0); return "key"')
            time.sleep(.1)

        def reveal():
            subprocess.run(['pbcopy'], input='输入法候选栏层级测试', text=True, check=True)
            before = len(SourceHandler.requests)
            key(['ctrl', 'alt', 'shift'], '9')
            if not wait_for(lambda: len(SourceHandler.requests) > before and cdp.ev('document.querySelector(".popup-shell")?.dataset.status === "done"')):
                raise RuntimeError('Distinct shortcut/local fixture failed')
            visible = [w for w in windows() if w['kCGWindowOwnerPID'] == native_pid]
            e2e.check('selection reveal stays on-screen without stealing source focus',
                      bool(visible) and cdp.ev('document.hasFocus()') is False
                      and 'com.apple.TextEdit' in hs('return hs.application.frontmostApplication():bundleID()'))
            if args.probe_level:
                native('w.setAlwaysOnTop(true,' + json.dumps(args.probe_level) + '),true')
            native('w.setBounds({x:420,y:480,width:480,height:440}),w.focus(),true')
            time.sleep(.2)
            cdp.ev('document.querySelector(".composer__input").focus();window.__ime=[];for(const type of ["compositionstart","compositionend","keydown"])document.addEventListener(type,e=>window.__ime.push({type,key:e.key,composing:e.isComposing}))')
            time.sleep(.2)
            e2e.check('native popup owns input focus', cdp.ev('document.hasFocus() && document.activeElement.classList.contains("composer__input")') is True)

        def candidate_case(label, method):
            hs('hs.keycodes.setMethod(' + json.dumps(method, ensure_ascii=False) + '); return hs.keycodes.currentSourceID()')
            time.sleep(.4)
            before_windows = {w['kCGWindowNumber'] for w in windows()}
            for letter in 'ni':
                key([], letter)
            time.sleep(.4)
            ws = windows()
            # Identify the visible native window by PID and geometry, not localized app name.
            popup = next((w for w in ws if w['kCGWindowOwnerPID'] == native_pid and w['kCGWindowBounds']['Width'] == 480), None)
            # macOS hosts system IME candidate panels in the client process here.
            # Require a newly on-screen native panel, separate from the popup.
            candidates = [w for w in ws if w['kCGWindowNumber'] not in before_windows
                          and w['kCGWindowOwnerPID'] == native_pid and w != popup
                          and w['kCGWindowBounds']['Width'] > 100
                          and w['kCGWindowBounds']['Height'] > 20]
            composing = cdp.ev('window.__ime.some(e=>e.type==="compositionstart")') is True
            metrics[label] = {'popup': popup, 'candidates': candidates, 'windows': ws,
                              'composition': cdp.ev('window.__ime'), 'inputSource': hs('return hs.keycodes.currentSourceID()').strip()}
            if popup:
                b = popup['kCGWindowBounds']
                rect = ','.join(str(round(b[k])) for k in ['X', 'Y', 'Width', 'Height'])
                subprocess.run(['screencapture', '-x', '-R' + rect, str(shots / (label + '.png'))], check=True)
            overlap = [w for w in candidates if popup and intersects(w['kCGWindowBounds'], popup['kCGWindowBounds'])]
            e2e.check(label + ': real IME composition and candidate window exist', composing and bool(candidates))
            e2e.check(label + ': overlapping candidates render above popup', bool(popup) and bool(overlap) and all(ws.index(w) < ws.index(popup) and w['kCGWindowLayer'] > popup['kCGWindowLayer'] for w in overlap) if popup else False, json.dumps({'popupLayer': popup['kCGWindowLayer'] if popup else None, 'candidateLayers': [w['kCGWindowLayer'] for w in overlap]}))
            before = len(SourceHandler.requests)
            key([], '1')
            text = cdp.ev('document.querySelector(".composer__input").value')
            e2e.check(label + ': numeric selection commits Chinese without querying', any('\u4e00' <= c <= '\u9fff' for c in text) and len(SourceHandler.requests) == before, str(text))
            key(['cmd'], 'a')
            key([], 'delete')
            for letter in 'ni':
                key([], letter)
            key([], 'return')
            e2e.check(label + ': composing Enter does not query', len(SourceHandler.requests) == before)
            key(['cmd'], 'a')
            key([], 'delete')
            for letter in 'ni':
                key([], letter)
            key([], 'escape')
            e2e.check(label + ': composing Escape keeps popup focused and visible', cdp.ev('document.hasFocus()') is True and native('w.isVisible()') is True)
            hs('hs.keycodes.currentSourceID("com.apple.keylayout.ABC");return "ABC"')
            key(['cmd'], 'a')
            key([], 'delete')

        subprocess.run(['open', '-a', 'TextEdit', str(fixture)], check=True)
        time.sleep(.7)
        hs('hs.application.get("com.apple.TextEdit"):activate();return "active"')
        reveal()
        candidate_case('desktop-pinyin', 'Pinyin – Simplified')
        candidate_case('desktop-shuangpin', 'Shuangpin – Simplified')
        cdp.ev('window.api.popup.close()')
        hs('local a=hs.application.get("com.apple.TextEdit");a:activate();a:focusedWindow():setFullScreen(true);return "fullscreen"')
        full = wait_for(lambda: hs('return tostring(hs.application.get("com.apple.TextEdit"):focusedWindow():isFullScreen())').strip() == 'true')
        time.sleep(1)
        reveal()
        ws = windows()
        e2e.check('popup is on-screen over real fullscreen Space', bool(full) and any(w['kCGWindowOwnerPID'] == native_pid for w in ws))
        candidate_case('fullscreen-pinyin', 'Pinyin – Simplified')
        candidate_case('fullscreen-shuangpin', 'Shuangpin – Simplified')
    except Exception as exc:
        e2e.check('native IME driver completes', False, repr(exc))
    finally:
        actions = [
            ('popup CDP', lambda: cdp.close() if cdp else None),
            ('inspector', lambda: inspector.close() if inspector else None),
            ('process', lambda: (proc.terminate(), proc.wait(timeout=10)) if proc else None),
            ('server', lambda: (server.shutdown(), server.server_close()) if server else None),
            ('fullscreen', lambda: hs('local a=hs.application.get("com.apple.TextEdit");if a then for _,w in ipairs(a:allWindows()) do if w:title():find("askthis%-ime%-fixture") and w:isFullScreen() then w:setFullScreen(false) end end end;return "restored"')),
            ('fixture', lambda: subprocess.run(['osascript', '-e', 'tell application "TextEdit" to close (documents whose name is "askthis-ime-fixture.txt") saving no'], capture_output=True, check=True)),
            ('native state', lambda: hs('hs.keycodes.currentSourceID(' + json.dumps(source) + ');if _askthisIMEClipboard then hs.pasteboard.writeAllData(_askthisIMEClipboard) end;if _askthisIMEPointer then hs.mouse.absolutePosition(_askthisIMEPointer) end;if _askthisIMEFront then _askthisIMEFront:activate() end;_askthisIMEClipboard=nil;_askthisIMEPointer=nil;_askthisIMEFront=nil;return "restored"')),
            ('temporary profile', lambda: shutil.rmtree(tmp)),
        ]
        for name, action in actions:
            try:
                action()
            except Exception as exc:
                e2e.check('cleanup ' + name, False, repr(exc))
        (shots / 'results.json').write_text(json.dumps({'probeLevel': args.probe_level, 'results': e2e.RESULTS, 'metrics': metrics}, ensure_ascii=False, indent=2))
        print(f'RESULT: {sum(ok for _,ok,_ in e2e.RESULTS)}/{len(e2e.RESULTS)} passed')
    return 0 if e2e.RESULTS and all(ok for _,ok,_ in e2e.RESULTS) else 1


if __name__ == '__main__':
    raise SystemExit(main())
