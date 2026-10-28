#!/usr/bin/env python3
"""Focused source/focus visual regression. Isolated profile and distinct hotkey.
Local SSE fixture only; never reads user's providers or talks to online models.
Run after npm run build. --baseline records expected pre-change failures.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from typing import Any, cast

import e2e
from manual_input_e2e import hs, wait_for, settings_target


class SourceHandler(e2e.MockHandler):
    requests = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        type(self).requests.append(body)
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Connection', 'close')
        self.end_headers()
        answer = '**幂等**：同一个操作执行一次或多次，结果相同。\n\n例如把开关设为“关”，重复设置也不会改变最终状态。'
        try:
            for part in [answer[:16], answer[16:]]:
                payload = {'choices': [{'delta': {'content': part}}]}
                self.wfile.write(f'data: {json.dumps(payload)}\n\n'.encode())
                self.wfile.flush()
                time.sleep(.15)
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--screenshots', required=True)
    args = parser.parse_args()
    shots = Path(args.screenshots).resolve()
    shots.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='askthis-source-', dir=os.environ.get('TMPDIR')))
    proc = cdp = server = None
    metrics = {}
    e2e.RESULTS.clear()
    e2e.CDP_PORT = 9239
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', e2e.CDP_PORT))
    hs('_askthisSourceClipboard=hs.pasteboard.readAllData(); _askthisSourcePointer=hs.mouse.absolutePosition(); _askthisSourceFront=hs.application.frontmostApplication(); return "saved"')
    try:
        server = e2e.ThreadingHTTPServer(('127.0.0.1', 0), SourceHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cfg = {'version': 2, 'locale': 'zh-CN', 'theme': 'light',
               'shortcut': 'Ctrl+Alt+Shift+9', 'launchAtLogin': False,
               'selectionMode': 'clipboard', 'historyEnabled': False,
               'windowWidth': 480, 'maxWindowHeight': 560,
               'providers': [{'id': 'fixture', 'name': 'Local visual fixture',
                              'kind': 'openai-compatible',
                              'baseUrl': f'http://127.0.0.1:{server.server_port}/v1',
                              'models': [{'id': 'local-fixture', 'reasoning': False}],
                              'reasoningStyle': 'none'}],
               'activeProviderId': 'fixture', 'activeModelId': 'local-fixture'}
        (tmp / 'config.json').write_text(json.dumps(cfg))
        proc = subprocess.Popen([str(Path(e2e.ROOT) / 'node_modules/.bin/electron'), '.',
                                 f'--user-data-dir={tmp}', f'--remote-debugging-port={e2e.CDP_PORT}',
                                 '--remote-allow-origins=*'], cwd=e2e.ROOT,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target = e2e.find_popup_target()
        if not target:
            raise RuntimeError('Isolated popup target not found')
        cdp = e2e.CDP(target['webSocketDebuggerUrl'])
        info = wait_for(settings_target)
        if not info:
            raise RuntimeError('Settings target not found')
        settings = e2e.CDP(info['webSocketDebuggerUrl'])
        wait_for(lambda: settings.ev('document.readyState === "complete" && !!window.api?.config'))
        settings.ev('window.close()')
        settings.close()

        def patch_config(patch):
            cdp.ev('window.api.app.openSettings()')
            info = wait_for(settings_target)
            if not info:
                raise RuntimeError('Settings target not found during configuration patch')
            s = e2e.CDP(info['webSocketDebuggerUrl'])
            try:
                if not wait_for(lambda: s.ev('document.readyState === "complete" && !!window.api?.config')):
                    raise RuntimeError('Settings preload not ready')
                s.ev('window.api.config.patch(' + json.dumps(patch) + ')')
                actual = s.ev('window.api.config.get()')
                assert all(actual[k] == v for k, v in patch.items()), 'isolated configuration readback'
                s.ev('window.close()')
            finally:
                s.close()

        def lookup(text):
            cdp.ev('window.api.popup.close()')
            subprocess.run(['pbcopy'], input=text, text=True, check=True)
            before = len(SourceHandler.requests)
            hs('hs.mouse.absolutePosition({x=440,y=200}); hs.eventtap.keyStroke({"ctrl","alt","shift"},"9",0); return "triggered"')
            if not wait_for(lambda: len(SourceHandler.requests) > before, 8):
                raise RuntimeError('Distinct test shortcut failed')
            if not wait_for(lambda: cdp.ev('document.querySelector(".popup-shell")?.dataset.status === "done"'), 10):
                raise RuntimeError('Local fixture did not finish')
            time.sleep(.2)

        def capture(name):
            # Read-only capture of the actual Electron renderer, not an HTML recreation.
            cdp.mid += 1
            cdp.ws.send(json.dumps({'id': cdp.mid, 'method': 'Page.captureScreenshot', 'params': {'format': 'png'}}))
            while True:
                msg = json.loads(cdp.ws.recv())
                if msg.get('id') == cdp.mid:
                    (shots / f'{name}.png').write_bytes(base64.b64decode(msg['result']['data']))
                    break
            metrics[name] = cdp.ev('''(()=>{const r={}; for(const s of ['.head','.body','.turn__q','.turn__q-badge','.turn__q-text','.turn__a','.composer','.composer__field']) {const e=document.querySelector(s), b=e.getBoundingClientRect(), c=getComputedStyle(e); r[s]={x:b.x,y:b.y,w:b.width,h:b.height,border:c.borderLeftWidth,bg:c.backgroundColor,color:c.color,font:c.fontSize,lineHeight:c.lineHeight,padding:c.padding};} return r})()''')

        def source_checks(label):
            e2e.check(label + ': source and follow-up have no border, background or decorative pseudo-elements', cdp.ev('''Array.from(document.querySelectorAll('.turn__q')).every(e=>{const c=getComputedStyle(e);return ['Top','Right','Bottom','Left'].every(side=>parseFloat(c['border'+side+'Width'])===0) && c.backgroundColor==='rgba(0, 0, 0, 0)' && ['::before','::after'].every(p=>['none','normal'].includes(getComputedStyle(e,p).content))})''') is True)
            e2e.check(label + ': question aligns to answer edge without inset', cdp.ev('''Array.from(document.querySelectorAll('.turn')).every(e=>{const q=e.querySelector('.turn__q'),a=e.querySelector('.turn__a');return Math.abs(q.getBoundingClientRect().x-a.getBoundingClientRect().x)<1 && getComputedStyle(q).paddingLeft==='0px'})''') is True)
            e2e.check(label + ': source label remains visible and answer type stays 14px', cdp.ev('''getComputedStyle(document.querySelector('.turn__q-badge')).fontSize==='10px' && getComputedStyle(document.querySelector('.turn__a')).fontSize==='14px' && document.querySelector('.turn__q-badge').textContent.length>0''') is True)
            e2e.check(label + ': text wraps without horizontal overflow', cdp.ev('''document.documentElement.scrollWidth<=innerWidth && Array.from(document.querySelectorAll('.turn__q-text')).every(e=>e.scrollWidth<=e.clientWidth+1)''') is True)

        lookup('什么是幂等？')
        capture('light-short')
        source_checks('light')
        cdp.ev('document.activeElement?.blur()')
        time.sleep(.2)
        before = float(cdp.ev('document.querySelector(".popup-card").getBoundingClientRect().height'))
        unfocused = cdp.ev('getComputedStyle(document.querySelector(".composer__field")).borderColor')
        cdp.ev('document.querySelector(".composer__input").focus()')
        time.sleep(.2)
        focus = cast(dict[str, Any], cdp.ev('''(()=>{const c=getComputedStyle(document.querySelector('.composer__field'));return {border:c.borderColor,width:c.borderWidth,shadow:c.boxShadow}})()'''))
        e2e.check('focus: single neutral hairline with no halo', focus['width'] == '1px' and focus['shadow'] == 'none' and cdp.ev('''(()=>{const c=getComputedStyle(document.querySelector('.composer__field')).borderColor;const el=document.createElement('span');el.style.color='var(--popup-focus)';document.querySelector('.popup-card').append(el);const expected=getComputedStyle(el).color;el.remove();return c===expected})()''') is True)
        e2e.check('focus: remains visible and never resizes popup', focus['border'] != unfocused and abs(float(cdp.ev('document.querySelector(".popup-card").getBoundingClientRect().height')) - before) < 1)
        capture('light-focused')
        cdp.ev('''(()=>{const e=document.querySelector('.composer__input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'举一个例子');e.dispatchEvent(new Event('input',{bubbles:true}));})()''')
        e2e.check('draft remains editable', cdp.ev('document.querySelector(".composer__input").value === "举一个例子"') is True)
        capture('light-draft')
        count = len(SourceHandler.requests)
        cdp.ev('document.querySelector(".composer__action").click()')
        if not wait_for(lambda: len(SourceHandler.requests) > count and cdp.ev('document.querySelector(".popup-shell").dataset.status === "done"')):
            raise RuntimeError('Follow-up did not finish')
        source_checks('follow-up')
        e2e.check('follow-up preserves question and assistant context', cdp.ev('document.querySelectorAll(".turn").length===2') is True and any(m['role'] == 'assistant' for m in SourceHandler.requests[-1]['messages']))
        capture('light-follow-up')
        patch_config({'theme': 'dark', 'locale': 'en-US', 'windowWidth': 320, 'maxWindowHeight': 200})
        long_question = 'Idempotence\nHow does repeated execution preserve the same final state? ' + 'unbroken_long_word_' * 5
        lookup(long_question)
        source_checks('dark 320px multiline')
        e2e.check('original multiline question survives verbatim', cdp.ev('document.querySelector(".turn__q-text").textContent') == long_question)
        e2e.check('dark mode uses actual dark media query and remains bounded', cdp.ev('matchMedia("(prefers-color-scheme:dark)").matches && innerWidth === 320 && innerHeight <= 200') is True)
        capture('dark-minimum-long')
        cdp.ev('document.querySelector(".body").scrollTop=0')
        time.sleep(.15)
        capture('dark-minimum-source')
        patch_config({'windowWidth': 480, 'maxWindowHeight': 560, 'locale': 'zh-CN'})
        lookup('什么是幂等？')
        capture('dark-short')
    except Exception as exc:
        e2e.check('focused visual test driver completes', False, str(exc))
    finally:
        cleanup = [
            ('CDP', lambda: cdp.close() if cdp else None),
            ('process', lambda: (proc.terminate(), proc.wait(timeout=10)) if proc else None),
            ('server', lambda: (server.shutdown(), server.server_close()) if server else None),
            ('native state', lambda: hs('if _askthisSourceClipboard then hs.pasteboard.writeAllData(_askthisSourceClipboard) end; if _askthisSourcePointer then hs.mouse.absolutePosition(_askthisSourcePointer) end; if _askthisSourceFront then _askthisSourceFront:activate() end; _askthisSourceClipboard=nil; _askthisSourcePointer=nil; _askthisSourceFront=nil; return "restored"')),
            ('temporary profile', lambda: shutil.rmtree(tmp)),
        ]
        for name, action in cleanup:
            try:
                action()
            except Exception as exc:
                e2e.check('cleanup ' + name, False, str(exc))
        report = {'baseline': args.baseline, 'results': e2e.RESULTS, 'metrics': metrics,
                  'fixture_requests': len(SourceHandler.requests)}
        (shots / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(f'RESULT: {sum(ok for _, ok, _ in e2e.RESULTS)}/{len(e2e.RESULTS)} passed')
    return 0 if e2e.RESULTS and all(ok for _, ok, _ in e2e.RESULTS) else 1


if __name__ == '__main__':
    raise SystemExit(main())
