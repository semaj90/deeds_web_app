from __future__ import annotations

from atlas_summary_claim_validation_v1 import NumericSlotV1, VersionSlotV1
from atlas_summary_faithfulness_v1 import (
    validate_summary_claim_numeric_v1,
    validate_summary_claim_versions_v1,
)


def test_numeric_values_are_exact_and_separate_from_version_literals() -> None:
    source = "PostgreSQL 18.4 uses 3 workers and a 16 MB setting."
    claim = "PostgreSQL 18.4 uses 4 workers and a 16 MB setting."
    slot = validate_summary_claim_numeric_v1(source, claim)
    assert slot == {
        "status": "FAIL",
        "sourceValues": ["3", "16 MB"],
        "claimValues": ["4", "16 MB"],
        "unsupportedValues": ["4"],
    }
    assert NumericSlotV1.model_validate(slot).model_dump() == slot


def test_versions_are_compared_as_exact_strings_not_numbers() -> None:
    source = "PostgreSQL 18.4 and CUDA 12.9.0 are installed."
    matching = validate_summary_claim_versions_v1(source, "PostgreSQL 18.4 uses CUDA 12.9.0.")
    assert matching == {
        "status": "PASS",
        "sourceVersions": ["18.4", "12.9.0"],
        "claimVersions": ["18.4", "12.9.0"],
        "unsupportedVersions": [],
    }
    assert VersionSlotV1.model_validate(matching).model_dump() == matching

    changed = validate_summary_claim_versions_v1(source, "PostgreSQL 18.04 uses CUDA 12.9.")
    assert changed["status"] == "FAIL"
    assert changed["unsupportedVersions"] == ["18.04", "12.9"]


def test_unqualified_numeric_values_do_not_become_version_assertions() -> None:
    assert validate_summary_claim_versions_v1("The value is 18.4.", "The value is 18.4.")["claimVersions"] == []
    assert validate_summary_claim_numeric_v1("The value is 18.4.", "The value is 18.4.")["status"] == "PASS"

