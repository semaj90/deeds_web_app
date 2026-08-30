"""GA8-JUDGE-01 freeze phase: semantic-only candidate admission.

Creates an immutable evaluation candidate universe from EmbeddingGemma semantic_768 only.
No IMPORTS relevance labels, PageRank, graph features, or prior judgments may affect admission.

canonical_authority: false
"""
from __future__ import annotations

import json
import math
import os
import random
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests

from ga8_judge_v2_common import canonical_json, load_ndjson, sha256_float32, sha256_json, sha256_text, write_ndjson

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
EMBED_MODEL = os.getenv("GA8_EMBED_MODEL", "embeddinggemma:latest")
EMBED_MODEL_REVISION = os.getenv("GA8_EMBEDDING_MODEL_REVISION")
QUERY_SET_PATH = os.getenv("GA8_QUERY_SET_PATH", ".tmp/atlas/structural-proxy-golden-set-v1.ndjson")
OUT_PATH = os.getenv("GA8_FROZEN_POOL_PATH", ".tmp/atlas/ga8-frozen-semantic-candidate-pools-v1.ndjson")
REPORT_PATH = os.getenv("GA8_FROZEN_POOL_REPORT", "docs/reports/ga8-frozen-semantic-candidate-pool-v1.json")
POOL_K = int(os.getenv("GA8_SEMANTIC_POOL_K", "50"))
SAMPLE_SIZE = int(os.getenv("GA8_QUERY_SAMPLE_SIZE", "60"))
SEED = int(os.getenv("GA8_QUERY_SAMPLE_SEED", "684453"))
REPRESENTATION_ID = "semantic_768"

OPTIONAL_COLUMNS = ("source_revision", "workspace_revision", "content_hash", "representation_revision")


def embed_query(text: str) -> list[float]:
    resp = requests.post(f"{OLLAMA_URL}/api/embed", json={"model": EMBED_MODEL, "input": text[:2000]}, timeout=60)
    resp.raise_for_status()
    vectors = resp.json().get("embeddings")
    if not isinstance(vectors, list) or not vectors or not isinstance(vectors[0], list):
        raise RuntimeError("GA8_QUERY_EMBEDDING_MISSING")
    vector = [float(v) for v in vectors[0]]
    if len(vector) != 768 or any(not math.isfinite(v) for v in vector):
        raise RuntimeError("GA8_QUERY_EMBEDDING_INVALID_768")
    return vector


def available_columns(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='codebase_chunk_index'")
        return {str(row[0]) for row in cur.fetchall()}


def source_ref(relative_path: str) -> str:
    value = str(relative_path).replace("\\", "/").lstrip("./")
    return value if value.startswith("sveltekit-frontend/") else f"sveltekit-frontend/{value}"


def fetch_pool(conn, entry: dict, vector: list[float], columns: set[str]) -> list[dict]:
    optional = [name for name in OPTIONAL_COLUMNS if name in columns]
    optional_sql = "" if not optional else ", " + ", ".join(optional)
    vector_literal = "[" + ",".join(f"{v:.9g}" for v in vector) + "]"
    sql = f"""
      SELECT id::text AS candidate_id, relative_path, summary,
             (1.0 - (content_embedding <=> %s::halfvec))::double precision AS semantic_score
             {optional_sql}
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL AND id::text != %s
      ORDER BY content_embedding <=> %s::halfvec ASC, id ASC
      LIMIT %s
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, (vector_literal, str(entry["query_packet_key"]), vector_literal, POOL_K))
        rows = cur.fetchall()

    out: list[dict] = []
    for pool_ordinal, row in enumerate(rows):
        evidence = str(row.get("summary") or "").strip()
        score = float(row["semantic_score"])
        if not math.isfinite(score):
            raise RuntimeError("GA8_NON_FINITE_SEMANTIC_SCORE")
        out.append({
            "poolOrdinal": pool_ordinal,
            "candidateId": str(row["candidate_id"]),
            "sourceRef": source_ref(str(row["relative_path"])),
            "sourceRevision": str(row["source_revision"]) if row.get("source_revision") is not None else None,
            "workspaceRevision": str(row["workspace_revision"]) if row.get("workspace_revision") is not None else None,
            "representationRevision": str(row["representation_revision"]) if row.get("representation_revision") is not None else None,
            "contentHash": str(row["content_hash"]) if row.get("content_hash") is not None else None,
            "semanticScore": score,
            "evidenceText": evidence,
            "evidenceTextChecksum": sha256_text(evidence),
        })
    return out


def query_id(entry: dict) -> str:
    return "ga8q:" + sha256_text(str(entry["query_source_ref"]) + "\0" + str(entry["query_text"])).removeprefix("sha256:")[:24]


def pool_checksum_payload(row: dict) -> dict:
    return {
        "queryId": row["queryId"],
        "queryText": row["queryText"],
        "queryTextChecksum": row["queryTextChecksum"],
        "queryEmbeddingChecksum": row["queryEmbeddingChecksum"],
        "representationId": row["representationId"],
        "embeddingModelRevision": row["embeddingModelRevision"],
        "poolK": row["poolK"],
        "candidates": row["candidates"],
    }


def main() -> None:
    if not EMBED_MODEL_REVISION:
        raise SystemExit("GA8_EMBEDDING_MODEL_REVISION_REQUIRED")
    if POOL_K <= 0 or SAMPLE_SIZE <= 0:
        raise SystemExit("GA8_POOL_OR_SAMPLE_SIZE_INVALID")

    entries = load_ndjson(QUERY_SET_PATH)
    eligible = [{"query_source_ref": r["query_source_ref"], "query_packet_key": r["query_packet_key"], "query_text": r["query_text"]}
                for r in entries if r.get("query_source_ref") and r.get("query_packet_key") and r.get("query_text")]
    sample = random.Random(SEED).sample(eligible, min(SAMPLE_SIZE, len(eligible)))
    query_set_checksum = sha256_json(sample)

    conn = psycopg2.connect(DATABASE_URL)
    provisional: list[dict] = []
    empty_pools = 0
    try:
        columns = available_columns(conn)
        missing_optional = [name for name in OPTIONAL_COLUMNS if name not in columns]
        for index, entry in enumerate(sample):
            vector = embed_query(str(entry["query_text"]))
            candidates = fetch_pool(conn, entry, vector, columns)
            if not candidates:
                empty_pools += 1
                continue
            row = {
                "schema": "atlas.frozen-semantic-candidate-pool.v1",
                "queryId": query_id(entry),
                "queryText": str(entry["query_text"]),
                "queryTextChecksum": sha256_text(str(entry["query_text"])),
                "querySourceRef": str(entry["query_source_ref"]),
                "querySetChecksum": query_set_checksum,
                "representationId": REPRESENTATION_ID,
                "embeddingModel": EMBED_MODEL,
                "embeddingModelRevision": EMBED_MODEL_REVISION,
                "queryEmbeddingChecksum": sha256_float32(vector),
                "poolK": POOL_K,
                "ordinalMapChecksum": sha256_json([c["candidateId"] for c in candidates]),
                "ordinalCoordinate": "POOL_LOCAL_NOT_CANONICAL_CANDIDATE_ORDINAL",
                "labelInputsUsed": 0,
                "graphInputsUsed": 0,
                "sourceLineageColumnsMissing": missing_optional,
                "candidates": candidates,
                "canonicalAuthority": False,
            }
            row["candidatePoolChecksum"] = sha256_json(pool_checksum_payload(row))
            provisional.append(row)
            if (index + 1) % 10 == 0:
                print(canonical_json({"event": "ga8_pool_freeze_progress", "processed": index + 1, "total": len(sample)}))
    finally:
        conn.close()

    if not provisional:
        raise SystemExit("GA8_NO_FROZEN_CANDIDATE_POOLS")
    candidate_snapshot_revision = sha256_json([
        {"queryId": row["queryId"], "candidatePoolChecksum": row["candidatePoolChecksum"]}
        for row in provisional
    ])
    frozen = [{**row, "candidateSnapshotRevision": candidate_snapshot_revision} for row in provisional]
    write_ndjson(OUT_PATH, frozen)

    report = {
        "schema": "atlas.ga8-semantic-candidate-pool-freeze-receipt.v1",
        "status": "GA8_FROZEN_SEMANTIC_CANDIDATE_POOL_CREATED",
        "querySetOrigin": "STRUCTURAL_PROXY_QUERY_FIELDS_ONLY_RELEVANCE_LABELS_UNUSED",
        "querySetChecksum": query_set_checksum,
        "candidateSnapshotRevision": candidate_snapshot_revision,
        "artifactChecksum": sha256_json(frozen),
        "representationId": REPRESENTATION_ID,
        "embeddingModel": EMBED_MODEL,
        "embeddingModelRevision": EMBED_MODEL_REVISION,
        "poolK": POOL_K,
        "requestedQueries": len(sample),
        "frozenQueries": len(frozen),
        "emptyPools": empty_pools,
        "labelInputsUsed": 0,
        "graphInputsUsed": 0,
        "humanGoldRelevanceSetProven": False,
        "canonicalAuthority": False,
        "artifactPath": OUT_PATH,
    }
    Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(canonical_json(report))


if __name__ == "__main__":
    main()
