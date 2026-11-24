from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import psycopg
import torch
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.eg2_onnx_adapter_v1 import Eg2OnnxClientV1, chunk_text_by_tokens
from atlas_graph_runtime.pytorch_mlp_domain_ranker_challenger_v1 import (
    ChallengerExample,
    export_challenger_to_onnx,
    train_and_evaluate_challenger,
    verify_onnx_parity,
)

TARGET_DOMAINS = ("Graph", "UI", "database", "documentation", "gpu", "test")
PER_DOMAIN_LIMIT = 25


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set")

    rows: list[tuple[str, str, str, str, float]] = []
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for dom in TARGET_DOMAINS:
                cur.execute(
                    """
                    SELECT DISTINCT ON (source_ref)
                           source_ref, source_revision, domain_class, summary,
                           COALESCE(pagerank, 0.0)::float8
                    FROM atlas_packets
                    WHERE domain_class = %s
                      AND summary IS NOT NULL
                      AND length(trim(summary)) >= 40
                    ORDER BY source_ref, packet_key
                    LIMIT %s
                    """,
                    (dom, PER_DOMAIN_LIMIT),
                )
                rows.extend(cur.fetchall())

    labels = sorted(TARGET_DOMAINS)
    label_to_idx = {lbl: i for i, lbl in enumerate(labels)}
    client = Eg2OnnxClientV1()

    examples: list[ChallengerExample] = []
    for source_ref, source_rev, domain_class, summary, pagerank in rows:
        chunks = chunk_text_by_tokens(summary, max_tokens=256, overlap_tokens=32, max_chunks=2)
        if not chunks:
            continue
        res = client.embed(chunks, dim=512, task_prompt_name="Classification")
        # Mean-pool chunk vectors and L2-renormalize for document representation
        doc_vec = np.mean(np.asarray(res.vectors, dtype=np.float32), axis=0)
        norm = float(np.linalg.norm(doc_vec))
        if norm > 0.0:
            doc_vec = doc_vec / norm
        examples.append(
            ChallengerExample(
                vector=doc_vec.tolist(),
                domain_label=label_to_idx[domain_class],
                relevance_score=float(pagerank),
                primary_source_ref=source_ref,
                source_revision=source_rev or "unknown",
            )
        )

    model, receipt = train_and_evaluate_challenger(
        examples,
        input_dim=512,
        num_domains=len(labels),
        hidden_dim=128,
        activation="gelu",
        epochs=40,
        lr=3e-3,
    )

    out_dir = REPO_ROOT / "models" / "domain-classifier"
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = export_challenger_to_onnx(model, out_dir / "eg2-onnx-mlp-512.onnx")
    pt_path = out_dir / "eg2-onnx-mlp-512.pt"
    torch.save(
        {
            "state_dict": model.state_dict(),
            "input_dim": 512,
            "hidden_dim": 128,
            "num_domains": len(labels),
            "activation": "gelu",
            "labels": labels,
            "encoder_profile": "eg2-onnx-q8-mrl-512",
        },
        pt_path,
    )

    sample = np.asarray([ex.vector for ex in examples[:8]], dtype=np.float32)
    parity = verify_onnx_parity(model, onnx_path, sample)
    if not parity["passed"]:
        raise RuntimeError(f"ONNX parity failed: {parity}")

    report = {
        "schema": "atlas.eg2-onnx-pytorch-mlp-train.v1",
        "encoderProfile": "eg2-onnx-q8-mrl-512",
        "labels": labels,
        "receipt": receipt.to_dict(),
        "onnxPath": str(onnx_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "ptPath": str(pt_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "onnxParity": parity,
    }
    report_path = REPO_ROOT / "docs" / "reports" / "eg2-onnx-pytorch-mlp-train-v1.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
