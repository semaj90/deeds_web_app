"""PCA/SVD representation baseline vs. existing MRL-truncation and autoencoder-latent lanes.

Real replacement for the broken scripts/atlas/pca-baseline-768-to-384.mjs (that script's
"_powerIteration" generated random vectors, not real eigenvectors -- never produced a saved
result). This script:

  1. Reads canonical content_embedding rows for PCA/SVD and existing autoencoder latents from
     a separate matched cohort so sparse latent coverage cannot cap PCA sample dimensions.
  2. Computes MRL-truncation lanes (512/256/128) via the same prefix+L2-renormalize mechanism
     already used elsewhere in this repo -- not a new truncation mechanism.
  3. Fits a REAL PCA/SVD basis via sklearn.decomposition.TruncatedSVD (never hand-rolled power
     iteration) on the 768d sample and compares requested widths against matching MRL lanes.
  4. Feeds every representation into the existing, already-tested
     atlas_compute.representation_compare.compare_representations() harness -- does not
     reimplement neighbor-overlap/distance-correlation metrics.

Read-only: no Postgres writes, no Qdrant writes. Reference: openspec/changes/
parent-atlas-pca-svd-representation-baseline/tasks.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import TruncatedSVD

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "python" / "atlas_compute"))
from representation_compare import compare_representations  # noqa: E402

OUTPUT_PATH = REPO_ROOT / "docs" / "vector-governance" / "pca-svd-representation-comparison-v2.json"


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
    if vectors_768.ndim != 2 or dim < 1 or dim > min(vectors_768.shape):
        raise ValueError(
            f"projection dimension {dim} exceeds matrix capacity {min(vectors_768.shape)}"
        )
    svd = TruncatedSVD(n_components=dim, random_state=seed)
    projected = svd.fit_transform(vectors_768)
    if projected.shape != (vectors_768.shape[0], dim):
        raise ValueError(
            f"TruncatedSVD returned shape {projected.shape}; expected {(vectors_768.shape[0], dim)}"
        )
    return projected.astype(np.float32)


def fetch_rows(conn, limit: int, *, require_latents: bool = False) -> list[dict]:
    latent_filter = """
          AND latent_256 IS NOT NULL
          AND latent_128 IS NOT NULL
          AND latent_64 IS NOT NULL
    """ if require_latents else ""
    query = f"""
        SELECT id::text AS id,
               content_embedding AS content_embedding,
               latent_256 AS latent_256,
               latent_128 AS latent_128,
               latent_64 AS latent_64
        FROM codebase_chunk_index
        WHERE content_embedding IS NOT NULL
        {latent_filter}
        ORDER BY id
        LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(query, (limit,))
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    parser.add_argument("--limit", type=int, default=2000, help="Row sample size (default: 2000)")
    parser.add_argument("--k", type=int, default=10, help="Neighborhood size for comparison metrics")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not args.database_url:
        parser.error("provide --database-url or set DATABASE_URL")

    import psycopg2

    conn = psycopg2.connect(args.database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        semantic_rows = fetch_rows(conn, args.limit)
        latent_rows = fetch_rows(conn, args.limit, require_latents=True)
    finally:
        conn.rollback()
        conn.close()

    required_projection_rows = 512
    if len(semantic_rows) < max(required_projection_rows, args.k + 1):
        print(json.dumps({
            "status": "INSUFFICIENT_SEMANTIC_COHORT",
            "rowCount": len(semantic_rows),
            "requiredRows": max(required_projection_rows, args.k + 1),
            "requestedDimensions": [512, 256, 128, 64],
        }, indent=2))
        sys.exit(1)

    content_768 = np.stack([parse_vector(row["content_embedding"]) for row in semantic_rows])
    if content_768.shape[1] != 768:
        raise ValueError(f"semantic cohort width must be 768, got {content_768.shape[1]}")

    pca_512 = fit_pca_projection(content_768, 512, args.seed)
    pca_256 = fit_pca_projection(content_768, 256, args.seed)
    pca_128 = fit_pca_projection(content_768, 128, args.seed)
    pca_64 = fit_pca_projection(content_768, 64, args.seed)

    representations = {
        "mrl_512": mrl_truncate(content_768, 512),
        "mrl_256": mrl_truncate(content_768, 256),
        "mrl_128": mrl_truncate(content_768, 128),
        "pca_svd_512": pca_512,
        "pca_svd_256": pca_256,
        "pca_svd_128": pca_128,
        "pca_svd_64": pca_64,
    }

    receipt = compare_representations(content_768, representations, k=args.k)
    latent_reference = None
    latent_receipt = None
    if len(latent_rows) >= args.k + 1:
        latent_reference = np.stack([parse_vector(row["content_embedding"]) for row in latent_rows])
        latent_representations = {
            f"autoencoder_latent_{dim}": np.stack(
                [parse_vector(row[f"latent_{dim}"]) for row in latent_rows]
            )
            for dim in (256, 128, 64)
        }
        latent_receipt = compare_representations(
            latent_reference, latent_representations, k=args.k
        ).to_dict()

    report = {
        "schema": "atlas.pca-svd-representation-baseline.v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "READ_ONLY_EVALUATION",
        "readOnlyInvariants": {"writesPerformed": False, "postgresModified": False, "qdrantModified": False},
        "sampleSize": len(semantic_rows),
        "candidateIdsChecksum": hashlib.sha256(
            "\n".join(row["id"] for row in semantic_rows).encode("utf-8")
        ).hexdigest(),
        "cohortQualification": "DATABASE_ROWS_ONLY_SOURCE_LINEAGE_NOT_VERIFIED",
        "referenceDimensions": 768,
        "svdImplementation": "sklearn.decomposition.TruncatedSVD",
        "comparison": receipt.to_dict(),
        "autoencoderCohort": {
            "sampleSize": len(latent_rows),
            "candidateIdsChecksum": hashlib.sha256(
                "\n".join(row["id"] for row in latent_rows).encode("utf-8")
            ).hexdigest(),
            "comparison": latent_receipt or {
                "status": "INSUFFICIENT_LATENT_COHORT",
                "requiredRows": args.k + 1,
            },
        },
        "canonicalAuthority": False,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": "PCA_SVD_DIAGNOSTIC_COMPLETE_NOT_LINEAGE_QUALIFIED",
        "sampleSize": len(semantic_rows),
        "recommendedRepresentation": receipt.recommended_representation,
        "rankedByOverlapThenCorrelation": [m.name for m in receipt.representations],
        "reportPath": str(OUTPUT_PATH.relative_to(REPO_ROOT)),
    }, indent=2))


if __name__ == "__main__":
    main()
