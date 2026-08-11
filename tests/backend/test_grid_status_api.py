import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('grid_status_api', ROOT / 'k8s/base/grid-status-api.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


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


if __name__ == '__main__':
    unittest.main()
