from __future__ import annotations

from pathlib import Path

from atlas_graph_runtime.cli_find_dependencies_v1 import run_find_dependencies_cli
from atlas_graph_runtime.dependency_lookup_v1 import (
    resolve_dependencies_v1,
    resolve_dependents_v1,
)


GRAPH = "sha256:" + "a" * 64
WORKSPACE = "sha256:" + "b" * 64
SOURCE = "sha256:" + "c" * 64


def fixture():
    nodes = [
        {"gpu_node_id": 0, "graph_node_key": "file:a", "source_ref": "src/a.ts", "source_revision": SOURCE, "workspace_revision": WORKSPACE, "node_kind": "file"},
        {"gpu_node_id": 1, "graph_node_key": "file:b", "source_ref": "src/b.ts", "source_revision": "sha256:" + "d" * 64, "workspace_revision": WORKSPACE, "node_kind": "file"},
        {"gpu_node_id": 2, "graph_node_key": "file:c", "source_ref": "src/c.ts", "source_revision": "sha256:" + "e" * 64, "workspace_revision": WORKSPACE, "node_kind": "file"},
    ]
    edges = [
        {"src_gpu_node_id": 0, "dst_gpu_node_id": 1, "edge_type": "IMPORTS", "weight": 1.0, "evidenceRefs": ["ast:src/a.ts:bytes:0-10"], "edgeId": "edge:a-b", "sourceRef": "src/a.ts", "sourceRevision": SOURCE, "workspaceRevision": WORKSPACE},
        {"src_gpu_node_id": 0, "dst_gpu_node_id": 2, "edge_type": "CALLS", "weight": 1.0, "evidenceRefs": ["ast:src/a.ts:bytes:11-21"], "edgeId": "edge:a-c", "sourceRef": "src/a.ts", "sourceRevision": SOURCE, "workspaceRevision": WORKSPACE},
        {"src_gpu_node_id": 1, "dst_gpu_node_id": 2, "edge_type": "DEFINES", "weight": 1.0, "evidenceRefs": ["ast:src/b.ts:bytes:0-3"]},
    ]
    source_identity = {"sourceRef": "src/a.ts", "sourceRevision": SOURCE, "workspaceRevision": WORKSPACE}
    return nodes, edges, source_identity


def test_resolves_only_direct_source_backed_dependency_edges_and_ranks_them():
    nodes, edges, identity = fixture()
    result = resolve_dependencies_v1(
        target="sveltekit-frontend/src/a.ts",
        source_identity=identity,
        graph_revision=GRAPH,
        workspace_revision=WORKSPACE,
        nodes=nodes,
        edges=edges,
    )
    assert result["failure"] is None
    assert {row["type"] for row in result["dependencies"]} == {"IMPORTS", "CALLS"}
    assert all(row["evidenceRefs"] and row["pageRankPrior"] >= 0 for row in result["dependencies"])
    assert result["pageRank"]["backend"] == "networkx"
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False


def test_rejects_stale_graph_source_revision():
    nodes, edges, identity = fixture()
    identity["sourceRevision"] = "sha256:" + "f" * 64
    result = resolve_dependencies_v1(
        target="src/a.ts", source_identity=identity,
        graph_revision=GRAPH, workspace_revision=WORKSPACE,
        nodes=nodes, edges=edges,
    )
    assert result["failure"] == "GRAPH_SOURCE_REVISION_MISMATCH"
    assert result["dependencies"] == []


def test_reports_missing_dependency_edges_without_inventing_results():
    nodes, _edges, identity = fixture()
    result = resolve_dependencies_v1(
        target="src/a.ts", source_identity=identity,
        graph_revision=GRAPH, workspace_revision=WORKSPACE,
        nodes=nodes, edges=[{"src_gpu_node_id": 0, "dst_gpu_node_id": 1, "edge_type": "DEFINES", "weight": 1.0}],
    )
    assert result["failure"] == "NO_TYPED_DEPENDENCY_EDGES"
    assert result["dependencies"] == []


def test_rejects_dependency_edge_whose_source_binding_does_not_match_its_node():
    nodes, edges, identity = fixture()
    edges[0]["sourceRevision"] = "sha256:" + "f" * 64
    result = resolve_dependencies_v1(
        target="src/a.ts", source_identity=identity,
        graph_revision=GRAPH, workspace_revision=WORKSPACE,
        nodes=nodes, edges=edges,
    )
    assert result["failure"] == "DEPENDENCY_EDGE_REVISION_MISMATCH"
    assert result["dependencies"] == []


def test_resolves_incoming_dependents_via_reverse_edges():
    nodes, edges, _identity = fixture()
    b_identity = {"sourceRef": "src/b.ts", "sourceRevision": "sha256:" + "d" * 64, "workspaceRevision": WORKSPACE}
    result = resolve_dependents_v1(
        target="sveltekit-frontend/src/b.ts",
        source_identity=b_identity,
        graph_revision=GRAPH,
        workspace_revision=WORKSPACE,
        nodes=nodes,
        edges=edges,
    )
    assert result["failure"] is None
    assert result["direction"] == "incoming"
    assert len(result["dependents"]) == 1
    assert result["dependents"] == result["dependencies"]
    row = result["dependents"][0]
    assert row["depCanonical"] == "src/a.ts"
    assert row["type"] == "IMPORTS"
    assert row["evidenceRefs"] == ["ast:src/a.ts:bytes:0-10"]
    assert row["pageRankPrior"] >= 0
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False


def test_reports_no_incoming_edges_for_root_target():
    nodes, edges, identity = fixture()
    result = resolve_dependents_v1(
        target="src/a.ts",
        source_identity=identity,
        graph_revision=GRAPH,
        workspace_revision=WORKSPACE,
        nodes=nodes,
        edges=edges,
    )
    assert result["failure"] == "NO_INCOMING_EDGES"
    assert result["direction"] == "incoming"
    assert result["dependents"] == []


def test_rejects_invalid_direction():
    nodes, edges, identity = fixture()
    result = resolve_dependencies_v1(
        target="src/a.ts",
        source_identity=identity,
        graph_revision=GRAPH,
        workspace_revision=WORKSPACE,
        nodes=nodes,
        edges=edges,
        direction="sideways",
    )
    assert result["failure"] == "INVALID_DIRECTION"
    assert result["dependencies"] == []


def test_cli_find_dependencies_supports_outgoing_and_incoming_directions(tmp_path: Path):
    src_dir = tmp_path / "sveltekit-frontend" / "src" / "lib"
    src_dir.mkdir(parents=True)
    (src_dir / "leaf.ts").write_text("export const x = 1;\n", encoding="utf-8")
    (src_dir / "caller.ts").write_text("import { x } from './leaf';\nexport const y = x;\n", encoding="utf-8")

    outgoing = run_find_dependencies_cli(
        target="sveltekit-frontend/src/lib/caller.ts",
        repo_root=tmp_path,
        direction="outgoing",
    )
    assert outgoing["lookup"]["failure"] is None
    assert outgoing["direction"] == "outgoing"
    assert [row["dep"] for row in outgoing["dependencies"]] == ["sveltekit-frontend/src/lib/leaf.ts"]

    incoming = run_find_dependencies_cli(
        target="sveltekit-frontend/src/lib/leaf.ts",
        repo_root=tmp_path,
        direction="incoming",
    )
    assert incoming["lookup"]["failure"] is None
    assert incoming["direction"] == "incoming"
    assert [row["dep"] for row in incoming["dependencies"]] == ["sveltekit-frontend/src/lib/caller.ts"]
    assert incoming["canonicalAuthority"] is False
    assert incoming["writesPerformed"] is False

    bad_dir = run_find_dependencies_cli(
        target="sveltekit-frontend/src/lib/leaf.ts",
        repo_root=tmp_path,
        direction="bogus",
    )
    assert bad_dir["lookup"]["failure"] == "INVALID_DIRECTION"
