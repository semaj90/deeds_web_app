"""PCA/SVD representation baseline vs. existing MRL-truncation and autoencoder-latent lanes.

Real replacement for the broken scripts/atlas/pca-baseline-768-to-384.mjs (that script's
"_powerIteration" generated random vectors, not real eigenvectors -- never produced a saved
result). This script:

  1. Reads a real sample of codebase_chunk_index rows carrying content_embedding (768d,
     canonical) plus the already-populated latent_256/latent_128/latent_64 autoencoder columns.
  2. Computes MRL-truncation lanes (512/256/128) via the same prefix+L2-renormalize mechanism
     already used elsewhere in this repo -- not a new truncation mechanism.
  3. Fits a REAL PCA/SVD basis via sklearn.decomposition.TruncatedSVD (never hand-rolled power
     iteration) on the 768d sample, and projects to 512/256/128 for direct comparison against the
     MRL lanes at matching dimensions.
  4. Feeds every representation into the existing, already-tested
     atlas_compute.representation_compare.compare_representations() harness -- does not
     reimplement neighbor-overlap/distance-correlation metrics.

Read-only: no Postgres writes, no Qdrant writes. Reference: openspec/changes/
parent-atlas-pca-svd-representation-baseline/tasks.md.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psycopg2
from sklearn.decomposition import TruncatedSVD

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "python" / "atlas_compute"))
from representation_compare import compare_representations  # noqa: E402

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
OUTPUT_PATH = REPO_ROOT / "docs" / "vector-governance" / "pca-svd-representation-comparison-v1.json"


def parse_vector(raw: str) -> np.ndarray:
    return np.fromstring(raw.strip("[]"), sep=",", dtype=np.float32)


def mrl_truncate(vectors: np.ndarray, dim: int) -> np.ndarray:
    """Prefix-slice + L2-renormalize -- the same MRL mechanism this repo already uses for
    codebase_chunks_512 and the latent_128 SLICE_FIRST_N lane. No new truncation mechanism."""
    sliced = vectors[:, :dim]
    norms = np.linalg.norm(sliced, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (sliced / norms).astype(np.float32)


def fit_pca_projection(vectors_768: np.ndarray, dim: int, seed: int) -> np.ndarray:
    """Real SVD via sklearn.decomposition.TruncatedSVD (never a random-vector approximation)."""
    svd = TruncatedSVD(n_components=dim, random_state=seed)
    projected = svd.fit_transform(vectors_768)
    return projected.astype(np.float32)


def fetch_rows(conn, limit: int) -> list[dict]:
    query = """
        SELECT id::text AS id,
               content_embedding AS content_embedding,
               latent_256 AS latent_256,
               latent_128 AS latent_128,
               latent_64 AS latent_64
        FROM codebase_chunk_index
        WHERE content_embedding IS NOT NULL
          AND latent_256 IS NOT NULL
          AND latent_128 IS NOT NULL
          AND latent_64 IS NOT NULL
        ORDER BY id
        LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(query, (limit,))
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--limit", type=int, default=2000, help="Row sample size (default: 2000)")
    parser.add_argument("--k", type=int, default=10, help="Neighborhood size for comparison metrics")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    conn = psycopg2.connect(args.database_url)
    try:
        rows = fetch_rows(conn, args.limit)
    finally:
        conn.close()

    if len(rows) < args.k + 1:
        print(json.dumps({
            "status": "INSUFFICIENT_ROWS",
            "rowCount": len(rows),
            "required": args.k + 1,
        }, indent=2))
        sys.exit(1)

    content_768 = np.stack([parse_vector(r["content_embedding"]) for r in rows])
    latent_256 = np.stack([parse_vector(r["latent_256"]) for r in rows])
    latent_128 = np.stack([parse_vector(r["latent_128"]) for r in rows])
    latent_64 = np.stack([parse_vector(r["latent_64"]) for r in rows])

    # MRL-truncation lanes (existing mechanism, prefix + L2-renorm of the same 768d vectors).
    mrl_512 = mrl_truncate(content_768, 512)
    mrl_256 = mrl_truncate(content_768, 256)
    mrl_128 = mrl_truncate(content_768, 128)

    # Real PCA/SVD lanes at matching dimensions, for direct apples-to-apples comparison.
    pca_512 = fit_pca_projection(content_768, 512, args.seed)
    pca_256 = fit_pca_projection(content_768, 256, args.seed)
    pca_128 = fit_pca_projection(content_768, 128, args.seed)
    pca_64 = fit_pca_projection(content_768, 64, args.seed)

    representations = {
        "mrl_512": mrl_512,
        "mrl_256": mrl_256,
        "mrl_128": mrl_128,
        "pca_svd_512": pca_512,
        "pca_svd_256": pca_256,
        "pca_svd_128": pca_128,
        "pca_svd_64": pca_64,
        "autoencoder_latent_256": latent_256,
        "autoencoder_latent_128": latent_128,
        "autoencoder_latent_64": latent_64,
    }

    receipt = compare_representations(content_768, representations, k=args.k)

    report = {
        "schema": "atlas.pca-svd-representation-baseline.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "READ_ONLY_EVALUATION",
        "readOnlyInvariants": {"writesPerformed": False, "postgresModified": False, "qdrantModified": False},
        "sampleSize": len(rows),
        "referenceDimensions": 768,
        "svdImplementation": "sklearn.decomposition.TruncatedSVD",
        "comparison": receipt.to_dict(),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": "PCA_SVD_BASELINE_COMPLETE",
        "sampleSize": len(rows),
        "recommendedRepresentation": receipt.recommended_representation,
        "rankedByOverlapThenCorrelation": [m.name for m in receipt.representations],
        "reportPath": str(OUTPUT_PATH.relative_to(REPO_ROOT)),
    }, indent=2))


if __name__ == "__main__":
    main()
