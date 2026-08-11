const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
const { context, propagation, trace, SpanStatusCode } = require("@opentelemetry/api");

function initializeTelemetry() {
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "";
  const resourceAttributes = {
    "service.name": process.env.OTEL_SERVICE_NAME || "meter-service",
    "service.namespace": process.env.SRE_NAMESPACE || "energy",
    "service.version": process.env.SRE_VERSION || "2026-04-25",
    "sre.scenario": process.env.SRE_SCENARIO || "",
    "sre.service": process.env.SRE_SERVICE || "meter-service",
    "sre.namespace": process.env.SRE_NAMESPACE || "energy",
    "sre.component": process.env.SRE_COMPONENT || "api",
    "sre.version": process.env.SRE_VERSION || "2026-04-25"
  };

  if (connectionString) {
    try {
      useAzureMonitor({
        connectionString,
        resource: { attributes: resourceAttributes }
      });
    } catch (error) {
      console.warn(`[meter-service] telemetry initialization failed: ${error.message}`);
    }
  }

  return {
    tracer: trace.getTracer("meter-service"),
    resourceAttributes
  };
}

function buildTelemetryAttributes(extra = {}) {
  return {
    "sre.scenario": process.env.SRE_SCENARIO || "",
    "sre.service": process.env.SRE_SERVICE || "meter-service",
    "sre.namespace": process.env.SRE_NAMESPACE || "energy",
    "sre.component": process.env.SRE_COMPONENT || "api",
    "sre.version": process.env.SRE_VERSION || "2026-04-25",
    ...extra
  };
}

function extractCorrelationId(req) {
  const header = req.headers["x-correlation-id"] || req.headers["x-correlationid"] || req.headers["x-ms-request-id"];
  return Array.isArray(header) ? header[0] : header || `meter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createCorrelationCarrier(_req, correlationId) {
  const carrier = {};
  const traceContext = context.active();
  propagation.inject(traceContext, carrier);
  carrier["x-correlation-id"] = correlationId;
  return carrier;
}

function setSpanStatus(span, error) {
  const message = error && error.message ? error.message : String(error);
  span.setStatus({
    code: error ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    message
  });
}

function addExceptionAttributes(span, error) {
  if (error) {
    span.recordException(error);
    span.setAttributes({ "error.type": error && error.name ? error.name : "Error" });
  }
}

module.exports = {
  initializeTelemetry,
  buildTelemetryAttributes,
  extractCorrelationId,
  createCorrelationCarrier,
  setSpanStatus,
  addExceptionAttributes
};
