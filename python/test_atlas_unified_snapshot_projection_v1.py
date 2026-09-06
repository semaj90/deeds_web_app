from __future__ import annotations

import json

from atlas_unified_snapshot_projection_v1 import (
    iter_json_array,
    project_snapshot,
    resolve_decoder_backend,
)


def test_stream_reader_matches_top_level_arrays_not_value_text(tmp_path):
    snapshot = tmp_path / "snapshot.json"
    snapshot.write_text(
        json.dumps({
            "snapshotId": "snapshot:test",
            "nodes": [
                {"nodeKey": "a", "properties": {"extraction_text": "edges"}},
                {"nodeKey": "b", "properties": {}},
            ],
            "edges": [{"sourceNodeKey": "a", "targetNodeKey": "b", "edgeType": "CALLS"}],
        }),
        encoding="utf-8",
    )

    assert len(list(iter_json_array(snapshot, "nodes"))) == 2
    edges = list(iter_json_array(snapshot, "edges"))
    assert len(edges) == 1
    assert edges[0]["sourceNodeKey"] == "a"


def test_auto_decoder_is_safe_without_optional_simdjson():
    assert resolve_decoder_backend("stdlib") == "stdlib"
    assert resolve_decoder_backend("auto") in {"stdlib", "simdjson"}


def test_projection_is_bounded_and_marks_semantic_stages_without_vectors(tmp_path):
    snapshot = tmp_path / "snapshot.json"
    snapshot.write_text(
        json.dumps({
            "snapshotId": "snapshot:test",
            "nodes": [
                {"nodeKey": "b", "nodeType": "entity", "properties": {"domainClass": "identity"}},
                {"nodeKey": "a", "nodeType": "concept", "properties": {"vectors": {"vector_dim": 768}}},
            ],
            "edges": [{"sourceNodeKey": "a", "targetNodeKey": "b", "edgeType": "MENTIONS"}],
        }),
        encoding="utf-8",
    )
    manifest = project_snapshot(
        snapshot,
        tmp_path / "out",
        max_age_hours=1_000_000,
        run_pagerank=True,
    )

    assert manifest["status"] == "PROJECTION_PROVEN_BOUNDED"
    assert manifest["counts"]["nodes"] == 2
    assert manifest["counts"]["edges"] == 1
    assert manifest["observations"]["graphBackend"] == "networkx"
    assert manifest["downstream"]["embedding"].startswith("BLOCKED_")
    assert manifest["downstream"]["writesPerformed"] is False


def test_projection_reports_edges_excluded_by_node_bound(tmp_path):
    snapshot = tmp_path / "snapshot.json"
    snapshot.write_text(
        json.dumps({
            "snapshotId": "snapshot:coverage",
            "nodes": [
                {"nodeKey": "a"},
                {"nodeKey": "b"},
                {"nodeKey": "c"},
            ],
            "edges": [
                {"sourceNodeKey": "a", "targetNodeKey": "b", "edgeType": "CALLS"},
                {"sourceNodeKey": "b", "targetNodeKey": "c", "edgeType": "CALLS"},
            ],
        }),
        encoding="utf-8",
    )

    manifest = project_snapshot(
        snapshot,
        tmp_path / "out",
        max_nodes=2,
        max_age_hours=1_000_000,
    )

    assert manifest["counts"]["nodesTruncated"] is True
    assert manifest["counts"]["edgeRecordsSeen"] == 2
    assert manifest["counts"]["edges"] == 1
    assert manifest["counts"]["edgesMissingNodeEndpoints"] == 1
