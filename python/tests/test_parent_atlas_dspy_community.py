from __future__ import annotations

import pytest

from python.parent_atlas_dspy_community import (
    CommunityEvidenceV1,
    validate_community_label_output_v1,
)


def _evidence() -> CommunityEvidenceV1:
    return CommunityEvidenceV1.build(
        community_fingerprint="sha256:community",
        algorithm_id="cugraph.leiden.26.06",
        graph_revision="graph:1",
        member_ids=["symbol:B", "symbol:A", "symbol:A"],
        representative_source_refs=["src/a.ts", "src/b.ts"],
        representative_symbols=["A", "B"],
        evidence_refs=["evidence:2", "evidence:1", "evidence:1"],
    )


def test_evidence_packet_is_canonicalized() -> None:
    evidence = _evidence()
    assert evidence.member_ids == ("symbol:A", "symbol:B")
    assert evidence.evidence_refs == ("evidence:1", "evidence:2")


def test_label_validation_accepts_only_supplied_evidence() -> None:
    confidence, cited = validate_community_label_output_v1(
        _evidence(),
        confidence=0.91,
        cited_evidence_refs=["evidence:2", "evidence:1"],
    )
    assert confidence == pytest.approx(0.91)
    assert cited == ("evidence:1", "evidence:2")


def test_label_validation_rejects_invented_evidence() -> None:
    with pytest.raises(ValueError, match="unknown evidence refs"):
        validate_community_label_output_v1(
            _evidence(),
            confidence=0.8,
            cited_evidence_refs=["evidence:1", "invented:77"],
        )
