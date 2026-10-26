#!/usr/bin/env python3
"""cuDF / RAPIDS & PyArrow Vectorized ACE JSON Packet Batch Builder (v1)

Accelerates large-scale (400k+ chunks) codebase indexing and ACE JSON packet creation:
- Utilizes GPU cuDF DataFrame when running under RAPIDS/CUDA (e.g. WSL2 atlas-rapids-cu13).
- Seamlessly falls back to PyArrow / NumPy vectorized processing on CPU.
- Performs vectorized 4D manifold coordinate filtering ([x, y, z, w]) and grade thresholding.
- Batches chunk metadata and source refs into schema-compliant ACE packet structures.

Invariants:
- Read-only ingestion; writes zero store rows (writesPerformed: false).
- canonicalAuthority: false, diagnosticOnly: true.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np

# Try GPU cuDF first; fallback to PyArrow / Pandas
try:
    import cudf
    CUDF_AVAILABLE = True
except ImportError:
    CUDF_AVAILABLE = False

try:
    import pyarrow as pa
    import pyarrow.compute as pc
    PYARROW_AVAILABLE = True
except ImportError:
    PYARROW_AVAILABLE = False


def generate_synthetic_cohort(n_rows: int = 50_000, seed: int = 42) -> dict:
    """Generate deterministic synthetic 400k-scale cohort for performance benchmarking."""
    np.random.seed(seed)
    feature_labels = [
        "chat", "auth", "canvas", "video_editor", "photo_editor",
        "ai_chat", "image_creator", "html5_visual_playground", "forum", "wiki", "user_db"
    ]

    chunk_ids = [f"chunk_{i:06d}" for i in range(n_rows)]
    source_refs = [f"src/components/{feature_labels[i % len(feature_labels)]}/component_{i % 100}.svelte" for i in range(n_rows)]
    labels = [feature_labels[i % len(feature_labels)] for i in range(n_rows)]
    x_coords = np.random.uniform(0.0, 44.0, size=n_rows).astype(np.float32)
    y_coords = np.random.uniform(0.0, 44.0, size=n_rows).astype(np.float32)
    z_coords = np.random.uniform(0.0, 1.0, size=n_rows).astype(np.float32)
    w_coords = np.random.uniform(0.0, 1.0, size=n_rows).astype(np.float32)
    grade_scores = w_coords  # GRPO reward score aligns with w
    content_hashes = [hashlib.sha256(f"content_{i}".encode()).hexdigest() for i in range(n_rows)]

    return {
        "chunk_id": chunk_ids,
        "source_ref": source_refs,
        "feature_label": labels,
        "x": x_coords,
        "y": y_coords,
        "z": z_coords,
        "w": w_coords,
        "grade_score": grade_scores,
        "content_hash": content_hashes,
    }


def build_ace_packets_vectorized(
    cohort: dict,
    target_feature: str = "chat",
    min_grade: float = 0.55,
    query_coords: tuple[float, float, float, float] = (5.0, 5.0, 0.2, 0.85),
    top_k: int = 50,
) -> dict:
    """Filter and rank chunks into ACE packets using GPU cuDF or PyArrow CPU."""
    t0 = time.perf_counter()
    backend = "GPU_CUDF" if CUDF_AVAILABLE else ("CPU_PYARROW" if PYARROW_AVAILABLE else "CPU_NUMPY")

    qx, qy, qz, qw = query_coords

    if CUDF_AVAILABLE:
        df = cudf.DataFrame(cohort)
        # Vectorized mask
        mask = (df["feature_label"] == target_feature) & (df["grade_score"] >= min_grade)
        filtered = df[mask].copy()

        # Vectorized 4D Euclidean distance calculation
        dx = filtered["x"] - qx
        dy = filtered["y"] - qy
        dz = filtered["z"] - qz
        dw = filtered["w"] - qw
        filtered["manifold_dist"] = (dx * dx + dy * dy + dz * dz + dw * dw) ** 0.5
        filtered["rank_score"] = filtered["grade_score"] * 0.6 + (1.0 / (1.0 + filtered["manifold_dist"])) * 0.4

        # Top-K sort
        sorted_df = filtered.sort_values(by="rank_score", ascending=False).head(top_k)
        selected_records = sorted_df.to_pandas().to_dict(orient="records")
    elif PYARROW_AVAILABLE:
        table = pa.Table.from_pydict(cohort)
        mask = pc.and_(
            pc.equal(table["feature_label"], target_feature),
            pc.greater_equal(table["grade_score"], min_grade)
        )
        filtered = table.filter(mask)
        fx = filtered["x"].to_numpy()
        fy = filtered["y"].to_numpy()
        fz = filtered["z"].to_numpy()
        fw = filtered["w"].to_numpy()
        fg = filtered["grade_score"].to_numpy()

        dist = np.sqrt((fx - qx)**2 + (fy - qy)**2 + (fz - qz)**2 + (fw - qw)**2)
        rank_score = fg * 0.6 + (1.0 / (1.0 + dist)) * 0.4
        indices = np.argsort(-rank_score)[:top_k]

        selected_records = []
        c_ids = filtered["chunk_id"].to_pylist()
        s_refs = filtered["source_ref"].to_pylist()
        f_lbls = filtered["feature_label"].to_pylist()
        for idx in indices:
            selected_records.append({
                "chunk_id": c_ids[idx],
                "source_ref": s_refs[idx],
                "feature_label": f_lbls[idx],
                "manifold_dist": float(dist[idx]),
                "rank_score": float(rank_score[idx]),
                "grade_score": float(fg[idx]),
            })
    else:
        # Fallback NumPy
        labels = np.array(cohort["feature_label"])
        grades = np.array(cohort["grade_score"])
        mask = (labels == target_feature) & (grades >= min_grade)
        idx_match = np.where(mask)[0]

        fx = np.array(cohort["x"])[idx_match]
        fy = np.array(cohort["y"])[idx_match]
        fz = np.array(cohort["z"])[idx_match]
        fw = np.array(cohort["w"])[idx_match]
        fg = grades[idx_match]

        dist = np.sqrt((fx - qx)**2 + (fy - qy)**2 + (fz - qz)**2 + (fw - qw)**2)
        rank_score = fg * 0.6 + (1.0 / (1.0 + dist)) * 0.4
        best_indices = np.argsort(-rank_score)[:top_k]

        selected_records = []
        for bi in best_indices:
            orig_i = idx_match[bi]
            selected_records.append({
                "chunk_id": cohort["chunk_id"][orig_i],
                "source_ref": cohort["source_ref"][orig_i],
                "feature_label": cohort["feature_label"][orig_i],
                "manifold_dist": float(dist[bi]),
                "rank_score": float(rank_score[bi]),
                "grade_score": float(fg[bi]),
            })

    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Package into ACE JSON packet schema
    packet = {
        "schema": "atlas.ace-vectorized-packet.v1",
        "featureLabel": target_feature,
        "tokenBudget": 4096,
        "queryCoordinates": list(query_coords),
        "selectedCount": len(selected_records),
        "sourceRefs": [r["source_ref"] for r in selected_records],
        "candidates": selected_records,
        "backend": backend,
        "processingTimeMs": round(elapsed_ms, 3),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return packet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=50_000, help="Number of chunks to benchmark")
    parser.add_argument("--feature", type=str, default="chat")
    parser.add_argument("--min-grade", type=float, default=0.55)
    parser.add_argument("--out", type=Path, default=Path("docs/reports/cudf-ace-packet-batch-receipt-v1.json"))
    args = parser.parse_args()

    print(f"\n=== cuDF / RAPIDS Vectorized ACE Packet Builder (v1) ===")
    print(f"Generating synthetic cohort: {args.rows:,} chunks...")
    t0 = time.perf_counter()
    cohort = generate_synthetic_cohort(args.rows)
    gen_time = time.perf_counter() - t0
    print(f"Cohort generated in {gen_time:.3f}s")

    print(f"\nBuilding ACE Packet for feature '{args.feature}' (min grade {args.min_grade})...")
    packet = build_ace_packets_vectorized(
        cohort,
        target_feature=args.feature,
        min_grade=args.min_grade,
    )

    print(f"[OK] Packet Built via {packet['backend']} in {packet['processingTimeMs']} ms!")
    print(f"   Candidates Selected: {packet['selectedCount']}")
    if packet["candidates"]:
        top = packet["candidates"][0]
        print(f"   Top Candidate:       {top['source_ref']}")
        print(f"   Rank Score:          {top['rank_score']:.4f} (Grade: {top['grade_score']:.2f}, 4D Dist: {top['manifold_dist']:.3f})")

    # Persist receipt
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf8") as f:
        json.dump(packet, f, indent=2)
    print(f"\nReceipt written to: {args.out}\n")


if __name__ == "__main__":
    main()
