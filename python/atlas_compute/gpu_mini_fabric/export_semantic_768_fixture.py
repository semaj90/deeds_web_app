#!/usr/bin/env python
"""One-time READ-ONLY export of real semantic_768 vectors for GPU-GRAPH-ANN-03.

Reads codebase_chunk_index.content_embedding (canonical per CLAUDE.md's
Embedding Dimensions Policy) directly from Postgres, read-only, and writes a
frozen local snapshot -- a raw contiguous float32 binary file plus a small
JSON manifest with row count / dim / checksum / source query -- so the
GPU-GRAPH-ANN-03 benchmark itself never touches the live database (frozen
fixture, not a live query on every run). Per root CLAUDE.md's Wire Format
Layering Rule, the bulk vector array is written as raw float32 bytes, never
JSON.

Credentials are read from this repo's own .env files by this script directly
-- never printed, logged, or passed through a shell command visible in any
tool-call transcript.

Run inside conda env atlas-rapids-cu13:
  PYTHONPATH=. /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
    -m atlas_compute.gpu_mini_fabric.export_semantic_768_fixture
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import numpy as np
import psycopg2

REPO_ROOT = Path("/mnt/c/Users/james/Videos/deeds-web-app")
OUT_DIR = REPO_ROOT / "python" / "atlas_compute" / "gpu_mini_fabric" / "fixtures"
OUT_VECTORS = OUT_DIR / "semantic-768-real-frozen.f32.bin"
OUT_NODE_KEYS = OUT_DIR / "semantic-768-real-frozen-node-keys.json"
OUT_MANIFEST = OUT_DIR / "semantic-768-real-frozen-manifest.json"


def _find_database_url() -> str:
    for env_path in (REPO_ROOT / ".env", REPO_ROOT / "sveltekit-frontend" / ".env"):
        if not env_path.exists():
            continue
        text = env_path.read_text(errors="ignore")
        m = re.search(r'^DATABASE_URL=(.+)$', text, re.MULTILINE)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL not found in .env files")


def main() -> None:
    dsn = _find_database_url()
    # Postgres runs on host port 5434 (Windows) / reachable at 127.0.0.1:5434
    # from WSL2 via Docker Desktop's WSL2 backend port sharing -- if the DSN
    # from .env uses a different host/port (e.g. app-internal "postgres:5432"
    # docker-network hostname), rewrite host/port for this WSL2-side connection.
    dsn_for_wsl = re.sub(r"@[^:/]+:\d+/", "@127.0.0.1:5434/", dsn)

    conn = psycopg2.connect(dsn_for_wsl)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, content_embedding::text
                FROM codebase_chunk_index
                WHERE content_embedding IS NOT NULL
                ORDER BY id
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    n = len(rows)
    print(f"fetched {n} rows with populated content_embedding")

    node_keys = [r[0] for r in rows]
    vectors = np.zeros((n, 768), dtype=np.float32)
    for i, (_id, vec_text) in enumerate(rows):
        # pgvector text repr: "[0.1,0.2,...]"
        vectors[i] = np.array(vec_text.strip("[]").split(","), dtype=np.float32)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    vectors.tofile(OUT_VECTORS)
    OUT_NODE_KEYS.write_text(json.dumps(node_keys))

    checksum = hashlib.sha256(vectors.tobytes()).hexdigest()
    manifest = {
        "schema": "atlas.gpu-mini-fabric.semantic-768-real-frozen-manifest.v1",
        "source": "codebase_chunk_index.content_embedding (read-only export)",
        "num_rows": n,
        "dim": 768,
        "dtype": "float32",
        "vectors_file": OUT_VECTORS.name,
        "node_keys_file": OUT_NODE_KEYS.name,
        "vectors_checksum": checksum,
        "canonical_production_data_touched": True,
        "canonical_production_data_mutated": False,
        "note": "Read-only SELECT export, frozen at export time -- not re-queried on every benchmark run. Touches real canonical data (read) but never writes/mutates it.",
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
