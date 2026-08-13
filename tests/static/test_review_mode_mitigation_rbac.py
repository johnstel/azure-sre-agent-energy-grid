"""Static safety tests for the Review-mode mitigation RBAC boundary (issue #80).

These guard the HIGH-severity defect found in review of PR #86: the Kubernetes dataActions role
assignment was written at ``scope: aks`` -- a CLUSTER-WIDE grant -- while the code, docs, and
configure script all claimed it was narrowed to ``<aksId>/namespaces/energy``.

Azure RBAC for Kubernetes Authorization scopes a namespace grant to the extension-resource path
``<aksResourceId>/namespaces/<namespace>``. Bicep cannot target that path, so the assignment must be
created by the configure script -- never by the template at cluster scope.

These tests run offline and are intentionally narrow.
"""

import json
import pathlib
import re
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]

ROLE_MODULE = ROOT / 'infra/bicep/modules/sre-agent-mitigation-role.bicep'
CONFIGURE_SCRIPT = ROOT / 'scripts/configure-sre-agent-mitigation-guardrails.ps1'
VALIDATE_SCRIPT = ROOT / 'scripts/validate-sre-agent-mitigation-guardrails.ps1'
POLICY = ROOT / 'infra/sre-agent/tool-access-policy.json'
DESIGN_DOC = ROOT / 'docs/REVIEW-MODE-MITIGATION.md'

ROLE_ASSIGNMENT_RE = re.compile(
    r"resource\s+(?P<symbol>\w+)\s+'Microsoft\.Authorization/roleAssignments@[^']+'\s*="
    r"(?P<body>.*?)\n}",
    re.DOTALL,
)


class MitigationRbacScopeTests(unittest.TestCase):
    def setUp(self):
        self.role_module = ROLE_MODULE.read_text(encoding='utf-8')
        self.configure = CONFIGURE_SCRIPT.read_text(encoding='utf-8')
        self.validate = VALIDATE_SCRIPT.read_text(encoding='utf-8')

    def test_template_creates_no_assignment_for_the_kubernetes_dataactions_role(self):
        """A `scope: aks` assignment of the dataActions role is a cluster-wide grant."""
        for match in ROLE_ASSIGNMENT_RE.finditer(self.role_module):
            body = match.group('body')
            self.assertNotIn(
                'namespaceRole',
                body,
                msg=(
                    f"Role assignment '{match.group('symbol')}' references the Kubernetes "
                    'dataActions role. Bicep cannot express the '
                    '<aksId>/namespaces/<namespace> scope, so any assignment it creates is '
                    'CLUSTER-WIDE. Create it in configure-sre-agent-mitigation-guardrails.ps1 '
                    'instead.'
                ),
            )

    def test_template_declares_it_does_not_create_the_layer2_assignment(self):
        self.assertIn('namespaceRoleAssignmentCreatedByTemplate bool = false', self.role_module)

    def test_template_emits_the_exact_namespace_scope(self):
        self.assertIn('output namespaceAssignmentScope string', self.role_module)
        self.assertIn('${aks.id}/namespaces/${namespaceName}', self.role_module)

    def test_dataactions_role_excludes_secrets_and_exec(self):
        self.assertIn('Microsoft.ContainerService/managedClusters/secrets/read', self.role_module)
        self.assertIn('Microsoft.ContainerService/managedClusters/pods/exec/action', self.role_module)
        not_data = self.role_module.split('notDataActions:', 1)[1]
        self.assertIn('secrets/read', not_data)
        self.assertIn('pods/exec/action', not_data)

    def test_control_plane_role_grants_no_admin_credential_or_run_command(self):
        actions = re.findall(r"'(Microsoft\.[A-Za-z0-9./_-]+)'", self.role_module)
        self.assertIn('Microsoft.ContainerService/managedClusters/listClusterUserCredential/action', actions)
        for forbidden in ('listClusterAdminCredential', 'runCommand', 'managedClusters/write', 'managedClusters/delete'):
            self.assertFalse(
                any(forbidden in action for action in actions),
                msg=f"custom role must not grant '{forbidden}'",
            )
        self.assertFalse(any('*' in action for action in actions), msg='no wildcard actions')

    def test_layer2_remains_opt_in_and_off_by_default(self):
        self.assertIn('param enableKubernetesDataActions bool = false', self.role_module)
        main = (ROOT / 'infra/bicep/main.bicep').read_text(encoding='utf-8')
        self.assertIn('param enableReviewModeMitigation bool = false', main)
        self.assertIn('param enableAgentKubernetesRbac bool = false', main)


class ConfigureScriptScopeTests(unittest.TestCase):
    def setUp(self):
        self.configure = CONFIGURE_SCRIPT.read_text(encoding='utf-8')

    def test_builds_the_documented_namespace_scope(self):
        self.assertIn('"$aksId/namespaces/$KubernetesNamespace"', self.configure)

    def test_creates_assignment_only_at_the_exact_namespace_scope(self):
        self.assertIn('az role assignment create', self.configure)
        self.assertIn('--scope $normalizedExpected', self.configure)

    def test_verifies_the_scope_the_service_returned(self):
        self.assertIn('az role assignment show', self.configure)
        self.assertIn('does not match the required', self.configure)

    def test_fails_loudly_on_cluster_wide_or_foreign_namespace_grants(self):
        self.assertIn('CLUSTER-WIDE GRANT', self.configure)
        self.assertIn('OUT-OF-SCOPE GRANT', self.configure)

    def test_is_idempotent(self):
        self.assertIn('nothing to do (idempotent)', self.configure)

    def test_no_longer_claims_namespace_enforcement_without_verifying(self):
        """The exact regression: any assignment used to print 'namespace scope'."""
        self.assertNotIn(
            "Write-Result 'PASS' 'Layer 2 active: the Kubernetes boundary is enforced by "
            "the API server at namespace scope.'",
            self.configure,
        )


class ValidatorGuardTests(unittest.TestCase):
    def setUp(self):
        self.validate = VALIDATE_SCRIPT.read_text(encoding='utf-8')

    def test_validator_guards_against_a_reintroduced_cluster_scoped_assignment(self):
        self.assertIn('roleAssignments@', self.validate)
        self.assertIn('does NOT create a role assignment for the Kubernetes dataActions role', self.validate)

    def test_validator_checks_the_configure_script_scope_logic(self):
        self.assertIn('CLUSTER-WIDE GRANT', self.validate)
        self.assertIn('OUT-OF-SCOPE GRANT', self.validate)


class ToolAccessPolicyTests(unittest.TestCase):
    def test_ask_rules_are_exactly_the_two_documented_scale_commands(self):
        policy = json.loads(POLICY.read_text(encoding='utf-8'))
        self.assertEqual(
            sorted(policy['permissions']['ask']),
            sorted([
                'RunKubectlWriteCommand(kubectl scale deployment/mongodb -n energy --replicas=1)',
                'RunKubectlWriteCommand(kubectl scale deployment/mongodb -n energy --replicas=0)',
            ]),
        )

    def test_allow_rules_cannot_bypass_the_ask_gate(self):
        policy = json.loads(POLICY.read_text(encoding='utf-8'))
        for rule in policy['permissions']['allow']:
            self.assertNotRegex(rule, r'Write|delete|exec|Terminal|Shell|Python')


class DesignDocHonestyTests(unittest.TestCase):
    def test_doc_does_not_claim_the_template_creates_a_namespace_assignment(self):
        doc = DESIGN_DOC.read_text(encoding='utf-8')
        self.assertIn('PENDING', doc)
        self.assertIn('namespaces/energy', doc)
        # The doc must explain that Bicep cannot express the namespace scope.
        self.assertRegex(doc, r'Bicep cannot|cannot express')


if __name__ == '__main__':
    unittest.main()
