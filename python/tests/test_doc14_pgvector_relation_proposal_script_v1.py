"""Verify the pinned pgvector relation draft includes honest local OAK readback."""
from __future__ import annotations

import runpy
from pathlib import Path

import pytest


def test_pgvector_proposal_binds_pinned_source_and_keeps_unmapped_oak_terms_pending() -> None:
    pytest.importorskip("oaklib")
    root = Path(__file__).resolve().parents[2]
    namespace = runpy.run_path(str(root / "scripts/atlas/prove-doc14-pgvector-relation-proposal-v1.py"))
    receipt = namespace["build"]()

    assert receipt["schema"] == "atlas.doc14-pgvector-relation-review.v2"
    assert receipt["proposal"]["canonical_authority"] is False
    assert receipt["proposal"]["evidence_start_byte"] < receipt["proposal"]["evidence_end_byte"]
    assert receipt["oakReview"]["backend"] == "LOCAL_READ_ONLY_OBO"
    assert receipt["oakReview"]["ontologyRevision"].startswith("sha256:")
    assert receipt["oakReview"]["candidateBundle"]["matches"] == [
        {"searchText": "Iterative scans", "externalIds": []},
        {"searchText": "strict or relaxed ordering", "externalIds": []},
    ]
    assert receipt["oakReview"]["relationLookupStatus"] == "NOT_RUN_NO_CONCEPT_MATCH"
    assert receipt["oakReview"]["canonicalAuthority"] is False
    assert receipt["oakReview"]["writesPerformed"] is False
    assert receipt["reviewDecision"] is None
    assert receipt["graphRevision"] is None
    assert receipt["writesPerformed"] is False
