const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyntheticEvent, runSyntheticTransaction, main } = require("../src/synthetic-transaction");

test("createSyntheticEvent builds a safe demo event", () => {
  const event = createSyntheticEvent({ synthetic: true }, "corr-1", { now: new Date("2026-01-01T00:00:00.000Z") });
  assert.equal(event.synthetic, true);
  assert.equal(event.syntheticName, "slo-meter-ingest");
  assert.equal(event.syntheticMode, "demo");
  assert.equal(event.correlationId, "corr-1");
  assert.equal(event.meterId, "SM-SYNTHETIC-0001");
  assert.equal(event.reading, 0.01);
  assert.ok(new Date(event.expiresAt).getTime() > new Date("2026-01-01T00:00:00.000Z").getTime());
});

test("createSyntheticEvent does not expire a regular meter event", () => {
  const event = createSyntheticEvent({ meterId: "SM-REAL-1", reading: 12 }, "corr-regular", {
    now: new Date("2026-01-01T00:00:00.000Z")
  });
  assert.equal(event.synthetic, false);
  assert.equal(event.expiresAt, undefined);
  assert.equal(event.meterId, "SM-REAL-1");
});

test("createSyntheticEvent bounds synthetic input to safe test data and retention", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const event = createSyntheticEvent({
    synthetic: true,
    meterId: "SM-REAL-1",
    zone: "Zone-A North",
    reading: 999,
    expiresAt: "2099-01-01T00:00:00.000Z",
  }, "corr-bounded", { now });

  assert.equal(event.meterId, "SM-SYNTHETIC-0001");
  assert.equal(event.zone, "Zone-Synthetic");
  assert.equal(event.reading, 0.1);
  assert.equal(event.expiresAt, "2026-01-01T00:05:00.000Z");
});

test("runSyntheticTransaction succeeds after dispatch completion", async () => {
  let calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/events")) {
      return { ok: true, status: 202, json: async () => ({}) };
    }
    return { status: 200, json: async () => ({ status: "completed", persistedAt: "2026-01-01T00:00:01.000Z" }) };
  };
  const result = await runSyntheticTransaction({
    fetch: fetchImpl,
    sleep: async () => {},
    now: () => 0,
    totalTimeoutMs: 1000,
    requestTimeoutMs: 1,
    maxRetries: 0,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service"
  });
  assert.equal(result.success, true);
  assert.equal(result.failureStage, "success");
  assert.equal(calls.length, 2);
  const event = JSON.parse(calls[0].options.body);
  assert.equal(event.synthetic, true);
  assert.equal(event.syntheticName, "slo-meter-ingest");
  assert.equal(event.syntheticMode, "demo");
  assert.equal(event.meterId, "SM-SYNTHETIC-0001");
  assert.ok(event.expiresAt);
});

test("runSyntheticTransaction reports ingress failure", async () => {
  const result = await runSyntheticTransaction({
    fetch: async () => ({ status: 500, ok: false }),
    sleep: async () => {},
    now: () => 0,
    totalTimeoutMs: 10,
    requestTimeoutMs: 1,
    maxRetries: 0,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service"
  });
  assert.equal(result.success, false);
  assert.equal(result.failureStage, "ingress");
});

test("runSyntheticTransaction handles delayed completion", async () => {
  let nowValue = 0;
  const fetchImpl = async (url) => {
    if (url.includes("/events")) {
      return { ok: true, status: 202, json: async () => ({}) };
    }
    if (nowValue < 50) {
      nowValue += 20;
      return { status: 404 };
    }
    return { status: 200, json: async () => ({ status: "completed", persistedAt: "2026-01-01T00:00:01.000Z" }) };
  };
  const result = await runSyntheticTransaction({
    fetch: fetchImpl,
    sleep: async () => {},
    now: () => {
      const value = nowValue;
      nowValue += 1;
      return value;
    },
    totalTimeoutMs: 200,
    requestTimeoutMs: 1,
    maxRetries: 0,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service"
  });
  assert.equal(result.success, true);
  assert.equal(result.failureStage, "success");
});

test("runSyntheticTransaction uses one correlation id across retries", async () => {
  const correlationId = "corr-retry";
  const seen = [];
  const result = await runSyntheticTransaction({
    correlationId,
    fetch: async (url, options) => {
      seen.push({ url, correlationId: options.headers["x-correlation-id"] });
      if (url.includes("/events")) {
        if (seen.length < 2) {
          return { status: 500, ok: false };
        }
        return { ok: true, status: 202, json: async () => ({}) };
      }
      return { status: 200, json: async () => ({ status: "completed", persistedAt: "2026-01-01T00:00:01.000Z" }) };
    },
    sleep: async () => {},
    now: () => 0,
    totalTimeoutMs: 1000,
    requestTimeoutMs: 1,
    maxRetries: 1,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service"
  });
  assert.equal(result.success, true);
  assert.equal(result.failureStage, "success");
  assert.ok(seen.every((entry) => entry.correlationId === correlationId));
});

test("runSyntheticTransaction classifies 404 responses through the deadline as a persistence failure", async () => {
  let nowValue = 0;
  const result = await runSyntheticTransaction({
    fetch: async (url) => {
      if (url.includes("/events")) {
        return { ok: true, status: 202, json: async () => ({}) };
      }
      return { status: 404 };
    },
    sleep: async () => {},
    now: () => {
      const value = nowValue;
      nowValue += 1;
      return value;
    },
    totalTimeoutMs: 1,
    requestTimeoutMs: 1,
    maxRetries: 0,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service"
  });
  assert.equal(result.success, false);
  assert.equal(result.failureStage, "persistence");
  assert.equal(result.failureReason, "persistence_confirmation_timeout");
});

test("runSyntheticTransaction classifies dispatch HTTP failures as persistence failures", async () => {
  const span = recordingSpan();
  const result = await runSyntheticTransaction({
    fetch: async (url) => {
      if (url.includes("/events")) {
        return { ok: true, status: 202, json: async () => ({}) };
      }
      return { status: 500 };
    },
    sleep: async () => {},
    now: () => 0,
    totalTimeoutMs: 10,
    requestTimeoutMs: 1,
    maxRetries: 0,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service",
    tracer: { startSpan: () => span }
  });
  assert.equal(result.success, false);
  assert.equal(result.failureStage, "persistence");
  assert.equal(result.failureReason, "persistence_http_500");
  assert.equal(span.attributes["synthetic.failure_stage"], "persistence");
  assert.equal(span.attributes["synthetic.failure_reason"], "persistence_http_500");
});

test("runSyntheticTransaction classifies dispatch timeout as a persistence failure", async () => {
  const result = await runSyntheticTransaction({
    fetch: async (url) => {
      if (url.includes("/events")) return { ok: true, status: 202, json: async () => ({}) };
      const error = new Error("request timed out");
      error.name = "TimeoutError";
      throw error;
    },
    sleep: async () => {},
    now: () => 0,
    totalTimeoutMs: 10,
    requestTimeoutMs: 1,
    maxRetries: 0,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service"
  });
  assert.equal(result.success, false);
  assert.equal(result.failureStage, "persistence");
  assert.equal(result.failureReason, "persistence_timeout");
});

test("runSyntheticTransaction classifies dispatch connection refusal as a persistence failure", async () => {
  const result = await runSyntheticTransaction({
    fetch: async (url) => {
      if (url.includes("/events")) return { ok: true, status: 202, json: async () => ({}) };
      throw new Error("connect ECONNREFUSED dispatch-service");
    },
    sleep: async () => {},
    now: () => 0,
    totalTimeoutMs: 10,
    requestTimeoutMs: 1,
    maxRetries: 0,
    pollIntervalMs: 0,
    backoffBaseMs: 0,
    meterServiceBaseUrl: "http://meter-service",
    dispatchServiceBaseUrl: "http://dispatch-service"
  });
  assert.equal(result.success, false);
  assert.equal(result.failureStage, "persistence");
  assert.equal(result.failureReason, "persistence_request_error");
});

test("main writes a JSON result for the synthetic transaction runner", async () => {
  const originalWrite = process.stdout.write;
  const chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  let flushed = false;
  try {
    await main({
      fetch: async (url) => {
        if (url.includes("/events")) {
          return { ok: true, status: 202, json: async () => ({}) };
        }
        return { status: 200, json: async () => ({ status: "completed", persistedAt: "2026-01-01T00:00:01.000Z" }) };
      },
      sleep: async () => {},
      now: () => 0,
      totalTimeoutMs: 10,
      requestTimeoutMs: 1,
      maxRetries: 0,
      pollIntervalMs: 0,
      backoffBaseMs: 0,
      meterServiceBaseUrl: "http://meter-service",
      dispatchServiceBaseUrl: "http://dispatch-service",
      flushTelemetry: async () => {
        flushed = true;
      }
    });
    assert.equal(flushed, true);
    assert.ok(chunks.some((chunk) => chunk.includes('"success":true')));
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = previousExitCode;
  }
});

test("main fails the job when telemetry cannot be flushed", async () => {
  const originalWrite = process.stdout.write;
  const chunks = [];
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    const result = await main({
      fetch: async (url) => url.includes("/events")
        ? { ok: true, status: 202, json: async () => ({}) }
        : { status: 200, json: async () => ({ status: "completed", persistedAt: "2026-01-01T00:00:01.000Z" }) },
      sleep: async () => {},
      now: () => 0,
      totalTimeoutMs: 10,
      requestTimeoutMs: 1,
      maxRetries: 0,
      pollIntervalMs: 0,
      backoffBaseMs: 0,
      meterServiceBaseUrl: "http://meter-service",
      dispatchServiceBaseUrl: "http://dispatch-service",
      flushTelemetry: async () => {
        throw new Error("export unavailable");
      }
    });

    assert.equal(result.success, false);
    assert.equal(result.failureStage, "telemetry_export");
    assert.equal(process.exitCode, 1);
    assert.ok(chunks.some((chunk) => chunk.includes('"telemetry_export"')));
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = previousExitCode;
  }
});

function recordingSpan() {
  return {
    attributes: {},
    setAttributes(values) {
      Object.assign(this.attributes, values);
    },
    setStatus() {},
    recordException() {},
    end() {}
  };
}
