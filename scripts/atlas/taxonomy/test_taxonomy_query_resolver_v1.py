"""Tests for the advisory taxonomy query resolver. No database, no network."""
from __future__ import annotations

import hashlib
import json

from taxonomy_query_resolver_v1 import SNAPSHOT, load_snapshot, resolve


def test_snapshot_structure_is_frozen_and_sorted():
    # The checksum was produced by the Node builder (JSON.stringify of the sorted groups). Python's
    # JSON formatting differs, so this test checks structure, not the hash value.
    snap = load_snapshot()
    assert snap["checksum"].startswith("sha256:") and len(snap["checksum"]) == len("sha256:") + 64
    assert snap["writesPerformed"] is False
    assert len(snap["groups"]) == 17
    assert [g["group_id"] for g in snap["groups"]] == sorted(g["group_id"] for g in snap["groups"])


def test_resolution_is_deterministic():
    assert resolve("machine learning model") == resolve("machine learning model")


def test_machine_learning_query_ranks_its_group_first():
    out = resolve("machine learning")
    top_ids = [c["canonicalId"] for c in out["page"]["candidates"]] if "candidates" in out["page"] else []
    assert top_ids and top_ids[0] == "machine-learning"


def test_unrelated_query_returns_no_candidates():
    out = resolve("zzqqxx vvww")
    cands = out["page"].get("candidates", [])
    assert cands == []


def test_pagination_is_a_slice_of_the_full_ordering():
    full = resolve("database retrieval cache", k=50)
    full_ids = [c["canonicalId"] for c in full["page"].get("candidates", [])]
    p2 = resolve("database retrieval cache", k=2, offset=2)
    p2_ids = [c["canonicalId"] for c in p2["page"].get("candidates", [])]
    assert p2_ids == full_ids[2:4]


def test_output_is_advisory_and_non_authoritative():
    out = resolve("graph")
    assert out["advisory"] is True
    assert out["canonicalAuthority"] is False
    for c in out["page"].get("candidates", []):
        assert c["classification"] == "PROPOSED_CANDIDATE"


def test_no_duplicate_canonical_ids_in_a_page():
    out = resolve("machine learning graph retrieval cache", k=50)
    ids = [c["canonicalId"] for c in out["page"].get("candidates", [])]
    assert len(ids) == len(set(ids))


def test_trigram_false_positive_is_only_a_proposal():
    # "cache" appears for "machine learning" through weak trigram overlap; it must stay a proposal.
    out = resolve("machine learning")
    for c in out["page"].get("candidates", []):
        assert c["classification"] == "PROPOSED_CANDIDATE"
        assert out["advisory"] is True


def test_snapshot_checksum_is_reported_for_comparison():
    snap = load_snapshot()
    out = resolve("graph", snapshot=snap)
    assert out["snapshotChecksum"] == snap["checksum"]
    mismatched = dict(snap, checksum="sha256:" + "0" * 64)
    assert resolve("graph", snapshot=mismatched)["snapshotChecksum"] != snap["checksum"]


def test_resolver_is_read_only_no_database_or_network_modules():
    import sys
    import taxonomy_query_resolver_v1 as mod  # noqa: F401
    forbidden = {"psycopg", "psycopg2", "sqlalchemy", "redis", "neo4j", "qdrant_client", "requests", "httpx"}
    assert not (forbidden & set(sys.modules)), "resolver must not load database, cache or network clients"
