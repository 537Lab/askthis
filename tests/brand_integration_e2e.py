#!/usr/bin/env python3
"""Focused packaged-brand verification: no user profile, secrets or login-item changes.

Uses the real packaged payload in a temporary, uniquely identified bundle so
app.setLoginItemSettings(false) cannot disable the user's AskThis login item.
Only the test copy's bundle name/ID/signature differ; app.asar and icons must
match the original package byte-for-byte. No production source is injected.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, cast

from PIL import Image
import e2e
from manual_input_e2e import hs, wait_for

ROOT = Path(e2e.ROOT)
NS = {'s': 'http://www.w3.org/2000/svg'}


def debugging_port(profile, proc):
    """Only discover the endpoint published by this launch's fresh profile."""
    def read_port():
        if proc.poll() is not None:
            raise RuntimeError('test app exited before publishing DevToolsActivePort')
        try:
            lines = (profile / 'DevToolsActivePort').read_text().splitlines()
        except FileNotFoundError:
            return None
        if len(lines) < 2:  # Chromium may still be writing the file.
            return None
        port = int(lines[0])
        if not 1 <= port <= 65535 or not lines[1].startswith('/devtools/browser/'):
            raise RuntimeError('invalid test profile DevToolsActivePort')
        return port

    port = wait_for(read_port, 20)
    if not port:
        raise RuntimeError('test profile DevToolsActivePort not found; refusing CDP fallback')
    return port


def connect_packaged_target(port, clone, page):
    expected = (clone.resolve() / f'Contents/Resources/app.asar/out/renderer/{page}.html').as_uri()

    def find_target():
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=3) as response:
            targets = json.load(response)
        return next((t for t in targets if t.get('type') == 'page' and t.get('url') == expected), None)

    target = wait_for(find_target, 10)
    if not target:
        raise RuntimeError(f'packaged {page} target not found for this clone: {expected}')
    websocket_url = f'ws://127.0.0.1:{port}/devtools/page/{target["id"]}'
    if target.get('webSocketDebuggerUrl') != websocket_url:
        raise RuntimeError(f'packaged {page} websocket does not belong to this endpoint')
    connection = e2e.CDP(websocket_url)
    try:
        # Target metadata can be stale; verify the connected renderer before any writes.
        if connection.ev('location.href') != expected:
            raise RuntimeError(f'packaged {page} renderer URL does not belong to this clone')
    except Exception:
        connection.close()
        raise
    return connection


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def screenshot(cdp, path):
    cdp.mid += 1
    cdp.ws.send(json.dumps({'id': cdp.mid, 'method': 'Page.captureScreenshot',
                           'params': {'format': 'png'}}))
    while True:
        message = json.loads(cdp.ws.recv())
        if message.get('id') == cdp.mid:
            if 'error' in message:
                raise RuntimeError(message['error'])
            path.write_bytes(base64.b64decode(message['result']['data']))
            with Image.open(path) as image:
                image.verify()
            return


def inspect_logo(cdp: Any, selector, master, size):
    expected = ET.parse(ROOT / 'resources/brand' / master).getroot()
    group = expected.find('s:g', NS)
    assert group is not None
    path = group.find('s:path', NS)
    assert path is not None
    actual = cdp.ev('''(() => {const e=document.querySelector(%s),r=e.getBoundingClientRect();
      return {viewBox:e.getAttribute('viewBox'),transform:e.querySelector('g').getAttribute('transform'),
      path:e.querySelector('path').getAttribute('d'),fillRule:e.querySelector('path').getAttribute('fill-rule'),
      w:r.width,h:r.height,ink:getComputedStyle(e).color,
      text:getComputedStyle(document.body).getPropertyValue('--text').trim()}})()''' % json.dumps(selector))
    assert actual['viewBox'] == expected.attrib['viewBox']
    assert actual['transform'] == group.attrib['transform'] and actual['path'] == path.attrib['d']
    assert actual['fillRule'] == 'evenodd' and actual['w'] == size and actual['h'] == size
    assert cdp.ev('''(() => {const e=document.querySelector(%s),s=document.createElement('span');
      s.style.color='var(--text)';document.body.append(s);const ok=getComputedStyle(e).color===getComputedStyle(s).color;s.remove();return ok})()''' % json.dumps(selector)) is True
    return actual


def contrast(cdp: Any, logo, background):
    return cdp.ev(r'''(() => {const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
      const bg=e=>{while(e){const c=getComputedStyle(e).backgroundColor,v=c.match(/[\d.]+/g)||[];
        if(v.length===3 || Number(v[3])>0)return c;e=e.parentElement}return 'rgb(255,255,255)'};
      const lum=s=>{const c=rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
      const a=lum(getComputedStyle(document.querySelector(%s)).color),b=lum(bg(document.querySelector(%s)));
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})()''' % (json.dumps(logo), json.dumps(background)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--screenshots', type=Path, required=True)
    args = parser.parse_args()
    app = args.app.resolve()
    shots = args.screenshots.resolve()
    shots.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='askthis-brand-verify-', dir=os.environ.get('TMPDIR')))
    proc = cdp = settings = server = None
    metrics = {'tested_package': str(app), 'runtime_identity_isolated': True, 'themes': {}}
    failures = []
    original_cdp_port = e2e.CDP_PORT
    try:
        resources = app / 'Contents/Resources'
        info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
        icon = info['CFBundleIconFile']
        if not icon.endswith('.icns'):
            icon += '.icns'
        assert digest(resources / icon) == digest(ROOT / 'resources/brand/app.icns')
        expected = {'icon.png': 'app-1024.png', 'tray/trayTemplate.png': 'mark-16.png',
                    'tray/trayTemplate@2x.png': 'mark-32.png', 'tray/tray.png': 'app-32.png'}
        for target, source in expected.items():
            assert digest(resources / target) == digest(ROOT / 'resources/brand' / source)
        for target, size in [('tray/trayTemplate.png', 16), ('tray/trayTemplate@2x.png', 32)]:
            with Image.open(resources / target) as image:
                assert image.size == (size, size) and image.mode == 'RGBA'
                corner = image.getpixel((0, 0))
                assert isinstance(corner, tuple) and corner[3] == 0
                assert all(pixel[:3] == (0, 0, 0) for pixel in
                           (image.getpixel((x, y)) for y in range(size) for x in range(size))
                           if isinstance(pixel, tuple) and pixel[3])
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True, capture_output=True)
        metrics['package_signature_and_resources'] = 'passed'
        metrics['payload_sha256'] = digest(resources / 'app.asar')

        clone = work / 'AskThis.app'
        subprocess.run(['ditto', str(app), str(clone)], check=True)
        info['CFBundleIdentifier'] = 'local.askthis.b2-brand-verification'
        # Electron resolves helper apps from CFBundleName; retain AskThis here.
        info['CFBundleDisplayName'] = 'AskThis Brand Verification'
        (clone / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
        subprocess.run(['codesign', '--force', '--deep', '--sign', '-', '--entitlements',
                        str(ROOT / 'node_modules/app-builder-lib/templates/entitlements.mac.plist'), str(clone)],
                       check=True, capture_output=True)
        assert digest(clone / 'Contents/Resources/app.asar') == metrics['payload_sha256']
        assert digest(clone / 'Contents/Resources' / icon) == digest(resources / icon)
        profile = work / 'profile'
        profile.mkdir()
        server = e2e.ThreadingHTTPServer(('127.0.0.1', 0), e2e.MockHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cfg = {'version': 2, 'locale': 'zh-CN', 'theme': 'light', 'shortcut': 'Ctrl+Alt+Shift+9',
               'launchAtLogin': False, 'selectionMode': 'manual', 'historyEnabled': False,
               'windowWidth': 480, 'maxWindowHeight': 560,
               'providers': [{'id': 'brand-fixture', 'name': 'Local brand fixture', 'kind': 'openai-compatible',
                              'baseUrl': f'http://127.0.0.1:{server.server_port}/v1',
                              'models': [{'id': 'brand-fixture', 'reasoning': False}], 'reasoningStyle': 'none'}],
               'activeProviderId': 'brand-fixture', 'activeModelId': 'brand-fixture'}
        (profile / 'config.json').write_text(json.dumps(cfg))
        hs('_atBrandFront=hs.application.frontmostApplication(); return "saved"')
        with (work / 'runtime.log').open('w') as log:
            proc = subprocess.Popen([str(clone / 'Contents/MacOS/AskThis'), f'--user-data-dir={profile}',
                                     '--remote-debugging-port=0', '--remote-allow-origins=*'],
                                    stdout=log, stderr=log)
        port = debugging_port(profile, proc)
        e2e.CDP_PORT = port  # The reused CDP transport uses this only for its Origin.
        cdp = connect_packaged_target(port, clone, 'popup')
        settings = connect_packaged_target(port, clone, 'settings')
        assert wait_for(lambda: settings.ev('!!window.api?.config && document.querySelectorAll(".sidebar__item").length===5'))
        hs('hs.eventtap.keyStroke({"ctrl","alt","shift"},"9",0);return "opened"')
        assert wait_for(lambda: cdp.ev('document.hasFocus() && !!document.querySelector(".composer__input")'), 8)
        cdp.ev('''(() => {const e=document.querySelector('.composer__input');
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'品牌图标验证');
          e.dispatchEvent(new Event('input',{bubbles:true}));})()''')
        assert wait_for(lambda: cdp.ev('!document.querySelector(".composer__action").disabled'))
        cdp.ev('document.querySelector(".composer__action").click()')
        assert wait_for(lambda: cdp.ev('document.querySelector(".popup-shell")?.dataset.status==="done" && document.querySelector(".turn__a")?.textContent.includes("MOCK-REPLY")'), 10)
        metrics['local_query_smoke'] = 'passed (local mock, not online GPT)'
        for theme in ['light', 'dark']:
            value = cast(dict[str, Any], settings.ev('window.api.config.patch(' + json.dumps({'theme': theme}) + ')'))
            assert value['theme'] == theme
            assert wait_for(lambda: cdp.ev('matchMedia("(prefers-color-scheme:dark)").matches') == (theme == 'dark'))
            assert wait_for(lambda: settings.ev('matchMedia("(prefers-color-scheme:dark)").matches') == (theme == 'dark'))
            time.sleep(.2)
            popup = inspect_logo(cdp, '.head__logo svg', 'small-mark.svg', 16)
            sidebar = inspect_logo(settings, '.sidebar__foot svg', 'small-mark.svg', 12)
            settings.ev('document.querySelectorAll(".sidebar__item")[4].click()')
            assert wait_for(lambda: settings.ev('!!document.querySelector(".about__hero svg")'))
            about = inspect_logo(settings, '.about__hero svg', 'mark.svg', 44)
            ratios = {'popup': contrast(cdp, '.head__logo svg', '.popup-card'),
                      'sidebar': contrast(settings, '.sidebar__foot svg', '.sidebar'),
                      'about': contrast(settings, '.about__hero svg', '.content')}
            assert min(ratios.values()) >= 3, ratios
            assert cdp.ev('getComputedStyle(document.querySelector(".turn__q")).borderLeftWidth') == '0px'
            screenshot(cdp, shots / f'popup-{theme}.png')
            screenshot(settings, shots / f'settings-about-{theme}.png')
            metrics['themes'][theme] = {'popup': popup, 'sidebar': sidebar, 'about': about, 'contrast': ratios}
        assert metrics['themes']['light']['popup']['ink'] != metrics['themes']['dark']['popup']['ink']
        metrics['production_svg_geometry'] = 'exact match at 12/16/44px'
        metrics['existing_source_presentation'] = 'unchanged, no left border'
        metrics['temporary_profile_contains_no_user_secrets'] = True
        print('PASS packaged B2: exact ICNS/native resources, 12/16/44px marks, light/dark themes, local query smoke')
    except Exception as error:
        failures.append(str(error) or repr(error))
        print('FAIL', failures[-1])
        runtime = work / 'runtime.log'
        if runtime.exists():
            (shots / 'runtime-failure.log').write_text(runtime.read_text())
    finally:
        e2e.CDP_PORT = original_cdp_port
        for connection in [cdp, settings]:
            if connection:
                try:
                    connection.close()
                except Exception as error:
                    failures.append('CDP cleanup: ' + str(error))
        if proc:
            proc.terminate()
            try:
                proc.wait(10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        if server:
            server.shutdown()
            server.server_close()
        try:
            hs('if _atBrandFront then _atBrandFront:activate() end;_atBrandFront=nil;return "restored"')
        except Exception as error:
            failures.append('front application cleanup: ' + str(error))
        shutil.rmtree(work)
        metrics['failures'] = failures
        metrics['passed'] = not failures
        (shots / 'verification.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == '__main__':
    raise SystemExit(main())
