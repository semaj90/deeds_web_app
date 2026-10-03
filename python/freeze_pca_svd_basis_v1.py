"""Freeze a real PCA/SVD basis for a given dimension and save both the basis and its projections.

Parameterized by --dim (64, 128, 256, ...) rather than one file per dimension, per this repo's
own duplication-prevention discipline -- the 64d, 128d, and 256d freezes are the same mechanism at
different output sizes, not three separate scripts.

Follow-up to pca_svd_representation_baseline_v1.py's comparison run, which found (at 64d
specifically) the trained autoencoder beats an uncentered PCA/SVD projection: autoencoder
overlap@10 0.7358 vs SVD 0.6875 (see
docs/vector-governance/pca-svd-representation-comparison-v1.json). At 128d and 256d the same
comparison found PCA/SVD WINS instead (pca_svd_128 0.8007 vs autoencoder_latent_128 0.7978;
pca_svd_256 0.9155 vs autoencoder_latent_256 0.8363). This script does NOT re-decide any of that --
it exists so each dimension's SVD basis is a real, versioned, reusable artifact (not re-fit from
scratch every time) if it's ever needed again, at whichever dimension is requested.

Precision note: sklearn.decomposition.TruncatedSVD does NOT mean-center the data (unlike classic
PCA) -- it operates on the raw (or L2-normalized, if requested) embedding matrix directly. This is
the correct, standard choice for this kind of dense embedding data and matches what the comparison
script already used, but "PCA" and "(uncentered) TruncatedSVD" are not identical mathematical
objects and this script's own outputs are labeled with the precise method, not a loose "PCA" label.

Outputs (both new files, no existing file touched):
  - models/pca-svd-basis/pca_svd_64_v1.npz -- frozen basis: singular vectors, explained variance
    ratios, fit metadata, sha256 artifact digest.
  - docs/vector-governance/pca_svd_64_projections_v1.jsonl -- one JSON line per row: id + the
    64-dim projected vector, produced via svd.transform() on the FROZEN basis (not a re-fit), to
    prove the basis is genuinely reusable.

Read-only against Postgres (SELECT only) and Qdrant (untouched entirely). No schema change, no
backfill column, no live-table write -- this is an artifact-freezing step only, matching this
repo's Drizzle Safety Rule discipline for anything that isn't (yet) a schema/table change.
Reference: openspec/changes/parent-atlas-pca-svd-representation-baseline/tasks.md.
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
import psycopg2
import sklearn
from sklearn.decomposition import TruncatedSVD

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
BASIS_DIR = REPO_ROOT / "models" / "pca-svd-basis"

# Recorded comparison results per dimension from pca-svd-representation-comparison-v1.json --
# used only to annotate this run's frozen metadata with the already-known verdict at that
# dimension, never recomputed or re-decided here.
KNOWN_COMPARISON_RESULTS = {
    64: {
        "autoencoder_latent_overlap_at_10": 0.7358,
        "pca_svd_overlap_at_10": 0.6875,
        "verdict": "AUTOENCODER_WINS_AT_THIS_DIMENSION",
    },
    128: {
        "autoencoder_latent_overlap_at_10": 0.7978,
        "pca_svd_overlap_at_10": 0.8007,
        "verdict": "PCA_SVD_WINS_AT_THIS_DIMENSION",
    },
    256: {
        "autoencoder_latent_overlap_at_10": 0.8363,
        "pca_svd_overlap_at_10": 0.9155,
        "verdict": "PCA_SVD_WINS_AT_THIS_DIMENSION",
    },
}


def basis_path(dim: int) -> Path:
    return BASIS_DIR / f"pca_svd_{dim}_v1.npz"


def projections_path(dim: int) -> Path:
    return REPO_ROOT / "docs" / "vector-governance" / f"pca_svd_{dim}_projections_v1.jsonl"


def parse_vector(raw: str) -> np.ndarray:
    return np.fromstring(raw.strip("[]"), sep=",", dtype=np.float32)


def fetch_rows(conn, limit: int) -> list[dict]:
    query = """
        SELECT id::text AS id, content_embedding AS content_embedding
        FROM codebase_chunk_index
        WHERE content_embedding IS NOT NULL
        ORDER BY id
        LIMIT %s
    """
    with conn.cursor() as cur:
        cur.execute(query, (limit,))
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def sha256_of_array(array: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(array, dtype=np.float32).tobytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--dim", type=int, default=64, choices=[64, 128, 256],
                         help="Output dimension to freeze a basis for (default: 64)")
    parser.add_argument("--fit-limit", type=int, default=10000,
                         help="Row sample size used to FIT the basis (default: 10000, larger than "
                              "the 1,703-row comparison sample for a more representative basis)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    dim = args.dim
    basis_out = basis_path(dim)
    projections_out = projections_path(dim)

    conn = psycopg2.connect(args.database_url)
    try:
        rows = fetch_rows(conn, args.fit_limit)
    finally:
        conn.close()

    if len(rows) < 128:
        print(json.dumps({"status": "INSUFFICIENT_ROWS", "rowCount": len(rows)}, indent=2))
        sys.exit(1)

    ids = [r["id"] for r in rows]
    content_768 = np.stack([parse_vector(r["content_embedding"]) for r in rows])

    svd = TruncatedSVD(n_components=dim, random_state=args.seed)
    svd.fit(content_768)

    components_digest = sha256_of_array(svd.components_)
    fit_metadata = {
        "schema": "atlas.pca-svd-basis.v1",
        "method": "sklearn.decomposition.TruncatedSVD",
        "centered": False,
        "note": "TruncatedSVD does not mean-center the input -- distinct from classic centered PCA.",
        "sklearnVersion": sklearn.__version__,
        "inputDimension": 768,
        "outputDimension": dim,
        "fitRowCount": len(rows),
        "randomSeed": args.seed,
        "explainedVarianceRatioSum": float(np.sum(svd.explained_variance_ratio_)),
        "componentsDigest": components_digest,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "comparisonReceiptRef": "docs/vector-governance/pca-svd-representation-comparison-v1.json",
        "comparisonResultAtThisDimension": KNOWN_COMPARISON_RESULTS.get(dim, {"note": "no recorded comparison at this dimension"}),
    }

    BASIS_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        basis_out,
        components=svd.components_.astype(np.float32),
        explained_variance=svd.explained_variance_.astype(np.float32),
        explained_variance_ratio=svd.explained_variance_ratio_.astype(np.float32),
        singular_values=svd.singular_values_.astype(np.float32),
        metadata=json.dumps(fit_metadata),
    )

    # Prove reusability: transform via the FROZEN basis (svd.transform, not fit_transform).
    projected = svd.transform(content_768).astype(np.float32)

    projections_out.parent.mkdir(parents=True, exist_ok=True)
    with projections_out.open("w", encoding="utf-8") as handle:
        for row_id, vector in zip(ids, projected):
            handle.write(json.dumps({"id": row_id, f"pca_svd_{dim}": vector.tolist()}) + "\n")

    # Reload check: confirm the saved basis, loaded fresh, reproduces the same projection.
    reloaded = np.load(basis_out, allow_pickle=False)
    reloaded_components = reloaded["components"]
    reprojected_sample = (content_768[:5] @ reloaded_components.T).astype(np.float32)
    direct_sample = projected[:5]
    max_reload_delta = float(np.max(np.abs(reprojected_sample - direct_sample)))

    print(json.dumps({
        "status": f"PCA_SVD_{dim}_BASIS_FROZEN",
        "dimension": dim,
        "fitRowCount": len(rows),
        "basisPath": str(basis_out.relative_to(REPO_ROOT)),
        "projectionsPath": str(projections_out.relative_to(REPO_ROOT)),
        "componentsDigest": components_digest,
        "explainedVarianceRatioSum": fit_metadata["explainedVarianceRatioSum"],
        "reloadRoundTripMaxDelta": max_reload_delta,
        "reloadRoundTripPass": max_reload_delta < 1e-4,
        "writesPerformed": {"postgres": False, "qdrant": False, "newLocalFiles": True},
    }, indent=2))


if __name__ == "__main__":
    main()
