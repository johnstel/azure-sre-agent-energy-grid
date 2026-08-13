import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class GridMapStaticContractTests(unittest.TestCase):
    def test_topology_contract_matches_governed_status_requirements(self):
        topology_path = ROOT / 'k8s/base/grid-map-topology.json'
        topology = json.loads(topology_path.read_text(encoding='utf-8'))
        self.assertEqual(topology['schemaVersion'], '1.2')
        self.assertEqual(topology['dataContract']['version'], 'cloud-demo-v2')
        self.assertEqual(topology['dataContract']['allowlistedNamespaces'], ['energy'])
        self.assertIn('high-cpu', topology['dataContract']['transientScenarioCoverage'])
        self.assertEqual(len(topology['scenarioMappings']), 10)

    def test_ops_console_promotes_accessibility_and_safe_language(self):
        html_path = ROOT / 'k8s/base/ops-console.html'
        html = html_path.read_text(encoding='utf-8')
        self.assertIn('not connected to real grid telemetry', html)
        self.assertIn('role="note"', html)
        self.assertIn('prefers-reduced-motion', html)
        self.assertIn('aria-live="polite"', html)

    def test_status_api_uses_allowlisted_namespace_and_redaction(self):
        api_path = ROOT / 'k8s/base/grid-status-api.py'
        source = api_path.read_text(encoding='utf-8')
        self.assertIn("ALLOWED_NAMESPACE = 'energy'", source)
        self.assertIn("SECRET_PATTERNS", source)
        self.assertIn("[redacted]", source)

    def test_application_manifest_uses_least_privilege_rbac(self):
        manifest_path = ROOT / 'k8s/base/application.yaml'
        source = manifest_path.read_text(encoding='utf-8')
        self.assertIn('serviceAccountName: ops-console-status-reader', source)
        self.assertIn('name: ops-console-status-reader', source)
        self.assertIn('resources: ["pods", "services", "endpoints", "events"]', source)
        self.assertIn('resources: ["deployments", "statefulsets"]', source)
        self.assertIn('verbs: ["get", "list"]', source)
        self.assertNotIn('resources: ["secrets", "configmaps"]', source)


if __name__ == '__main__':
    unittest.main()
