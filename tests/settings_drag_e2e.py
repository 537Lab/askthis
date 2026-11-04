#!/usr/bin/env python3
"""Real native settings drag regression. Isolated config, no model requests.
Requires macOS, Hammerspoon, and e2e.py dependencies. Run after npm run build.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import time
import urllib.request
from typing import Any
import Quartz  # type: ignore[import-not-found]

import e2e
from manual_input_e2e import hs, settings_target, wait_for


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packaged', action='store_true')
    parser.add_argument('--screenshots', required=True)
    args = parser.parse_args()
    shots = Path(args.screenshots).resolve()
    shots.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='askthis-settings-drag-', dir=os.environ.get('TMPDIR')))
    proc = cdp = inspector = None
    metrics = {}
    e2e.RESULTS.clear()
    e2e.CDP_PORT = 9242
    hs('_askthisDragPointer=hs.mouse.absolutePosition();_askthisDragFront=hs.application.frontmostApplication();return "saved"')
    try:
        assert hs('return tostring(hs.caffeinate.sessionProperties().CGSSessionScreenIsLocked or false)').strip() == 'false', 'Screen is locked'
        cfg = {'version': 2, 'locale': 'zh-CN', 'selectionMode': 'manual',
               'shortcut': 'Ctrl+Alt+Shift+8', 'launchAtLogin': False, 'historyEnabled': False}
        (tmp / 'config.json').write_text(json.dumps(cfg))
        exe = Path(e2e.ROOT) / 'node_modules/.bin/electron'
        if args.packaged:
            original = Path(e2e.ROOT) / 'release/mac-arm64/AskThis.app'
            isolated = tmp / 'AskThis.app'
            subprocess.run(['ditto', str(original), str(isolated)], check=True)
            info = isolated / 'Contents/Info.plist'
            data = plistlib.loads(info.read_bytes())
            data['CFBundleIdentifier'] = 'com.askthis.settings-drag-regression'
            info.write_bytes(plistlib.dumps(data))
            subprocess.run(['codesign', '--force', '--deep', '--sign', '-', '--entitlements', str(Path(e2e.ROOT) / 'node_modules/app-builder-lib/templates/entitlements.mac.plist'), str(isolated)], check=True, capture_output=True)
            payload = Path('Contents/Resources/app.asar')
            assert hashlib.sha256((original / payload).read_bytes()).digest() == hashlib.sha256((isolated / payload).read_bytes()).digest()
            exe = isolated / 'Contents/MacOS/AskThis'
        proc = subprocess.Popen([str(exe)] + ([] if args.packaged else ['.']) + [f'--user-data-dir={tmp}', f'--remote-debugging-port={e2e.CDP_PORT}', '--remote-allow-origins=*', '--inspect=9243'], cwd=e2e.ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not e2e.find_popup_target():
            raise RuntimeError('Test process did not start')
        info = wait_for(settings_target, 15)
        if not info:
            raise RuntimeError('No isolated settings target')
        cdp = e2e.CDP(info['webSocketDebuggerUrl'])
        if not wait_for(lambda: cdp.ev('!!document.querySelector(".sidebar__title") && document.body.classList.contains("is-mac")')):
            raise RuntimeError('Settings did not load')
        main_target = json.load(urllib.request.urlopen('http://127.0.0.1:9243/json/list', timeout=3))[0]
        inspector = e2e.CDP(main_target['webSocketDebuggerUrl'])
        native_pid = inspector.ev('process.pid')
        hs('hs.application.applicationForPID(' + str(native_pid) + '):activate(true);return "activated test settings"')
        time.sleep(1)

        def native(expr) -> Any:
            value = inspector.ev('(()=>{const w=process.mainModule.require("electron").BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("settings.html"));return ' + expr + '})()')
            if isinstance(value, str) and value.startswith('[JS ERR]'):
                raise RuntimeError(expr)
            return value

        native('w.setBounds({x:240,y:100,width:920,height:640}),w.show(),w.focus(),true')
        time.sleep(.3)

        def drag(label, x, y):
            before = native('w.getBounds()')
            sx, sy = before['x'] + x, before['y'] + y
            dx, dy = 80, 45
            def post(kind, x, y):
                event = Quartz.CGEventCreateMouseEvent(None, kind, (x, y), Quartz.kCGMouseButtonLeft)
                # Native titlebar dragging requires one nonzero event number
                # shared by down/drag/up on macOS 27 (zero gives false failures).
                Quartz.CGEventSetIntegerValueField(event, Quartz.kCGMouseEventNumber, 42)
                Quartz.CGEventSetIntegerValueField(event, Quartz.kCGMouseEventClickState, 1)
                Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
            post(Quartz.kCGEventLeftMouseDown, sx, sy)
            time.sleep(.1)
            for step in range(1, 9):
                px, py = sx + dx * step / 8, sy + dy * step / 8
                post(Quartz.kCGEventLeftMouseDragged, px, py)
                time.sleep(.03)
            post(Quartz.kCGEventLeftMouseUp, sx + dx, sy + dy)
            time.sleep(.2)
            after = native('w.getBounds()')
            metrics[label] = {'before': before, 'after': after}
            e2e.check(label + ': real mouse drag moves native window', abs(after['x'] - before['x'] - dx) <= 2 and abs(after['y'] - before['y'] - dy) <= 2, json.dumps(metrics[label]))
            native('w.setBounds(' + json.dumps(before) + '),true')
            time.sleep(.15)

        drag('top blank strip', 340, 16)
        drag('sidebar Settings title', 50, 50)
        # Navigation and forms remain normal clickable no-drag regions.
        r = cdp.ev('(()=>{const r=document.querySelectorAll(".sidebar__item")[4].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
        b = native('w.getBounds()')
        hs('hs.eventtap.leftClick({x=' + str(b['x'] + r['x']) + ',y=' + str(b['y'] + r['y']) + '});return "clicked"')
        e2e.check('native sidebar navigation remains clickable', bool(wait_for(lambda: cdp.ev('!!document.querySelector(".about__hero")'))))
        cdp.ev('document.querySelectorAll(".sidebar__item")[0].click()')
        wait_for(lambda: cdp.ev('!!document.querySelector("select")'))
        e2e.check('form controls are outside the drag regions', cdp.ev('Array.from(document.querySelectorAll("button,input,select,textarea")).every(e=>{for(let p=e;p;p=p.parentElement){if(getComputedStyle(p).webkitAppRegion==="drag")return false}return true})') is True)
        dragbar = cdp.ev('(()=>{const e=document.querySelector(".settings-dragbar");if(!e)return null;const r=e.getBoundingClientRect();return {height:r.height,width:r.width,region:getComputedStyle(e).webkitAppRegion,hidden:e.getAttribute("aria-hidden")}})()')
        metrics['dragbar'] = dragbar
        e2e.check('macOS top drag area spans window without layout shift', bool(dragbar) and dragbar['height'] == 30 and dragbar['width'] == 920 and dragbar['region'] == 'drag' and dragbar['hidden'] == 'true')
        cdp.ev('document.body.classList.remove("is-mac")')
        e2e.check('non-macOS leaves native titlebar behavior unchanged', cdp.ev('(()=>{const e=document.querySelector(".settings-dragbar");return !!e && getComputedStyle(e).display==="none" && getComputedStyle(document.querySelector(".sidebar__title")).webkitAppRegion!=="drag"})()') is True)
        cdp.ev('document.body.classList.add("is-mac")')
        b = native('w.getBounds()')
        subprocess.run(['screencapture', '-x', '-R' + ','.join(str(b[k]) for k in ['x', 'y', 'width', 'height']), str(shots / 'settings.png')], check=True)
    except Exception as exc:
        e2e.check('settings drag driver completes', False, repr(exc))
    finally:
        for name, action in [
            ('CDP', lambda: cdp.close() if cdp else None),
            ('inspector', lambda: inspector.close() if inspector else None),
            ('process', lambda: (proc.terminate(), proc.wait(timeout=10)) if proc else None),
            ('native state', lambda: hs('if _askthisDragPointer then hs.mouse.absolutePosition(_askthisDragPointer) end;if _askthisDragFront then _askthisDragFront:activate() end;_askthisDragPointer=nil;_askthisDragFront=nil;return "restored"')),
            ('temporary profile', lambda: shutil.rmtree(tmp)),
        ]:
            try:
                action()
            except Exception as exc:
                e2e.check('cleanup ' + name, False, repr(exc))
        (shots / 'results.json').write_text(json.dumps({'results': e2e.RESULTS, 'metrics': metrics}, ensure_ascii=False, indent=2))
        print(f'RESULT: {sum(ok for _,ok,_ in e2e.RESULTS)}/{len(e2e.RESULTS)} passed')
    return 0 if e2e.RESULTS and all(ok for _,ok,_ in e2e.RESULTS) else 1


if __name__ == '__main__':
    raise SystemExit(main())
