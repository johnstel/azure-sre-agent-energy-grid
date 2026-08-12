const { randomUUID } = require("crypto");
const { SpanKind, SpanStatusCode } = require("@opentelemetry/api");
const { initializeTelemetry, buildTelemetryAttributes, shutdownTelemetry } = require("./telemetry");

const SYNTHETIC_RETENTION_MS = 5 * 60 * 1000;

function normalizeSyntheticReading(reading) {
  const numericValue = Number(reading);
  if (!Number.isFinite(numericValue)) {
    return 0.01;
  }
  return Math.min(0.1, Math.max(0.01, Math.abs(numericValue)));
}

function boundedSyntheticExpiry(payload, now) {
  const maximumExpiry = now.getTime() + SYNTHETIC_RETENTION_MS;
  const requestedExpiry = payload.expiresAt
    ? new Date(payload.expiresAt).getTime()
    : now.getTime() + Number(payload.expiresInMs || SYNTHETIC_RETENTION_MS);

  if (!Number.isFinite(requestedExpiry)) {
    return new Date(maximumExpiry).toISOString();
  }
  return new Date(Math.min(requestedExpiry, maximumExpiry)).toISOString();
}

function createSyntheticEvent(payload = {}, correlationId, options = {}) {
  const synthetic = Boolean(payload.synthetic === true || payload.syntheticName === "slo-meter-ingest" || payload.syntheticMode === "demo");
  const now = options.now ? new Date(options.now) : new Date();
  const event = {
    id: payload.id || (options.randomUUID || randomUUID)(),
    meterId: synthetic ? "SM-SYNTHETIC-0001" : (payload.meterId || "SM-0001"),
    reading: synthetic ? normalizeSyntheticReading(payload.reading) : (payload.reading ?? 0),
    zone: synthetic ? "Zone-Synthetic" : (payload.zone || "Zone-A North"),
    observedAt: payload.observedAt || now.toISOString(),
    correlationId: payload.correlationId || correlationId,
    synthetic
  };

  if (synthetic) {
    event.syntheticName = payload.syntheticName || "slo-meter-ingest";
    event.syntheticMode = payload.syntheticMode || "demo";
    event.expiresAt = boundedSyntheticExpiry(payload, now);
  }

  return event;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSyntheticTransaction(dependencies = {}) {
  const telemetry = initializeTelemetry();
  const tracer = dependencies.tracer || telemetry.tracer;
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const sleepImpl = dependencies.sleep || defaultSleep;
  const nowProvider = dependencies.now || (() => Date.now());
  const correlationId = dependencies.correlationId || `synthetic-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const meterServiceBaseUrl = dependencies.meterServiceBaseUrl || process.env.METER_SERVICE_URL || "http://meter-service.energy.svc.cluster.local:3000";
  const dispatchServiceBaseUrl = dependencies.dispatchServiceBaseUrl || process.env.DISPATCH_SERVICE_URL || "http://dispatch-service.energy.svc.cluster.local:3001";
  const totalTimeoutMs = Number(dependencies.totalTimeoutMs ?? process.env.SYNTHETIC_TOTAL_TIMEOUT_MS ?? 30000);
  const requestTimeoutMs = Number(dependencies.requestTimeoutMs ?? process.env.SYNTHETIC_REQUEST_TIMEOUT_MS ?? 2000);
  const maxRetries = Math.max(0, Number(dependencies.maxRetries ?? process.env.SYNTHETIC_MAX_RETRIES ?? 3));
  const backoffBaseMs = Number(dependencies.backoffBaseMs ?? process.env.SYNTHETIC_BACKOFF_BASE_MS ?? 100);
  const pollIntervalMs = Number(dependencies.pollIntervalMs ?? process.env.SYNTHETIC_POLL_INTERVAL_MS ?? 250);
  const startTime = nowProvider();
  const event = createSyntheticEvent({
    ...(dependencies.body || {}),
    // The runner is always a demo probe. Callers cannot accidentally turn its
    // write into an untagged customer reading by omitting these fields.
    synthetic: true,
    syntheticName: "slo-meter-ingest",
    syntheticMode: "demo"
  }, correlationId, { now: new Date(startTime) });

  const span = tracer.startSpan("slo.meter-ingest.transaction", {
    kind: SpanKind.SERVER,
    attributes: {
      ...buildTelemetryAttributes({
        "http.method": "POST",
        "http.route": "/events",
        "messaging.system": "rabbitmq"
      }),
      "synthetic.name": "slo-meter-ingest",
      "synthetic.mode": "demo",
      "synthetic.correlation_id": correlationId,
      "synthetic.failure_stage": "success"
    }
  });

  const result = {
    success: false,
    correlationId,
    failureStage: "success",
    attempts: 0,
    elapsedMs: 0,
    status: "failed"
  };

  try {
    let accepted = false;
    let ingressError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      result.attempts = attempt + 1;
      const requestController = requestTimeoutMs > 0 ? AbortSignal.timeout(requestTimeoutMs) : undefined;
      try {
        const response = await fetchImpl(`${meterServiceBaseUrl}/events`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-correlation-id": correlationId
          },
          body: JSON.stringify(event),
          signal: requestController
        });
        if (response.ok || response.status === 202) {
          accepted = true;
          break;
        }
        ingressError = new Error(`meter-service ingress returned ${response.status}`);
      } catch (error) {
        ingressError = error;
      }

      if (nowProvider() - startTime >= totalTimeoutMs) {
        break;
      }
      if (attempt < maxRetries) {
        await sleepImpl(Math.max(0, backoffBaseMs * (attempt + 1)));
      }
    }

    if (!accepted) {
      result.success = false;
      result.failureStage = "ingress";
      result.status = "failed";
      result.error = ingressError && ingressError.message ? ingressError.message : "ingress failed";
      span.setAttributes({ "synthetic.failure_stage": result.failureStage });
      span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
      span.recordException(ingressError || new Error(result.error));
      return result;
    }

    let completionError = null;
    while (nowProvider() - startTime < totalTimeoutMs) {
      const requestController = requestTimeoutMs > 0 ? AbortSignal.timeout(requestTimeoutMs) : undefined;
      try {
        const response = await fetchImpl(`${dispatchServiceBaseUrl}/transactions/${encodeURIComponent(correlationId)}`, {
          headers: {
            "x-correlation-id": correlationId
          },
          signal: requestController
        });
        if (response.status === 200) {
          const payload = await response.json();
          result.success = true;
          result.failureStage = "success";
          result.status = payload.status || "completed";
          result.dispatchStatus = payload.status || "completed";
          result.completedAt = payload.persistedAt || null;
          span.setAttributes({ "synthetic.failure_stage": result.failureStage });
          span.setStatus({ code: SpanStatusCode.OK, message: "completed" });
          return result;
        }
        if (response.status === 404) {
          await sleepImpl(pollIntervalMs);
          continue;
        }
        completionError = new Error(`dispatch lookup returned ${response.status}`);
        break;
      } catch (error) {
        completionError = error;
        break;
      }
    }

    if (completionError) {
      result.success = false;
      result.failureStage = "completion_check";
      result.status = "failed";
      result.error = completionError && completionError.message ? completionError.message : "dispatch lookup failed";
      span.setAttributes({ "synthetic.failure_stage": result.failureStage });
      span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
      span.recordException(completionError);
      return result;
    }

    result.success = false;
    result.failureStage = "persistence_timeout";
    result.status = "failed";
    result.error = "dispatch transaction not persisted before deadline";
    span.setAttributes({ "synthetic.failure_stage": result.failureStage });
    span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
    return result;
  } finally {
    result.elapsedMs = nowProvider() - startTime;
    span.setAttributes({
      "synthetic.success": result.success,
      "synthetic.elapsed_ms": result.elapsedMs
    });
    span.end();
  }
}

async function main(dependencies = {}) {
  const result = await runSyntheticTransaction(dependencies);
  try {
    await (dependencies.flushTelemetry || shutdownTelemetry)();
  } catch (error) {
    result.success = false;
    result.status = "failed";
    result.failureStage = "telemetry_export";
    result.error = error && error.message ? error.message : "telemetry export failed";
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.success ? 0 : 1;
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ success: false, failureStage: "ingress", error: error && error.message ? error.message : "unknown_error" })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  boundedSyntheticExpiry,
  createSyntheticEvent,
  normalizeSyntheticReading,
  runSyntheticTransaction,
  main
};
