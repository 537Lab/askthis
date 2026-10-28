"""Headless CDP isolation regression; stdlib only, never launches an app."""
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import shutil
import socket
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch

TESTS = Path(__file__).resolve().parent
# Import the real test/helpers without requiring Pillow or websocket-client.
# Neither boundary is exercised: screenshots and CDP transport are mocked below.
with patch.dict(sys.modules, {'PIL': types.SimpleNamespace(Image=MagicMock()),
                              'websocket': types.ModuleType('websocket')}):
    sys.path.insert(0, str(TESTS))
    try:
        spec = importlib.util.spec_from_file_location('brand_under_test', TESTS / 'brand_integration_e2e.py')
        assert spec is not None and spec.loader is not None
        brand = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(brand)
    finally:
        sys.path.pop(0)


class BrandIsolationTests(unittest.TestCase):
    def run_fixture(self, *, wrong_page=None, wrong_url=None, active_port=True,
                    wrong_location: str | None = None, wrong_websocket=False):
        """Exercise real main/control flow; replace only OS/CDP/UI boundaries."""
        with tempfile.TemporaryDirectory(prefix='brand-unit-', dir=os.environ.get('TMPDIR')) as temp:
            root = Path(temp)
            app = root / 'Source.app'
            (app / 'Contents/Resources').mkdir(parents=True)
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIconFile': 'app.icns'}))
            events = []
            launched = []
            requests = []
            clients = []
            targets = []
            owned_port = 31007
            process = MagicMock()
            process.poll.return_value = None

            def command_run(command, **kwargs):
                if command[0] == 'ditto':
                    shutil.copytree(command[1], command[2])
                return MagicMock(returncode=0)

            def launch(command, **kwargs):
                launched.append(command)
                profile = Path(next(arg.split('=', 1)[1] for arg in command if arg.startswith('--user-data-dir=')))
                clone = profile.parent / 'AskThis.app'
                if active_port:
                    (profile / 'DevToolsActivePort').write_text(f'{owned_port}\n/devtools/browser/unit-test\n')
                for page in ('popup', 'settings'):
                    url = (clone / f'Contents/Resources/app.asar/out/renderer/{page}.html').as_uri()
                    if page == wrong_page:
                        url = (wrong_url(url) if callable(wrong_url) else wrong_url) or (
                            root / f'another-clone/AskThis.app/Contents/Resources/app.asar/out/renderer/{page}.html').as_uri()
                    targets.append({'id': page, 'type': 'page', 'url': url,
                                    'webSocketDebuggerUrl': f'ws://127.0.0.1:{owned_port}/devtools/page/{page}'})
                if wrong_websocket:
                    targets[0]['webSocketDebuggerUrl'] = 'ws://127.0.0.1:9249/devtools/page/popup'
                return process

            def urlopen(url, **kwargs):
                requests.append(url)
                return io.StringIO(json.dumps(targets))

            def connect(url):
                target = next(t for t in targets if t['webSocketDebuggerUrl'] == url)
                client = MagicMock()
                clients.append(client)
                events.append(('connect', target['id']))

                def evaluate(expression):
                    if expression == 'location.href':
                        events.append(('identity', target['id']))
                        return ('file:///another-clone/settings.html'
                                if wrong_location == target['id'] else target['url'])
                    if 'config.patch' in expression:
                        events.append(('write', target['id']))
                        raise RuntimeError('fixture stops at first verified config write')
                    return True

                client.ev.side_effect = evaluate
                return client

            def image_open(path):
                image = MagicMock()
                image.size = (32, 32) if '@2x' in str(path) else (16, 16)
                image.mode = 'RGBA'
                image.getpixel.return_value = (0, 0, 0, 0)
                image.__enter__.return_value = image
                return image

            original_port = brand.e2e.CDP_PORT
            with patch.object(brand, 'digest', return_value='same-payload'), \
                 patch.object(brand.Image, 'open', side_effect=image_open), \
                 patch.object(brand.subprocess, 'run', side_effect=command_run), \
                 patch.object(brand.subprocess, 'Popen', side_effect=launch), \
                 patch.object(brand, 'hs'), \
                 patch.object(brand, 'wait_for', side_effect=lambda fn, *args: fn()), \
                 patch.object(brand.e2e, 'ThreadingHTTPServer'), \
                 patch.object(brand.threading, 'Thread'), \
                 patch.object(brand.e2e, 'CDP', side_effect=connect), \
                 patch.object(brand.e2e, 'find_popup_target', side_effect=lambda: targets[0]), \
                 patch.object(brand, 'settings_target', side_effect=lambda: targets[1], create=True), \
                 patch.object(brand.urllib.request, 'urlopen', side_effect=urlopen), \
                 patch.object(sys, 'argv', ['brand', '--app', str(app), '--screenshots', str(root / 'shots')]), \
                 patch('sys.stdout', new_callable=io.StringIO):
                result = brand.main()
            restored_port = brand.e2e.CDP_PORT
            brand.e2e.CDP_PORT = original_port  # Keep a failing old implementation from leaking test state.
            self.assertEqual(result, 1)  # Negative case or deliberate stop, never full GUI e2e.
            self.assertEqual(restored_port, original_port)
            return types.SimpleNamespace(events=events, launched=launched, requests=requests,
                                         clients=clients, original_port=original_port,
                                         restored_port=restored_port, owned_port=owned_port)

    def test_other_temporary_bundle_popup_is_never_accepted_or_modified(self):
        result = self.run_fixture(wrong_page='popup')
        self.assertEqual(result.events, [], 'foreign popup reached CDP / config mutation')

    def test_other_temporary_bundle_settings_is_never_accepted_or_modified(self):
        result = self.run_fixture(wrong_page='settings')
        self.assertNotIn(('connect', 'settings'), result.events)
        self.assertFalse(any(kind == 'write' for kind, _ in result.events))

    def test_occupied_legacy_port_without_own_port_file_is_never_contacted(self):
        with socket.socket() as occupied:
            try:
                occupied.bind(('127.0.0.1', 9249))
                occupied.listen()
            except OSError:
                pass  # Already occupied externally: the same isolation requirement applies.
            result = self.run_fixture(active_port=False)
        self.assertIn('--remote-debugging-port=0', result.launched[0])
        self.assertEqual(result.requests, [])
        self.assertEqual(result.events, [])

    def test_own_dynamic_port_and_both_identities_precede_config_write(self):
        with socket.socket() as occupied:
            try:
                occupied.bind(('127.0.0.1', 9249))
                occupied.listen()
            except OSError:
                pass
            result = self.run_fixture()
        self.assertIn('--remote-debugging-port=0', result.launched[0])
        self.assertEqual(result.requests, [f'http://127.0.0.1:{result.owned_port}/json/list'] * 2)
        self.assertEqual(result.events, [('connect', 'popup'), ('identity', 'popup'),
                                         ('connect', 'settings'), ('identity', 'settings'),
                                         ('write', 'settings')])
        for client in result.clients:
            client.close.assert_called_once()

    def test_installed_http_and_url_suffix_lookalikes_are_rejected(self):
        for page in ('popup', 'settings'):
            for url in (f'file:///Applications/AskThis.app/Contents/Resources/app.asar/out/renderer/{page}.html',
                        f'https://example.invalid/{page}.html',
                        lambda own: own + '?fixture=other',
                        lambda own: own + '#other',
                        lambda own: own + '.bak'):
                with self.subTest(page=page, url=str(url)):
                    result = self.run_fixture(wrong_page=page, wrong_url=url)
                    self.assertNotIn(('connect', page), result.events)
                    self.assertFalse(any(kind == 'write' for kind, _ in result.events))

    def test_connected_renderer_must_match_target_metadata_before_writes(self):
        for page in ('popup', 'settings'):
            with self.subTest(page=page):
                result = self.run_fixture(wrong_location=page)
                self.assertIn(('identity', page), result.events)
                self.assertFalse(any(kind == 'write' for kind, _ in result.events))
                for client in result.clients:
                    client.close.assert_called_once()

    def test_foreign_websocket_endpoint_is_rejected_before_connection(self):
        result = self.run_fixture(wrong_websocket=True)
        self.assertEqual(result.events, [])

    def test_invalid_or_incomplete_active_port_never_falls_back(self):
        with tempfile.TemporaryDirectory(prefix='brand-port-', dir=os.environ.get('TMPDIR')) as temp:
            profile = Path(temp)
            proc = MagicMock()
            proc.poll.return_value = None
            with patch.object(brand, 'wait_for', side_effect=lambda fn, *args: fn()):
                for contents in ('', '31007\n', '0\n/devtools/browser/test\n',
                                 '65536\n/devtools/browser/test\n', 'not-a-port\n/devtools/browser/test\n',
                                 '31007\n/devtools/page/foreign\n'):
                    with self.subTest(contents=contents):
                        (profile / 'DevToolsActivePort').write_text(contents)
                        with self.assertRaises((RuntimeError, ValueError)):
                            brand.debugging_port(profile, proc)

    def test_exited_test_process_cannot_reuse_even_its_profile_endpoint(self):
        with tempfile.TemporaryDirectory(prefix='brand-port-', dir=os.environ.get('TMPDIR')) as temp:
            profile = Path(temp)
            (profile / 'DevToolsActivePort').write_text('31007\n/devtools/browser/test\n')
            proc = MagicMock()
            proc.poll.return_value = 1
            with patch.object(brand, 'wait_for', side_effect=lambda fn, *args: fn()):
                with self.assertRaisesRegex(RuntimeError, 'test app exited'):
                    brand.debugging_port(profile, proc)


if __name__ == '__main__':
    unittest.main()
