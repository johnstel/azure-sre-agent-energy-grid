use asset_service::build_state;

#[test]
fn build_state_includes_expected_dimensions() {
    std::env::set_var("SRE_SCENARIO", "crash-loop");
    std::env::set_var("SRE_SERVICE", "asset-service");
    std::env::set_var("SRE_NAMESPACE", "energy");
    std::env::set_var("SRE_COMPONENT", "api");
    std::env::set_var("SRE_VERSION", "2026-04-25");

    let state = build_state();
    assert_eq!(state.scenario, "crash-loop");
    assert_eq!(state.service_name, "asset-service");
    assert_eq!(state.namespace, "energy");
    assert_eq!(state.component, "api");
    assert_eq!(state.version, "2026-04-25");
}
