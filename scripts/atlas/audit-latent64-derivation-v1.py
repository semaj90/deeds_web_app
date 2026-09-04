#!/usr/bin/env python3
"""Read-only comparison of stored latent_64 with the current Phase 16 encoder output."""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
import psycopg2
import torch

ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(ROOT / "python" / "atlas_compute"))
from latent_autoencoder import NestedAutoencoderConfig, NestedSemanticAutoencoder  # noqa: E402


def vector(value):
    if isinstance(value, (list, tuple, np.ndarray)):
        return np.asarray(value, dtype=np.float32)
    return np.fromstring(str(value).strip("[]"), sep=",", dtype=np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--report-path", default="docs/reports/latent64-derivation-audit-v1.json")
    parser.add_argument("--marker", help="restrict the sample to one stored latent64_model marker")
    parser.add_argument("--receipt", default="docs/reports/latent-autoencoder-training-receipt-v3-full01.json")
    parser.add_argument("--checkpoint", default="python/checkpoints/nested_semantic_autoencoder_v3_full01.pt")
    args = parser.parse_args()
    if args.limit <= 0 or args.limit > 128:
        raise SystemExit("--limit must be between 1 and 128")

    with open(ROOT / args.receipt, encoding="utf-8") as fh:
        receipt = json.load(fh)
    model_checksum = receipt["model_checksum"][:64]
    database_url = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            marker_clause = " AND latent64_model = %s" if args.marker else ""
            params = (args.marker, args.limit) if args.marker else (args.limit,)
            cur.execute(
                f"""
                SELECT id::text, content_embedding, latent_256, latent_64, latent64_model
                FROM codebase_chunk_index
                WHERE content_embedding IS NOT NULL AND latent_256 IS NOT NULL AND latent_64 IS NOT NULL
                {marker_clause}
                ORDER BY id LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    input_lengths = [int(vector(row[1]).size) for row in rows]
    valid_rows = [row for row in rows if vector(row[1]).size == 768 and vector(row[3]).size == 64]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
    model.load_state_dict(torch.load(ROOT / args.checkpoint, map_location=device, weights_only=True))
    model.to(device).eval()
    inputs = np.asarray([vector(row[1]) for row in valid_rows], dtype=np.float32)
    stored = np.asarray([vector(row[3]) for row in valid_rows], dtype=np.float32)
    with torch.no_grad():
        _, _, computed = model.encode(torch.from_numpy(inputs).to(device)) if len(valid_rows) else (None, None, torch.empty((0, 64), device=device))
    computed = computed.cpu().numpy().astype(np.float32)
    errors = np.max(np.abs(stored - computed), axis=1) if len(valid_rows) else np.asarray([], dtype=np.float32)
    result = {
        "schema": "atlas.latent64-derivation-audit.v1",
        "status": "MATCH" if len(valid_rows) and float(errors.max()) <= 1e-4 else ("MISMATCH" if len(valid_rows) else "NO_VALID_768_SAMPLE"),
        "sampleCount": len(rows),
        "valid768SampleCount": len(valid_rows),
        "inputDimensionCounts": {str(length): input_lengths.count(length) for length in sorted(set(input_lengths))},
        "modelChecksum": model_checksum,
        "device": str(device),
        "storedMarkers": sorted({row[4] for row in rows}),
        "maxAbsoluteError": float(errors.max()) if len(errors) else None,
        "meanAbsoluteError": float(errors.mean()) if len(errors) else None,
        "rowChecksum": "sha256:" + hashlib.sha256("\n".join(row[0] for row in rows).encode()).hexdigest(),
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    output = ROOT / args.report_path
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
