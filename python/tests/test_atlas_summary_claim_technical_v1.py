from __future__ import annotations

from atlas_summary_faithfulness_v1 import validate_summary_claim_technical_tokens_v1
from atlas_summary_claim_validation_v1 import TechnicalTokenSlotV1


def _validate_slot(source: str, claim: str) -> dict:
    slot = validate_summary_claim_technical_tokens_v1(source, claim)
    assert TechnicalTokenSlotV1.model_validate(slot).model_dump() == slot
    return slot


def test_exact_dotted_and_underscored_identifiers_pass() -> None:
    slot = _validate_slot(
        "Use `hnsw.iterative_scan` with `scan_mem_multiplier`.",
        "Set `hnsw.iterative_scan` and `scan_mem_multiplier`.",
    )
    assert slot == {
        "status": "PASS",
        "sourceTokens": ["hnsw.iterative_scan", "scan_mem_multiplier"],
        "claimTokens": ["hnsw.iterative_scan", "scan_mem_multiplier"],
        "missingTechnicalTokens": [],
        "unexpectedTechnicalTokens": [],
    }


def test_unsupported_or_corrupted_identifier_fails() -> None:
    unsupported = _validate_slot(
        "Configure `hnsw.iterative_scan`.",
        "Configure `gpu.magic_scan`.",
    )
    assert unsupported["status"] == "FAIL"
    assert "gpu.magic_scan" in unsupported["unexpectedTechnicalTokens"]

    corrupted = _validate_slot(
        "Configure `hnsw.iterative_scan`.",
        "Configure `hnsw_iterative_scan`.",
    )
    assert corrupted["status"] == "FAIL"
    assert any("hnsw_iterative_scan" in item for item in corrupted["unexpectedTechnicalTokens"])


def test_omitted_source_identifier_is_observational_and_never_gates_a_claim() -> None:
    slot = _validate_slot(
        "The `hnsw.iterative_scan` setting works with `scan_mem_multiplier`.",
        "The setting works.",
    )
    assert slot["status"] == "PASS"
    assert slot["missingTechnicalTokens"]  # still reported as coverage data
    assert slot["unexpectedTechnicalTokens"] == []


def test_claim_mentioning_one_identifier_passes_even_when_the_source_has_others() -> None:
    slot = _validate_slot(
        "PostgreSQL 18.4 adds `io_method`. Set `hnsw.ef_search` = 40. See `hnsw.iterative_scan`.",
        "PostgreSQL 18.4 supports `io_method`.",
    )
    assert slot["status"] == "PASS"
    assert slot["unexpectedTechnicalTokens"] == []
    assert "io_method" in slot["claimTokens"]


def test_invented_or_corrupted_identifiers_still_fail_regardless_of_omission() -> None:
    invented = _validate_slot("Use `io_method` here.", "Use `hnsw.scan_mem_multiplier` here.")
    assert invented["status"] == "FAIL"
    corrupted = _validate_slot("Use `hnsw.iterative_scan` here.", "Use `hnsw_iterative_scan` here.")
    assert corrupted["status"] == "FAIL"


def test_numeric_and_version_literals_are_not_classified_as_technical_tokens() -> None:
    slot = _validate_slot(
        "PostgreSQL 18.4 supports `hnsw.iterative_scan`.",
        "PostgreSQL 19.1 supports `hnsw.iterative_scan`.",
    )
    assert slot["status"] == "PASS"
    assert "18.4" not in slot["sourceTokens"]
    assert "19.1" not in slot["claimTokens"]
