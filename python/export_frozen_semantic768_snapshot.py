"""Exports a read-only, checksummed diagnostic snapshot from
codebase_chunk_index.content_embedding, whose canonical model/source lineage is unverified.

This does NOT train anything or qualify a production cohort. It freezes a
structural diagnostic matrix + ordinal map; source/model lineage remains unproven.

Ordering: rows are ordered by id (the primary key) for full determinism --
re-running this exporter against an unchanged corpus must produce byte-identical
output and checksums.

Verifies (does not just trust column type) that every row's content_embedding is
genuinely 768-dim via len(), and that every value is finite -- matches this
repo's own "verify structurally, don't trust metadata" rule.

Outputs:
  docs/reports/semantic768/frozen_semantic_768_<tag>_matrix.f32bin
    Raw row-major float32 little-endian matrix, shape [N, 768]. No header --
    the manifest carries N and 768 explicitly. Readable directly via
    torch.from_file(path, shared=False, size=N*768, dtype=torch.float32) or
    numpy.memmap(path, dtype='<f4', shape=(N, 768)).
  docs/reports/semantic768/frozen_semantic_768_<tag>_ordinal_map.json
    ordinal (0..N-1) -> {id, source_ref}, in matrix row order.
  docs/reports/semantic768-ae-training-snapshot-<tag>.json
    The manifest: row count, matrix checksum, ordinal map checksum,
    sourceRef coverage, code-revision fields, and explicit unqualified lineage
    status. Existing tags are never overwritten.

Usage:
  python python/export_frozen_semantic768_snapshot.py --tag diagnostic-v5
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time

import numpy as np
import psycopg2
import psycopg2.extras

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "docs", "reports", "semantic768")
REPORT_DIR = os.path.join(REPO_ROOT, "docs", "reports")

EMBED_DIM = 768


def git_sha_for(path: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%H", "--", path],
            cwd=REPO_ROOT, capture_output=True, text=True, check=True,
        )
        sha = out.stdout.strip()
        return sha or None
    except Exception:
        return None


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def snapshot_output_paths(tag: str) -> tuple[str, str, str]:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", tag) or ".." in tag:
        raise ValueError("snapshot tag must be a simple filename component")
    return (
        os.path.join(OUT_DIR, f"frozen_semantic_768_{tag}_matrix.f32bin"),
        os.path.join(OUT_DIR, f"frozen_semantic_768_{tag}_ordinal_map.json"),
        os.path.join(REPORT_DIR, f"semantic768-ae-training-snapshot-{tag}.json"),
    )


def ensure_snapshot_paths_new(paths: tuple[str, ...]) -> None:
    existing = [path for path in paths if os.path.lexists(path)]
    if existing:
        raise FileExistsError("refusing to overwrite existing snapshot artifacts: " + ", ".join(existing))


def snapshot_qualification_fields() -> dict[str, object]:
    return {
        "representationRevision": None,
        "sourceColumn": "codebase_chunk_index.content_embedding",
        "canonicalSourceColumn": None,
        "producerRevision": None,
        "lineageQualification": "NOT_PROVEN",
        "modelIdentityQualification": "NOT_PROVEN",
        "statusExplanation": "Structural dimensions, finiteness, and artifact checksums do not establish canonical source/model lineage.",
        "status": "FROZEN_ARTIFACT_STRUCTURAL_ONLY",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--tag", default="v4", help="snapshot tag, e.g. v4")
    args = parser.parse_args()

    try:
        matrix_path, ordinal_map_path, manifest_path = snapshot_output_paths(args.tag)
        ensure_snapshot_paths_new((matrix_path, ordinal_map_path, manifest_path))
    except (ValueError, FileExistsError) as exc:
        print(json.dumps({"status": "BLOCKED_NO_OVERWRITE", "reason": str(exc)}))
        sys.exit(78)

    os.makedirs(OUT_DIR, exist_ok=True)
    started_at = time.time()

    conn = psycopg2.connect(args.database_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id::text AS id, source_ref, content_embedding
                FROM codebase_chunk_index
                WHERE content_embedding IS NOT NULL
                ORDER BY id
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    n = len(rows)
    if n == 0:
        print(json.dumps({"status": "FAILED", "reason": "no eligible rows"}))
        sys.exit(1)

    matrix = np.empty((n, EMBED_DIM), dtype=np.float32)
    ordinal_map = []
    source_refs_seen: set[str] = set()
    reject_count = 0

    for i, row in enumerate(rows):
        vec = np.fromstring(row["content_embedding"].strip("[]"), sep=",", dtype=np.float32)
        if vec.shape[0] != EMBED_DIM:
            reject_count += 1
            print(json.dumps({"event": "reject", "id": row["id"], "reason": "dimension_mismatch", "got": int(vec.shape[0])}))
            continue
        if not np.all(np.isfinite(vec)):
            reject_count += 1
            print(json.dumps({"event": "reject", "id": row["id"], "reason": "non_finite_value"}))
            continue
        matrix[i] = vec
        ordinal_map.append({"ordinal": i, "id": row["id"], "sourceRef": row["source_ref"]})
        if row["source_ref"]:
            source_refs_seen.add(row["source_ref"])

    if reject_count > 0:
        print(json.dumps({"status": "FAILED", "reason": f"{reject_count} rows failed structural verification"}))
        sys.exit(1)

    matrix_bytes = matrix.tobytes(order="C")
    matrix_checksum = sha256_bytes(matrix_bytes)
    ordinal_map_checksum = sha256_bytes(json.dumps(ordinal_map, sort_keys=False).encode("utf-8"))

    with open(matrix_path, "xb") as fh:
        fh.write(matrix_bytes)
    with open(ordinal_map_path, "x", encoding="utf-8") as fh:
        json.dump(ordinal_map, fh)

    first_row_checksum = sha256_bytes(matrix[0].tobytes())
    last_row_checksum = sha256_bytes(matrix[-1].tobytes())

    manifest = {
        "schema": "atlas.frozen-semantic768-training-snapshot.v1",
        "tag": args.tag,
        "rowCount": n,
        "embeddingDim": EMBED_DIM,
        "matrixPath": os.path.relpath(matrix_path, REPO_ROOT).replace("\\", "/"),
        "matrixChecksum": matrix_checksum,
        "matrixEncoding": "IEEE754_F32LE",
        "matrixLayout": "row-major, shape [N, 768], no header",
        "ordinalMapPath": os.path.relpath(ordinal_map_path, REPO_ROOT).replace("\\", "/"),
        "ordinalMapChecksum": ordinal_map_checksum,
        "firstRowChecksum": first_row_checksum,
        "lastRowChecksum": last_row_checksum,
        "sourceRefCoverage": len(source_refs_seen),
        **snapshot_qualification_fields(),
        "trainingCodeRevision": git_sha_for("python/train_latent_autoencoder.py"),
        "exporterCodeRevision": git_sha_for("python/export_frozen_semantic768_snapshot.py"),
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "durationS": time.time() - started_at,
    }

    with open(manifest_path, "x", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
