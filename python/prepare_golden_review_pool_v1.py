"""Prepare a blank graded-review pool from current EmbeddingGemma retrieval.

Read-only with respect to PostgreSQL: it reads the structural proxy query set,
retrieves a bounded top-50 pool from the canonical semantic_768 column, and
writes reviewable JSONL with no assigned relevance grades.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / ".tmp/atlas/structural-proxy-golden-set-v1.ndjson"
OUTPUT = ROOT / ".tmp/atlas/golden-relevance-review-pool-v1.ndjson"
REPORT = ROOT / "docs/reports/golden-relevance-review-pool-v1.json"
DATABASE_URL = os.environ.get("ATLAS_DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
OLLAMA_URL = os.environ.get("ATLAS_EMBEDDING_URL", "http://127.0.0.1:11434")
EMBED_MODEL = os.environ.get("ATLAS_EMBEDDING_MODEL", "embeddinggemma:latest")
POOL_K = 50
SAMPLE_SIZE = 60
SEED = 684453


def checksum(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def embed(text: str) -> list[float]:
    response = requests.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": EMBED_MODEL, "input": text[:2000]},
        timeout=30,
    )
    response.raise_for_status()
    vector = response.json()["embeddings"][0]
    if len(vector) != 768:
        raise ValueError(f"EmbeddingGemma contract violation: expected 768, got {len(vector)}")
    return vector


def main() -> None:
    entries = [json.loads(line) for line in INPUT.read_text(encoding="utf-8").splitlines() if line.strip()]
    rng = random.Random(SEED)
    selected = rng.sample(entries, min(SAMPLE_SIZE, len(entries)))
    records = []
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for entry in selected:
                vector = embed(entry["query_text"])
                literal = "[" + ",".join(f"{value:.8f}" for value in vector) + "]"
                cur.execute(
                    """
                    SELECT id::text AS candidate_id, relative_path, summary,
                           content_hash
                    FROM codebase_chunk_index
                    WHERE content_embedding IS NOT NULL AND id::text <> %s
                    ORDER BY content_embedding <=> %s::halfvec
                    LIMIT %s
                    """,
                    (entry["query_packet_key"], literal, POOL_K),
                )
                proxy_ids = set(entry.get("relevant_packet_keys", []))
                candidates = []
                for rank, row in enumerate(cur.fetchall(), start=1):
                    candidates.append({
                        "candidateId": row["candidate_id"],
                        "rank": rank,
                        "sourceRef": row["relative_path"],
                        "summary": row["summary"],
                        "contentHash": row["content_hash"],
                        "proxyRelevantHint": row["candidate_id"] in proxy_ids,
                        "relevanceGrade": None,
                        "confidence": None,
                        "reviewerId": None,
                        "evidenceRefs": [],
                        "notes": None,
                    })
                records.append({
                    "schema": "atlas.golden-relevance-review-pool-item.v1",
                    "reviewStatus": "PENDING",
                    "queryId": entry["query_packet_key"],
                    "querySourceRef": entry["query_source_ref"],
                    "queryText": entry["query_text"],
                    "embeddingModel": EMBED_MODEL,
                    "representation": "semantic_768",
                    "candidateSnapshotRevision": None,
                    "ordinalMapChecksum": None,
                    "candidates": candidates,
                    "proxyHintIsNotTruth": True,
                })
    serialized = "".join(json.dumps(record, separators=(",", ":")) + "\n" for record in records)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(serialized, encoding="utf-8")
    report = {
        "schema": "atlas.golden-relevance-review-pool-v1",
        "status": "REVIEW_POOL_PREPARED",
        "canonicalAuthority": False,
        "sourceCorpusEntries": len(entries),
        "sampledQueries": len(records),
        "poolK": POOL_K,
        "candidateCount": sum(len(record["candidates"]) for record in records),
        "blankGrades": sum(sum(candidate["relevanceGrade"] is None for candidate in record["candidates"]) for record in records),
        "embeddingModel": EMBED_MODEL,
        "representation": "semantic_768",
        "databaseWrites": False,
        "productionActivation": False,
        "inputChecksum": checksum(INPUT.read_bytes()),
        "outputChecksum": checksum(serialized.encode("utf-8")),
        "nextRequiredStep": "Fill grades 0-3 and revision bindings through independent review; do not import proxy hints.",
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
