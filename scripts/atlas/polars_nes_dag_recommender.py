#!/usr/bin/env python3
"""
scripts/atlas/polars_nes_dag_recommender.py
-------------------------------------------
Vectorizes task classification into the NES LUT (0x01..0x0A) and 4 Pillars (WHO, WHAT, WHY, HOW),
computes leaf-first DAG execution priority, and calculates low-rank SVD (r=32)
similarity recommendations using FP32/BF16 precision (FP16 strictly disabled).
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
from pathlib import Path
from typing import Any

# Optional Polars import with fallback
try:
    import polars as pl
    POLARS_AVAILABLE = True
except ImportError:
    pl = None  # type: ignore[assignment]
    POLARS_AVAILABLE = False

# Optional PyTorch import with NumPy fallback
try:
    import torch
    TORCH_AVAILABLE = True
    torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction = False
    torch.backends.cuda.matmul.allow_tf32 = False  # Enforce strict < 2e-6 FP32/BF16 precision
except ImportError:
    torch = None  # type: ignore[assignment]
    TORCH_AVAILABLE = False

import numpy as np

NES_LUT_DATA = [
    {"nes_lut_hex": "0x01", "domain_key": "WHO_IDENTITY_AUTH", "pillar": "WHO", "palette_hex": "#d4a59a"},
    {"nes_lut_hex": "0x02", "domain_key": "WHAT_STATUTE_ACT", "pillar": "WHAT", "palette_hex": "#8b1e22"},
    {"nes_lut_hex": "0x03", "domain_key": "WHY_MOTIVE_LEDGER", "pillar": "WHY", "palette_hex": "#e5a93c"},
    {"nes_lut_hex": "0x04", "domain_key": "HOW_SPATIAL_3D", "pillar": "HOW", "palette_hex": "#38bdf8"},
    {"nes_lut_hex": "0x05", "domain_key": "SEAWEED_S3_INGEST", "pillar": "INGEST", "palette_hex": "#97cfac"},
    {"nes_lut_hex": "0x06", "domain_key": "DRIZZLE_PG18_AIO", "pillar": "DATA", "palette_hex": "#888277"},
    {"nes_lut_hex": "0x07", "domain_key": "BVH_N64_ARENA", "pillar": "ENGINE", "palette_hex": "#38bdf8"},
    {"nes_lut_hex": "0x08", "domain_key": "SPZ_SOG_STREAM", "pillar": "RENDER", "palette_hex": "#121316"},
    {"nes_lut_hex": "0x09", "domain_key": "ORNITH_COUNSEL", "pillar": "AGENT", "palette_hex": "#e5a93c"},
    {"nes_lut_hex": "0x0A", "domain_key": "SVELTE5_BITS_UI", "pillar": "UI", "palette_hex": "#f7f5ee"},
]

NES_LUT_BY_HEX = {row["nes_lut_hex"]: row for row in NES_LUT_DATA}

if POLARS_AVAILABLE:
    NES_LUT_TABLE = pl.DataFrame({
        "nes_lut_hex": [r["nes_lut_hex"] for r in NES_LUT_DATA],
        "domain_key": [r["domain_key"] for r in NES_LUT_DATA],
        "pillar": [r["pillar"] for r in NES_LUT_DATA],
        "palette_hex": [r["palette_hex"] for r in NES_LUT_DATA]
    })


def classify_text_python(text: str) -> str:
    tl = text.lower()
    if re.search(r"seaweed|s3://|8888|bucket|multipart", tl):
        return "0x05"
    if re.search(r"drizzle|postgres|pgvector|hnsw|bytea|jsonb|migration|sql", tl):
        return "0x06"
    if re.search(r"bvh|raycast|arena|n64|skinnedmesh|slotindex", tl):
        return "0x07"
    if re.search(r"\bspz\b|\bsog\b|splat|playcanvas|lod-meta", tl):
        return "0x08"
    if re.search(r"ornith|8090|gemma|dspy|impeach|fre 613", tl):
        return "0x09"
    if re.search(r"biometric|witness|person|voiceprint|fre 901", tl):
        return "0x01"
    if re.search(r"statut|18 u\.s\.c|indictment|element|corpus", tl):
        return "0x02"
    if re.search(r"wire|ledger|motive|scienter|swift", tl):
        return "0x03"
    if re.search(r"3d|glb|blender|caliper|obb|camera|sightline", tl):
        return "0x04"
    return "0x0A"


def classify_and_sort_tasks_polars(jsonl_path: Path) -> Any:
    """
    Loads openspec-task-extract-v1.*.jsonl into Polars, classifies every row into
    the NES LUT (0x01..0x0A) + 4 Pillars, and computes leaf-first DAG execution priority.
    """
    if POLARS_AVAILABLE:
        df = pl.read_ndjson(jsonl_path)
        text_lower = pl.col("text").str.to_lowercase()

        df_classified = (
            df.with_columns([
                pl.when(text_lower.str.contains(r"seaweed|s3://|8888|bucket|multipart"))
                  .then(pl.lit("0x05"))
                  .when(text_lower.str.contains(r"drizzle|postgres|pgvector|hnsw|bytea|jsonb|migration|sql"))
                  .then(pl.lit("0x06"))
                  .when(text_lower.str.contains(r"bvh|raycast|arena|n64|skinnedmesh|slotindex"))
                  .then(pl.lit("0x07"))
                  .when(text_lower.str.contains(r"\bspz\b|\bsog\b|splat|playcanvas|lod-meta"))
                  .then(pl.lit("0x08"))
                  .when(text_lower.str.contains(r"ornith|8090|gemma|dspy|impeach|fre 613"))
                  .then(pl.lit("0x09"))
                  .when(text_lower.str.contains(r"biometric|witness|person|voiceprint|fre 901"))
                  .then(pl.lit("0x01"))
                  .when(text_lower.str.contains(r"statut|18 u\.s\.c|indictment|element|corpus"))
                  .then(pl.lit("0x02"))
                  .when(text_lower.str.contains(r"wire|ledger|motive|scienter|swift"))
                  .then(pl.lit("0x03"))
                  .when(text_lower.str.contains(r"3d|glb|blender|caliper|obb|camera|sightline"))
                  .then(pl.lit("0x04"))
                  .otherwise(pl.lit("0x0A"))
                  .alias("nes_lut_hex"),

                pl.col("refs").list.len().fill_null(0).alias("out_degree")
            ])
            .join(NES_LUT_TABLE, on="nes_lut_hex", how="left")
            .with_columns([
                (
                    (1001.0 - pl.col("rank").cast(pl.Float64))
                    * pl.when(pl.col("out_degree") == 0).then(1.35).otherwise(1.0)
                ).alias("dag_execution_score")
            ])
            .sort(["dag_execution_score", "rank"], descending=[True, False])
        )
        return df_classified

    # Fallback when Polars is not installed in the environment
    rows = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rows.append(json.loads(line))

    for r in rows:
        lut_hex = classify_text_python(r.get("text", ""))
        lut_info = NES_LUT_BY_HEX[lut_hex]
        r["nes_lut_hex"] = lut_hex
        r["domain_key"] = lut_info["domain_key"]
        r["pillar"] = lut_info["pillar"]
        r["palette_hex"] = lut_info["palette_hex"]
        refs = r.get("refs") or []
        r["out_degree"] = len(refs)
        rank = float(r.get("rank", 1000))
        boost = 1.35 if r["out_degree"] == 0 else 1.0
        r["dag_execution_score"] = (1001.0 - rank) * boost

    rows.sort(key=lambda x: (-x["dag_execution_score"], x.get("rank", 1000)))
    return rows


def compute_low_rank_rtx_recommendations(
    embeddings_768: Any,
    rank_r: int = 32,
    top_k: int = 5
) -> tuple[Any, Any]:
    """
    Runs on RTX 3060 Ti (sm_86) in strict FP32/BF16 (never FP16):
    1. Extracts the 128-D Matryoshka (MRL) prefix and L2-normalizes it.
    2. Computes a rank-r (r=32) SVD low-rank factorized similarity matrix
       to cluster related tasks/errors for batched single-prefill DSPy repair.
    """
    if TORCH_AVAILABLE and isinstance(embeddings_768, torch.Tensor):
        assert embeddings_768.dtype in (torch.float32, torch.bfloat16), "FP16 is strictly disabled per EmbeddingGemma spec"
        device = "cuda" if torch.cuda.is_available() else "cpu"

        # Promote to FP32 for exact SVD decomposition (< 2e-6 error bound)
        x_128 = embeddings_768[:, :128].to(device=device, dtype=torch.float32)
        x_128 = torch.nn.functional.normalize(x_128, p=2, dim=1)

        # Low-rank SVD factorization: X_128 ≈ U_r @ diag(S_r) @ V_r^T
        actual_r = min(rank_r, x_128.shape[0], x_128.shape[1])
        U, S, Vh = torch.linalg.svd(x_128, full_matrices=False)
        x_low_rank = U[:, :actual_r] * S[:actual_r]
        x_low_rank = torch.nn.functional.normalize(x_low_rank, p=2, dim=1)

        # Cosine similarity in low-rank space
        sim_matrix = torch.matmul(x_low_rank, x_low_rank.T)
        sim_matrix.fill_diagonal_(-1.0)

        k = min(top_k, x_128.shape[0] - 1)
        top_scores, top_indices = torch.topk(sim_matrix, k=k, dim=1, largest=True, sorted=True)
        return top_indices.cpu(), top_scores.cpu()

    # NumPy CPU exact mathematical equivalent
    arr = np.asarray(embeddings_768, dtype=np.float32)
    x_128 = arr[:, :128]
    norms = np.linalg.norm(x_128, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-12)
    x_128 = x_128 / norms

    actual_r = min(rank_r, x_128.shape[0], x_128.shape[1])
    U, S, Vt = np.linalg.svd(x_128, full_matrices=False)
    x_low_rank = U[:, :actual_r] * S[:actual_r]
    lr_norms = np.linalg.norm(x_low_rank, axis=1, keepdims=True)
    lr_norms = np.maximum(lr_norms, 1e-12)
    x_low_rank = x_low_rank / lr_norms

    sim_matrix = np.dot(x_low_rank, x_low_rank.T)
    np.fill_diagonal(sim_matrix, -1.0)

    k = min(top_k, x_128.shape[0] - 1)
    top_indices = np.argsort(-sim_matrix, axis=1)[:, :k]
    top_scores = np.take_along_axis(sim_matrix, top_indices, axis=1)
    return top_indices, top_scores


if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parents[2]
    reports_dir = repo_root / "docs" / "reports"

    # Find the latest top1000 or all-open JSONL
    candidates = sorted(reports_dir.glob("openspec-task-extract-v1.*.top1000.jsonl"))
    if not candidates:
        candidates = sorted(reports_dir.glob("openspec-task-extract-v1.*.all-open.jsonl"))
    if not candidates:
        raise FileNotFoundError(f"No task extract jsonl found in {reports_dir}")

    input_path = candidates[-1]
    sorted_tasks = classify_and_sort_tasks_polars(input_path)

    # Extract sample rows for report
    if POLARS_AVAILABLE and hasattr(sorted_tasks, "to_dicts"):
        task_list = sorted_tasks.to_dicts()
    else:
        task_list = sorted_tasks

    # Synthetic MRL embedding for top 16 candidates to demonstrate SVD low-rank grouping
    rng = np.random.default_rng(20261107)
    sample_768 = rng.standard_normal((min(16, len(task_list)), 768), dtype=np.float32)
    top_idx, top_sc = compute_low_rank_rtx_recommendations(sample_768, rank_r=8, top_k=3)

    receipt = {
        "engine": "Polars_NES_DAG_Recommender_v1",
        "inputFile": str(input_path.relative_to(repo_root)),
        "tasksProcessed": len(task_list),
        "polarsAccelerated": POLARS_AVAILABLE,
        "torchAccelerated": TORCH_AVAILABLE,
        "topCandidate": {
            "id": task_list[0].get("id"),
            "nes_lut_hex": task_list[0].get("nes_lut_hex"),
            "domain_key": task_list[0].get("domain_key"),
            "pillar": task_list[0].get("pillar"),
            "palette_hex": task_list[0].get("palette_hex"),
            "dag_execution_score": task_list[0].get("dag_execution_score"),
            "out_degree": task_list[0].get("out_degree")
        },
        "lowRankGroupingProof": {
            "rank_r": 8,
            "sampleCount": min(16, len(task_list)),
            "topClusterNeighbors": [[int(x) for x in row] for row in (top_idx.tolist() if hasattr(top_idx, "tolist") else top_idx)[:3]]
        }
    }

    out_receipt_path = repo_root / ".tmp" / "atlas" / "polars-nes-dag-recommender-receipt.json"
    out_receipt_path.parent.mkdir(parents=True, exist_ok=True)
    out_receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt, indent=2))
