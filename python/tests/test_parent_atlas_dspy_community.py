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
        member_ids=["packet:b", "packet:a", "packet:a"],
        representative_source_refs=["src/a.ts", "src/b.ts"],
        representative_symbols=["A", "B"],
        evidence_refs=["evidence:2", "evidence:1"],
    )


def test_community_evidence_is_canonicalized():
    evidence = _evidence()
    assert evidence.member_ids == ("packet:a", "packet:b")
    assert evidence.evidence_refs == ("evidence:1", "evidence:2")


def test_label_validation_rejects_invented_evidence():
    evidence = _evidence()
    with pytest.raises(ValueError, match="unknown evidence"):
        validate_community_label_output_v1(
            evidence,
            confidence=0.9,
            cited_evidence_refs=["evidence:1", "invented:3"],
        )


def test_label_validation_accepts_supplied_evidence_only():
    confidence, cited = validate_community_label_output_v1(
        _evidence(),
        confidence=1.2,
        cited_evidence_refs=["evidence:2"],
    )
    assert confidence == 1.0
    assert cited == ("evidence:2",)
