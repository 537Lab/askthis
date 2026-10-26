#!/usr/bin/env python3
"""Focused native layout regression, reusing the existing local SSE fixture.

No online calls or user configuration. --baseline captures the previous design
and records expected failures of the new compact-layout requirements.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
from typing import Any, cast

import e2e
from experience_e2e import ExperienceHandler
from manual_input_e2e import hs, wait_for, settings_target


class AdaptiveHandler(ExperienceHandler):
    requests = []

    def do_POST(self):
        # Use the original fixture unchanged for the screenshot comparison.
        if self.path == '/short/chat/completions':
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            type(self).requests.append(body)
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Connection', 'close')
            self.end_headers()
            text = '幂等：同一个操作执行一次或多次，结果相同。例如把开关设为“关”，重复设置也不会改变最终状态。'
            payload = {'choices': [{'delta': {'content': text}}]}
            self.wfile.write(f'data: {json.dumps(payload)}\n\ndata: [DONE]\n\n'.encode())
            self.wfile.flush()
        else:
            super().do_POST()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--packaged', action='store_true')
    parser.add_argument('--screenshots', required=True)
    args = parser.parse_args()
    shots = Path(args.screenshots).resolve()
    shots.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='askthis-adaptive-', dir=os.environ.get('TMPDIR')))
    proc = cdp = mock = None
    metrics = {}
    bundle = 'com.askthis.app' if args.packaged else 'com.github.Electron'
    hs('_askthisAdaptiveClipboard=hs.pasteboard.readAllData(); _askthisAdaptivePointer=hs.mouse.absolutePosition(); return "saved"')
    try:
        cfg = {'version': 2, 'locale': 'zh-CN', 'theme': 'light', 'shortcut': 'Alt+Shift+D',
               'launchAtLogin': False, 'selectionMode': 'clipboard', 'historyEnabled': False,
               'windowWidth': 480, 'maxWindowHeight': 560,
               'providers': [{'id': 'fixture', 'name': 'Local fixture', 'kind': 'openai-compatible',
                              'baseUrl': f'http://127.0.0.1:{e2e.MOCK_PORT}/v1',
                              'models': [{'id': 'local-fixture', 'reasoning': True}], 'reasoningStyle': 'none'}],
               'activeProviderId': 'fixture', 'activeModelId': 'local-fixture'}
        (tmp / 'config.json').write_text(json.dumps(cfg))
        mock = e2e.ThreadingHTTPServer(('127.0.0.1', e2e.MOCK_PORT), AdaptiveHandler)
        threading.Thread(target=mock.serve_forever, daemon=True).start()
        exe = str(Path(e2e.ROOT) / ('release/mac-arm64/AskThis.app/Contents/MacOS/AskThis' if args.packaged else 'node_modules/.bin/electron'))
        proc = subprocess.Popen([exe] + ([] if args.packaged else ['.']) + [f'--user-data-dir={tmp}', f'--remote-debugging-port={e2e.CDP_PORT}', '--remote-allow-origins=*'], cwd=e2e.ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target = e2e.find_popup_target()
        if not target:
            raise RuntimeError('No popup target')
        cdp = e2e.CDP(target['webSocketDebuggerUrl'])
        info = wait_for(settings_target)
        if not info:
            raise RuntimeError('No settings target')
        settings = e2e.CDP(info['webSocketDebuggerUrl'])
        wait_for(lambda: settings.ev('document.readyState === "complete" && !!window.api?.config'))
        settings.ev('window.close()')
        settings.close()

        def key(mods, keyname):
            hs(f'hs.eventtap.keyStroke({json.dumps(mods).replace("[", "{").replace("]", "}")}, {json.dumps(keyname)}, 0); return "key"')
            time.sleep(.12)

        def frame():
            return json.loads(hs('local a=hs.application.get(' + json.dumps(bundle) + '); for _,w in ipairs(a:allWindows()) do local f=w:frame(); if f.w<700 and w:isVisible() then return hs.json.encode({x=f.x,y=f.y,w=f.w,h=f.h}) end end; return "null"'))

        def capture(name):
            time.sleep(.25)
            f = frame()
            if not f:
                raise RuntimeError('Native popup missing')
            rect = ','.join(str(round(f[k])) for k in ['x', 'y', 'w', 'h'])
            subprocess.run(['screencapture', '-x', '-R' + rect, str(shots / (name + '.png'))], check=True)
            metrics[name] = {'native': f, 'layout': cdp.ev('(() => {let r={}; for(const s of [".head",".body",".turn__q",".turn__a",".turn__actions",".composer",".composer__hints"]){const e=document.querySelector(s), b=e?.getBoundingClientRect(); r[s]=b?{height:b.height,top:b.top,bottom:b.bottom}:null} return r})()')}

        def click(selector):
            r = cast(dict[str, Any], cdp.ev('(() => {const r=document.querySelector(' + json.dumps(selector) + ').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()'))
            f = frame()
            hs(f'hs.eventtap.leftClick({{x={f["x"] + r["x"]},y={f["y"] + r["y"]}}}); return "click"')
            time.sleep(.15)

        def type_text(text):
            hs(f'hs.eventtap.keyStrokes({json.dumps(text, ensure_ascii=False)}); return "typed"')
            time.sleep(.2)

        def done():
            return wait_for(lambda: cdp.ev('document.querySelector(".popup-shell")?.dataset.status === "done"'), 20)

        def lookup(text):
            key([], 'escape')
            subprocess.run(['pbcopy'], input=text, text=True, check=True)
            hs('hs.mouse.absolutePosition({x=450,y=200}); return "position"')
            before = len(AdaptiveHandler.requests)
            key(['alt', 'shift'], 'd')
            if not wait_for(lambda: len(AdaptiveHandler.requests) > before) or not done():
                raise RuntimeError('Fixture lookup did not complete')

        def patch_settings(patch):
            cdp.ev('window.api.app.openSettings()')
            info = wait_for(settings_target)
            if not info:
                raise RuntimeError('No settings target')
            s = e2e.CDP(info['webSocketDebuggerUrl'])
            try:
                wait_for(lambda: s.ev('document.readyState === "complete" && !!window.api?.config'))
                s.ev('window.api.config.patch(' + json.dumps(patch) + ')')
                actual = s.ev('window.api.config.get()')
                def includes(actual, expected):
                    if isinstance(expected, dict):
                        return isinstance(actual, dict) and all(includes(actual.get(k), v) for k, v in expected.items())
                    if isinstance(expected, list):
                        return isinstance(actual, list) and len(actual) == len(expected) and all(includes(a, b) for a, b in zip(actual, expected))
                    return actual == expected
                if not includes(actual, patch):
                    raise RuntimeError('Settings readback mismatch')
                s.ev('window.close()')
            finally:
                s.close()

        if not args.baseline:
            subprocess.run(['pbcopy'], input='', text=True, check=True)
            key(['alt', 'shift'], 'd')
            focused = wait_for(lambda: cdp.ev('document.hasFocus() && document.activeElement?.classList.contains("composer__input")'))
            e2e.check('blank capture keeps native input focus and makes no request', bool(focused) and not AdaptiveHandler.requests)
            e2e.check('blank input retains readable size and keyboard guidance', cdp.ev('getComputedStyle(document.querySelector(".composer__input")).fontSize === "15px" && document.querySelector(".composer__hints").getBoundingClientRect().height>0') is True)
            capture('empty')

        lookup('渐进披露：让界面只呈现此刻需要的信息。')
        capture('answer')
        e2e.check('idle follow-up is a visible one-line entry rather than a full editor', cdp.ev('document.querySelector(".composer").getBoundingClientRect().height < 65') is True)
        e2e.check('short source label shares a row with its text', cdp.ev('Math.abs(document.querySelector(".turn__q-badge").getBoundingClientRect().top-document.querySelector(".turn__q-text").getBoundingClientRect().top)<5') is True)
        e2e.check('readable answer typography is unchanged', cdp.ev('getComputedStyle(document.querySelector(".turn__a")).fontSize === "14px" && parseFloat(getComputedStyle(document.querySelector(".turn__a")).lineHeight)>24') is True)
        before_focus = frame()
        click('.composer__input')
        e2e.check('focusing an empty follow-up does not resize the native window', abs(frame()['h'] - before_focus['h']) <= 1)
        type_text('举个贴近速查的例子')
        capture('draft')
        e2e.check('draft reveals keyboard help', cdp.ev('document.querySelector(".composer__hints").getBoundingClientRect().height > 0') is True)
        key([], 'return')
        type_text('下一问的草稿')
        e2e.check('busy Enter never sends a second request or clears the draft', cdp.ev('document.querySelector(".composer__input").value === "下一问的草稿"') is True)
        count = len(AdaptiveHandler.requests)
        key([], 'return')
        e2e.check('busy submission guard holds', len(AdaptiveHandler.requests) == count)
        if not done():
            raise RuntimeError('Follow-up incomplete')
        e2e.check('completion preserves draft and native focus', cdp.ev('document.hasFocus() && document.activeElement.value === "下一问的草稿"') is True)
        e2e.check('follow-up retains assistant context', any(m['role'] == 'assistant' for m in AdaptiveHandler.requests[-1]['messages']))
        capture('follow-up')
        click('.turn:last-of-type button[aria-label=复制结果]')
        e2e.check('contextual copy keeps the popup open', bool(frame()) and '渐进披露' in subprocess.check_output(['pbpaste'], text=True))

        if not args.baseline:
            count = len(AdaptiveHandler.requests)
            click('.turn:last-of-type button[aria-label=重新生成]')
            requested = wait_for(lambda: len(AdaptiveHandler.requests) > count)
            e2e.check('regenerate keeps the turn count and the follow-up draft', bool(requested) and cdp.ev('document.querySelectorAll(".turn").length===2 && document.querySelector(".composer__input").value==="下一问的草稿"') is True)
            click('button[aria-label=停止]')
            e2e.check('stop stays available before the first answer token', bool(done()) and cdp.ev('!!document.querySelector(".turn:last-of-type button[aria-label=重新生成]")') is True)
            lookup('LONG')
            e2e.check('long response stays within configured native height and scrolls', frame()['h'] <= 560 and cdp.ev('document.querySelector(".body").scrollHeight>document.querySelector(".body").clientHeight') is True)
            # Explicit user scroll intent, followed by a multiline draft resize.
            f = frame()
            hs(f'hs.mouse.absolutePosition({{x={f["x"]+180},y={f["y"]+170}}}); hs.eventtap.scrollWheel({{0,700}},{{}},"pixel"); return "scroll"')
            wait_for(lambda: cdp.ev('!!document.querySelector(".latest")'))
            top = float(cdp.ev('document.querySelector(".body").scrollTop'))
            click('.composer__input')
            type_text('第一行')
            for line in ['第二行', '第三行', '第四行', '第五行']:
                key(['shift'], 'return')
                type_text(line)
            e2e.check('expanding draft preserves historical reading position', abs(float(cdp.ev('document.querySelector(".body").scrollTop')) - top) < 3)
            e2e.check('latest control clears the expanded draft', cdp.ev('document.querySelector(".latest").getBoundingClientRect().bottom<=document.querySelector(".composer").getBoundingClientRect().top') is True)
            capture('long-reading')
            click('.latest')
            e2e.check('latest resumes following after multiline expansion', cdp.ev('(()=>{const b=document.querySelector(".body");return b.scrollHeight-b.scrollTop-b.clientHeight<8})()') is True)

        key([], 'escape')
        cfg['providers'][0]['baseUrl'] = f'http://127.0.0.1:{e2e.MOCK_PORT}/short'
        patch_settings({'providers': cfg['providers']})
        lookup('幂等是什么？')
        capture('short')
        e2e.check('short lookup is content-sized without empty answer space', cdp.ev('document.querySelector(".body").scrollHeight<=document.querySelector(".body").clientHeight+1') is True)
        if not args.baseline:
            key([], 'escape')
            patch_settings({'theme': 'dark', 'locale': 'en-US', 'windowWidth': 340, 'maxWindowHeight': 200})
            lookup('Idempotence')
            click('.composer__input')
            type_text('line one')
            for line in ['line two', 'line three', 'line four', 'line five']:
                key(['shift'], 'return')
                type_text(line)
            e2e.check('dark English minimum-height multiline draft keeps all controls inside', cdp.ev('(()=>{const c=document.querySelector(".popup-card").getBoundingClientRect(), h=document.querySelector(".composer__hints").getBoundingClientRect(), a=document.querySelector(".composer__action").getBoundingClientRect();return h.bottom<=c.bottom && a.bottom<=c.bottom && document.documentElement.scrollWidth<=innerWidth && matchMedia("(prefers-color-scheme:dark)").matches && document.querySelector(".composer__input").value.includes("line five")})()') is True)
            capture('dark-minimum')
    except Exception as exc:
        e2e.check('focused suite driver completes', False, str(exc))
    finally:
        (shots / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2))
        def stop_process():
            if proc:
                proc.terminate()
                try:
                    proc.wait(8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()

        cleanup = [
            ('CDP', lambda: cdp.close() if cdp else None),
            ('process', stop_process),
            ('server', lambda: (mock.shutdown(), mock.server_close()) if mock else None),
            ('native state', lambda: hs('if _askthisAdaptiveClipboard then hs.pasteboard.writeAllData(_askthisAdaptiveClipboard); _askthisAdaptiveClipboard=nil end; if _askthisAdaptivePointer then hs.mouse.absolutePosition(_askthisAdaptivePointer); _askthisAdaptivePointer=nil end; return "restored"')),
            ('temporary user data', lambda: shutil.rmtree(tmp)),
        ]
        for name, action in cleanup:
            try:
                action()
            except Exception as exc:
                e2e.check('cleanup ' + name, False, str(exc))
        print(f'RESULT: {sum(ok for _,ok,_ in e2e.RESULTS)}/{len(e2e.RESULTS)} passed')
    return 0 if e2e.RESULTS and all(ok for _,ok,_ in e2e.RESULTS) else 1


if __name__ == '__main__':
    raise SystemExit(main())
