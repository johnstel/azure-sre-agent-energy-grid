"""
Test: Knowledge Manifest YAML Schema Validation.

Validates that docs/deep-context/KNOWLEDGE-MANIFEST.yaml conforms to the required
schema: every source has required fields, no duplicates, paths exist, and exclusions
have rationale.
"""

import os
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "docs" / "deep-context" / "KNOWLEDGE-MANIFEST.yaml"

REQUIRED_SOURCE_FIELDS = {
    "id",
    "path",
    "title",
    "authority",
    "owner",
    "version",
    "last_validated",
    "environment",
    "sensitivity",
    "review_due",
    "upload_target",
    "rationale",
}

VALID_AUTHORITIES = {"authoritative", "reference", "informational"}
VALID_SENSITIVITIES = {"public", "internal", "confidential"}
VALID_UPLOAD_TARGETS = {"knowledge_base", "code_access", "memory", "none"}


def load_manifest():
    """Load and parse the YAML manifest."""
    assert MANIFEST_PATH.exists(), f"Manifest not found: {MANIFEST_PATH}"
    with open(MANIFEST_PATH, "r") as f:
        return yaml.safe_load(f)


def test_manifest_exists():
    """Manifest file exists."""
    assert MANIFEST_PATH.exists()


def test_manifest_loads():
    """Manifest is valid YAML."""
    data = load_manifest()
    assert data is not None
    assert "sources" in data
    assert "exclusions" in data


def test_manifest_version():
    """Manifest has required top-level fields."""
    data = load_manifest()
    assert "manifest_version" in data
    assert "last_reviewed" in data
    assert "next_review_due" in data
    assert "repository" in data


def test_source_required_fields():
    """Every source has all required fields."""
    data = load_manifest()
    for i, source in enumerate(data["sources"]):
        missing = REQUIRED_SOURCE_FIELDS - set(source.keys())
        assert not missing, f"Source #{i} ({source.get('id', '?')}): missing fields {missing}"


def test_source_field_values():
    """Source field values are within valid enumerations."""
    data = load_manifest()
    for source in data["sources"]:
        sid = source["id"]
        assert source["authority"] in VALID_AUTHORITIES, f"{sid}: invalid authority '{source['authority']}'"
        assert source["sensitivity"] in VALID_SENSITIVITIES, f"{sid}: invalid sensitivity '{source['sensitivity']}'"
        assert source["upload_target"] in VALID_UPLOAD_TARGETS, f"{sid}: invalid upload_target '{source['upload_target']}'"


def test_no_duplicate_ids():
    """Source IDs are unique."""
    data = load_manifest()
    ids = [s["id"] for s in data["sources"]]
    assert len(ids) == len(set(ids)), f"Duplicate source IDs: {[x for x in ids if ids.count(x) > 1]}"


def test_source_paths_exist():
    """All source paths resolve to existing files."""
    data = load_manifest()
    missing = []
    for source in data["sources"]:
        full_path = REPO_ROOT / source["path"]
        if not full_path.exists():
            missing.append(source["path"])
    assert not missing, f"Missing files: {missing}"


def test_exclusions_have_rationale():
    """Every exclusion has a path and rationale."""
    data = load_manifest()
    for i, excl in enumerate(data["exclusions"]):
        assert "path" in excl, f"Exclusion #{i}: missing 'path'"
        assert "rationale" in excl, f"Exclusion #{i}: missing 'rationale'"
        assert len(excl["rationale"]) > 10, f"Exclusion #{i}: rationale too short"


def test_no_overlap_sources_exclusions():
    """No source path matches an exclusion pattern (basic check)."""
    data = load_manifest()
    excl_prefixes = []
    for excl in data["exclusions"]:
        # Convert glob to prefix for basic overlap check
        prefix = excl["path"].replace("/**", "").replace("**/*", "")
        if not prefix.startswith("*"):
            excl_prefixes.append(prefix)

    for source in data["sources"]:
        for prefix in excl_prefixes:
            assert not source["path"].startswith(prefix), (
                f"Source '{source['id']}' path '{source['path']}' overlaps with exclusion '{prefix}'"
            )


if __name__ == "__main__":
    # Simple test runner without pytest dependency
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
