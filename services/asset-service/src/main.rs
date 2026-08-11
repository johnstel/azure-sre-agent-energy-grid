use std::{env, net::SocketAddr};

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use opentelemetry::{
    global,
    trace::{Span, Tracer},
    KeyValue,
};
use opentelemetry_otlp::{SpanExporter, WithExportConfig};
use opentelemetry_sdk::trace::SdkTracerProvider;
use serde::Serialize;
use serde_json::json;
use tokio::net::TcpListener;
use tracing::{info, instrument};

#[derive(Clone)]
struct AppState {
    service_name: String,
    namespace: String,
    scenario: String,
    component: String,
    version: String,
}

#[derive(Serialize)]
struct AssetItem {
    id: usize,
    name: String,
    kind: String,
    capacity_mw: usize,
    status: String,
}

fn resolve_otlp_endpoint() -> Option<String> {
    env::var("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
        .ok()
        .or_else(|| env::var("OTEL_EXPORTER_OTLP_ENDPOINT").ok())
        .or_else(|| {
            env::var("APPLICATIONINSIGHTS_CONNECTION_STRING").ok().and_then(|connection_string| {
                connection_string
                    .split(';')
                    .find_map(|entry| {
                        let mut parts = entry.splitn(2, '=');
                        let key = parts.next()?.trim();
                        let value = parts.next()?.trim();
                        (key.eq_ignore_ascii_case("IngestionEndpoint")).then(|| format!("{}/v2/track", value.trim_end_matches('/')))
                    })
            })
        })
}

fn init_tracing() {
    let provider = if let Some(endpoint) = resolve_otlp_endpoint() {
        let exporter = SpanExporter::builder()
            .with_http()
            .with_endpoint(&endpoint)
            .build()
            .expect("otlp exporter");
        SdkTracerProvider::builder()
            .with_batch_exporter(exporter)
            .build()
    } else {
        SdkTracerProvider::builder()
            .with_simple_exporter(opentelemetry_stdout::SpanExporter::default())
            .build()
    };
    global::set_tracer_provider(provider);
}

fn build_state() -> AppState {
    AppState {
        service_name: env::var("SRE_SERVICE").unwrap_or_else(|_| "asset-service".to_string()),
        namespace: env::var("SRE_NAMESPACE").unwrap_or_else(|_| "energy".to_string()),
        scenario: env::var("SRE_SCENARIO").unwrap_or_default(),
        component: env::var("SRE_COMPONENT").unwrap_or_else(|_| "api".to_string()),
        version: env::var("SRE_VERSION").unwrap_or_else(|_| "2026-04-25".to_string()),
    }
}

fn build_attributes(state: &AppState, method: &str, route: &str, status: u16) -> Vec<KeyValue> {
    vec![
        KeyValue::new("sre.scenario", state.scenario.clone()),
        KeyValue::new("sre.service", state.service_name.clone()),
        KeyValue::new("sre.namespace", state.namespace.clone()),
        KeyValue::new("sre.component", state.component.clone()),
        KeyValue::new("sre.version", state.version.clone()),
        KeyValue::new("http.method", method.to_string()),
        KeyValue::new("http.route", route.to_string()),
        KeyValue::new("http.response.status_code", status as i64),
    ]
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let mut span = global::tracer("asset-service").start("asset.health");
    for attribute in build_attributes(&state, "GET", "/health", 200) {
        span.set_attribute(attribute);
    }
    let body = json!({ "status": "ok", "service": "asset-service", "telemetry": {"sre.scenario": state.scenario, "sre.service": state.service_name, "sre.namespace": state.namespace, "sre.component": state.component, "sre.version": state.version} });
    (StatusCode::OK, Json(body)).into_response()
}

#[instrument(skip_all)]
async fn list_assets(State(state): State<AppState>) -> impl IntoResponse {
    let mut span = global::tracer("asset-service").start("asset.list");
    for attribute in build_attributes(&state, "GET", "/", 200) {
        span.set_attribute(attribute);
    }
    let items = (1..=5)
        .map(|index| AssetItem {
            id: index,
            name: format!("Asset {index}"),
            kind: match index {
                1 => "Solar Farm".to_string(),
                2 => "Wind Turbine".to_string(),
                3 => "Gas Turbine".to_string(),
                4 => "Battery Storage".to_string(),
                _ => "Substation".to_string(),
            },
            capacity_mw: 120 + index * 30,
            status: "online".to_string(),
        })
        .collect::<Vec<_>>();
    Json(items).into_response()
}

#[instrument(skip_all)]
async fn raise_exception(State(state): State<AppState>) -> impl IntoResponse {
    let mut span = global::tracer("asset-service").start("asset.exception");
    for attribute in build_attributes(&state, "GET", "/debug/exception", 500) {
        span.set_attribute(attribute);
    }
    span.set_status(opentelemetry::trace::Status::error("simulated exception"));
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "simulated_exception" }))).into_response()
}

#[tokio::main]
async fn main() {
    init_tracing();
    let state = build_state();
    let app = Router::new()
        .route("/health", get(health))
        .route("/", get(list_assets))
        .route("/debug/exception", get(raise_exception))
        .with_state(state);

    let addr: SocketAddr = format!("0.0.0.0:{}", env::var("PORT").unwrap_or_else(|_| "3002".to_string()))
        .parse()
        .expect("valid address");
    let listener = TcpListener::bind(addr).await.expect("bind listener");
    info!("asset-service listening on {addr}");
    axum::serve(listener, app).await.expect("server failed");
}
