(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GridMapHelpers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_TOPOLOGY = {
    schemaVersion: '1.2',
    host: 'ops-console',
    namespace: 'energy',
    disclaimer: 'Demo topology only. This map visualizes Kubernetes service/application health for the Azure SRE Agent demo and is not connected to real grid telemetry, SCADA, GIS, or utility infrastructure.',
    dataContract: {
      version: 'cloud-demo-v2',
      source: 'governed read-only in-cluster status API',
      refreshSeconds: 30,
      severityOrder: ['healthy', 'warning', 'critical'],
      unknownHandling: 'Unknown is a separate non-propagating state. Do not treat unknown as worse than critical.',
      allowlistedNamespaces: ['energy'],
      allowlistedResources: ['asset-service', 'meter-service', 'dispatch-service', 'mongodb', 'rabbitmq', 'load-simulator', 'grid-worker', 'grid-dashboard', 'ops-console'],
      transientScenarioCoverage: ['high-cpu', 'pending-pods', 'probe-failure', 'missing-config'],
      maxNodes: 12,
      maxEvents: 8,
      maxOutputBytes: 16384,
      maxWindowSeconds: 900
    },
    nodes: [
      { id: 'grid-dashboard', label: 'Consumer Portal', resourceName: 'grid-dashboard', metaphor: 'Customer Energy Portal', kind: 'service', icon: 'dashboard', position: { x: 120, y: 120 }, healthSource: 'static', stateNote: 'Static cloud portal context.' },
      { id: 'ops-console', label: 'Grid Operations Console', resourceName: 'ops-console', metaphor: 'Control Room', kind: 'service', icon: 'console', position: { x: 120, y: 320 }, healthSource: 'static', stateNote: 'Host surface for the grid map.' },
      { id: 'meter-service', label: 'Meter Service', resourceName: 'meter-service', metaphor: 'Smart Meter Ingestion', kind: 'service', icon: 'meter', position: { x: 360, y: 120 }, healthSource: 'live', healthPath: '/api/meter/health', stateNote: 'Live health endpoint and governed status API.' },
      { id: 'asset-service', label: 'Asset Service', resourceName: 'asset-service', metaphor: 'Asset Catalog', kind: 'service', icon: 'assets', position: { x: 360, y: 320 }, healthSource: 'live', healthPath: '/api/assets/health', stateNote: 'Live health endpoint and governed status API.' },
      { id: 'dispatch-service', label: 'Dispatch Service', resourceName: 'dispatch-service', metaphor: 'Energy Dispatch', kind: 'service', icon: 'dispatch', position: { x: 600, y: 220 }, healthSource: 'live', healthPath: '/api/dispatch/health', stateNote: 'Live health endpoint and governed status API.' },
      { id: 'rabbitmq', label: 'RabbitMQ', resourceName: 'rabbitmq', metaphor: 'Event Bus', kind: 'datastore', icon: 'queue', position: { x: 600, y: 60 }, healthSource: 'status', stateNote: 'Governed in-cluster status only.' },
      { id: 'mongodb', label: 'MongoDB', resourceName: 'mongodb', metaphor: 'Meter Data Store', kind: 'datastore', icon: 'database', position: { x: 840, y: 220 }, healthSource: 'status', stateNote: 'Governed in-cluster status only.' },
      { id: 'load-simulator', label: 'Load Simulator', resourceName: 'load-simulator', metaphor: 'Consumer Demand Simulator', kind: 'service', icon: 'simulator', position: { x: 360, y: 520 }, healthSource: 'static', stateNote: 'Static load context.' },
      { id: 'grid-worker', label: 'Grid Worker', resourceName: 'grid-worker', metaphor: 'Dispatch Worker', kind: 'service', icon: 'worker', position: { x: 600, y: 520 }, healthSource: 'static', replicas: 0, stateNote: 'Disabled in application.yaml with replicas: 0 due to AMQP protocol mismatch.' },
      { id: 'forecast-service', label: 'Forecast Service', resourceName: 'forecast-service', metaphor: 'Demand Forecast', kind: 'service', icon: 'forecast', position: { x: 840, y: 420 }, healthSource: 'optional', optional: true, absentBehavior: 'Render as unknown with label Optional service absent in current deployment' },
      { id: 'frequency-calc-overload', label: 'Frequency Calc Overload', resourceName: 'frequency-calc-overload', metaphor: 'CPU-heavy control loop', kind: 'service', icon: 'cpu', position: { x: 1040, y: 90 }, healthSource: 'status', transient: true, scenarioId: 'high-cpu', stateNote: 'Visible during high CPU stress scenarios.' },
      { id: 'substation-monitor', label: 'Substation Monitor', resourceName: 'substation-monitor', metaphor: 'Scheduling-sensitive monitor', kind: 'service', icon: 'monitor', position: { x: 1040, y: 250 }, healthSource: 'status', transient: true, scenarioId: 'pending-pods', stateNote: 'Visible when pods remain Pending.' },
      { id: 'grid-health-monitor', label: 'Grid Health Monitor', resourceName: 'grid-health-monitor', metaphor: 'Probe-sensitive health watcher', kind: 'service', icon: 'probe', position: { x: 1040, y: 410 }, healthSource: 'status', transient: true, scenarioId: 'probe-failure', stateNote: 'Visible when readiness probes fail.' },
      { id: 'grid-zone-config', label: 'Grid Zone Config', resourceName: 'grid-zone-config', metaphor: 'Scenario configuration source', kind: 'service', icon: 'config', position: { x: 1040, y: 560 }, healthSource: 'status', transient: true, scenarioId: 'missing-config', stateNote: 'Visible when a configuration object is missing.' }
    ],
    edges: [
      { source: 'grid-dashboard', target: 'meter-service', label: 'Usage and billing data', type: 'sync' },
      { source: 'grid-dashboard', target: 'asset-service', label: 'Asset catalog reads', type: 'sync' },
      { source: 'ops-console', target: 'dispatch-service', label: 'Operations data', type: 'sync' },
      { source: 'ops-console', target: 'asset-service', label: 'Asset inventory', type: 'sync' },
      { source: 'meter-service', target: 'rabbitmq', label: 'Meter events', type: 'async' },
      { source: 'meter-service', target: 'mongodb', label: 'Meter readings', type: 'sync' },
      { source: 'rabbitmq', target: 'dispatch-service', label: 'Dispatch commands', type: 'async' },
      { source: 'dispatch-service', target: 'mongodb', label: 'Grid state writes', type: 'sync' },
      { source: 'asset-service', target: 'mongodb', label: 'Asset catalog data', type: 'sync' },
      { source: 'dispatch-service', target: 'asset-service', label: 'Asset lookups', type: 'sync' },
      { source: 'asset-service', target: 'forecast-service', label: 'Demand forecast', type: 'sync', optional: true },
      { source: 'load-simulator', target: 'meter-service', label: 'Simulated meter usage', type: 'sync' },
      { source: 'grid-worker', target: 'dispatch-service', label: 'Disabled dispatch processing path', type: 'sync', disabled: true },
      { source: 'dispatch-service', target: 'frequency-calc-overload', label: 'Control loop pressure', type: 'control', transient: true, scenarioId: 'high-cpu' },
      { source: 'dispatch-service', target: 'substation-monitor', label: 'Scheduling pressure', type: 'control', transient: true, scenarioId: 'pending-pods' },
      { source: 'dispatch-service', target: 'grid-health-monitor', label: 'Readiness probe watch', type: 'control', transient: true, scenarioId: 'probe-failure' },
      { source: 'dispatch-service', target: 'grid-zone-config', label: 'Configuration dependency', type: 'control', transient: true, scenarioId: 'missing-config' }
    ],
    scenarioMappings: {
      'oom-killed': { nodeId: 'meter-service', severity: 'critical' },
      'crash-loop': { nodeId: 'asset-service', severity: 'critical' },
      'image-pull-backoff': { nodeId: 'dispatch-service', severity: 'critical' },
      'high-cpu': { nodeId: 'frequency-calc-overload', severity: 'warning' },
      'pending-pods': { nodeId: 'substation-monitor', severity: 'warning' },
      'probe-failure': { nodeId: 'grid-health-monitor', severity: 'warning' },
      'network-block': { nodeId: 'meter-service', severity: 'critical' },
      'missing-config': { nodeId: 'grid-zone-config', severity: 'warning' },
      'mongodb-down': { nodeId: 'mongodb', severity: 'critical' },
      'service-mismatch': { nodeId: 'meter-service', severity: 'critical' }
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildTopology() {
    return clone(DEFAULT_TOPOLOGY);
  }

  function normalizeStatus(value) {
    if (value === 'healthy' || value === 'warning' || value === 'critical' || value === 'unknown') {
      return value;
    }
    return 'unknown';
  }

  function parseTimestamp(value, fallback) {
    if (!value) {
      return fallback || Date.now();
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : (fallback || Date.now());
  }

  function buildHealthById(payload, now) {
    const healthById = {};
    const nodes = Array.isArray(payload && payload.nodes) ? payload.nodes : [];
    const currentTime = now || Date.now();
    nodes.forEach(function (node) {
      const nodeId = node && node.id;
      if (!nodeId) {
        return;
      }
      const checkedAt = parseTimestamp(node.sourceTimestamp, currentTime);
      healthById[nodeId] = {
        id: nodeId,
        severity: normalizeStatus(node.status || node.severity || 'unknown'),
        checkedAt: checkedAt,
        successAt: checkedAt,
        reason: node.reason || 'governed-status',
        source: node,
        summary: node.summary || ('Governed status: ' + normalizeStatus(node.status || node.severity || 'unknown'))
      };
    });
    return healthById;
  }

  function getScenarioMapping(topology, activeScenario) {
    if (!activeScenario || !topology || !topology.scenarioMappings) {
      return null;
    }
    return topology.scenarioMappings[activeScenario] || null;
  }

  function getScenarioNodeIds(topology, activeScenario) {
    const ids = [];
    const mapping = getScenarioMapping(topology, activeScenario);
    if (mapping && mapping.nodeId) {
      ids.push(mapping.nodeId);
    }
    if (topology && Array.isArray(topology.nodes)) {
      topology.nodes.forEach(function (node) {
        if (node && node.transient && node.scenarioId === activeScenario) {
          ids.push(node.id);
        }
      });
    }
    return Array.from(new Set(ids));
  }

  function buildEventsFromPayload(payload, topology, now) {
    const currentTime = now || Date.now();
    const events = [];
    const rawEvents = Array.isArray(payload && payload.events) ? payload.events : [];
    const activeScenario = payload && payload.activeScenario ? payload.activeScenario : null;
    const mapping = getScenarioMapping(topology, activeScenario);
    const maxEvents = (topology && topology.dataContract && topology.dataContract.maxEvents) || 8;

    rawEvents.forEach(function (event) {
      if (!event) {
        return;
      }
      events.push({
        nodeId: event.nodeId || (mapping && mapping.nodeId) || null,
        severity: normalizeStatus(event.severity || 'unknown'),
        timestamp: event.timestamp || new Date(currentTime).toISOString(),
        reason: event.reason || 'status',
        message: event.message || 'Governed status update',
        source: event
      });
    });

    if (activeScenario && mapping && !events.some(function (entry) { return entry.nodeId === mapping.nodeId; })) {
      events.unshift({
        nodeId: mapping.nodeId,
        severity: normalizeStatus(mapping.severity || 'warning'),
        timestamp: new Date(currentTime).toISOString(),
        reason: 'scenario',
        message: 'Transient scenario node surfaced for ' + activeScenario,
        source: { scenarioId: activeScenario }
      });
    }

    return events.slice(0, maxEvents);
  }

  function mergeStatusPayload(existingHealthById, payload, now, topology) {
    const healthById = existingHealthById ? clone(existingHealthById) : {};
    const overrideHealth = buildHealthById(payload, now);
    Object.keys(overrideHealth).forEach(function (key) {
      healthById[key] = overrideHealth[key];
    });
    return {
      healthById: healthById,
      events: buildEventsFromPayload(payload, topology, now),
      activeScenario: payload && payload.activeScenario ? payload.activeScenario : null,
      bannerMessage: payload && payload.bannerMessage ? payload.bannerMessage : 'Governed in-cluster status snapshot loaded.'
    };
  }

  function buildStatusSnapshot(payload, topology, now) {
    const merged = mergeStatusPayload({}, payload, now, topology);
    const activeScenario = payload && payload.activeScenario ? payload.activeScenario : null;
    const scenarioNodeIds = getScenarioNodeIds(topology, activeScenario);
    return {
      healthById: merged.healthById,
      events: merged.events,
      activeScenario: activeScenario,
      bannerMessage: merged.bannerMessage,
      scenarioNodeIds: scenarioNodeIds
    };
  }

  return {
    buildTopology: buildTopology,
    mergeStatusPayload: mergeStatusPayload,
    normalizeStatus: normalizeStatus,
    buildHealthById: buildHealthById,
    buildEventsFromPayload: buildEventsFromPayload,
    buildStatusSnapshot: buildStatusSnapshot,
    getScenarioNodeIds: getScenarioNodeIds,
    getScenarioMapping: getScenarioMapping,
    parseTimestamp: parseTimestamp
  };
});
