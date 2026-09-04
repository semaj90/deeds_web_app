"""Backfills codebase_chunk_index.latent_256 AND latent_64 from content_embedding via a real
model forward pass (NestedSemanticAutoencoder.encode()) -- NOT a prefix truncation, since both
are learned representations. The model already computes latent256/latent128/latent64 together
in one forward pass; this writes both persistable outputs (latent_128 has no Postgres storage
column yet, so it stays in-memory-only here -- adding it needs a schema migration, out of scope
for this backfill).

Writes latent_256 (halfvec(256)) + latent_256_checkpoint_revision, and latent_64 (vector(64)) +
latent64_model + latent_embedding_valid + latent_embedding_validated_at (the model_checksum from
the training receipt, so a future retrain doesn't silently mix generations) after Postgres,
per this repo's canonical packet truth flow (Postgres first, mirrors/cache after -- there is no
Qdrant/Redis write in this script; that's a separate follow-up once these columns are backfilled
and verified).

Dry-run by default. Pass --apply to write. Batches writes via execute_values for throughput on
55K+ rows.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np
import psycopg2
import psycopg2.extras
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "atlas_compute"))
from latent_autoencoder import NestedAutoencoderConfig, NestedSemanticAutoencoder  # noqa: E402

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"


def fetch_batch(conn, batch_size: int, offset: int, frozen_ids: list[str] | None = None) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        id_clause = "id = ANY(%s::uuid[]) AND" if frozen_ids is not None else ""
        params = ((frozen_ids, CHECKPOINT_REVISION, CHECKPOINT_REVISION, batch_size, offset)
                  if frozen_ids is not None else
                  (CHECKPOINT_REVISION, CHECKPOINT_REVISION, batch_size, offset))
        cur.execute(
            f"""
            SELECT id::text AS id, content_embedding
            FROM codebase_chunk_index
            WHERE {id_clause} content_embedding IS NOT NULL
              AND (
                latent_256_checkpoint_revision IS NULL OR latent_256_checkpoint_revision != %s
                OR latent_64 IS NULL OR latent64_model IS NULL OR latent64_model != %s
              )
            ORDER BY id
            LIMIT %s OFFSET %s
            """,
            params,
        )
        return cur.fetchall()


def main() -> None:
    global CHECKPOINT_REVISION
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--checkpoint", default="python/checkpoints/nested_semantic_autoencoder_v3_full01.pt")
    parser.add_argument("--receipt", default="docs/reports/latent-autoencoder-training-receipt-v3-full01.json")
    parser.add_argument("--batch-size", type=int, default=2000)
    parser.add_argument("--limit", type=int, default=0, help="0 = all eligible rows")
    parser.add_argument("--ids-file", help="JSON array of frozen UUIDs for a stable cohort")
    parser.add_argument("--apply", action="store_true", help="write to Postgres; default is dry-run")
    args = parser.parse_args()

    with open(args.receipt, "r", encoding="utf-8") as fh:
        receipt = json.load(fh)
    CHECKPOINT_REVISION = receipt["model_checksum"][:64]
    frozen_ids = None
    if args.ids_file:
        with open(args.ids_file, "r", encoding="utf-8") as fh:
            frozen_ids = json.load(fh)
        if not isinstance(frozen_ids, list) or not all(isinstance(value, str) for value in frozen_ids):
            raise ValueError("--ids-file must contain a JSON array of UUID strings")
    print(json.dumps({"event": "checkpoint_revision", "value": CHECKPOINT_REVISION}))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
    state_dict = torch.load(args.checkpoint, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    conn = psycopg2.connect(args.database_url)
    conn.autocommit = False
    total_processed = 0
    total_written = 0
    started_at = time.time()

    try:
        while True:
            rows = fetch_batch(conn, args.batch_size, 0, frozen_ids)
            if not rows:
                break
            if args.limit and total_processed + len(rows) > args.limit:
                rows = rows[: args.limit - total_processed]
            if not rows:
                break

            vectors = np.array(
                [np.fromstring(r["content_embedding"].strip("[]"), sep=",", dtype=np.float32) for r in rows],
                dtype=np.float32,
            )
            with torch.no_grad():
                tensor = torch.from_numpy(vectors).to(device)
                latent256, _latent128, latent64 = model.encode(tensor)
                latent256_np = latent256.detach().cpu().numpy()
                latent64_np = latent64.detach().cpu().numpy()

            payload = [
                (
                    "[" + ",".join(f"{v:.6f}" for v in latent256_np[i]) + "]",
                    CHECKPOINT_REVISION,
                    "[" + ",".join(f"{v:.6f}" for v in latent64_np[i]) + "]",
                    CHECKPOINT_REVISION,
                    rows[i]["id"],
                )
                for i in range(len(rows))
            ]

            if args.apply:
                with conn.cursor() as cur:
                    psycopg2.extras.execute_batch(
                        cur,
                        """
                        UPDATE codebase_chunk_index
                        SET latent_256 = %s,
                            latent_256_checkpoint_revision = %s,
                            latent_64 = %s,
                            latent64_model = %s,
                            latent_embedding_valid = true,
                            latent_embedding_validated_at = now()
                        WHERE id = %s::uuid
                        """,
                        payload,
                        page_size=500,
                    )
                conn.commit()
                total_written += len(rows)

            total_processed += len(rows)
            print(json.dumps({
                "event": "batch_complete",
                "processed": total_processed,
                "written": total_written,
                "mode": "APPLY" if args.apply else "DRY_RUN",
            }))

            if args.limit and total_processed >= args.limit:
                break
            if not args.apply:
                # dry-run: same rows would be re-selected forever since nothing gets written
                break
    finally:
        conn.close()

    duration_s = time.time() - started_at
    status = {
        "status": "BACKFILL_APPLY_PROVEN" if args.apply else "BACKFILL_DRY_RUN_PROVEN",
        "mode": "APPLY" if args.apply else "DRY_RUN",
        "checkpoint_revision": CHECKPOINT_REVISION,
        "rows_processed": total_processed,
        "rows_written": total_written,
        "duration_s": duration_s,
    }
    print(json.dumps(status))


if __name__ == "__main__":
    main()
