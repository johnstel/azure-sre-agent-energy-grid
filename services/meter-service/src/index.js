const http = require("http");
const amqp = require("amqplib");
const { context, trace } = require("@opentelemetry/api");
const { initializeTelemetry, buildTelemetryAttributes, extractCorrelationId, createCorrelationCarrier, setSpanStatus, addExceptionAttributes } = require("./telemetry");
const { createSyntheticEvent } = require("./synthetic-transaction");

const { tracer, resourceAttributes } = initializeTelemetry();

// ---------------------------------------------------------------------------
// Resilience constants (override via env for tuning without a redeploy)
// ---------------------------------------------------------------------------
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES, 10) || 1 * 1024 * 1024; // 1 MB
const RECONNECT_BASE_MS = parseInt(process.env.RECONNECT_BASE_MS, 10) || 1000;
const RECONNECT_MAX_MS = parseInt(process.env.RECONNECT_MAX_MS, 10) || 30000;
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 10000;

function createApp(dependencies = {}) {
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";
  const queueName = process.env.RABBITMQ_QUEUE || "meter-events";
  const rabbitHost = process.env.RABBITMQ_HOST || "rabbitmq";
  const rabbitPort = process.env.RABBITMQ_PORT || 5672;
  const rabbitUser = process.env.RABBITMQ_USERNAME || "";
  const rabbitPassword = process.env.RABBITMQ_PASSWORD || "";
  const rabbitUrl = process.env.RABBITMQ_URL || (rabbitUser && rabbitPassword ? `amqp://${rabbitUser}:${rabbitPassword}@${rabbitHost}:${rabbitPort}` : null);

  // -------------------------------------------------------------------------
  // RabbitMQ connection state — mutable so we can reconnect transparently
  // -------------------------------------------------------------------------
  let channel = null;
  let connection = null;
  let reconnectTimer = null;
  let shuttingDown = false;

  /** Connect (or reconnect) to RabbitMQ with exponential back-off + jitter. */
  async function connectRabbitMQ(attempt = 0) {
    if (shuttingDown || !rabbitUrl) return;
    try {
      connection = await amqp.connect(rabbitUrl);
      const ch = await connection.createChannel();
      await ch.assertQueue(queueName, { durable: true });
      channel = ch;
      if (attempt > 0) {
        console.log(`[meter-service] rabbitmq reconnected after ${attempt} retries`);
      } else {
        console.log("[meter-service] rabbitmq connected");
      }

      // Auto-reconnect on unexpected close / error
      connection.on("error", (err) => {
        console.error(`[meter-service] rabbitmq connection error: ${err.message}`);
      });
      connection.on("close", () => {
        if (!shuttingDown) {
          console.warn("[meter-service] rabbitmq connection closed unexpectedly, scheduling reconnect");
          channel = null;
          connection = null;
          scheduleReconnect();
        }
      });
      ch.on("error", (err) => {
        console.error(`[meter-service] rabbitmq channel error: ${err.message}`);
      });
      ch.on("close", () => {
        if (!shuttingDown) {
          console.warn("[meter-service] rabbitmq channel closed");
          channel = null;
        }
      });
    } catch (error) {
      channel = null;
      connection = null;
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
      const jitter = Math.floor(Math.random() * delay * 0.2);
      console.warn(`[meter-service] rabbitmq connect failed (attempt ${attempt + 1}): ${error.message}, retrying in ${delay + jitter}ms`);
      await new Promise((resolve) => { reconnectTimer = setTimeout(resolve, delay + jitter); });
      if (!shuttingDown) {
        return connectRabbitMQ(attempt + 1);
      }
    }
  }

  function scheduleReconnect() {
    if (shuttingDown) return;
    reconnectTimer = setTimeout(() => connectRabbitMQ(0), RECONNECT_BASE_MS);
  }

  // -------------------------------------------------------------------------
  // Initialise connection — honour injected channelPromise for tests
  // -------------------------------------------------------------------------
  let channelPromise;
  if (dependencies.channelPromise) {
    channelPromise = dependencies.channelPromise.then((ch) => { channel = ch; return ch; });
  } else {
    channelPromise = connectRabbitMQ(0);
  }

  // -------------------------------------------------------------------------
  // HTTP server
  // -------------------------------------------------------------------------
  const server = http.createServer(async (req, res) => {
    const correlationId = extractCorrelationId(req);
    const route = req.url.split("?")[0];

    const span = tracer.startSpan("http.server", {
      attributes: {
        ...buildTelemetryAttributes({
          "http.method": req.method,
          "http.route": route,
          "messaging.system": "rabbitmq"
        }),
        "http.request.method": req.method,
        "http.route": route,
        "correlation.id": correlationId,
        "service.instance.id": process.env.HOSTNAME || "meter-service"
      }
    });
    const ctx = trace.setSpan(context.active(), span);

    try {
      // --- Dependency-aware health check --------------------------------
      if (req.method === "GET" && route === "/health") {
        const rabbitOk = channel !== null;
        const status = rabbitOk ? "ok" : "degraded";
        const statusCode = rabbitOk ? 200 : 503;
        span.setAttributes({ "http.response.status_code": statusCode });
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status,
          service: "meter-service",
          correlationId,
          dependencies: { rabbitmq: rabbitOk ? "connected" : "disconnected" },
          telemetry: resourceAttributes
        }));
        return;
      }

      if (req.method === "POST" && route === "/events") {
        const body = await readBody(req, MAX_BODY_BYTES);
        const event = createSyntheticEvent(
          { ...body, correlationId: body.correlationId || correlationId },
          correlationId,
          { now: new Date() }
        );
        const carrier = createCorrelationCarrier(req, correlationId);
        const publishSpan = tracer.startSpan("rabbitmq.publish", {
          attributes: {
            ...buildTelemetryAttributes({
              "messaging.system": "rabbitmq",
              "messaging.destination": queueName,
              "messaging.operation": "publish",
              "messaging.destination_kind": "queue"
            }),
            "messaging.destination.name": queueName,
            "correlation.id": correlationId
          }
        });
        try {
          // --- Fail honestly when RabbitMQ is unavailable ----------------
          const ch = channel;
          if (!ch) {
            publishSpan.setAttributes({ "messaging.publish.skipped": true });
            publishSpan.end();
            span.setAttributes({ "http.response.status_code": 503 });
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "rabbitmq_unavailable", correlationId }));
            return;
          }
          ch.publish("", queueName, Buffer.from(JSON.stringify(event)), {
            persistent: true,
            headers: carrier
          });
          publishSpan.setAttributes({ "messaging.rabbitmq.queue": queueName, "messaging.message.id": event.id, "correlation.id": correlationId });
          publishSpan.end();
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ accepted: true, event, correlationId }));
          return;
        } catch (error) {
          addExceptionAttributes(publishSpan, error);
          setSpanStatus(publishSpan, error);
          publishSpan.end();
          throw error;
        }
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found", correlationId }));
    } catch (error) {
      addExceptionAttributes(span, error);
      setSpanStatus(span, error);
      const code = error.statusCode || 500;
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "internal_error", correlationId }));
    } finally {
      span.end();
    }
  });

  // -------------------------------------------------------------------------
  // Graceful shutdown — drain HTTP, close RabbitMQ, flush telemetry
  // -------------------------------------------------------------------------
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[meter-service] ${signal} received, shutting down gracefully…`);

    clearTimeout(reconnectTimer);

    // Stop accepting new connections; let in-flight requests finish
    server.close(() => { console.log("[meter-service] http server closed"); });

    // Close RabbitMQ cleanly
    try {
      if (channel) await channel.close().catch(() => {});
      if (connection) await connection.close().catch(() => {});
      console.log("[meter-service] rabbitmq connection closed");
    } catch (err) {
      console.warn(`[meter-service] rabbitmq cleanup error: ${err.message}`);
    }

    // Hard deadline — don't hang forever
    setTimeout(() => {
      console.warn("[meter-service] graceful shutdown timeout, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  return { server, port, host, channelPromise, shutdown };
}

// ---------------------------------------------------------------------------
// Body parser with size guard to prevent OOM from oversized payloads
// ---------------------------------------------------------------------------
async function readBody(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      req.destroy();
      const err = new Error(`request body exceeds ${maxBytes} byte limit`);
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function startServer(dependencies = {}) {
  const { server, port, host, shutdown } = createApp(dependencies);

  // Register shutdown hooks only when running as a real server (not in tests)
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server.listen(port, host, () => {
    console.log(`[meter-service] listening on ${host}:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
