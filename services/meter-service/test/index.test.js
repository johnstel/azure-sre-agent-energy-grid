const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { createApp } = require("../src/index");
const { buildTelemetryAttributes, extractCorrelationId } = require("../src/telemetry");

test("extractCorrelationId uses request header", () => {
  const req = { headers: { "x-correlation-id": "corr-123" } };
  assert.equal(extractCorrelationId(req), "corr-123");
});

test("buildTelemetryAttributes includes capability contract dimensions", () => {
  process.env.SRE_SCENARIO = "oom-killed";
  process.env.SRE_SERVICE = "meter-service";
  process.env.SRE_NAMESPACE = "energy";
  process.env.SRE_COMPONENT = "api";
  process.env.SRE_VERSION = "2026-04-25";
  const attrs = buildTelemetryAttributes({ "http.method": "POST" });
  assert.equal(attrs["sre.scenario"], "oom-killed");
  assert.equal(attrs["sre.service"], "meter-service");
  assert.equal(attrs["sre.namespace"], "energy");
  assert.equal(attrs["sre.component"], "api");
  assert.equal(attrs["sre.version"], "2026-04-25");
});

test("POST /events accepts a meter event", async () => {
  const channelPromise = Promise.resolve({
    publish: (_exchange, _queue, payload) => {
      assert.equal(payload.toString().includes("meterId"), true);
    }
  });
  const { server } = createApp({ channelPromise });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const response = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: "/events", method: "POST" }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on("error", reject);
    req.write(JSON.stringify({ meterId: "SM-1", reading: 55 }));
    req.end();
  });
  assert.equal(response.statusCode, 202);
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
