"""Read-only, deterministic query-to-candidate sequence over validated corpus rows.

This is an analysis adapter, not a corpus parser, model trainer, queue service,
or canonical identity owner. Inputs must already be schema-validated and
revision-qualified by their owning source/OKF pipeline.
"""
from __future__ import annotations

from collections import deque
from dataclasses import asdict
import hashlib
import json
import re
import argparse
from pathlib import Path
from typing import Any, Mapping, Sequence

from .topk_paginator import stable_topk


REQUIRED_CANDIDATE_FIELDS = (
    "canonicalId",
    "candidateOrdinal",
    "sourceRef",
    "sourceRevision",
    "workspaceRevision",
    "representationRevision",
    "evidenceRefs",
    "text",
)

FEATURE_COLUMNS = (
    "keywordScore",
    "trigramScore",
    "semanticScore",
    "pagerankScore",
    "astScore",
    "ontologyScore",
    "clusterDistance",
)


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(re.findall(r"[a-z0-9]+", value.casefold()))


def _digest(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _validate_candidates(candidates: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    if not candidates:
        raise ValueError("SEQUENCE_CANDIDATES_REQUIRED")
    validated: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_ordinals: set[int] = set()
    for candidate in candidates:
        missing = [key for key in REQUIRED_CANDIDATE_FIELDS if key not in candidate]
        if missing:
            raise ValueError("SEQUENCE_CANDIDATE_FIELDS_MISSING:" + ",".join(missing))
        canonical_id = str(candidate["canonicalId"]).strip()
        if not canonical_id:
            raise ValueError("SEQUENCE_CANONICAL_ID_REQUIRED")
        if canonical_id in seen_ids:
            raise ValueError("SEQUENCE_DUPLICATE_CANONICAL_ID")
        seen_ids.add(canonical_id)
        ordinal = candidate["candidateOrdinal"]
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal < 0:
            raise ValueError("SEQUENCE_ORDINAL_INVALID")
        if ordinal in seen_ordinals:
            raise ValueError("SEQUENCE_DUPLICATE_ORDINAL")
        seen_ordinals.add(ordinal)
        for key in ("sourceRef", "sourceRevision", "workspaceRevision", "representationRevision"):
            if not isinstance(candidate[key], str) or not candidate[key].strip():
                raise ValueError("SEQUENCE_LINEAGE_REQUIRED:" + key)
        evidence_refs = candidate["evidenceRefs"]
        if not isinstance(evidence_refs, (list, tuple)) or not evidence_refs:
            raise ValueError("SEQUENCE_EVIDENCE_REQUIRED")
        if not isinstance(candidate["text"], str):
            raise ValueError("SEQUENCE_TEXT_REQUIRED")
        if candidate.get("revisionStatus") != "PROVEN":
            raise ValueError("SEQUENCE_REVISION_NOT_PROVEN")
        validated.append(dict(candidate))
    return sorted(validated, key=lambda item: (item["candidateOrdinal"], item["canonicalId"]))


def run_advisory_candidate_sequence_v1(
    *,
    sequence_id: str,
    corpus_revision: str,
    corpus_checksum: str,
    corpus_schema_status: str,
    query: str,
    candidates: Sequence[Mapping[str, Any]],
    k: int = 10,
    offset: int = 0,
    queue_capacity: int = 512,
    graph_revision: str | None = None,
    graph_edges: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    """Extract keyword evidence and return stable, proposal-only Top-K results.

    ``graph_edges`` optionally supplies already-admitted ordinal edges. PageRank
    is attached as an advisory feature and never changes lexical Top-K ordering.
    The queue is a bounded in-memory deque; this function performs no writes.
    """
    if not sequence_id.strip() or not corpus_revision.strip() or not corpus_checksum.strip():
        raise ValueError("SEQUENCE_CORPUS_IDENTITY_REQUIRED")
    if corpus_schema_status != "VALIDATED":
        raise ValueError("SEQUENCE_OKF_CORPUS_NOT_VALIDATED")
    if not query.strip():
        raise ValueError("SEQUENCE_QUERY_REQUIRED")
    if k < 0 or offset < 0:
        raise ValueError("SEQUENCE_PAGE_INVALID")
    if queue_capacity < 1:
        raise ValueError("SEQUENCE_QUEUE_CAPACITY_INVALID")
    rows = _validate_candidates(candidates)
    if len(rows) > queue_capacity:
        raise ValueError("SEQUENCE_QUEUE_CAPACITY_EXCEEDED")

    query_terms = set(_tokens(query))
    if not query_terms:
        raise ValueError("SEQUENCE_QUERY_HAS_NO_KEYWORDS")

    queue = deque(rows, maxlen=queue_capacity)
    observed: list[dict[str, Any]] = []
    while queue:
        row = queue.popleft()
        document_terms = set(_tokens(row["text"]))
        overlap = query_terms & document_terms
        score = len(overlap) / len(query_terms)
        observed.append({
            "canonicalId": row["canonicalId"],
            "candidateOrdinal": row["candidateOrdinal"],
            "score": score,
            "sourceRevision": row["sourceRevision"],
            "evidenceRefs": list(row["evidenceRefs"]),
            "sourceRef": row["sourceRef"],
            "workspaceRevision": row["workspaceRevision"],
            "representationRevision": row["representationRevision"],
            "keywordMatches": sorted(overlap),
            "classification": "ADVISORY_KEYWORD_CANDIDATE",
            "canonicalAuthority": False,
        })
    page = stable_topk(observed, k=k, offset=offset)
    extras = {item["canonicalId"]: item for item in observed}
    ranked = [{**item, **{key: extras[item["canonicalId"]][key] for key in (
        "sourceRef", "workspaceRevision", "representationRevision", "keywordMatches",
        "classification", "canonicalAuthority",
    )}} for item in page["candidates"]]

    pagerank_status = "NOT_REQUESTED"
    if graph_edges:
        if not graph_revision or not graph_revision.strip():
            raise ValueError("SEQUENCE_GRAPH_REVISION_REQUIRED")
        from atlas_graph_runtime.contracts import TypedGraphEdge
        from atlas_graph_runtime.networkx_executor import run_pagerank_v2

        edge_values = []
        for edge in graph_edges:
            try:
                edge_values.append(TypedGraphEdge(
                    src_ordinal=edge["srcOrdinal"],
                    dst_ordinal=edge["dstOrdinal"],
                    kind=str(edge["kind"]),
                    weight=float(edge.get("weight", 1.0)),
                ))
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("SEQUENCE_GRAPH_EDGE_INVALID") from exc
        scores, graph_receipt = run_pagerank_v2(
            graph_revision=graph_revision,
            node_ordinals=[row["candidateOrdinal"] for row in rows],
            edges=edge_values,
        )
        if graph_receipt.status != "PROVEN":
            raise ValueError("SEQUENCE_PAGERANK_NOT_PROVEN")
        for item in ranked:
            item["pagerankAdvisory"] = scores.get(item["candidateOrdinal"], 0.0)
        pagerank_status = "PROVEN_ADVISORY"
    else:
        graph_receipt = None

    observation_by_id = {item["canonicalId"]: item for item in observed}
    feature_rows = [{
        "canonicalId": row["canonicalId"],
        "candidateOrdinal": row["candidateOrdinal"],
        "sourceRevision": row["sourceRevision"],
        "workspaceRevision": row["workspaceRevision"],
        "representationRevision": row["representationRevision"],
        "evidenceRefs": list(row["evidenceRefs"]),
        "features": {
            "keywordScore": observation_by_id[row["canonicalId"]]["score"],
            "trigramScore": None,
            "semanticScore": None,
            "pagerankScore": scores.get(row["candidateOrdinal"], 0.0) if graph_receipt is not None else None,
            "astScore": None,
            "ontologyScore": None,
            "clusterDistance": None,
        },
        "featureStatus": {
            "keywordScore": "COMPUTED_DETERMINISTIC",
            "trigramScore": "NOT_PROVIDED",
            "semanticScore": "NOT_PROVIDED",
            "pagerankScore": "COMPUTED_ADVISORY" if graph_receipt is not None else "NOT_PROVIDED",
            "astScore": "NOT_PROVIDED",
            "ontologyScore": "NOT_PROVIDED",
            "clusterDistance": "NOT_PROVIDED",
        },
    } for row in rows]
    if graph_receipt is not None:
        for feature in feature_rows:
            feature["pagerankAdvisory"] = feature["features"]["pagerankScore"]
    corpus_manifest = {
        "sequenceId": sequence_id,
        "corpusRevision": corpus_revision,
        "corpusChecksum": corpus_checksum,
        "query": query,
        "candidates": [
            [row["canonicalId"], row["candidateOrdinal"], row["sourceRevision"],
             row["workspaceRevision"], row["representationRevision"], row["evidenceRefs"]]
            for row in rows
        ],
    }
    corpus_snapshot_checksum = _digest(corpus_manifest)
    ordinal_map_checksum = _digest([
        [row["candidateOrdinal"], row["canonicalId"]] for row in rows
    ])
    feature_matrix_payload = {
        "schema": "atlas.candidate-feature-matrix.v1",
        "columns": list(FEATURE_COLUMNS),
        "normalizationPolicy": "KEYWORD_OVER_QUERY_TERM_COUNT; OTHER_FEATURES_UNNORMALIZED_OR_NOT_PROVIDED",
        "corpusRevision": corpus_revision,
        "corpusSnapshotChecksum": corpus_snapshot_checksum,
        "ordinalMapChecksum": ordinal_map_checksum,
        "graphRevision": graph_revision if graph_receipt is not None else None,
        "graphReceiptChecksum": graph_receipt.output_checksum if graph_receipt is not None else None,
        "rows": feature_rows,
    }
    return {
        "schema": "atlas.advisory-candidate-sequence.v1",
        "sequenceId": sequence_id,
        "status": "PROPOSAL_ONLY",
        "corpusRevision": corpus_revision,
        "corpusChecksum": corpus_checksum,
        "inputChecksum": corpus_snapshot_checksum,
        "candidateCount": len(rows),
        "queue": {"mode": "IN_MEMORY_BOUNDED", "capacity": queue_capacity, "dequeued": len(observed)},
        "stages": {
            "keywordRecognition": "PROVEN_DETERMINISTIC",
            "featureAlignment": "PROVEN_IDENTITY_ORDERED",
            "pagerank": pagerank_status,
            "naiveBayes": "NOT_RUN_REQUIRES_LABELED_TRAINING_CORPUS",
            "logisticRegression": "NOT_RUN_REQUIRES_LABELED_TRAINING_CORPUS",
            "xgboost": "NOT_RUN_REQUIRES_GROUPED_LABELS_AND_HELD_OUT_EVALUATION",
            "kmeans": "NOT_RUN_REQUIRES_QUALIFIED_NUMERIC_FEATURE_MATRIX",
            "backpropagation": "NOT_RUN_LOGISTIC_ONLY_IF_TRAINING_IS_AUTHORIZED_AND_LABELED_DATA_EXISTS",
        },
        "algorithmNotes": {
            "keywordRecognition": "Deterministic token overlap; no learned parameters.",
            "naiveBayes": "Estimate class priors and feature likelihoods; no backpropagation.",
            "logisticRegression": "Supervised binary classifier; gradient descent may use the sigmoid/cross-entropy chain rule.",
            "xgboost": "Gradient-boosted trees use loss gradients/Hessians for split and leaf updates; this is not neural-network backpropagation.",
            "kmeans": "Iterative nearest-centroid assignment and centroid means; no backpropagation.",
            "pagerank": "Graph fixed-point/power iteration; advisory structural score.",
            "ranking": "Keyword score drives stable Top-K; PageRank is attached as metadata and cannot alter ordering.",
        },
        "graphReceipt": asdict(graph_receipt) if graph_receipt is not None else None,
        "featureMatrix": {
            **feature_matrix_payload,
            "rowCount": len(feature_rows),
            "featureDimension": len(FEATURE_COLUMNS),
            "checksum": _digest(feature_matrix_payload),
            "canonicalAuthority": False,
        },
        "featureRows": feature_rows,
        "topK": {**page, "candidates": ranked},
        "writesPerformed": False,
        "promotionEligible": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Validated JSON envelope exported by the .okf owner")
    parser.add_argument("--output", type=Path, help="Optional local JSON receipt path")
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    result = run_advisory_candidate_sequence_v1(
        sequence_id=payload["sequenceId"],
        corpus_revision=payload["corpusRevision"],
        corpus_checksum=payload["corpusChecksum"],
        corpus_schema_status=payload["corpusSchemaStatus"],
        query=payload["query"],
        candidates=payload["candidates"],
        k=int(payload.get("k", 10)),
        offset=int(payload.get("offset", 0)),
        queue_capacity=int(payload.get("queueCapacity", 512)),
        graph_revision=payload.get("graphRevision"),
        graph_edges=payload.get("graphEdges", ()),
    )
    encoded = json.dumps(result, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
