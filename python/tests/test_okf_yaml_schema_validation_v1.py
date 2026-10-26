from __future__ import annotations

import json
from pathlib import Path

from parent_atlas_ontology.okf_yaml_schema_validation_v1 import validate_paths, validate_yaml_document


ROOT = Path(__file__).resolve().parents[2]
DOCUMENT = ROOT / ".okf/predicates/feature-relationships.yaml"
SCHEMA = ROOT / ".okf/schemas/feature-relationships-v1.schema.json"


def test_existing_relationship_registry_validates_without_authority_or_writes() -> None:
    result = validate_paths(DOCUMENT, SCHEMA)

    assert result["status"] == "VALID"
    assert result["reason"] is None
    assert len(result["documentSha256"]) == 64
    assert len(result["schemaSha256"]) == 64
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False


def test_duplicate_yaml_keys_are_rejected() -> None:
    result = validate_yaml_document(
        b"version: 1\nversion: 2\n",
        SCHEMA.read_bytes(),
    )

    assert result["status"] == "REJECTED"
    assert result["reason"] == "OKF_YAML_DUPLICATE_KEY"


def test_unknown_predicate_fields_are_rejected() -> None:
    document = DOCUMENT.read_bytes() + b"\nrogue_predicate: {}\n"
    result = validate_yaml_document(document, SCHEMA.read_bytes())

    assert result["status"] == "REJECTED"
    assert result["reason"] == "OKF_SCHEMA_VALIDATION_FAILED"


def test_invalid_predicate_degree_is_rejected() -> None:
    document = DOCUMENT.read_text(encoding="utf-8").replace(
        "allowed_degree: [binary, ternary, nary]",
        "allowed_degree: [quaternary]",
        1,
    ).encode("utf-8")
    result = validate_yaml_document(document, SCHEMA.read_bytes())

    assert result["status"] == "REJECTED"
    assert any("allowed_degree" in error for error in result["errors"])


def test_invalid_json_schema_is_rejected() -> None:
    result = validate_yaml_document(DOCUMENT.read_bytes(), b'{"type": "not-a-json-schema-type"}')

    assert result["status"] == "REJECTED"
    assert result["reason"] == "OKF_JSON_SCHEMA_INVALID"


def test_validation_results_are_repeatable_for_unchanged_inputs() -> None:
    first = validate_paths(DOCUMENT, SCHEMA)
    second = validate_paths(DOCUMENT, SCHEMA)

    assert first == second
