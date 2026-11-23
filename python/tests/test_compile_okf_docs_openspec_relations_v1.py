import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "atlas" / "compile-okf-docs-openspec-relations-v1.py"
SPEC = importlib.util.spec_from_file_location("compile_okf_docs_openspec_relations_v1", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def sha(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def task_for(source_ref: str, block_hash: str):
    key = "example-change:3.2"
    return {
        "logicalTaskKey": key,
        "source": source_ref,
        "blockHash": block_hash,
        "taskIdentity": {"logicalTaskKey": key, "taskRevision": block_hash},
    }


def test_task_binding_requires_current_source_file_and_exact_task_revision(tmp_path: Path):
    source = tmp_path / "openspec" / "change" / "tasks.md"
    source.parent.mkdir(parents=True)
    current_bytes = b"- [ ] task\n"
    source.write_bytes(current_bytes)
    root_relative = "openspec/change/tasks.md"
    block_hash = sha(b"exact task block")
    task = task_for(root_relative, block_hash)

    bound = MODULE._qualify_task_binding(task, {root_relative: sha(current_bytes)}, tmp_path)
    assert bound["status"] == "SOURCE_AND_TASK_REVISION_QUALIFIED"
    assert bound["logicalTaskKey"] == "example-change:3.2"
    assert bound["sourceFileRevision"] == sha(current_bytes)

    stale = MODULE._qualify_task_binding(task, {root_relative: sha(b"old bytes")}, tmp_path)
    assert stale["status"] == "REJECTED"
    assert stale["reason"] == "TASK_SOURCE_FILE_REVISION_MISMATCH"


def test_task_binding_rejects_missing_identity_and_path_escape(tmp_path: Path):
    missing_key = {"blockHash": sha(b"block"), "source": "tasks.md"}
    assert MODULE._qualify_task_binding(missing_key, {}, tmp_path)["reason"] == "LOGICAL_TASK_KEY_MISSING"

    escaped = task_for("../outside/tasks.md", sha(b"block"))
    assert MODULE._qualify_task_binding(escaped, {}, tmp_path)["reason"] == "TASK_SOURCE_REF_INVALID"


def test_graph_revision_includes_source_and_task_revisions_and_is_deterministic():
    records = [{"chunkId": "docs/a.md", "sourceRevision": sha(b"a"), "byteLength": 1}]
    binding = [{
        "logicalTaskKey": "example-change:3.2",
        "taskRevision": sha(b"task"),
        "sourceRef": "openspec/change/tasks.md",
        "sourceFileRevision": sha(b"tasks"),
    }]
    first = MODULE._compute_graph_revision(records, binding)
    assert first == MODULE._compute_graph_revision(records, binding)
    assert first != MODULE._compute_graph_revision([{**records[0], "sourceRevision": sha(b"changed")}], binding)
    assert first != MODULE._compute_graph_revision(records, [{**binding[0], "taskRevision": sha(b"new task")}])


def test_explicit_document_links_keep_utf8_byte_spans_and_unresolved_targets():
    text = "Résumé cites docs/guide.md and openspec/missing/tasks.md"
    relations = MODULE._extract_explicit_path_refs(
        text,
        {"docs/guide.md"},
    )
    assert [r["target"] for r in relations] == ["docs/guide.md", "openspec/missing/tasks.md"]
    first = relations[0]
    encoded = text.encode("utf-8")
    start, end = first["supportingSpan"]
    assert encoded[start:end].decode("utf-8") == first["evidenceText"]
    assert first["targetResolution"] == "RESOLVED_LOCAL_SOURCE"
    assert relations[1]["targetResolution"] == "UNRESOLVED_LOCAL_TARGET"


def test_local_document_link_pagerank_uses_existing_networkx_receipt():
    graph_revision = sha(b"local graph revision")
    records = [
        {"chunkId": "docs/a.md", "sourceRevision": sha(b"a"), "relationPaths": [{
            "predicate": "DOCUMENT_LINKS_TO", "target": "docs/b.md",
            "targetResolution": "RESOLVED_LOCAL_SOURCE",
            "supportingSpan": [2, 16], "supportingSpanUnit": "UTF8_BYTE_OFFSET",
        }]},
        {"chunkId": "docs/b.md", "sourceRevision": sha(b"b"), "relationPaths": []},
        {"chunkId": "docs/c.md", "sourceRevision": sha(b"c"), "relationPaths": [{
            "predicate": "DOCUMENT_LINKS_TO", "target": "openspec/not-indexed.md",
            "targetResolution": "UNRESOLVED_LOCAL_TARGET",
        }]},
    ]
    first = MODULE._rank_explicit_document_links(records, graph_revision)
    second = MODULE._rank_explicit_document_links(records, graph_revision)
    assert first["status"] == "LOCAL_DERIVED_GRAPH_RANKED"
    assert first["backend"] == "networkx"
    assert first["nodeCount"] == 3
    assert first["edgeCount"] == 1
    assert first["scores"] == second["scores"]
    assert first["receipt"]["graph_revision"] == graph_revision
    assert first["edgeEvidence"][0]["sourceRevision"] == sha(b"a")
    assert first["edgeEvidence"][0]["targetRevision"] == sha(b"b")
    assert first["edgeEvidence"][0]["supportingSpan"] == [2, 16]
    assert first["canonicalAuthority"] is False
    assert first["writesPerformed"] is False


def test_unresolved_mentions_are_ranked_for_review_without_auto_resolution(tmp_path: Path):
    existing = tmp_path / "src" / "lib" / "outside-scan.ts"
    existing.parent.mkdir(parents=True)
    existing.write_text("export const x = 1;", encoding="utf-8")
    records = [{
        "chunkId": "docs/a.md",
        "sourceRevision": sha(b"source"),
        "relationPaths": [
            {"target": "src/lib/outside-scan.ts", "supportingSpan": [0, 24],
             "supportingSpanUnit": "UTF8_BYTE_OFFSET"},
            {"target": "docs/missing.md", "supportingSpan": [30, 46],
             "supportingSpanUnit": "UTF8_BYTE_OFFSET"},
            {"target": "docs/missing.md", "supportingSpan": [50, 66],
             "supportingSpanUnit": "UTF8_BYTE_OFFSET"},
            {"target": "../escape.md", "supportingSpan": [70, 82],
             "supportingSpanUnit": "UTF8_BYTE_OFFSET"},
        ],
    }]
    result = MODULE._rank_unresolved_mentions(records, tmp_path)
    ranked = result["rankedCandidates"]
    assert [row["targetRef"] for row in ranked] == [
        "src/lib/outside-scan.ts", "docs/missing.md", "../escape.md",
    ]
    assert [row["status"] for row in ranked] == [
        "EXISTS_OUTSIDE_SCAN", "MISSING_LOCAL_FILE", "PATH_ESCAPES_REPOSITORY",
    ]
    assert ranked[1]["mentionCount"] == 2
    assert ranked[0]["workspaceContentSha256"] == sha(b"export const x = 1;")
    assert ranked[0]["hashStatus"] == "HASHED_LOCAL_WORKSPACE_FILE"
    assert ranked[0]["revisionScope"] == "LOCAL_FILE_CONTENT_HASH_NOT_CANONICAL_WORKSPACE_REVISION"
    assert ranked[0]["repairEligible"] is True
    assert ranked[0]["repairPriorityScore"] > 0.0
    assert ranked[2]["repairEligible"] is False
    assert ranked[2]["repairPriorityScore"] is None
    assert result["admittedOutsideScanCohortCount"] == 1
    cohort_item = result["admittedOutsideScanCohort"][0]
    assert cohort_item["schema"] == "atlas.lexical-source-analysis.v1"
    assert cohort_item["observedRelationTuples"][0]["objectId"] is None
    assert cohort_item["observedRelationTuples"][0]["status"] == "OBSERVED"
    assert cohort_item["observedRelationTuples"][0]["evidenceSpan"] == {"startByte": 0, "endByte": 24}
    assert result["autoResolved"] is False
    assert result["writesPerformed"] is False
