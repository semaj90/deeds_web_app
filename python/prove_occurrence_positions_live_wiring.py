"""Read-only, no-server-boot proof that occurrence_positions is actually populated end-to-end
through _native_ast_evidence() (the real /ast/chunk handler), against a real repo file that
exhibited the live shared-position bug this session
(openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md).

Does not require the FastAPI service to be running — calls the handler function directly.
Usage: python prove_occurrence_positions_live_wiring.py
"""
import miniforge_nlp_sidecar_v2 as sidecar
import miniforge_nlp_sidecar as legacy

TARGET_FILE = "scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs"


def main() -> None:
    import os

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    path = os.path.join(repo_root, *TARGET_FILE.split("/"))
    with open(path, "r", encoding="utf-8") as f:
        source = f.read()

    req = legacy.AstChunkRequest(source=source, language="javascript", file_path=TARGET_FILE, source_revision="test")
    resp = sidecar._native_ast_evidence(req)

    path_join_edges = [e for e in resp.edges if e.to_evidence_key == "path.join"]
    print(f"path.join edges: {len(path_join_edges)}")
    for e in path_join_edges[:12]:
        print(f"  evidence_start=({e.evidence_start_line},{e.evidence_start_column}) occurrence_positions={e.occurrence_positions}")

    none_count = sum(1 for e in resp.edges if e.occurrence_positions is None)
    some_count = sum(1 for e in resp.edges if e.occurrence_positions)
    print(f"\ntotal edges: {len(resp.edges)}, occurrence_positions None: {none_count}, populated: {some_count}")

    # A chunk spanning multiple real path.join calls (the exact bug case) must show >1
    # occurrence_positions entries on at least one edge, not just a single repeated position.
    multi_occurrence_edges = [e for e in path_join_edges if e.occurrence_positions and len(e.occurrence_positions) > 1]
    status = "PROVEN_LIVE_WIRING" if multi_occurrence_edges else "NO_MULTI_OCCURRENCE_EDGE_FOUND"
    print(f"\nstatus: {status}")
    if multi_occurrence_edges:
        print(f"  example: evidence_start=({multi_occurrence_edges[0].evidence_start_line},{multi_occurrence_edges[0].evidence_start_column}) occurrence_positions={multi_occurrence_edges[0].occurrence_positions}")


if __name__ == "__main__":
    main()
