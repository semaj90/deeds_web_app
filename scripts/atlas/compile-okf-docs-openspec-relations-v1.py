"""Compile local .okf/docs plus revision-qualified OpenSpec relation candidates.

Uses PyYAML 6.0.2 (no external yq binary required) and python.atlas_graph_runtime.document_relation_rrf_v1
to index all local .okf YAML/JSON manifests and docs/ markdown/YAML files with SHA-256 sourceRevisions,
extract explicit references, and run Task x Document SVD + 4-lane RRF recommendations.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

import numpy as np
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from python.atlas_graph_runtime.document_relation_rrf_v1 import (
    admit_verified_topk,
    build_relation_proposal_v1,
    fuse_topk,
    svd_topk_recommend,
)
from python.atlas_graph_runtime.contracts import TypedGraphEdge
from python.atlas_graph_runtime.networkx_executor import run_pagerank_v2

WORKBOARD_PATH = REPO_ROOT / "docs" / "reports" / "openspec-workboard-v1.json"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "okf-docs-openspec-relations-v1.json"

_PATH_REF_RE = re.compile(r"\b((?:docs|openspec|sveltekit-frontend|scripts|python|packages)/[A-Za-z0-9_./-]+\.(?:md|yaml|yml|json|ts|mts|mjs|py))\b")


def _extract_explicit_path_refs(text: str, known_source_refs: set[str], *, max_refs: int = 25) -> list[dict[str, Any]]:
    """Extract local path mentions with exact UTF-8 byte spans and resolution status."""
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in _PATH_REF_RE.finditer(text):
        target = match.group(1)
        if target in seen:
            continue
        seen.add(target)
        start = len(text[:match.start(1)].encode("utf-8"))
        end = start + len(target.encode("utf-8"))
        resolution = "RESOLVED_LOCAL_SOURCE" if target in known_source_refs else "UNRESOLVED_LOCAL_TARGET"
        refs.append({
            "predicate": "DOCUMENT_LINKS_TO",
            "target": target,
            "targetResolution": resolution,
            "supportingSpan": [start, end],
            "supportingSpanUnit": "UTF8_BYTE_OFFSET",
            "evidenceText": target,
        })
        if len(refs) >= max_refs:
            break
    return refs


def _rank_unresolved_mentions(
    records: list[dict[str, Any]], repo_root: Path = REPO_ROOT, *, limit: int = 100,
) -> dict[str, Any]:
    """Create a ranked review queue; never auto-promote a target into the graph."""
    grouped: dict[str, dict[str, Any]] = {}
    resolution_counts: dict[str, int] = {}
    root = repo_root.resolve()
    indexed_refs = {record["chunkId"] for record in records}
    for record in records:
        for relation in record.get("relationPaths", []):
            target = relation["target"]
            if target in indexed_refs:
                continue
            path = (root / Path(target)).resolve()
            try:
                path.relative_to(root)
            except ValueError:
                status = "PATH_ESCAPES_REPOSITORY"
            else:
                status = "EXISTS_OUTSIDE_SCAN" if path.is_file() else "MISSING_LOCAL_FILE"
            resolution_counts[status] = resolution_counts.get(status, 0) + 1
            row = grouped.setdefault(target, {
                "targetRef": target,
                "status": status,
                "mentionCount": 0,
                "evidenceSamples": [],
            })
            # If the same literal appears in several places, the classification is deterministic.
            if row["status"] != status:
                row["status"] = "INCONSISTENT_LOCAL_OBSERVATION"
            row["mentionCount"] += 1
            if len(row["evidenceSamples"]) < 3:
                row["evidenceSamples"].append({
                    "sourceRef": record["chunkId"],
                    "sourceRevision": record["sourceRevision"],
                    "supportingSpan": relation["supportingSpan"],
                    "supportingSpanUnit": relation["supportingSpanUnit"],
                })
    status_priority = {"EXISTS_OUTSIDE_SCAN": 0, "INCONSISTENT_LOCAL_OBSERVATION": 1,
                       "MISSING_LOCAL_FILE": 2, "PATH_ESCAPES_REPOSITORY": 3}
    ranked = sorted(
        grouped.values(),
        key=lambda row: (status_priority.get(row["status"], 9), -row["mentionCount"], row["targetRef"]),
    )
    returned = ranked[:limit]
    remaining_hash_budget = 16 * 1024 * 1024
    max_hash_file_bytes = 1024 * 1024
    for row in returned:
        if row["status"] != "EXISTS_OUTSIDE_SCAN":
            continue
        target_path = (root / Path(row["targetRef"])).resolve()
        try:
            target_path.relative_to(root)
            size = target_path.stat().st_size
        except (OSError, ValueError):
            row["workspaceContentSha256"] = None
            row["hashStatus"] = "PATH_CHANGED_OR_UNAVAILABLE"
            continue
        row["targetByteLength"] = size
        if size > max_hash_file_bytes:
            row["workspaceContentSha256"] = None
            row["hashStatus"] = "FILE_SIZE_LIMIT"
            continue
        if size > remaining_hash_budget:
            row["workspaceContentSha256"] = None
            row["hashStatus"] = "TOTAL_HASH_BUDGET"
            continue
        digest = hashlib.sha256()
        with target_path.open("rb") as source:
            for block in iter(lambda: source.read(64 * 1024), b""):
                digest.update(block)
        remaining_hash_budget -= size
        row["workspaceContentSha256"] = f"sha256:{digest.hexdigest()}"
        row["hashStatus"] = "HASHED_LOCAL_WORKSPACE_FILE"
        row["revisionScope"] = "LOCAL_FILE_CONTENT_HASH_NOT_CANONICAL_WORKSPACE_REVISION"

    for row in returned:
        distinct_sources = {s["sourceRef"] for s in row.get("evidenceSamples", []) if s.get("sourceRef")}
        row["distinctSourceCount"] = len(distinct_sources)
        if row["status"] == "PATH_ESCAPES_REPOSITORY":
            row["repairEligible"] = False
            row["repairPriorityScore"] = None
        else:
            e_flag = 1 if row["status"] == "EXISTS_OUTSIDE_SCAN" else 0
            s_flag = 1 if row.get("workspaceContentSha256") else 0
            u_flag = 1 if row["status"] in {"MISSING_LOCAL_FILE", "INCONSISTENT_LOCAL_OBSERVATION"} else 0
            score = (
                4.0 * e_flag
                + 2.0 * math.log1p(row["distinctSourceCount"])
                + 2.0 * s_flag
                - float(u_flag)
            )
            row["repairEligible"] = e_flag == 1 and s_flag == 1
            row["repairPriorityScore"] = round(score, 6)

    admitted_outside_scan = [
        {
            "schema": "atlas.lexical-source-analysis.v1",
            "sourceRef": row["targetRef"],
            "sourceSha256": row["workspaceContentSha256"],
            "hashStatus": row.get("hashStatus"),
            "revisionScope": row.get("revisionScope"),
            "distinctSourceCount": row["distinctSourceCount"],
            "mentionCount": row["mentionCount"],
            "repairPriorityScore": row["repairPriorityScore"],
            "observedRelationTuples": [
                {
                    "subjectId": sample["sourceRef"],
                    "predicate": "DOCUMENT_LINKS_TO",
                    "objectId": None,
                    "candidateTargetRef": row["targetRef"],
                    "sourceRef": sample["sourceRef"],
                    "sourceRevision": sample["sourceRevision"],
                    "evidenceSpan": {
                        "startByte": sample["supportingSpan"][0],
                        "endByte": sample["supportingSpan"][1],
                    },
                    "extractionMethod": "compile_okf_docs_path_ref_v1",
                    "status": "OBSERVED",
                }
                for sample in row.get("evidenceSamples", [])[:3]
            ],
        }
        for row in returned
        if row.get("repairEligible") is True
    ]
    return {
        "status": "REVIEW_QUEUE_ONLY",
        "rankingPolicy": "EXISTS_OUTSIDE_SCAN_FIRST_THEN_MENTION_COUNT_THEN_LEXICAL_PATH",
        "candidateCount": len(grouped),
        "returnedCandidateCount": min(len(grouped), limit),
        "truncated": len(grouped) > limit,
        "limit": limit,
        "admittedOutsideScanCohortCount": len(admitted_outside_scan),
        "admittedOutsideScanCohort": admitted_outside_scan,
        "mentionResolutionCounts": resolution_counts,
        "rankedCandidates": returned,
        "hashPolicy": {"maxFileBytes": max_hash_file_bytes, "totalByteBudget": 16 * 1024 * 1024,
                       "remainingByteBudget": remaining_hash_budget},
        "autoResolved": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def _rank_explicit_document_links(
    records: list[dict[str, Any]], graph_revision: str,
) -> dict[str, Any]:
    """Run the existing NetworkX CPU oracle over exact, locally resolved path links."""
    source_refs = sorted(record["chunkId"] for record in records)
    ordinal_by_ref = {source_ref: ordinal for ordinal, source_ref in enumerate(source_refs)}
    record_by_ref = {record["chunkId"]: record for record in records}
    edges: list[TypedGraphEdge] = []
    edge_evidence: list[dict[str, Any]] = []
    for record in records:
        for relation in record.get("relationPaths", []):
            target = relation.get("target")
            if relation.get("targetResolution") == "RESOLVED_LOCAL_SOURCE" and target in ordinal_by_ref:
                target_record = record_by_ref[target]
                edges.append(TypedGraphEdge(
                    src_ordinal=ordinal_by_ref[record["chunkId"]],
                    dst_ordinal=ordinal_by_ref[target],
                    kind="DOCUMENT_LINKS_TO",
                    weight=1.0,
                ))
                edge_evidence.append({
                    "predicate": "DOCUMENT_LINKS_TO",
                    "sourceRef": record["chunkId"],
                    "sourceRevision": record["sourceRevision"],
                    "targetRef": target,
                    "targetRevision": target_record["sourceRevision"],
                    "supportingSpan": relation["supportingSpan"],
                    "supportingSpanUnit": relation["supportingSpanUnit"],
                    "graphRevision": graph_revision,
                })
    if not source_refs:
        return {"status": "EMPTY_GRAPH", "backend": "networkx", "nodeCount": 0, "edgeCount": 0, "scores": {}, "receipt": None}
    scores, receipt = run_pagerank_v2(
        graph_revision=graph_revision,
        node_ordinals=list(range(len(source_refs))),
        edges=edges,
    )
    return {
        "status": "LOCAL_DERIVED_GRAPH_RANKED",
        "backend": receipt.effective_backend,
        "nodeCount": receipt.node_count,
        "edgeCount": receipt.edge_count,
        "scores": {source_refs[ordinal]: score for ordinal, score in sorted(scores.items())},
        "edgeEvidence": edge_evidence,
        "receipt": receipt.__dict__,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def _sha256_bytes(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _qualify_task_binding(task: dict[str, Any], source_file_hashes: dict[str, str], repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    """Bind a workboard task to its exact current task block and source file."""
    source_ref = str(task.get("source") or "").replace("\\", "/")
    logical_key = task.get("logicalTaskKey")
    identity = task.get("taskIdentity") if isinstance(task.get("taskIdentity"), dict) else {}
    task_revision = identity.get("taskRevision") or task.get("blockHash")
    result = {
        "logicalTaskKey": logical_key,
        "sourceRef": source_ref or None,
        "taskRevision": task_revision,
        "sourceFileRevision": None,
        "status": "REJECTED",
        "reason": None,
    }
    if not isinstance(logical_key, str) or not logical_key.strip():
        result["reason"] = "LOGICAL_TASK_KEY_MISSING"
        return result
    if identity.get("logicalTaskKey") != logical_key:
        result["reason"] = "TASK_IDENTITY_KEY_MISMATCH"
        return result
    if not isinstance(task_revision, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", task_revision):
        result["reason"] = "TASK_REVISION_MISSING_OR_INVALID"
        return result
    if task.get("blockHash") != task_revision:
        result["reason"] = "TASK_BLOCK_REVISION_MISMATCH"
        return result
    relative_source = Path(source_ref)
    if not source_ref or relative_source.is_absolute() or ".." in relative_source.parts:
        result["reason"] = "TASK_SOURCE_REF_INVALID"
        return result
    expected_file_revision = source_file_hashes.get(source_ref)
    if not isinstance(expected_file_revision, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", expected_file_revision):
        result["reason"] = "WORKBOARD_SOURCE_FILE_REVISION_MISSING"
        return result
    source_path = (repo_root / relative_source).resolve()
    try:
        source_path.relative_to(repo_root.resolve())
        actual_file_revision = _sha256_bytes(source_path.read_bytes())
    except (OSError, ValueError):
        result["reason"] = "TASK_SOURCE_FILE_UNAVAILABLE"
        return result
    result["sourceFileRevision"] = actual_file_revision
    if actual_file_revision != expected_file_revision:
        result["reason"] = "TASK_SOURCE_FILE_REVISION_MISMATCH"
        return result
    result["status"] = "SOURCE_AND_TASK_REVISION_QUALIFIED"
    return result


def _compute_graph_revision(records: list[dict[str, Any]], task_bindings: list[dict[str, Any]]) -> str:
    """Include source content and exact task bindings in the graph checksum."""
    material = {
        "schema": "atlas.okf-docs-openspec-graph-snapshot.v2",
        "sources": [
            {"sourceRef": r["chunkId"], "sourceRevision": r["sourceRevision"], "byteLength": r["byteLength"]}
            for r in records
        ],
        "tasks": [
            {"logicalTaskKey": b["logicalTaskKey"], "taskRevision": b["taskRevision"],
             "sourceRef": b["sourceRef"], "sourceFileRevision": b["sourceFileRevision"]}
            for b in task_bindings
        ],
    }
    encoded = json.dumps(material, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return _sha256_bytes(encoded)


def _extract_yaml_concepts(obj: Any, out: set[str]) -> None:
    if isinstance(obj, dict):
        for k in ("domain", "domainId", "domain_id", "concept", "conceptId", "concept_id", "id", "name", "kind", "tags"):
            v = obj.get(k)
            if isinstance(v, str) and 1 <= len(v) <= 80:
                out.add(v.strip())
            elif isinstance(v, list):
                for item in v[:20]:
                    if isinstance(item, str) and 1 <= len(item) <= 80:
                        out.add(item.strip())
        for val in obj.values():
            if isinstance(val, (dict, list)):
                _extract_yaml_concepts(val, out)
    elif isinstance(obj, list):
        for item in obj[:50]:
            if isinstance(item, (dict, list)):
                _extract_yaml_concepts(item, out)


def main(output_path: Path = REPORT_PATH, *, review_top_k: int = 50) -> None:
    okf_files = sorted((REPO_ROOT / ".okf").rglob("*"))
    okf_files = [p for p in okf_files if p.is_file()]
    docs_files = sorted((REPO_ROOT / "docs").rglob("*"))
    docs_files = [
        p for p in docs_files
        if p.is_file()
        and p.suffix.lower() in {".md", ".yaml", ".yml", ".okf"}
        and "docs\\reports\\" not in str(p)
        and "docs/reports/" not in str(p)
    ]

    all_files = okf_files + docs_files
    known_source_refs = {p.relative_to(REPO_ROOT).as_posix() for p in all_files}
    records: list[dict[str, Any]] = []
    rec_by_id: dict[str, dict[str, Any]] = {}
    yaml_parsed = 0
    yaml_errors = 0
    total_explicit_refs = 0
    concept_vocab: set[str] = set()

    for abs_path in all_files:
        rel = abs_path.relative_to(REPO_ROOT).as_posix()
        raw_bytes = abs_path.read_bytes()
        src_rev = _sha256_bytes(raw_bytes)
        text = raw_bytes.decode("utf-8", errors="replace")
        concepts: set[str] = set()

        if abs_path.suffix.lower() in {".yaml", ".yml"}:
            try:
                parsed = yaml.safe_load(text)
                yaml_parsed += 1
                _extract_yaml_concepts(parsed, concepts)
            except Exception:
                yaml_errors += 1
        elif abs_path.suffix.lower() == ".json":
            try:
                parsed = json.loads(text)
                _extract_yaml_concepts(parsed, concepts)
            except Exception:
                pass

        relation_paths = _extract_explicit_path_refs(text, known_source_refs)
        refs = [relation["target"] for relation in relation_paths]
        total_explicit_refs += len(refs)
        concept_vocab.update(concepts)

        rec = {
            "chunkId": rel,
            "sourceRevision": src_rev,
            "byteLength": len(raw_bytes),
            "lineCount": text.count("\n") + 1,
            "supportingSpans": [[0, len(raw_bytes)]] if raw_bytes else [],
            "supportingSpanUnit": "UTF8_BYTE_OFFSET",
            "supportingSpanGranularity": "WHOLE_SOURCE_NOT_CITATION_EXCERPT",
            "concepts": sorted(concepts)[:25],
            "explicitRefs": refs,
            "relationPaths": relation_paths,
            "preview": text[:280].lower(),
        }
        records.append(rec)
        rec_by_id[rel] = rec

    # Load open OpenSpec workboard tasks and build Task x Document matrix for top active sample tasks
    wb = json.loads(WORKBOARD_PATH.read_text(encoding="utf-8"))
    open_task_candidates = [t for t in wb.get("taskInventory", []) if t.get("state") == "OPEN"][:16]
    task_bindings = [
        _qualify_task_binding(task, wb.get("sourceFileHashes", {}))
        for task in open_task_candidates
    ]
    qualified_pairs = [
        (task, binding)
        for task, binding in zip(open_task_candidates, task_bindings)
        if binding["status"] == "SOURCE_AND_TASK_REVISION_QUALIFIED"
    ]
    open_tasks = [task for task, _ in qualified_pairs]
    qualified_bindings = [binding for _, binding in qualified_pairs]
    graph_revision = _compute_graph_revision(records, qualified_bindings)
    for record in records:
        record["graphRevision"] = graph_revision
    link_graph = _rank_explicit_document_links(records, graph_revision)
    unresolved_review = _rank_unresolved_mentions(records, limit=review_top_k)
    for source_ref, score in link_graph.get("scores", {}).items():
        rec_by_id[source_ref]["localDocumentLinkPageRank"] = score
    doc_ids = [r["chunkId"] for r in records]

    mat = np.zeros((len(open_tasks), len(records)), dtype=np.float64)
    for ti, task in enumerate(open_tasks):
        tokens = set(re.findall(r"[a-z0-9_]{3,}", f"{task.get('change', '')} {task.get('text', '')}".lower()))
        if not tokens:
            continue
        for dj, rec in enumerate(records):
            hay = f"{rec['chunkId']} {' '.join(rec['concepts'])} {rec['preview']}".lower()
            hits = sum(1 for tok in tokens if tok in hay)
            if hits:
                mat[ti, dj] = hits / len(tokens)

    sample_relations = []
    admitted: list[dict[str, Any]] = []
    admitted_count = 0
    if open_tasks and records:
        task0 = open_tasks[0]
        task0_binding = qualified_bindings[0]
        task0_tokens = set(re.findall(r"[a-z0-9_]{3,}", f"{task0.get('change', '')} {task0.get('text', '')}".lower()))
        lexical_ids = [
            r["chunkId"]
            for r in sorted(
                records,
                key=lambda x: (-sum(1 for t in task0_tokens if t in x["preview"] or t in x["chunkId"].lower()), x["chunkId"]),
            )[:25]
        ]
        # YAML-concept overlap is lexical metadata matching, not dense vector search.
        dense_ids = [
            r["chunkId"]
            for r in sorted(
                records,
                key=lambda x: (-sum(1 for t in task0_tokens if any(t in c.lower() for c in x["concepts"])), x["chunkId"]),
            )[:25]
        ]
        # Explicit path mentions are source observations, not Graphify traversal.
        graph_ids = [r["chunkId"] for r in records if len(r["explicitRefs"]) > 0][:25]
        svd_ranked = svd_topk_recommend(mat, task_index=0, doc_ids=doc_ids, rank_k=min(6, len(open_tasks)), top_k=25)
        lowrank_ids = [r["chunkId"] for r in svd_ranked]

        fused = fuse_topk(lexical_ids, dense_ids, graph_ids, lowrank_ids, k=15)
        admitted = admit_verified_topk(fused, lambda cid: rec_by_id.get(cid), limit=10)
        for candidate in admitted:
            record = rec_by_id.get(candidate["chunkId"])
            if record is not None:
                candidate["sourceByteLength"] = record["byteLength"]
                candidate["supportingSpanUnit"] = record["supportingSpanUnit"]
                candidate["supportingSpanGranularity"] = record["supportingSpanGranularity"]
        admitted_count = sum(1 for row in admitted if row["admissionStatus"] == "ADMITTED")

        for candidate in admitted[:3]:
            if candidate["admissionStatus"] == "ADMITTED":
                doc = rec_by_id[candidate["chunkId"]]
                sample_relations.append(
                    build_relation_proposal_v1(
                        subject_kind="task",
                        subject_id=str(task0_binding["logicalTaskKey"]),
                        subject_source_revision=str(task0_binding["taskRevision"]),
                        object_kind="document_chunk",
                        object_id=doc["chunkId"],
                        object_source_revision=doc["sourceRevision"],
                        predicate="TASK_RELEVANT_TO_DOCUMENT",
                        method="okf_docs_svd_rrf_4lane_v1",
                        source_ref=doc["chunkId"],
                        content_sha256=doc["sourceRevision"],
                        graph_revision=graph_revision,
                    )
                )

    report = {
        "schema": "atlas.okf-docs-openspec-relations.v1",
        "status": "LOCAL_CANDIDATES_VALIDATED" if admitted_count >= 1 and yaml_errors == 0 and open_tasks else "PARTIAL",
        "proofScope": "LOCAL_SOURCE_HASH_AND_PRE_ACE_CANDIDATE_SHAPE_ONLY",
        "graphifyIntegration": "NOT_WIRED",
        "networkxTraversal": "NOT_RUN",
        "pagerank": link_graph["status"],
        "localDocumentLinkGraph": {
            "status": link_graph["status"],
            "backend": link_graph["backend"],
            "nodeCount": link_graph["nodeCount"],
            "edgeCount": link_graph["edgeCount"],
            "resolvedReferenceCount": sum(
                1 for record in records for relation in record["relationPaths"]
                if relation["targetResolution"] == "RESOLVED_LOCAL_SOURCE"
            ),
            "unresolvedReferenceCount": sum(
                1 for record in records for relation in record["relationPaths"]
                if relation["targetResolution"] != "RESOLVED_LOCAL_SOURCE"
            ),
            "topRanked": [
                {"sourceRef": source_ref, "pageRank": score}
                for source_ref, score in sorted(
                    link_graph.get("scores", {}).items(), key=lambda item: (-item[1], item[0])
                )[:10]
            ],
            "executionReceipt": link_graph.get("receipt"),
            "resolvedEdgeEvidenceSample": link_graph.get("edgeEvidence", [])[:10],
            "canonicalAuthority": False,
            "writesPerformed": False,
        },
        "unresolvedMentionReview": unresolved_review,
        "canonicalGraphWrites": False,
        "okfFileCount": len(okf_files),
        "docsFileCount": len(docs_files),
        "totalIndexedFiles": len(records),
        "yamlParsedCount": yaml_parsed,
        "yamlParseErrorCount": yaml_errors,
        "conceptVocabSize": len(concept_vocab),
        "totalExplicitCrossRefs": total_explicit_refs,
        "graphRevision": graph_revision,
        "workboardGeneratedAt": wb.get("generatedAt"),
        "taskBindingCandidateCount": len(open_task_candidates),
        "taskBindingQualifiedCount": len(qualified_bindings),
        "taskBindingRejections": [b for b in task_bindings if b["status"] != "SOURCE_AND_TASK_REVISION_QUALIFIED"],
        "sampleTaskKey": open_tasks[0].get("logicalTaskKey") if open_tasks else None,
        "sampleTaskSourceRef": qualified_bindings[0]["sourceRef"] if qualified_bindings else None,
        "sampleTaskSourceFileRevision": qualified_bindings[0]["sourceFileRevision"] if qualified_bindings else None,
        "sampleTaskRevision": qualified_bindings[0]["taskRevision"] if qualified_bindings else None,
        "retrievalLaneSemantics": {
            "lexical": "token substring match over path and first 280 source-text characters",
            "dense": "token overlap against extracted YAML concepts; no embedding vectors",
            "graph": "explicit repository path references found by regex; no Graphify traversal",
            "lowrank": "NumPy SVD over task-document lexical/concept overlap matrix; no trained model",
        },
        "admittedTopKCount": admitted_count,
        "preAceValidatedCandidateCount": admitted_count,
        "admittedTop5": admitted[:5],
        "sampleRelationProposals": sample_relations,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "okfFileCount": report["okfFileCount"],
        "docsFileCount": report["docsFileCount"],
        "totalIndexedFiles": report["totalIndexedFiles"],
        "yamlParsedCount": report["yamlParsedCount"],
        "yamlParseErrorCount": report["yamlParseErrorCount"],
        "conceptVocabSize": report["conceptVocabSize"],
        "totalExplicitCrossRefs": report["totalExplicitCrossRefs"],
        "localDocumentLinkGraph": report["localDocumentLinkGraph"],
        "unresolvedMentionReview": {
            "candidateCount": unresolved_review["candidateCount"],
            "mentionResolutionCounts": unresolved_review["mentionResolutionCounts"],
            "topRanked": unresolved_review["rankedCandidates"][:10],
        },
        "admittedTopKCount": report["admittedTopKCount"],
        "graphifyIntegration": report["graphifyIntegration"],
        "reportPath": output_path.relative_to(REPO_ROOT).as_posix(),
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compile local .okf/docs task relations as non-canonical candidates.")
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    parser.add_argument("--review-top-k", type=int, default=50)
    args = parser.parse_args()
    output_path = args.output if args.output.is_absolute() else (REPO_ROOT / args.output).resolve()
    try:
        output_path.relative_to(REPO_ROOT.resolve())
    except ValueError:
        parser.error("--output must be inside the repository")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    main(output_path, review_top_k=max(1, min(500, int(args.review_top_k))))
