"""Read-only end-to-end proof of Document-Relation + 4-Lane RRF + SVD + Pre-ACE Verification
against live PostgreSQL 18 (`atlas_external_doc_chunks` / `atlas_external_doc_pages`).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import numpy as np
import psycopg2

from python.atlas_graph_runtime.document_relation_rrf_v1 import (
    admit_verified_topk,
    build_relation_proposal_v1,
    fuse_topk,
    svd_topk_recommend,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "okf-doc-rrf-e2e-proof-v1.json"


def _norm_sha256(val: str | None) -> str | None:
    if not val:
        return None
    s = str(val).strip().lower()
    if s.startswith("sha256:") and len(s) == 71:
        return s
    if re.fullmatch(r"[0-9a-f]{64}", s):
        return f"sha256:{s}"
    return None


def main() -> None:
    conn = psycopg2.connect("postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT c.chunk_id, c.page_id::text, p.url, p.title, p.content_hash, p.evidence_revision,
               c.ordinal, c.start_char, c.end_char, c.text, c.domain_class,
               COALESCE(c.domain_tags, ARRAY[]::text[]), COALESCE(c.concept_ids, ARRAY[]::text[])
        FROM public.atlas_external_doc_chunks c
        JOIN public.atlas_external_doc_pages p ON p.id = c.page_id
        ORDER BY c.page_id, c.ordinal
        """
    )
    rows = cur.fetchall()
    assert len(rows) > 0, "Expected live atlas_external_doc_chunks rows"

    docs = []
    doc_by_id = {}
    concept_vocab = {}
    for row in rows:
        (
            chunk_id,
            page_id,
            url,
            title,
            content_hash,
            evidence_rev,
            ordinal,
            start_char,
            end_char,
            text,
            domain_class,
            domain_tags,
            concept_ids,
        ) = row
        src_rev = _norm_sha256(content_hash) or _norm_sha256(evidence_rev)
        spans = [[int(start_char or 0), int(end_char or max(1, len(text or "")))]]
        rec = {
            "chunkId": chunk_id,
            "pageId": page_id,
            "url": url,
            "title": title,
            "sourceRevision": src_rev,
            "supportingSpans": spans,
            "domainClass": domain_class,
            "domainTags": list(domain_tags),
            "conceptIds": list(concept_ids),
            "text": text or "",
        }
        docs.append(rec)
        doc_by_id[chunk_id] = rec
        for tag in list(domain_tags) + list(concept_ids):
            if tag not in concept_vocab:
                concept_vocab[tag] = len(concept_vocab)

    graph_revision = "sha256:" + hashlib.sha256(
        json.dumps([d["chunkId"] for d in docs], separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    for d in docs:
        d["graphRevision"] = graph_revision
        d["relationPaths"] = [{"predicate": "DOCUMENT_HAS_CHUNK", "pageUrl": d["url"]}]

    # Sample queries tied to actual domains in the corpus
    queries = [
        ("cuda_tile", "cuda tile kernel memory sram"),
        ("postgresql_18", "postgresql pgvector index hnsw"),
        ("svelte_runes", "svelte runes state derived snippet"),
        ("three_js", "threejs webgpu shader texture"),
    ]

    # Build Task x Document relevance matrix (4 x len(docs)) & Document x Concept matrix
    mat = np.zeros((len(queries), len(docs)), dtype=np.float64)
    doc_ids = [d["chunkId"] for d in docs]
    for qi, (_qname, qtext) in enumerate(queries):
        qtokens = set(qtext.lower().split())
        for dj, d in enumerate(docs):
            hay = f"{d['title']} {d['text'][:400]} {' '.join(d['domainTags'])}".lower()
            hits = sum(1 for tok in qtokens if tok in hay)
            mat[qi, dj] = hits / max(1, len(qtokens))

    # Query 1: postgresql_18 / pgvector via FTS + SVD + graph + dense-tag proxy
    cur.execute(
        """
        SELECT chunk_id
        FROM public.atlas_external_doc_chunks
        WHERE search_vector @@ plainto_tsquery('english', 'postgresql pgvector hnsw')
        ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', 'postgresql pgvector hnsw')) DESC
        LIMIT 20
        """
    )
    lexical_ids = [r[0] for r in cur.fetchall()]
    svd_ranked = svd_topk_recommend(mat, task_index=1, doc_ids=doc_ids, rank_k=4, top_k=20)
    lowrank_ids = [r["chunkId"] for r in svd_ranked]
    dense_ids = [
        d["chunkId"]
        for d in sorted(
            docs,
            key=lambda x: (-sum(1 for t in ("postgresql", "pgvector", "hnsw") if t in x["text"].lower()), x["chunkId"]),
        )[:20]
    ]
    graph_ids = [d["chunkId"] for d in docs if "pgvector" in d["url"].lower() or "postgresql" in d["url"].lower()][:20]

    fused = fuse_topk(lexical_ids, dense_ids, graph_ids, lowrank_ids, k=15)
    admitted = admit_verified_topk(fused, lambda cid: doc_by_id.get(cid), limit=10)
    admitted_count = sum(1 for r in admitted if r["admissionStatus"] == "ADMITTED")

    sample_proposal = None
    if admitted and admitted[0]["admissionStatus"] == "ADMITTED":
        top = doc_by_id[admitted[0]["chunkId"]]
        sample_proposal = build_relation_proposal_v1(
            subject_kind="task",
            subject_id="cuda_tile_query",
            subject_source_revision=graph_revision,
            object_kind="document_chunk",
            object_id=top["chunkId"],
            object_source_revision=top["sourceRevision"],
            predicate="TASK_RELEVANT_TO_DOCUMENT",
            method="rrf_svd_4lane_v1",
            source_ref=top["url"],
            content_sha256=top["sourceRevision"],
            graph_revision=graph_revision,
        )

    report = {
        "schema": "atlas.okf-doc-rrf-e2e-proof.v1",
        "status": "PROVEN" if admitted_count >= 1 else "NO_ADMITTED_CANDIDATES",
        "externalDocChunkCount": len(docs),
        "conceptVocabSize": len(concept_vocab),
        "graphRevision": graph_revision,
        "lexicalHitCount": len(lexical_ids),
        "fusedTop5": fused[:5],
        "admittedCount": admitted_count,
        "admittedTop3": admitted[:3],
        "sampleRelationProposal": sample_proposal,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "externalDocChunkCount": report["externalDocChunkCount"],
        "conceptVocabSize": report["conceptVocabSize"],
        "lexicalHitCount": report["lexicalHitCount"],
        "admittedCount": report["admittedCount"],
        "topChunk": admitted[0]["chunkId"] if admitted else None,
        "reportPath": "docs/reports/okf-doc-rrf-e2e-proof-v1.json",
    }, indent=2))


if __name__ == "__main__":
    main()
