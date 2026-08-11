#!/usr/bin/env python3
import json
import os
import re
import ssl
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request
from urllib.parse import parse_qs, urlparse

ALLOWED_NAMESPACE = 'energy'
ALLOWED_RESOURCES = {
    'asset-service': {'kind': 'deployment'},
    'meter-service': {'kind': 'deployment'},
    'dispatch-service': {'kind': 'deployment'},
    'mongodb': {'kind': 'statefulset'},
    'rabbitmq': {'kind': 'statefulset'},
    'grid-dashboard': {'kind': 'deployment'},
    'ops-console': {'kind': 'deployment'},
    'load-simulator': {'kind': 'deployment'},
    'grid-worker': {'kind': 'deployment'},
}
DEFAULT_MAX_NODES = 12
DEFAULT_MAX_EVENTS = 8
DEFAULT_MAX_OUTPUT_BYTES = 16384
DEFAULT_MAX_WINDOW_SECONDS = 900
MAX_ALLOWED_NODES = 32
MAX_ALLOWED_EVENTS = 24
MAX_ALLOWED_OUTPUT_BYTES = 65536
MAX_ALLOWED_WINDOW_SECONDS = 3600
SECRET_PATTERNS = [
    re.compile(r'(?i)(token|password|secret|api[_-]?key|access[_-]?key|connectionstring)'),
]


def _read_service_account_token():
    token_path = Path('/var/run/secrets/kubernetes.io/serviceaccount/token')
    if token_path.exists():
        return token_path.read_text(encoding='utf-8').strip()
    return None


class GridStatusAPI:
    def __init__(self, token=None, host=None, port=None, ca_bundle_path=None, base_url=None, ssl_context=None, request_timeout=5):
        self.token = token if token is not None else _read_service_account_token()
        self.host = host or os.getenv('KUBERNETES_SERVICE_HOST', '127.0.0.1')
        self.port = port or os.getenv('KUBERNETES_SERVICE_PORT', '443')
        self.base_url = base_url or f'https://{self.host}:{self.port}'
        self.ca_bundle_path = ca_bundle_path or os.getenv('KUBERNETES_CA_CERT_PATH', '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
        self.request_timeout = request_timeout
        self.ssl_context = ssl_context
        self.request_errors = {}

    def _build_ssl_context(self):
        if self.ssl_context is not None:
            return self.ssl_context
        if self.ca_bundle_path:
            ca_path = Path(self.ca_bundle_path)
            if ca_path.exists():
                context = ssl.create_default_context(purpose=ssl.Purpose.SERVER_AUTH)
                context.load_verify_locations(cafile=str(ca_path))
                return context
        return ssl.create_default_context()

    def _request(self, path):
        headers = {}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        req = request.Request(self.base_url + path, headers=headers, method='GET')
        try:
            context = self._build_ssl_context()
            with request.urlopen(req, context=context, timeout=self.request_timeout) as resp:
                body = resp.read().decode('utf-8')
                return json.loads(body) if body else {}
        except (error.URLError, error.HTTPError, TimeoutError, ValueError, OSError, ssl.SSLError) as exc:
            error_message = str(exc)
            self.request_errors[path] = error_message
            return {'error': error_message, 'sourceStatus': 'error'}

    def _list_items(self, path):
        if hasattr(self, 'items') and self.items is not None and path in self.items:
            return self.items[path]
        payload = self._request(path)
        if isinstance(payload, dict) and payload.get('sourceStatus') == 'error':
            return []
        return payload.get('items', []) if isinstance(payload, dict) else []

    def _request_error_for(self, *paths):
        for path in paths:
            error_message = self.request_errors.get(path)
            if error_message:
                return error_message
        return None

    def _resource_path(self, kind, namespace):
        if kind == 'deployment':
            return f'/apis/apps/v1/namespaces/{namespace}/deployments'
        if kind == 'statefulset':
            return f'/apis/apps/v1/namespaces/{namespace}/statefulsets'
        return f'/api/v1/namespaces/{namespace}/services'

    def _resource_items(self, item_name, kind):
        items = self._list_items(self._resource_path(kind, ALLOWED_NAMESPACE))
        return [item for item in items if item.get('metadata', {}).get('name') == item_name]

    def _pod_items(self, item_name):
        pods = self._list_items(f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/pods')
        return [pod for pod in pods if pod.get('metadata', {}).get('labels', {}).get('app') == item_name]

    def _service_items(self, item_name):
        services = self._list_items(f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/services')
        return [service for service in services if service.get('metadata', {}).get('name') == item_name]

    def _endpoint_items(self, item_name):
        endpoints = self._list_items(f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/endpoints')
        return [endpoint for endpoint in endpoints if endpoint.get('metadata', {}).get('name') == item_name]

    def _event_items(self, item_name):
        events = self._list_items(f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/events')
        return [event for event in events if event.get('involvedObject', {}).get('name') == item_name]

    def _coerce_limit(self, value, default, maximum):
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        if parsed < 1:
            return 1
        return min(parsed, maximum)

    def _sanitize_text(self, value):
        if value is None:
            return ''
        text = str(value)
        for pattern in SECRET_PATTERNS:
            text = pattern.sub('[redacted]', text)
        return text

    def _readiness(self, resource):
        status = resource.get('status', {}) if resource else {}
        ready = status.get('readyReplicas', 0)
        total = status.get('replicas', 0)
        if total == 0:
            return 'unknown'
        if ready >= total:
            return 'ready'
        return 'degraded'

    def _pod_readiness(self, pods):
        if not pods:
            return 'unknown', 0, 'none', 'no pods scheduled'
        ready = 0
        restart_count = 0
        pressure_reasons = []
        for pod in pods:
            status = pod.get('status', {})
            phase = status.get('phase')
            if phase == 'Running':
                container_statuses = status.get('containerStatuses', [])
                if container_statuses and all(container.get('ready', False) for container in container_statuses):
                    ready += 1
            else:
                pressure_reasons.append(phase or 'Pending')
            restart_count += sum(container.get('restartCount', 0) for container in status.get('containerStatuses', []))
            for container_status in status.get('containerStatuses', []):
                waiting = container_status.get('state', {}).get('waiting', {})
                reason = waiting.get('reason', '')
                if reason in {'CreateContainerConfigError', 'ImagePullBackOff', 'ErrImagePull', 'CrashLoopBackOff'}:
                    pressure_reasons.append(reason)
        if ready == len(pods) and len(pods) > 0:
            return 'ready', restart_count, 'none', 'all pods are ready'
        if ready > 0:
            return 'degraded', restart_count, 'pressure', 'some pods are not ready'
        return 'not-ready', restart_count, 'pressure', 'pods are not ready'

    def _service_endpoint_state(self, service, endpoint):
        if not service:
            return 'unknown'
        if not endpoint:
            return 'missing'
        subsets = endpoint.get('subsets', [])
        ready_addresses = 0
        for subset in subsets:
            ready_addresses += len(subset.get('addresses', []))
        if ready_addresses > 0:
            return 'ready'
        if len(subsets) > 0:
            return 'pending'
        return 'unknown'

    def _resource_pressure(self, pods):
        if not pods:
            return 'unknown'
        for pod in pods:
            for condition in pod.get('status', {}).get('conditions', []):
                if condition.get('type') == 'PodScheduled' and condition.get('status') != 'True':
                    return 'scheduling'
            for container_status in pod.get('status', {}).get('containerStatuses', []):
                waiting = container_status.get('state', {}).get('waiting', {})
                reason = waiting.get('reason', '')
                if reason in {'CreateContainerConfigError', 'ImagePullBackOff', 'ErrImagePull', 'CrashLoopBackOff'}:
                    return 'container'
        return 'none'

    def _severity_for_resource(self, resource_name, deployment_readiness, pod_readiness, endpoint_state, pressure, warning_events, pods, reachability):
        if deployment_readiness == 'unknown' or pod_readiness == 'unknown':
            return 'unknown'
        if resource_name in {'mongodb', 'rabbitmq'}:
            if not reachability:
                return 'critical'
        if deployment_readiness == 'degraded' or pod_readiness in {'degraded', 'not-ready'} or endpoint_state != 'ready' or pressure != 'none' or len(warning_events) > 0:
            return 'warning'
        if resource_name in {'asset-service', 'meter-service', 'dispatch-service'} and pods and not any(p.get('status', {}).get('phase') == 'Running' for p in pods):
            return 'warning'
        return 'healthy'

    def _build_node(self, resource_name, resource, pods, service, endpoint, warning_events, request_error, activeScenario, timestamp):
        pod_readiness, restart_count, pressure, pressure_note = self._pod_readiness(pods)
        deployment_readiness = self._readiness(resource) if resource else 'unknown'
        endpoint_state = self._service_endpoint_state(service, endpoint)
        reachability = endpoint_state == 'ready' and pod_readiness in {'ready', 'degraded'}
        severity = self._severity_for_resource(resource_name, deployment_readiness, pod_readiness, endpoint_state, pressure, warning_events, pods, reachability)
        node = {
            'id': resource_name,
            'status': severity,
            'readiness': deployment_readiness if resource else pod_readiness,
            'podReadiness': pod_readiness,
            'deploymentReadiness': deployment_readiness,
            'restartCount': restart_count,
            'warningEvents': len(warning_events),
            'resourcePressure': pressure,
            'serviceEndpointState': endpoint_state,
            'sourceTimestamp': timestamp,
            'stalenessSeconds': 0,
            'summary': self._sanitize_text(f'Governed status for {resource_name}'),
            'reason': 'governed-status',
            'resourcePressureNote': self._sanitize_text(pressure_note),
            'mongodbReachable': None,
            'rabbitmqReachable': None,
            'sourceStatus': 'ok',
            'sourceError': None,
        }
        if request_error:
            node['status'] = 'unknown'
            node['readiness'] = 'unknown'
            node['podReadiness'] = 'unknown'
            node['deploymentReadiness'] = 'unknown'
            node['resourcePressure'] = 'unknown'
            node['serviceEndpointState'] = 'unknown'
            node['summary'] = self._sanitize_text(f'Governed status unavailable for {resource_name}: {request_error}')
            node['reason'] = 'source-error'
            node['sourceStatus'] = 'error'
            node['sourceError'] = self._sanitize_text(request_error)
        if resource_name == 'mongodb':
            node['mongodbReachable'] = reachability
        if resource_name == 'rabbitmq':
            node['rabbitmqReachable'] = reachability
        if activeScenario:
            node['activeScenario'] = activeScenario
        return node

    def _build_events(self, resource_name, warning_events, activeScenario, timestamp):
        events = []
        for event in warning_events[:3]:
            events.append({
                'nodeId': resource_name,
                'severity': 'warning',
                'timestamp': event.get('eventTime') or event.get('metadata', {}).get('creationTimestamp') or timestamp,
                'reason': self._sanitize_text(event.get('reason') or 'Warning'),
                'message': self._sanitize_text(event.get('message') or 'Warning event surfaced from the governed in-cluster snapshot'),
                'objectName': self._sanitize_text(event.get('involvedObject', {}).get('name') or resource_name),
            })
        if activeScenario:
            scenario_event = {
                'nodeId': resource_name,
                'severity': 'warning',
                'timestamp': timestamp,
                'reason': 'scenario',
                'message': f'Scenario {activeScenario} is active and the governed status snapshot is highlighting {resource_name}.',
                'objectName': self._sanitize_text(resource_name),
            }
            if not any(entry['nodeId'] == resource_name and entry['reason'] == 'scenario' for entry in events):
                events.append(scenario_event)
        return events

    def aggregate(self, activeScenario=None, max_nodes=None, max_events=None, max_output_bytes=None, window_seconds=None, namespace=None):
        timestamp = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        requested_namespace = namespace or ALLOWED_NAMESPACE
        if requested_namespace != ALLOWED_NAMESPACE:
            requested_namespace = ALLOWED_NAMESPACE
        max_nodes = self._coerce_limit(max_nodes if max_nodes is not None else DEFAULT_MAX_NODES, DEFAULT_MAX_NODES, MAX_ALLOWED_NODES)
        max_events = self._coerce_limit(max_events if max_events is not None else DEFAULT_MAX_EVENTS, DEFAULT_MAX_EVENTS, MAX_ALLOWED_EVENTS)
        max_output_bytes = self._coerce_limit(max_output_bytes if max_output_bytes is not None else DEFAULT_MAX_OUTPUT_BYTES, DEFAULT_MAX_OUTPUT_BYTES, MAX_ALLOWED_OUTPUT_BYTES)
        window_seconds = self._coerce_limit(window_seconds if window_seconds is not None else DEFAULT_MAX_WINDOW_SECONDS, DEFAULT_MAX_WINDOW_SECONDS, MAX_ALLOWED_WINDOW_SECONDS)
        nodes = []
        events = []
        for resource_name, spec in sorted(ALLOWED_RESOURCES.items()):
            resource = self._resource_items(resource_name, spec['kind'])[0] if self._resource_items(resource_name, spec['kind']) else None
            pods = self._pod_items(resource_name)
            service = self._service_items(resource_name)[0] if self._service_items(resource_name) else None
            endpoint = self._endpoint_items(resource_name)[0] if self._endpoint_items(resource_name) else None
            warning_events = [event for event in self._event_items(resource_name) if event.get('type') == 'Warning']
            request_error = self._request_error_for(
                self._resource_path(spec['kind'], ALLOWED_NAMESPACE),
                f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/pods',
                f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/services',
                f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/endpoints',
                f'/api/v1/namespaces/{ALLOWED_NAMESPACE}/events',
            )
            node = self._build_node(resource_name, resource, pods, service, endpoint, warning_events, request_error, activeScenario, timestamp)
            nodes.append(node)
            events.extend(self._build_events(resource_name, warning_events, activeScenario, timestamp))
        events.sort(key=lambda entry: (entry.get('reason') == 'scenario', entry.get('timestamp', '')))
        original_node_count = len(nodes)
        original_event_count = len(events)
        payload = {
            'schemaVersion': '1.2',
            'dataContractVersion': 'cloud-demo-v2',
            'namespace': ALLOWED_NAMESPACE,
            'generatedAt': timestamp,
            'sourceTimestamp': timestamp,
            'stalenessSeconds': 0,
            'allowlistedResources': sorted(ALLOWED_RESOURCES.keys()),
            'allowlistedNamespaces': [ALLOWED_NAMESPACE],
            'limits': {
                'maxNodes': max_nodes,
                'maxEvents': max_events,
                'maxOutputBytes': max_output_bytes,
                'maxWindowSeconds': window_seconds,
            },
            'nodes': nodes[:max_nodes],
            'events': events[:max_events],
            'activeScenario': activeScenario,
            'bannerMessage': 'Governed read-only in-cluster status snapshot loaded.',
            'scenarioNodeIds': [resource_name for resource_name in sorted(ALLOWED_RESOURCES.keys()) if resource_name in {'meter-service', 'asset-service', 'dispatch-service', 'mongodb', 'rabbitmq'}][:max_nodes],
        }
        serialized = json.dumps(payload).encode('utf-8')
        while len(serialized) > max_output_bytes and (payload['events'] or payload['nodes']):
            if payload['events']:
                payload['events'] = payload['events'][:-1]
            elif payload['nodes']:
                payload['nodes'] = payload['nodes'][:-1]
            serialized = json.dumps(payload).encode('utf-8')
        payload['outputBytes'] = len(serialized)
        payload['truncated'] = len(serialized) > max_output_bytes or len(payload['events']) < original_event_count or len(payload['nodes']) < original_node_count
        return payload


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/grid-status/v1'):
            params = parse_qs(parsed.query)
            payload = GridStatusAPI().aggregate(
                activeScenario=params.get('scenario', [None])[0],
                max_nodes=params.get('maxNodes', [None])[0],
                max_events=params.get('maxEvents', [None])[0],
                max_output_bytes=params.get('maxOutputBytes', [None])[0],
                window_seconds=params.get('windowSeconds', [None])[0],
            )
            body = json.dumps(payload).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    port = int(os.getenv('PORT', '8081'))
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'grid-status-api listening on {port}', file=sys.stderr)
    server.serve_forever()
