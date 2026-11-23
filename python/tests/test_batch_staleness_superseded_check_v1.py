"""Unit tests for timestamptz staleness and superseded-document batch check."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from atlas_graph_runtime.batch_staleness_superseded_check_v1 import (
    classify_document_staleness_v1,
)


def test_classify_superseded_takes_precedence() -> None:
    now = datetime(2026, 11, 23, 0, 0, tzinfo=timezone.utc)
    res = classify_document_staleness_v1(
        indexed_at=now,
        superseded_by="node:v2",
        now_utc=now,
    )
    assert res["status"] == "SUPERSEDED"
    assert res["eligibleForBatch"] is False


def test_classify_stale_timestamptz_and_hash_mismatch() -> None:
    now = datetime(2026, 11, 23, 0, 0, tzinfo=timezone.utc)
    older = now - timedelta(hours=48)
    stale_age = classify_document_staleness_v1(
        indexed_at=older,
        max_age_hours=24.0,
        now_utc=now,
    )
    assert stale_age["status"] == "STALE_TIMESTAMPTZ"

    stale_src = classify_document_staleness_v1(
        indexed_at=older,
        source_modified_at=now,
        now_utc=now,
    )
    assert stale_src["status"] == "STALE_TIMESTAMPTZ"

    mismatch = classify_document_staleness_v1(
        indexed_at=now,
        stored_hash="sha256:old",
        current_hash="sha256:new",
        now_utc=now,
    )
    assert mismatch["status"] == "HASH_OR_REVISION_MISMATCH"


def test_classify_fresh_document() -> None:
    now = datetime(2026, 11, 23, 0, 0, tzinfo=timezone.utc)
    res = classify_document_staleness_v1(
        indexed_at=now - timedelta(hours=2),
        source_modified_at=now - timedelta(hours=3),
        stored_hash="sha256:same",
        current_hash="sha256:same",
        max_age_hours=24.0,
        now_utc=now,
    )
    assert res["status"] == "FRESH"
    assert res["eligibleForBatch"] is True
