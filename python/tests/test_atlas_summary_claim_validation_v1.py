from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from atlas_summary_claim_validation_v1 import (
    SummaryClaimValidationFixtureV1,
    SummaryClaimValidationV1,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = (
    REPO_ROOT
    / "sveltekit-frontend/src/lib/server/atlas/docs/__fixtures__/summary-claim-validation-v1.fixture.json"
)


@pytest.fixture(scope="module")
def wire_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_typescript_fixture_round_trips_without_shape_changes(wire_fixture: dict) -> None:
    parsed = SummaryClaimValidationFixtureV1.model_validate(wire_fixture)
    round_trip = parsed.model_dump(mode="json", by_alias=True, exclude_none=False)
    assert round_trip == wire_fixture
    assert json.loads(json.dumps(round_trip, sort_keys=True)) == wire_fixture


def test_unknown_fields_are_rejected_at_every_nested_boundary(wire_fixture: dict) -> None:
    bad = json.loads(json.dumps(wire_fixture))
    bad["skeleton"]["unexpected"] = True
    with pytest.raises(ValidationError):
        SummaryClaimValidationFixtureV1.model_validate(bad)

    bad = json.loads(json.dumps(wire_fixture))
    bad["populated"]["technical"]["unexpected"] = True
    with pytest.raises(ValidationError):
        SummaryClaimValidationFixtureV1.model_validate(bad)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("claimOrdinal",), -1),
        (("claimOrdinal",), "0"),
        (("chunkEvidenceRevision",), "latest"),
        (("claimChecksum",), "bad"),
        (("canonicalAuthority",), True),
        (("semantic", "verdict"), "INVENTED"),
    ],
)
def test_invalid_wire_values_fail_closed(wire_fixture: dict, path: tuple, value: object) -> None:
    bad = json.loads(json.dumps(wire_fixture["populated"]))
    target = bad
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ValidationError):
        SummaryClaimValidationV1.model_validate(bad)


def test_invalid_and_empty_byte_ranges_are_rejected(wire_fixture: dict) -> None:
    bad = json.loads(json.dumps(wire_fixture["populated"]))
    bad["sourceSpan"] = {
        "status": "VERIFIED",
        "spans": [{"startByte": 10, "endByte": 10, "textChecksum": "0" * 64}],
    }
    with pytest.raises(ValidationError):
        SummaryClaimValidationV1.model_validate(bad)

    bad["sourceSpan"]["spans"][0]["startByte"] = -1
    with pytest.raises(ValidationError):
        SummaryClaimValidationV1.model_validate(bad)


def test_mirror_validates_but_does_not_derive_typescript_owned_checksums(wire_fixture: dict) -> None:
    candidate = json.loads(json.dumps(wire_fixture["skeleton"]))
    candidate["claimText"] = "changed after sealing"
    # Transport mirror checks shape only; canonical checksum derivation remains TS-owned.
    assert SummaryClaimValidationV1.model_validate(candidate).claimText == "changed after sealing"
