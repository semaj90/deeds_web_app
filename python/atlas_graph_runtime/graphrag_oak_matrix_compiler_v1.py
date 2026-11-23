"""GraphRAG + OAKLib + NetworkX PageRank -> Cosine / XGBoost / RL Feature-Matrix Compiler (v1).

Connects:
  - PostgreSQL 18 PROVEN chunks (`doc14-admitted-chunks.jsonl`)
  - admitted DOC-14 relations only (proposal rows are rejected; OAK candidates remain advisory)
  - NetworkX `run_pagerank_v2` CPU oracle (`atlas.graph-execution-receipt.v2`)
  - Vectorized float32 cosine similarity + pinned `[N, F]` feature matrix (AGENTS.md § 8)
  - heuristic ranking diagnostics & grouped XGBoost row export (not preference/reward training data).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import urllib.request
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from python.atlas_graph_runtime.contracts import TypedGraphEdge
from python.atlas_graph_runtime.networkx_executor import run_pagerank_v2

FEATURE_COLUMNS_V1 = (
    "cosine_similarity",
    "pagerank_prior",
    "concept_overlap_jaccard",
    "relation_degree_norm",
    "chunk_char_len_norm",
)


def _sha256_bytes(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _validate_admitted_relation_v1(relation: dict[str, Any], *, graph_revision: str) -> None:
    """Reject proposal-shaped rows at the graph-feature boundary.

    A source-backed proposal is still not a graph edge. The caller must pass a
    row from the existing admission owner, carrying the exact graph revision,
    source identity, and evidence reference that were admitted together.
    """
    if relation.get("admissionState") != "GRAPH_ADMITTED" or relation.get("canonicalAuthority") is not True:
        raise ValueError("RELATION_NOT_GRAPH_ADMITTED")
    if relation.get("graphRevision") != graph_revision:
        raise ValueError("RELATION_GRAPH_REVISION_MISMATCH")
    if not all(str(relation.get(field) or "").strip() for field in ("sourceRef", "sourceRevision", "evidenceRef")):
        raise ValueError("RELATION_SOURCE_EVIDENCE_BINDING_REQUIRED")
    if not all(str(relation.get(field) or "").strip() for field in ("subjectId", "objectId", "predicate")):
        raise ValueError("RELATION_ENDPOINTS_AND_PREDICATE_REQUIRED")


def compile_graphrag_oak_matrix_v1(
    *,
    chunks: Sequence[dict[str, Any]],
    relations: Sequence[dict[str, Any]],
    oak_concepts_by_ref: dict[str, list[str]],
    embeddings: np.ndarray,
    query_embedding: np.ndarray,
    graph_revision: str,
    model_revision: str,
) -> dict[str, Any]:
    """Build a revision-pinned [N, 5] float32 feature matrix + observable RL/XGBoost rows."""
    n = len(chunks)
    if n == 0:
        raise ValueError("EMPTY_CHUNK_COHORT")
    emb = np.asarray(embeddings, dtype=np.float32)
    q = np.asarray(query_embedding, dtype=np.float32).reshape(-1)
    if emb.ndim != 2 or emb.shape[0] != n or emb.shape[1] != q.shape[0]:
        raise ValueError("EMBEDDING_SHAPE_MISMATCH")

    # Pending proposals are never graph input. Validate the full relation batch
    # before computing any derived graph feature.
    for relation in relations:
        _validate_admitted_relation_v1(relation, graph_revision=graph_revision)

    # 1. Build directed NetworkX graph over unique sourceRefs + targetRefs
    node_refs = sorted(
        {str(c["sourceRef"]) for c in chunks}
        | {str(r["subjectId"]) for r in relations if r.get("subjectId")}
        | {str(r["objectId"]) for r in relations if r.get("objectId")}
    )
    ordinal_by_ref = {ref: idx for idx, ref in enumerate(node_refs)}
    edges: list[TypedGraphEdge] = []
    out_degree: dict[str, int] = {}
    for rel in relations:
        src = str(rel.get("subjectId") or "")
        dst = str(rel.get("objectId") or "")
        if src in ordinal_by_ref and dst in ordinal_by_ref:
            edges.append(
                TypedGraphEdge(
                    src_ordinal=ordinal_by_ref[src],
                    dst_ordinal=ordinal_by_ref[dst],
                    kind=str(rel.get("predicate") or "TASK_REFERENCES_DOCUMENT"),
                    weight=1.0,
                )
            )
            out_degree[src] = out_degree.get(src, 0) + 1
            out_degree[dst] = out_degree.get(dst, 0) + 1

    pr_scores, pr_receipt = run_pagerank_v2(
        graph_revision=graph_revision,
        node_ordinals=list(range(len(node_refs))),
        edges=edges,
    )

    # 2. Vectorized cosine similarity [N]
    q_norm = float(np.linalg.norm(q))
    emb_norms = np.linalg.norm(emb, axis=1)
    denom = np.where(emb_norms > 0.0, emb_norms * (q_norm if q_norm > 0 else 1.0), 1.0)
    cos_sims = np.where((emb_norms > 0.0) & (q_norm > 0.0), (emb @ q) / denom, 0.0).astype(np.float32)

    # 3. Assemble pinned [N, 5] float32 feature matrix + observable RL/XGBoost rows
    all_query_concepts = {c for cs in oak_concepts_by_ref.values() for c in cs}
    max_deg = max(1, max(out_degree.values(), default=1))
    matrix = np.zeros((n, len(FEATURE_COLUMNS_V1)), dtype=np.float32)
    ordinal_map: list[dict[str, Any]] = []
    xgb_rl_rows: list[dict[str, Any]] = []

    for idx, ch in enumerate(chunks):
        ref = str(ch["sourceRef"])
        concepts = set(oak_concepts_by_ref.get(ref, []))
        jaccard = (
            float(len(concepts & all_query_concepts)) / float(len(concepts | all_query_concepts))
            if all_query_concepts
            else 0.0
        )
        pr_val = float(pr_scores.get(ordinal_by_ref.get(ref, -1), 0.0))
        deg_norm = float(out_degree.get(ref, 0)) / float(max_deg)
        char_norm = min(1.0, float(len(str(ch.get("text") or ""))) / 8192.0)

        matrix[idx, 0] = float(cos_sims[idx])
        matrix[idx, 1] = pr_val
        matrix[idx, 2] = jaccard
        matrix[idx, 3] = deg_norm
        matrix[idx, 4] = char_norm

        ordinal_map.append({
            "ordinal": idx,
            "chunkId": ch["chunkId"],
            "sourceRef": ref,
            "sourceRevision": ch["sourceRevision"],
        })
        observable_reward = round(
            0.55 * float(cos_sims[idx]) + 0.25 * pr_val + 0.20 * jaccard,
            6,
        )
        xgb_rl_rows.append({
            "ordinal": idx,
            "chunkId": ch["chunkId"],
            "sourceRef": ref,
            "features": [round(float(x), 6) for x in matrix[idx]],
            "observableReward": observable_reward,
            "oakConcepts": sorted(concepts),
        })

    return {
        "schema": "atlas.graphrag-oak-matrix.v1",
        "featureColumns": list(FEATURE_COLUMNS_V1),
        "matrixShape": [int(matrix.shape[0]), int(matrix.shape[1])],
        "dtype": "float32",
        "modelRevision": model_revision,
        "graphRevision": graph_revision,
        "candidateOrdinalMapChecksum": _sha256_bytes(
            json.dumps(ordinal_map, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ),
        "matrixChecksum": _sha256_bytes(matrix.tobytes()),
        "pageRankReceipt": pr_receipt.__dict__,
        "xgbAndRlRows": xgb_rl_rows,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def export_xgb_csv_and_grpo_pairs_v1(
    *,
    query: str,
    rows: Sequence[dict[str, Any]],
    csv_path: Path,
    grpo_path: Path,
    min_reward_delta: float = 0.05,
) -> dict[str, Any]:
    """Export grouped XGBoost CSV and observable-reward GRPO pairs (canonicalAuthority=False)."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    grpo_path.parent.mkdir(parents=True, exist_ok=True)

    sorted_rows = sorted(rows, key=lambda r: (-float(r["observableReward"]), str(r["chunkId"])))
    qid = _sha256_bytes(query.encode("utf-8"))[:16]
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["query_group_id", "chunk_id", "source_ref", "observable_reward", *FEATURE_COLUMNS_V1])
        for r in sorted_rows:
            writer.writerow([qid, r["chunkId"], r["sourceRef"], r["observableReward"], *r["features"]])

    pairs: list[str] = []
    if len(sorted_rows) >= 2:
        top = sorted_rows[0]
        for tail in sorted_rows[1:]:
            delta = round(float(top["observableReward"]) - float(tail["observableReward"]), 6)
            if delta >= min_reward_delta:
                pairs.append(json.dumps({
                    "schema": "atlas.doc14-ranking-pair-diagnostic.v1",
                    "prompt": query,
                    "chosenChunkId": top["chunkId"],
                    "rejectedChunkId": tail["chunkId"],
                    "rewardDelta": delta,
                    "rewardSource": "FIXED_FEATURE_HEURISTIC",
                    "trainingEligible": False,
                    "canonicalAuthority": False,
                }, ensure_ascii=False))
    grpo_path.write_text("\n".join(pairs) + ("\n" if pairs else ""), encoding="utf-8")
    return {
        "xgbCsvPath": str(csv_path),
        "xgbRowCount": len(sorted_rows),
        "grpoJsonlPath": str(grpo_path),
        "grpoPairCount": len(pairs),
    }


def _embed_ollama(texts: list[str], *, url: str = "http://127.0.0.1:11434", model: str = "embeddinggemma2:q8_0") -> np.ndarray:
    req = urllib.request.Request(
        f"{url.rstrip('/')}/api/embed",
        data=json.dumps({"model": model, "input": texts, "truncate": False}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8"))
    return np.asarray(resp["embeddings"], dtype=np.float32)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GraphRAG + OAKLib + NetworkX PageRank matrix compiler.")
    parser.add_argument("--live-embed", action="store_true")
    parser.add_argument("--export-datasets", action="store_true")
    parser.add_argument("--query", default="ACE ContextManifest retrieval runtime")
    parser.add_argument("--model", default="embeddinggemma2:q8_0")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    jsonl_path = repo_root / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
    ace_proof_path = repo_root / "docs" / "reports" / "doc14-outside-scan-cohort-ace-proof-v1.json"
    out_path = repo_root / "docs" / "reports" / "graphrag-oak-matrix-v1.json"

    chunks = [json.loads(l) for l in jsonl_path.read_text(encoding="utf-8").splitlines() if l.strip()][: max(1, args.limit)]
    ace_proof = json.loads(ace_proof_path.read_text(encoding="utf-8")) if ace_proof_path.exists() else {}
    # The proof artifact currently contains proposals, not admitted edges. Do
    # not reinterpret them as graph relationships or invent OAK concept IDs.
    rels = [
        {
            "subjectId": p.get("subject", {}).get("id"),
            "objectId": p.get("object", {}).get("id"),
            "predicate": p.get("relation", {}).get("predicate"),
            "sourceRef": p.get("evidence", {}).get("sourceRef"),
            "sourceRevision": p.get("subject", {}).get("sourceRevision"),
            "evidenceRef": p.get("evidence", {}).get("sourceRef"),
            "graphRevision": p.get("graphRevision"),
            "admissionState": "GRAPH_ADMITTED" if p.get("admission") == "GRAPH_ADMITTED" else "PENDING",
            "canonicalAuthority": p.get("canonicalAuthority") is True,
        }
        for p in (ace_proof.get("sampleDoc14RelationProposals") or [])
        if p.get("admission") == "GRAPH_ADMITTED"
    ]
    oak_map: dict[str, list[str]] = {}
    if args.live_embed:
        doc_inputs = [f"title: {c.get('title') or 'none'} | text: {c['text']}" for c in chunks]
        q_input = f"task: search result | query: {args.query}"
        all_vecs = _embed_ollama([q_input, *doc_inputs], model=args.model)
        q_emb = all_vecs[0]
        emb_mat = all_vecs[1:]
        embedding_source = f"live:ollama:{args.model}"
    else:
        rng = np.random.default_rng(42)
        emb_mat = rng.normal(size=(len(chunks), 768)).astype(np.float32)
        q_emb = emb_mat[0].copy()
        embedding_source = "synthetic:rng42"

    graph_input = {
        "schema": "atlas.doc14-derived-graph-input.v1",
        "chunkBindings": [
            [str(c.get("chunkId") or ""), str(c.get("sourceRevision") or "")]
            for c in chunks
        ],
        "admittedRelations": rels,
    }
    graph_revision = _sha256_bytes(
        json.dumps(graph_input, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )
    res = compile_graphrag_oak_matrix_v1(
        chunks=chunks,
        relations=rels,
        oak_concepts_by_ref=oak_map,
        embeddings=emb_mat,
        query_embedding=q_emb,
        graph_revision=graph_revision,
        model_revision=args.model,
    )
    res["embeddingSource"] = embedding_source
    res["graphRevisionStatus"] = "DERIVED_LOCAL_INPUT_CHECKSUM_NOT_CANONICAL"
    res["oakConceptMappingStatus"] = "NO_ADMITTED_MAPPINGS"
    if args.export_datasets:
        res["datasetExport"] = export_xgb_csv_and_grpo_pairs_v1(
            query=args.query,
            rows=res["xgbAndRlRows"],
            csv_path=repo_root / "docs" / "reports" / "doc14-xgboost-features-v1.csv",
            grpo_path=repo_root / "docs" / "reports" / "doc14-grpo-pairs-v1.jsonl",
        )
    out_path.write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": res["schema"],
        "embeddingSource": embedding_source,
        "matrixShape": res["matrixShape"],
        "matrixChecksum": res["matrixChecksum"],
        "pageRankStatus": res["pageRankReceipt"]["status"],
        "rowCount": len(res["xgbAndRlRows"]),
        "datasetExport": res.get("datasetExport"),
        "topRow": res["xgbAndRlRows"][0] if res["xgbAndRlRows"] else None,
        "reportPath": str(out_path),
    }, indent=2))
