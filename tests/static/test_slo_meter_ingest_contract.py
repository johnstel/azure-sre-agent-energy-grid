import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]


class SloMeterIngestStaticContractTests(unittest.TestCase):
    def test_synthetic_probe_is_bounded_and_non_destructive(self):
        manifest = (ROOT / 'k8s/base/application.yaml').read_text(encoding='utf-8')

        self.assertIn('name: synthetic-meter-ingest-probe', manifest)
        self.assertIn('schedule: "*/2 * * * *"', manifest)
        self.assertIn('concurrencyPolicy: Forbid', manifest)
        self.assertIn('activeDeadlineSeconds: 45', manifest)
        self.assertIn('backoffLimit: 0', manifest)
        self.assertIn('ttlSecondsAfterFinished: 600', manifest)
        self.assertIn('command: ["node", "/app/scripts/synthetic-transaction.js"]', manifest)

        runner = (ROOT / 'services/meter-service/src/synthetic-transaction.js').read_text(encoding='utf-8')
        self.assertIn('SpanKind.SERVER', runner)
        self.assertIn('"slo.meter-ingest.transaction"', runner)
        self.assertIn('"synthetic.name": "slo-meter-ingest"', runner)
        self.assertIn('"synthetic.mode": "demo"', runner)
        self.assertIn('"synthetic.success"', runner)
        self.assertIn('shutdownTelemetry', runner)

        deploy_script = (ROOT / 'scripts/deploy.ps1').read_text(encoding='utf-8')
        self.assertIn("cronjob/synthetic-meter-ingest-probe", deploy_script)
        self.assertIn("-ImageTag $repoImageTag", deploy_script)

    def test_kql_contract_preserves_no_data_and_raw_run_p95(self):
        query = (ROOT / 'docs/evidence/kql/stable/slo-meter-ingest.kql').read_text(encoding='utf-8')

        self.assertIn('AppRequests', query)
        self.assertIn('arg_max(TimeGenerated, Success, DurationMs', query)
        self.assertIn('percentile(DurationMs, 95)', query)
        self.assertIn('LatestCriticalFailure', query)
        self.assertIn('FailureReason', query)
        self.assertIn('FailureStage in ("persistence", "ingress")', query)
        self.assertIn('arg_max(CriticalFailureAt, CriticalFailureStage, CriticalFailureReason)', query)
        self.assertIn('RunCount == 0, "NO_DATA"', query)
        self.assertIn('now() - LastSuccess > freshnessLimit', query)
        self.assertNotIn('coalesce(SuccessRatePct, 100', query)

    def test_alerts_and_dashboard_expose_non_green_customer_impact(self):
        alerts = (ROOT / 'infra/bicep/modules/alerts.bicep').read_text(encoding='utf-8')
        for logical_name in (
            'sloMeterIngestBurnAlert',
            'sloMeterIngestCustomerImpactAlert',
            'sloMeterIngestMongoPersistenceAlert',
            'sloMeterIngestIngressAlert',
            'sloMeterIngestNoDataAlert',
        ):
            self.assertIn(logical_name, alerts)
        self.assertIn('FailureStage == \'persistence\'', alerts)
        self.assertIn('FailureStage == \'ingress\'', alerts)
        self.assertIn('FailureReasons', alerts)
        self.assertIn('LatestCriticalFailure', alerts)
        self.assertIn('NoDataSignal = iff(SloTransactionRunCount == 0, 1, 0)', alerts)
        self.assertIn('FreshnessMinutes > 5.0', alerts)

        dashboard = json.loads((ROOT / 'infra/grafana/energy-grid-incident-dashboard.json').read_text(encoding='utf-8'))
        titles = {panel.get('title') for panel in dashboard['panels']}
        self.assertTrue({
            'Demo customer impact — slo-meter-ingest (AppRequests raw runs)',
            'Synthetic customer-impact state',
            'Success rate (10m, target \u226595%)',
            'p95 end-to-end latency (raw runs)',
            'Last successful transaction freshness',
            'Failure stage and burn rate',
        }.issubset(titles))
        failure_panel = next(panel for panel in dashboard['panels'] if panel.get('title') == 'Failure stage and burn rate')
        failure_query = failure_panel['targets'][0]['azureMonitor']['query']
        self.assertIn('arg_max(LatestFailureAt, LatestFailureStage, LatestFailureReason)', failure_query)

    def test_docs_keep_demo_and_scheduled_task_claims_evidence_safe(self):
        slo_doc = (ROOT / 'docs/SLO-METER-INGEST.md').read_text(encoding='utf-8')
        task_doc = (ROOT / 'docs/SRE-AGENT-GRID-READINESS-TASK.md').read_text(encoding='utf-8')

        self.assertIn('not a production SLO or SLA', slo_doc)
        self.assertIn('No transaction data is NO_DATA/unknown, never healthy.', task_doc)
        self.assertIn('The current create schema does **not** expose a run-mode/autonomy parameter.', task_doc)
        self.assertIn('no live scheduled-task finding is claimed', task_doc)


if __name__ == '__main__':
    unittest.main()
