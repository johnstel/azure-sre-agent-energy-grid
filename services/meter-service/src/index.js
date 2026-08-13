const http = require("http");
const amqp = require("amqplib");
const { context, trace } = require("@opentelemetry/api");
const { initializeTelemetry, buildTelemetryAttributes, extractCorrelationId, createCorrelationCarrier, setSpanStatus, addExceptionAttributes } = require("./telemetry");
const { createSyntheticEvent } = require("./synthetic-transaction");

const { tracer, resourceAttributes } = initializeTelemetry();

function createApp(dependencies = {}) {
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";
  const queueName = process.env.RABBITMQ_QUEUE || "meter-events";
  const rabbitHost = process.env.RABBITMQ_HOST || "rabbitmq";
  const rabbitPort = process.env.RABBITMQ_PORT || 5672;
  const rabbitUser = process.env.RABBITMQ_USERNAME || "";
  const rabbitPassword = process.env.RABBITMQ_PASSWORD || "";
  const rabbitUrl = process.env.RABBITMQ_URL || (rabbitUser && rabbitPassword ? `amqp://${rabbitUser}:${rabbitPassword}@${rabbitHost}:${rabbitPort}` : null);
  let channelPromise = dependencies.channelPromise;

  if (!channelPromise) {
    channelPromise = (async () => {
      if (!rabbitUrl) {
        return null;
      }
      try {
        const connection = await amqp.connect(rabbitUrl);
        const ch = await connection.createChannel();
        await ch.assertQueue(queueName, { durable: true });
        return ch;
      } catch (error) {
        console.warn(`[meter-service] rabbitmq unavailable: ${error.message}`);
        return null;
      }
    })();
  }

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
      if (req.method === "GET" && route === "/health") {
        span.setAttributes({ "http.response.status_code": 200, "rpc.grpc.status_code": 0 });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "meter-service", correlationId, telemetry: resourceAttributes }));
        return;
      }

      if (req.method === "POST" && route === "/events") {
        const body = await readBody(req);
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
          const ch = await channelPromise;
          if (ch) {
            ch.publish("", queueName, Buffer.from(JSON.stringify(event)), {
              persistent: true,
              headers: carrier
            });
          }
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
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "internal_error", correlationId }));
    } finally {
      span.end();
    }
  });

  return { server, port, host, channelPromise };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
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
  const { server, port, host } = createApp(dependencies);
  return server.listen(port, host, () => {
    console.log(`[meter-service] listening on ${host}:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
