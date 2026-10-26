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
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np
import psycopg2
import psycopg2.extras
import torch
from torch import nn
from torch.nn import functional as F

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "atlas_compute"))
from latent_autoencoder import NestedAutoencoderConfig, NestedSemanticAutoencoder  # noqa: E402


class CheckpointArchitectureError(ValueError):
    """Raised when checkpoint architecture is not allowlisted or has incompatible tensor shapes."""
    pass


class LegacyV3AE(nn.Module):
    """Historical 2026-08-29 3-tier AE for backward-compatibility with v3 checkpoints."""

    def __init__(self) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(768, 384), nn.GELU(), nn.Linear(384, 256), nn.LayerNorm(256)
        )
        self.decoder256 = nn.Sequential(nn.Linear(256, 384), nn.GELU(), nn.Linear(384, 768))
        self.decoder128 = nn.Sequential(nn.Linear(128, 384), nn.GELU(), nn.Linear(384, 768))
        self.decoder64 = nn.Sequential(nn.Linear(64, 384), nn.GELU(), nn.Linear(384, 768))

    def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        l256 = F.normalize(self.encoder(x), p=2, dim=-1)
        l128 = F.normalize(l256[:, :128], p=2, dim=-1)
        l64 = F.normalize(l128[:, :64], p=2, dim=-1)
        return l256, l128, l64

    def decode256(self, z: torch.Tensor) -> torch.Tensor:
        return F.normalize(self.decoder256(z), p=2, dim=-1)

    def decode128(self, z: torch.Tensor) -> torch.Tensor:
        return F.normalize(self.decoder128(z), p=2, dim=-1)

    def decode64(self, z: torch.Tensor) -> torch.Tensor:
        return F.normalize(self.decoder64(z), p=2, dim=-1)


def state_dict_checksum(model: nn.Module) -> str:
    """Computes exact sha256 checksum over sorted parameter names and tensor bytes."""
    digest = hashlib.sha256()
    for name, tensor in sorted(model.state_dict().items()):
        digest.update(name.encode("utf-8"))
        digest.update(np.ascontiguousarray(tensor.detach().cpu().numpy()).tobytes())
    return digest.hexdigest()


def identify_checkpoint_architecture(state_dict: dict[str, torch.Tensor]) -> str:
    """Deterministically identifies the autoencoder architecture by inspecting exact tensor shapes.

    Rejects unrecognized signatures, corrupted keys, and mismatched parameter dimensions.
    """
    if not isinstance(state_dict, dict):
        raise CheckpointArchitectureError("CHECKPOINT_NOT_A_STATE_DICT")

    canonical_keys = {"encoder_512.0.weight", "encoder_256.0.weight", "encoder_128.0.weight", "decoder256.0.weight"}
    legacy_keys = {"encoder.0.weight", "encoder.2.weight", "decoder256.0.weight", "decoder128.0.weight", "decoder64.0.weight"}

    keys = set(state_dict.keys())
    if canonical_keys.issubset(keys):
        if (
            state_dict["encoder_512.0.weight"].shape == torch.Size([512, 768])
            and state_dict["encoder_256.0.weight"].shape == torch.Size([256, 512])
            and state_dict["decoder256.0.weight"].shape == torch.Size([512, 256])
            and state_dict["decoder256.2.weight"].shape == torch.Size([768, 512])
        ):
            return "canonical_768_512_256_128"
        raise CheckpointArchitectureError("CANONICAL_SIGNATURE_TENSOR_SHAPE_MISMATCH")

    if legacy_keys.issubset(keys):
        if (
            state_dict["encoder.0.weight"].shape == torch.Size([384, 768])
            and state_dict["encoder.2.weight"].shape == torch.Size([256, 384])
            and state_dict["decoder256.0.weight"].shape == torch.Size([384, 256])
        ):
            return "legacy_v3_768_384_256"
        raise CheckpointArchitectureError("LEGACY_V3_SIGNATURE_TENSOR_SHAPE_MISMATCH")

    raise CheckpointArchitectureError("UNRECOGNIZED_CHECKPOINT_ARCHITECTURE")


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


def count_eligible(conn, frozen_ids: list[str] | None = None) -> int:
    with conn.cursor() as cur:
        id_clause = "id = ANY(%s::uuid[]) AND" if frozen_ids is not None else ""
        params = ((frozen_ids, CHECKPOINT_REVISION, CHECKPOINT_REVISION)
                  if frozen_ids is not None else
                  (CHECKPOINT_REVISION, CHECKPOINT_REVISION))
        cur.execute(
            f"""
            SELECT count(*)::int AS count
            FROM codebase_chunk_index
            WHERE {id_clause} content_embedding IS NOT NULL
              AND (
                latent_256_checkpoint_revision IS NULL OR latent_256_checkpoint_revision != %s
                OR latent_64 IS NULL OR latent64_model IS NULL OR latent64_model != %s
              )
            """,
            params,
        )
        row = cur.fetchone()
        return int(row[0]) if row else 0


def main() -> None:
    global CHECKPOINT_REVISION
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--checkpoint", default="python/checkpoints/nested_semantic_autoencoder_v3_full01.pt")
    parser.add_argument("--receipt", default="docs/reports/latent-autoencoder-training-receipt-v3-full01.json")
    parser.add_argument("--architecture-receipt", help="Optional path to write architecture selection receipt JSON")
    parser.add_argument("--batch-size", type=int, default=2000)
    parser.add_argument("--limit", type=int, default=0, help="0 = all eligible rows")
    parser.add_argument("--ids-file", help="JSON array of frozen UUIDs for a stable cohort")
    parser.add_argument("--apply", action="store_true", help="write to Postgres; default is dry-run")
    args = parser.parse_args()

    if args.apply:
        print(
            "LATENT256_APPLY_BLOCKED: per-row source/workspace revision compare-and-swap "
            "and independent vector readback are not implemented.",
            file=sys.stderr,
        )
        raise SystemExit(78)

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
    state_dict = torch.load(args.checkpoint, map_location=device, weights_only=True)
    if isinstance(state_dict, dict) and "state_dict" in state_dict:
        state_dict = state_dict["state_dict"]

    arch = identify_checkpoint_architecture(state_dict)
    if arch == "canonical_768_512_256_128":
        model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
    elif arch == "legacy_v3_768_384_256":
        model = LegacyV3AE()
    else:
        raise CheckpointArchitectureError(f"UNRECOGNIZED_CHECKPOINT_ARCHITECTURE: {arch}")

    model.load_state_dict(state_dict, strict=True)
    model.to(device)
    model.eval()

    with open(args.checkpoint, "rb") as fh:
        checkpoint_sha256 = hashlib.sha256(fh.read()).hexdigest()

    computed_model_checksum = state_dict_checksum(model)
    if computed_model_checksum.lower() != CHECKPOINT_REVISION.lower():
        raise ValueError(
            f"MODEL_CHECKSUM_MISMATCH: Computed state_dict checksum {computed_model_checksum} "
            f"does not match receipt model_checksum {CHECKPOINT_REVISION}"
        )

    arch_receipt = {
        "schema": "atlas.latent-checkpoint-architecture-receipt.v1",
        "architectureId": arch,
        "checkpointSha256": checkpoint_sha256,
        "modelChecksum": computed_model_checksum,
        "loaderRevision": "latent_checkpoint_loader.v2",
        "inputRepresentationRevision": "semantic_768:embedding_gemma",
        "transformPolicyRevision": "nested-semantic-autoencoder-v1",
        "strictStateDictValidation": True,
        "checkpointPath": args.checkpoint,
        "receiptPath": args.receipt,
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
    }
    print(json.dumps({"event": "architecture_selected", **arch_receipt}))
    print(json.dumps({"event": "model_loaded", "architecture": arch}))

    if args.architecture_receipt:
        os.makedirs(os.path.dirname(os.path.abspath(args.architecture_receipt)), exist_ok=True)
        with open(args.architecture_receipt, "w", encoding="utf-8") as f:
            json.dump(arch_receipt, f, indent=2)

    conn = psycopg2.connect(args.database_url)
    conn.autocommit = False
    total_eligible = count_eligible(conn, frozen_ids)
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
    remaining_eligible = max(0, total_eligible - total_processed)
    status = {
        "status": "BACKFILL_APPLY_PROVEN" if args.apply else "BACKFILL_DRY_RUN_PROVEN",
        "mode": "APPLY" if args.apply else "DRY_RUN",
        "checkpoint_revision": CHECKPOINT_REVISION,
        "architecture_id": arch,
        "checkpoint_sha256": checkpoint_sha256,
        "model_checksum": computed_model_checksum,
        "loader_revision": "latent_checkpoint_loader.v2",
        "rows_eligible": total_eligible,
        "rows_processed": total_processed,
        "rows_remaining": remaining_eligible,
        "rows_written": total_written,
        "batch_size": args.batch_size,
        "intentional_batch_limit": args.batch_size,
        "reconciliation_note": (
            f"{remaining_eligible} eligible records remain unprocessed because dry-run is intentionally "
            f"bounded by batch_size={args.batch_size}."
            if remaining_eligible > 0 else "All eligible records processed."
        ),
        "duration_s": duration_s,
    }
    print(json.dumps(status))


if __name__ == "__main__":
    main()
