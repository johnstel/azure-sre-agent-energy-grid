"""
Test: Evaluation Harness Schema & Fixture Validation.

Validates that the evaluation harness YAML is well-formed, all referenced
source files exist, and stale-test fixtures are self-contained.

This does NOT execute live SRE Agent queries — it validates the harness
definition so that live execution can proceed without fixture errors.
"""

import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
HARNESS_PATH = REPO_ROOT / "docs" / "deep-context" / "EVALUATION-HARNESS.yaml"

REQUIRED_EVAL_FIELDS = {
    "id",
    "scenario",
    "prompt",
    "expected_citations",
    "expected_root_cause",
    "expected_remediation",
    "stale_test",
}

SCORING_DIMENSIONS = {"source_citation", "root_cause_specificity", "safe_guidance", "uncertainty_handling"}


def load_harness():
    """Load the evaluation harness YAML."""
    assert HARNESS_PATH.exists(), f"Harness not found: {HARNESS_PATH}"
    with open(HARNESS_PATH, "r") as f:
        return yaml.safe_load(f)


def test_harness_exists():
    """Evaluation harness file exists."""
    assert HARNESS_PATH.exists()


def test_harness_loads():
    """Harness is valid YAML."""
    data = load_harness()
    assert data is not None
    assert "evaluations" in data
    assert "scoring" in data


def test_scoring_rubric_complete():
    """Scoring rubric has all required dimensions."""
    data = load_harness()
    dimensions = {d["name"] for d in data["scoring"]["dimensions"]}
    missing = SCORING_DIMENSIONS - dimensions
    assert not missing, f"Missing scoring dimensions: {missing}"


def test_scoring_weights_sum():
    """Scoring dimension weights sum to 100."""
    data = load_harness()
    total = sum(d["weight"] for d in data["scoring"]["dimensions"])
    assert total == 100, f"Weights sum to {total}, expected 100"


def test_evaluation_required_fields():
    """Every evaluation has required fields."""
    data = load_harness()
    for i, ev in enumerate(data["evaluations"]):
        missing = REQUIRED_EVAL_FIELDS - set(ev.keys())
        assert not missing, f"Evaluation #{i} ({ev.get('id', '?')}): missing {missing}"


def test_evaluation_ids_unique():
    """Evaluation IDs are unique."""
    data = load_harness()
    ids = [e["id"] for e in data["evaluations"]]
    assert len(ids) == len(set(ids)), f"Duplicate eval IDs"


def test_expected_citations_exist():
    """All expected citation paths point to existing files."""
    data = load_harness()
    missing = []
    for ev in data["evaluations"]:
        for citation_path in ev["expected_citations"]:
            full_path = REPO_ROOT / citation_path
            if not full_path.exists():
                missing.append(f"{ev['id']}: {citation_path}")
    assert not missing, f"Missing citation files:\n" + "\n".join(missing)


def test_stale_fixture_defined():
    """Stale-test evaluations have a stale_fixture with content."""
    data = load_harness()
    for ev in data["evaluations"]:
        if ev.get("stale_test"):
            assert "stale_fixture" in ev, f"{ev['id']}: stale_test=true but no stale_fixture"
            fixture = ev["stale_fixture"]
            assert "filename" in fixture, f"{ev['id']}: stale_fixture missing filename"
            assert "content" in fixture, f"{ev['id']}: stale_fixture missing content"
            assert "expected_behavior" in fixture, f"{ev['id']}: stale_fixture missing expected_behavior"


def test_scenarios_covered():
    """All three required scenarios (oom-killed, mongodb-down, service-mismatch) have evaluations."""
    data = load_harness()
    scenarios = {e["scenario"] for e in data["evaluations"]}
    required = {"oom-killed", "mongodb-down", "service-mismatch"}
    missing = required - scenarios
    assert not missing, f"Missing scenario coverage: {missing}"


def test_repeat_incident_defined():
    """Repeat-incident evaluation section exists."""
    data = load_harness()
    assert "repeat_incident" in data
    ri = data["repeat_incident"]
    assert "first_run_prompt" in ri
    assert "second_run_prompt" in ri
    assert "expected_behavior" in ri


def test_pass_threshold_reasonable():
    """Pass threshold is between 1 and 12."""
    data = load_harness()
    threshold = data["scoring"]["pass_threshold"]
    assert 1 <= threshold <= 12, f"Threshold {threshold} out of range [1,12]"


if __name__ == "__main__":
    tests = [v for k, v in globals().items() if k.startswith("test_")]
    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            print(f"  ✅ {test_fn.__doc__ or test_fn.__name__}")
            passed += 1
        except (AssertionError, Exception) as e:
            print(f"  ❌ {test_fn.__doc__ or test_fn.__name__}: {e}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
