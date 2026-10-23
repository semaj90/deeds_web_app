from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from parent_atlas_ontology.language_profile_v1 import (
    parse_profile,
    validate_profile,
    validate_profile_directory,
)


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / ".okf" / "schemas" / "language-profile-v1.schema.json"
PROFILE_DIR = ROOT / ".okf" / "languages"


def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def test_all_current_language_profiles_validate() -> None:
    manifest = yaml.safe_load((ROOT / ".okf" / "manifest.yaml").read_text(encoding="utf-8"))
    registered = manifest["registries"]["languages"]["schemas"]
    result = validate_profile_directory(PROFILE_DIR, SCHEMA_PATH, registered)
    profile_count = len(registered)

    assert result["profileCount"] == profile_count
    assert result["validCount"] == profile_count
    assert result["errorCount"] == 0
    assert result["canonicalAuthority"] is False
    assert result["canonicalDataWritesPerformed"] is False
    assert result["serviceCallsPerformed"] is False


def test_manifest_registers_every_validated_language_profile() -> None:
    manifest = yaml.safe_load((ROOT / ".okf" / "manifest.yaml").read_text(encoding="utf-8"))
    declared = set(manifest["registries"]["languages"]["schemas"])
    profiles = {path.name for path in PROFILE_DIR.glob("*.yaml") if path.name in declared}

    assert declared == profiles


def test_duplicate_yaml_keys_are_rejected() -> None:
    with pytest.raises(ValueError, match="LANGUAGE_PROFILE_DUPLICATE_KEY"):
        parse_profile("version: 1\nversion: 1\n")


def test_unknown_profile_fields_are_rejected() -> None:
    profile = parse_profile((PROFILE_DIR / "python.yaml").read_text(encoding="utf-8"))
    profile["runtime_ready"] = True

    errors = validate_profile(profile, _schema())

    assert any("runtime_ready" in error for error in errors)


def test_invalid_symbol_weight_is_rejected() -> None:
    profile = parse_profile((PROFILE_DIR / "go.yaml").read_text(encoding="utf-8"))
    profile["symbol_kinds"]["function"]["weight"] = 1.5

    errors = validate_profile(profile, _schema())

    assert any("weight" in error for error in errors)


def test_symbol_rule_requires_evidence_selector() -> None:
    profile = parse_profile((PROFILE_DIR / "rust.yaml").read_text(encoding="utf-8"))
    profile["symbol_kinds"]["function"].pop("ast_labels")

    errors = validate_profile(profile, _schema())

    assert errors


def test_validation_receipt_binds_schema_and_profile_bytes() -> None:
    result = validate_profile_directory(PROFILE_DIR, SCHEMA_PATH)

    assert len(result["schemaSha256"]) == 64
    assert len(result["snapshotSha256"]) == 64
    assert all(len(profile["sha256"]) == 64 for profile in result["profiles"])
    assert result["snapshotSha256"] == validate_profile_directory(PROFILE_DIR, SCHEMA_PATH)["snapshotSha256"]
