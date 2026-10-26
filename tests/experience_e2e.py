#!/usr/bin/env python3
"""Native popup experience regression; isolated local SSE fixture, never user keys.

Screenshots are real macOS window crops. Requires the same dependencies as e2e.py.
Quit the regular AskThis first to release its hotkey. --baseline captures old UI.
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

import e2e
from manual_input_e2e import hs, wait_for, settings_target


class ExperienceHandler(e2e.MockHandler):
    requests = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        type(self).requests.append(body)
        question = body['messages'][-1]['content']
        long = 'LONG' in question
        answer = ('### 渐进披露\n先给出此刻最需要的信息，再按意图展开更多细节。\n\n'
                  '**在速查里**：让问题、回答和下一步各有位置，而不是同时堆满所有操作。\n\n'
                  '- 输入时专注表达\n- 阅读时专注答案\n- 追问时保留上下文\n\n'
                  '> 本地测试内容，不消耗模型额度。')
        if long:
            answer += '\n\n' + '\n\n'.join(f'**细节 {i}** — 这是一段用于验证长回答滚动的测试内容。阅读旧内容时，新增文字不应把视线拉走。' for i in range(1, 19))
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Connection', 'close')
        self.end_headers()
        try:
            time.sleep(0.5)
            reasoning = {'choices': [{'delta': {'reasoning_content': '正在整理这段文字的含义。'}}]}
            self.wfile.write(f'data: {json.dumps(reasoning)}\n\n'.encode())
            self.wfile.flush()
            time.sleep(0.5)
            for i in range(0, len(answer), 32):
                chunk = {'choices': [{'delta': {'content': answer[i:i + 32]}}]}
                self.wfile.write(f'data: {json.dumps(chunk)}\n\n'.encode())
                self.wfile.flush()
                time.sleep(0.1)
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--packaged', action='store_true')
    parser.add_argument('--screenshots', required=True)
    args = parser.parse_args()
    shots = Path(args.screenshots).resolve()
    shots.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='askthis-experience-', dir=os.environ.get('TMPDIR')))
    proc = cdp = mock = None
    source = hs('return hs.keycodes.currentSourceID()').strip()
    hs('_askthisExperienceClipboard=hs.pasteboard.readAllData(); _askthisExperiencePointer=hs.mouse.absolutePosition(); return "saved"')
    fixture = tmp / 'askthis-experience-fixture.txt'
    fixture.write_text('渐进披露：让界面只呈现此刻需要的信息。', encoding='utf-8')
    try:
        mock = e2e.ThreadingHTTPServer(('127.0.0.1', e2e.MOCK_PORT), ExperienceHandler)
        threading.Thread(target=mock.serve_forever, daemon=True).start()
        cfg = {'version': 2, 'locale': 'zh-CN', 'theme': 'light', 'shortcut': 'Alt+Shift+D',
               'launchAtLogin': False, 'selectionMode': 'auto', 'clipboardFallback': False,
               'providers': [{'id': 'fixture', 'name': 'Local fixture', 'kind': 'openai-compatible',
                              'baseUrl': f'http://127.0.0.1:{e2e.MOCK_PORT}/v1',
                              'models': [{'id': 'local-fixture', 'reasoning': True}], 'reasoningStyle': 'none'}],
               'activeProviderId': 'fixture', 'activeModelId': 'local-fixture'}
        (tmp / 'config.json').write_text(json.dumps(cfg))
        exe = str(Path(e2e.ROOT) / ('release/mac-arm64/AskThis.app/Contents/MacOS/AskThis' if args.packaged else 'node_modules/.bin/electron'))
        proc = subprocess.Popen([exe] + ([] if args.packaged else ['.']) + [f'--user-data-dir={tmp}', f'--remote-debugging-port={e2e.CDP_PORT}', '--remote-allow-origins=*'], cwd=e2e.ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target = e2e.find_popup_target()
        if not target:
            raise RuntimeError('No popup target')
        cdp = e2e.CDP(target['webSocketDebuggerUrl'])
        st = wait_for(settings_target)
        if st:
            settings = e2e.CDP(st['webSocketDebuggerUrl'])
            settings.ev('window.close()')
            settings.close()
        time.sleep(0.3)

        def key(mods, key):
            hs(f'hs.eventtap.keyStroke({json.dumps(mods).replace("[", "{").replace("]", "}")}, {json.dumps(key)}, 0); return "key"')
            # Event posting returns before the app/IME has processed the key.
            time.sleep(0.08)

        def type_text(text):
            hs(f'hs.eventtap.keyStrokes({json.dumps(text, ensure_ascii=False)}); return "typed"')
            time.sleep(0.15)

        def popup_frame():
            bundle = 'com.askthis.app' if args.packaged else 'com.github.Electron'
            return json.loads(hs('local a=hs.application.get(' + json.dumps(bundle) + '); for _,w in ipairs(a:allWindows()) do local f=w:frame(); if f.w<700 and w:isVisible() then return hs.json.encode({x=f.x,y=f.y,w=f.w,h=f.h}) end end; return "null"'))

        def capture(name):
            time.sleep(0.25)
            f = popup_frame()
            if not f:
                raise RuntimeError('Native popup not visible for screenshot')
            rect = ','.join(str(round(f[k])) for k in ['x', 'y', 'w', 'h'])
            subprocess.run(['screencapture', '-x', '-R' + rect, str(shots / (name + '.png'))], check=True)

        def click(selector):
            r = cdp.ev('(() => { const r=document.querySelector(' + json.dumps(selector) + ').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()')
            f = popup_frame()
            point = '{x=' + str(f['x'] + r['x']) + ',y=' + str(f['y'] + r['y']) + '}'
            hs('hs.eventtap.leftClick(' + point + '); return "clicked"')
            time.sleep(0.15)

        def patch_settings(patch):
            cdp.ev('window.api.app.openSettings()')
            info = wait_for(settings_target)
            if not info:
                raise RuntimeError('Settings target did not appear')
            settings = e2e.CDP(info['webSocketDebuggerUrl'])
            try:
                ready = wait_for(lambda: settings.ev('document.readyState === "complete" && !!window.api?.config') is True)
                if not ready:
                    raise RuntimeError('Settings preload is not ready')
                settings.ev('window.api.config.patch(' + json.dumps(patch) + ')')
                actual = settings.ev('window.api.config.get()')
                if not isinstance(actual, dict) or any(actual.get(k) != v for k, v in patch.items()):
                    raise RuntimeError('Isolated settings patch did not persist')
                settings.ev('window.close()')
            finally:
                settings.close()

        def done():
            return wait_for(lambda: not cdp.ev('!!document.querySelector(".cursor,.waiting")') and cdp.ev('!!Array.from(document.querySelectorAll(".turn")).at(-1)?.querySelector(".turn__a")'), 20)

        subprocess.run(['open', '-a', 'TextEdit', str(fixture)], check=True)
        time.sleep(0.8)
        hs('hs.application.get("com.apple.TextEdit"):activate(); hs.keycodes.currentSourceID("com.apple.keylayout.ABC"); return "active"')
        time.sleep(0.25)
        key(['cmd'], 'right')  # explicit empty selection in a known editable app
        subprocess.run(['pbcopy'], input='STALE_CLIPBOARD', text=True, check=True)
        key(['alt', 'shift'], 'd')
        focused = wait_for(lambda: cdp.ev('document.hasFocus() && document.activeElement?.classList.contains("composer__input")'), 6)
        e2e.check('native no-selection shortcut focuses empty composer without a request', bool(focused) and not ExperienceHandler.requests)
        capture('empty')
        type_text('什么是渐进披露？')
        key([], 'return')
        time.sleep(0.35)
        capture('waiting')
        if not args.baseline:
            type_text('举个贴近速查的例子')
            key([], 'return')
            e2e.check('busy Enter keeps an editable draft without creating a request', len(ExperienceHandler.requests) == 1 and cdp.ev('document.querySelector(".composer__input").value') == '举个贴近速查的例子')
        e2e.check('manual first answer completes', bool(done()))
        capture('answer')
        if not args.baseline:
            e2e.check('manual first query switches to follow-up semantics', cdp.ev('document.querySelector(".composer__input").placeholder.includes("追问")') is True)
            e2e.check('completion preserves native focus and the next-question draft', cdp.ev('document.hasFocus() && document.activeElement?.classList.contains("composer__input") && document.activeElement.value === "举个贴近速查的例子"') is True)
            click('button[aria-label=发送]')
        else:
            click('.composer__input')
            type_text('举个贴近速查的例子')
            key([], 'return')
        e2e.check('native keyboard follow-up completes', bool(done()) and cdp.ev('document.querySelectorAll(".turn").length') == 2)
        capture('follow-up')
        e2e.check('request retains actual first answer as conversation context', len(ExperienceHandler.requests) == 2 and any(m['role'] == 'assistant' for m in ExperienceHandler.requests[-1]['messages']))
        if not args.baseline:
            click('.turn:last-of-type button[aria-label=复制结果]')
            e2e.check('native contextual copy preserves the conversation', '渐进披露' in subprocess.check_output(['pbpaste'], text=True) and bool(popup_frame()))
            request_count = len(ExperienceHandler.requests)
            click('.turn:last-of-type button[aria-label=重新生成]')
            wait_for(lambda: len(ExperienceHandler.requests) > request_count)
            e2e.check('native regenerate replaces rather than adds a turn', bool(done()) and cdp.ev('document.querySelectorAll(".turn").length') == 2)
            click('.composer__input')
            type_text('LONG')
            key(['shift'], 'return')
            type_text('多行问题')
            e2e.check('native Shift+Enter inserts newline without submitting', len(ExperienceHandler.requests) == request_count + 1 and '\n' in cdp.ev('document.querySelector(".composer__input").value'))
            click('button[aria-label=发送]')
            wait_for(lambda: cdp.ev('Array.from(document.querySelectorAll(".turn__a")).at(-1)?.textContent.length > 650'), 10)
            time.sleep(0.3)
            e2e.check('long stream automatically follows the latest text', cdp.ev('(() => {const b=document.querySelector(".body");return b.scrollTop>100 && b.scrollHeight-b.scrollTop-b.clientHeight<8})()') is True)
            f = popup_frame()
            hs('hs.mouse.absolutePosition({x=' + str(f['x'] + 180) + ',y=' + str(f['y'] + 170) + '}); hs.eventtap.scrollWheel({0,700},{},"pixel"); return "scroll up"')
            wait_for(lambda: cdp.ev('!!document.querySelector(".latest")'))
            time.sleep(0.5)
            top = float(cdp.ev('document.querySelector(".body").scrollTop'))
            time.sleep(0.6)
            after_top = float(cdp.ev('document.querySelector(".body").scrollTop'))
            e2e.check('native scrolling up is respected during streaming', abs(after_top - top) < 3 and cdp.ev('!!document.querySelector(".latest")') is True, f'scrollTop {top} -> {after_top}')
            click('.composer__input')
            type_text('下一问')
            for line in ['第二行', '第三行', '第四行']:
                key(['shift'], 'return')
                type_text(line)
            e2e.check('latest action stays above a growing multiline composer', cdp.ev('document.querySelector(".latest").getBoundingClientRect().bottom <= document.querySelector(".composer").getBoundingClientRect().top') is True)
            capture('reading-history')
            click('.latest')
            e2e.check('back-to-latest resumes following', cdp.ev('(() => {const b=document.querySelector(".body");return b.scrollHeight-b.scrollTop-b.clientHeight<8})()') is True)
            e2e.check('long stream completes', bool(done()))
            capture('long-answer')
        key([], 'escape')
        hs('hs.application.get("com.apple.TextEdit"):activate(); return "activate fixture"')
        time.sleep(0.25)
        key(['cmd'], 'a')
        request_count = len(ExperienceHandler.requests)
        key(['alt', 'shift'], 'd')
        selected = wait_for(lambda: len(ExperienceHandler.requests) > request_count and cdp.ev('document.querySelector(".turn__q-text")?.textContent.includes("渐进披露")') is True)
        e2e.check('native selection shortcut queries selected text', bool(selected) and bool(done()))
        capture('selection')
        if not args.baseline:
            e2e.check('selection lookup does not steal focus from the source app', cdp.ev('document.hasFocus()') is False and 'com.apple.TextEdit' in hs('return hs.application.frontmostApplication():bundleID()'))
        key([], 'escape')
        if not args.baseline:
            patch_settings({'theme': 'dark', 'windowWidth': 340, 'maxWindowHeight': 200, 'locale': 'en-US'})
            hs('hs.application.get("com.apple.TextEdit"):activate(); return "activate fixture"')
            time.sleep(0.25)
            key(['cmd'], 'right')
            key(['alt', 'shift'], 'd')
            wait_for(lambda: cdp.ev('document.hasFocus() && document.querySelectorAll(".turn").length===0 && document.activeElement?.classList.contains("composer__input")'))
            type_text('A question at narrow width')
            key([], 'return')
            wait_for(lambda: cdp.ev('document.querySelector(".turn__q-text")?.textContent === "A question at narrow width"'))
            e2e.check('dark narrow-width English answer completes', bool(done()))
            e2e.check('narrow card has no horizontal overflow or clipped composer', cdp.ev('(() => {const f=document.querySelector(".composer__field").getBoundingClientRect(); return document.documentElement.scrollWidth<=innerWidth && f.right<innerWidth && f.left>=0 && matchMedia("(prefers-color-scheme: dark)").matches})()') is True)
            capture('dark-narrow')
            click('.composer__input')
            type_text('A multiline draft')
            for line in ['line two', 'line three', 'line four', 'line five']:
                key(['shift'], 'return')
                type_text(line)
            e2e.check('minimum-height multiline composer and hints stay inside the card', cdp.ev('(() => {const c=document.querySelector(".popup-card").getBoundingClientRect(), f=document.querySelector(".composer__hints").getBoundingClientRect(), i=document.querySelector(".composer__input"); return f.bottom<=c.bottom && i.getBoundingClientRect().height<=32 && i.value.includes("line five") && i.placeholder.includes("follow-up")})()') is True)
            capture('minimum-height-draft')
            key([], 'escape')
            patch_settings({'theme': 'light', 'windowWidth': 480, 'maxWindowHeight': 560, 'locale': 'zh-CN'})
            hs('local a=hs.application.get("com.apple.TextEdit"); a:activate(); a:focusedWindow():setFullScreen(true); return "fullscreen"')
            full = wait_for(lambda: hs('return tostring(hs.application.get("com.apple.TextEdit"):focusedWindow():isFullScreen())').strip() == 'true', 6)
            time.sleep(0.8)
            key(['cmd'], 'right')
            key(['alt', 'shift'], 'd')
            focus = wait_for(lambda: cdp.ev('document.hasFocus() && document.querySelectorAll(".turn").length===0'), 5)
            e2e.check('native fullscreen Space opens a visible focused blank popup', bool(full) and bool(focus) and bool(popup_frame()))
            capture('fullscreen-empty')
            subprocess.run(['screencapture', '-x', str(shots / 'fullscreen-space.png')], check=True)
            cdp.ev('window.__ime=[]; for(const type of ["compositionstart","compositionend","keydown"]) document.addEventListener(type,e=>window.__ime.push({type,key:e.key,composing:e.isComposing}))')
            hs('hs.keycodes.setMethod("Pinyin – Simplified"); return hs.keycodes.currentSourceID()')
            time.sleep(0.35)
            for letter in 'nihao':
                key([], letter)
            time.sleep(0.25)
            composing = cdp.ev('window.__ime.some(e=>e.type==="compositionstart")') is True
            request_count = len(ExperienceHandler.requests)
            capture('ime-candidates')
            key([], 'return')
            marked = cdp.ev('document.querySelector(".composer__input").value')
            e2e.check('real system Pinyin Enter confirms marked text without sending', composing and len(ExperienceHandler.requests) == request_count and bool(marked), json.dumps({'marked': marked, 'events': cdp.ev('window.__ime')}, ensure_ascii=False))
            key([], 'return')
            wait_for(lambda: len(ExperienceHandler.requests) > request_count)
            e2e.check('second native Enter sends the confirmed text', len(ExperienceHandler.requests) == request_count + 1 and ExperienceHandler.requests[-1]['messages'][-1]['content'] == marked and bool(done()))
            for letter in 'nihao':
                key([], letter)
            time.sleep(0.25)
            subprocess.run(['screencapture', '-x', str(shots / 'pinyin-fullscreen.png')], check=True)
            key([], '1')
            chinese = cdp.ev('document.querySelector(".composer__input").value')
            e2e.check('real Pinyin candidate selection inserts Chinese without sending', len(ExperienceHandler.requests) == request_count + 1 and any('\u4e00' <= ch <= '\u9fff' for ch in chinese), chinese)
            for letter in 'zhong':
                key([], letter)
            key([], 'escape')
            e2e.check('real Pinyin Esc cancels candidates without dismissing popup', cdp.ev('document.hasFocus()') is True and bool(popup_frame()))
            hs('hs.keycodes.currentSourceID("com.apple.keylayout.ABC"); return "ABC"')
            key([], 'escape')
            e2e.check('non-composing Esc still dismisses popup', bool(wait_for(lambda: not bool(popup_frame()), 3)))
    except Exception as exc:
        e2e.check('native suite completes without driver errors', False, str(exc))
    finally:
        def stop_process():
            if proc:
                proc.terminate()
                try:
                    proc.wait(5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()

        def stop_mock():
            if mock:
                try:
                    mock.shutdown()
                finally:
                    mock.server_close()

        cleanup = [
            ('CDP connection', lambda: cdp.close() if cdp else None),
            ('test process', stop_process),
            ('local server', stop_mock),
            ('native fixture state', lambda: hs('local a=hs.application.get("com.apple.TextEdit"); if a then for _,w in ipairs(a:allWindows()) do if w:title():find("askthis%-experience%-fixture") and w:isFullScreen() then w:setFullScreen(false) end end end; if _askthisExperiencePointer then hs.mouse.absolutePosition(_askthisExperiencePointer); _askthisExperiencePointer=nil end; return "native state restored"')),
            ('fixture window', lambda: subprocess.run(['osascript', '-e', 'tell application "TextEdit" to close (documents whose name is "askthis-experience-fixture.txt") saving no'], capture_output=True, check=True)),
            ('input source', lambda: hs(f'hs.keycodes.currentSourceID({json.dumps(source)}); return "source restored"')),
            ('clipboard', lambda: hs('if _askthisExperienceClipboard then hs.pasteboard.writeAllData(_askthisExperienceClipboard); _askthisExperienceClipboard=nil end; return "clipboard restored"')),
            ('temporary user data', lambda: shutil.rmtree(tmp)),
        ]
        for name, action in cleanup:
            try:
                action()
            except Exception as exc:
                e2e.check('cleanup: ' + name, False, str(exc))
        print(f'RESULT: {sum(ok for _,ok,_ in e2e.RESULTS)}/{len(e2e.RESULTS)} passed')
    return 0 if e2e.RESULTS and all(ok for _, ok, _ in e2e.RESULTS) else 1


if __name__ == '__main__':
    raise SystemExit(main())
