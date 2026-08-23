import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_compute.spectral_rtx_alignment_fixture import build_spectral_rtx_alignment_fixture


def _row(ordinal: int, pagerank: float) -> dict:
    return {
        "ordinal": ordinal,
        "canonicalId": f"c{ordinal}",
        "semantic768": [0.0] * 768,
        "pagerank": pagerank,
    }


def test_fixture_is_deterministic_and_non_promotable():
    payload = {
        "fixtureId": "fixture-1",
        "workspaceRevision": "w1",
        "sourceRevision": "s1",
        "representationRevision": "embgemma-r1",
        "graphRevision": "g1",
        "ordinalMapChecksum": "a" * 64,
        "rows": [_row(1, 0.2), _row(0, 0.8)],
    }
    first = build_spectral_rtx_alignment_fixture(payload)
    second = build_spectral_rtx_alignment_fixture(payload)
    assert first["inputChecksum"] == second["inputChecksum"]
    assert first["outputChecksum"] == second["outputChecksum"]
    assert [entry["ordinal"] for entry in first["spectral"]["assignments"]] == [0, 1]
    assert first["backend"] == "MOCK_CPU_REFERENCE"
    assert first["canonicalWritesAllowed"] is False
    assert first["identityAuthority"] is False
    assert first["promotionEligible"] is False


