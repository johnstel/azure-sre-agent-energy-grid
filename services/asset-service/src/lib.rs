use std::env;

#[derive(Clone, Debug)]
pub struct AppState {
    pub service_name: String,
    pub namespace: String,
    pub scenario: String,
    pub component: String,
    pub version: String,
}

pub fn build_state() -> AppState {
    AppState {
        service_name: env::var("SRE_SERVICE").unwrap_or_else(|_| "asset-service".to_string()),
        namespace: env::var("SRE_NAMESPACE").unwrap_or_else(|_| "energy".to_string()),
        scenario: env::var("SRE_SCENARIO").unwrap_or_default(),
        component: env::var("SRE_COMPONENT").unwrap_or_else(|_| "api".to_string()),
        version: env::var("SRE_VERSION").unwrap_or_else(|_| "2026-04-25".to_string()),
    }
}
