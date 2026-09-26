import importlib.util
import json
from pathlib import Path

import pandas as pd

from atlas_graph_runtime.graph_projection_manifest import (
    graph_ordinal_map_checksum_v1,
)


ROOT = Path(__file__).resolve().parents[2]
BUILDER_PATH = ROOT / "scripts" / "atlas" / "build-current-structural-graph-artifact-v1.py"


def _load_builder():
    spec = importlib.util.spec_from_file_location("graph_artifact_builder_fixture", BUILDER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_builder_emits_distinct_candidate_and_graph_ordinal_checksums(tmp_path, monkeypatch):
    fixture_root = tmp_path / "repo"
    plan_path = fixture_root / "docs" / "plan.json"
    artifact_dir = tmp_path / "artifact"
    plan_path.parent.mkdir(parents=True)
    plan = {
        "mode": "READ_ONLY_PLAN",
        "canonicalAuthority": False,
        "writes": {"postgres": False, "qdrant": False},
        "workspaceRevision": "sha256:fixture-workspace",
        "candidateSnapshotRevision": "snapshot:fixture",
        "ordinalMapChecksum": "candidate-map-checksum-fixture",
        "nodes": [
            {"graphNodeKey": "node:b", "packetKey": "packet:b", "sourceRef": "b.ts", "sourceRevision": "sha256:b", "workspaceRevision": "sha256:fixture-workspace"},
            {"graphNodeKey": "node:a", "packetKey": "packet:a", "sourceRef": "a.ts", "sourceRevision": "sha256:a", "workspaceRevision": "sha256:fixture-workspace"},
            {"graphNodeKey": "node:isolated", "packetKey": None, "sourceRef": "c.ts", "sourceRevision": "sha256:c", "workspaceRevision": "sha256:fixture-workspace"},
        ],
        "edges": [{"sourceNodeKey": "node:a", "targetNodeKey": "node:b", "edgeType": "CALLS"}],
    }
    plan_path.write_text(json.dumps(plan), encoding="utf-8")
    builder = _load_builder()
    monkeypatch.setattr(builder, "ROOT", fixture_root)
    monkeypatch.setattr(builder, "PLAN", plan_path)
    monkeypatch.setattr(builder, "OUT", artifact_dir)

    builder.main()

    manifest = json.loads((artifact_dir / "manifest.json").read_text(encoding="utf-8"))
    node_table = pd.read_parquet(artifact_dir / "nodes.parquet").sort_values("gpu_node_id")
    rows = [
        {"graphOrdinal": int(row.gpu_node_id), "graphNodeKey": str(row.graph_node_key)}
        for row in node_table.itertuples(index=False)
    ]
    assert manifest["schema"] == "atlas.graph-projection-artifact.v1"
    assert manifest["candidateOrdinalMapChecksum"] == "candidate-map-checksum-fixture"
    assert manifest["graphOrdinalMapChecksum"] == graph_ordinal_map_checksum_v1(
        manifest["graphRevision"], manifest["workspaceRevision"], rows
    )
    assert manifest["nodeCount"] == 3  # isolated vertex retained in [0, V)
    assert manifest["edgeCount"] == 1
    assert manifest["canonicalAuthority"] is False
    assert manifest["writesPerformed"] is False
