import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('grid_status_api', ROOT / 'k8s/base/grid-status-api.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DummyContext:
    def __init__(self):
        self.loaded_cafile = None

    def load_verify_locations(self, cafile=None, capath=None, cadata=None):
        self.loaded_cafile = cafile
        self.loaded_capath = capath
        self.loaded_cadata = cadata


class DummyResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return b'{"items": []}'


class FakeGridStatusAPI(module.GridStatusAPI):
    def __init__(self, items):
        super().__init__()
        self.items = items

    def _request(self, path):
        return {}

    def _list_items(self, path):
        return self.items.get(path, [])


class GridStatusAPITests(unittest.TestCase):
    def test_allowlisted_resources_are_present(self):
        api = module.GridStatusAPI()
        self.assertIn('meter-service', module.ALLOWED_RESOURCES)
        self.assertIn('mongodb', module.ALLOWED_RESOURCES)

    def test_aggregate_payload_has_versioned_schema(self):
        api = FakeGridStatusAPI({})
        payload = api.aggregate(max_nodes=5, max_events=3, max_output_bytes=20000)
        self.assertEqual(payload['schemaVersion'], '1.2')
        self.assertEqual(payload['dataContractVersion'], 'cloud-demo-v2')
        self.assertEqual(payload['namespace'], 'energy')
        self.assertIn('nodes', payload)
        self.assertIn('events', payload)
        self.assertEqual(payload['allowlistedNamespaces'], ['energy'])

    def test_bounded_payload_and_sanitizes_secret_like_text(self):
        fake_items = {
            '/apis/apps/v1/namespaces/energy/deployments': [
                {'metadata': {'name': 'meter-service'}, 'status': {'replicas': 1, 'readyReplicas': 1}}
            ],
            '/api/v1/namespaces/energy/pods': [
                {
                    'metadata': {'labels': {'app': 'meter-service'}},
                    'status': {'phase': 'Running', 'containerStatuses': [{'ready': True, 'restartCount': 2}]},
                }
            ],
            '/api/v1/namespaces/energy/services': [
                {'metadata': {'name': 'meter-service'}}
            ],
            '/api/v1/namespaces/energy/endpoints': [
                {'metadata': {'name': 'meter-service'}, 'subsets': [{'addresses': [{'ip': '10.0.0.1'}]}]}
            ],
            '/api/v1/namespaces/energy/events': [
                {'type': 'Warning', 'reason': 'PasswordLeak', 'message': 'password=secret should not be exposed', 'metadata': {'creationTimestamp': '2026-01-01T00:00:00Z'}, 'involvedObject': {'name': 'meter-service'}}
            ],
        }
        api = FakeGridStatusAPI(fake_items)
        payload = api.aggregate(activeScenario='oom-killed', max_nodes=1, max_events=1, max_output_bytes=5000)
        self.assertEqual(len(payload['nodes']), 1)
        self.assertEqual(len(payload['events']), 1)
        self.assertNotIn('secret', payload['events'][0]['message'].lower())
        self.assertNotIn('password', payload['events'][0]['message'].lower())
        self.assertIn('[redacted]', payload['events'][0]['message'])

    def test_request_uses_verified_ssl_context_from_ca_bundle(self):
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', delete=False) as handle:
            handle.write('fake-ca')
            ca_path = handle.name
        try:
            dummy_context = DummyContext()
            captured = {}

            def fake_urlopen(req, context=None, timeout=5):
                captured['context'] = context
                captured['timeout'] = timeout
                return DummyResponse()

            with patch.object(module.ssl, 'create_default_context', return_value=dummy_context) as create_context:
                with patch.object(module.request, 'urlopen', side_effect=fake_urlopen):
                    api = module.GridStatusAPI(ca_bundle_path=ca_path, token='abc')
                    payload = api._request('/api/v1/namespaces/energy/pods')

            self.assertEqual(payload, {'items': []})
            self.assertIs(captured['context'], dummy_context)
            self.assertEqual(dummy_context.loaded_cafile, ca_path)
            self.assertEqual(create_context.call_args.kwargs['purpose'], module.ssl.Purpose.SERVER_AUTH)
        finally:
            pathlib.Path(ca_path).unlink(missing_ok=True)

    def test_request_surfaces_errors_as_source_error_state(self):
        def fake_urlopen(req, context=None, timeout=5):
            raise module.error.URLError('certificate verify failed')

        with patch.object(module.request, 'urlopen', side_effect=fake_urlopen):
            api = module.GridStatusAPI(token='abc')
            payload = api._request('/api/v1/namespaces/energy/pods')

        self.assertEqual(payload['sourceStatus'], 'error')
        self.assertIn('certificate verify failed', payload['error'])
        self.assertEqual(api._request_error_for('/api/v1/namespaces/energy/pods'), payload['error'])

    def test_truncation_only_marks_true_when_payload_is_really_limited(self):
        api = FakeGridStatusAPI({
            '/apis/apps/v1/namespaces/energy/deployments': [
                {'metadata': {'name': 'meter-service'}, 'status': {'replicas': 1, 'readyReplicas': 1}}
            ],
            '/api/v1/namespaces/energy/pods': [
                {'metadata': {'labels': {'app': 'meter-service'}}, 'status': {'phase': 'Running', 'containerStatuses': [{'ready': True, 'restartCount': 0}]}}
            ],
            '/api/v1/namespaces/energy/services': [
                {'metadata': {'name': 'meter-service'}}
            ],
            '/api/v1/namespaces/energy/endpoints': [
                {'metadata': {'name': 'meter-service'}, 'subsets': [{'addresses': [{'ip': '10.0.0.1'}]}]}
            ],
            '/api/v1/namespaces/energy/events': [
                {'type': 'Warning', 'reason': 'Inspect', 'message': 'Transient', 'metadata': {'creationTimestamp': '2026-01-01T00:00:00Z'}, 'involvedObject': {'name': 'meter-service'}}
            ],
        })
        payload = api.aggregate(max_nodes=len(module.ALLOWED_RESOURCES), max_events=20, max_output_bytes=50000)
        self.assertFalse(payload['truncated'])
        self.assertEqual(len(payload['nodes']), len(module.ALLOWED_RESOURCES))


if __name__ == '__main__':
    unittest.main()
