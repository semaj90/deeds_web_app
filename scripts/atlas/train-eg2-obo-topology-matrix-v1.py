from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import numpy as np
import psycopg
import pyarrow as pa
import pyarrow.ipc as ipc
from sklearn.metrics import f1_score

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.eg2_onnx_adapter_v1 import Eg2OnnxClientV1, chunk_text_by_tokens
from atlas_graph_runtime.pytorch_mlp_domain_ranker_challenger_v1 import (
    ChallengerExample,
    export_challenger_to_onnx,
    grouped_source_split,
    train_and_evaluate_challenger,
    verify_onnx_parity,
)

OBO_PATH = REPO_ROOT / ".okf" / "ontologies" / "atlas-domain-and-language-terms-v1.obo"
ARROW_OUT = REPO_ROOT / ".tmp" / "atlas" / "eg2-obo-feature-matrix-v1.arrow"
REPORT_OUT = REPO_ROOT / "docs" / "reports" / "eg2-obo-classifier-comparison-v1.json"
TARGET_DOMAINS = ("Graph", "UI", "database", "documentation", "gpu", "test")
PER_DOMAIN_LIMIT = 20


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _load_obo_terms() -> list[dict[str, Any]]:
    terms: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    for raw in OBO_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if line == "[Term]":
            if cur and cur.get("id"):
                terms.append(cur)
            cur = {"parents": [], "synonyms": []}
        elif line.startswith("[") and line.endswith("]"):
            if cur and cur.get("id"):
                terms.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            k, v = line.split(":", 1)
            k, v = k.strip(), v.strip()
            if k == "id":
                cur["id"] = v
            elif k == "name":
                cur["name"] = v
            elif k == "is_a":
                cur["parents"].append(v.split("!")[0].strip())
    if cur and cur.get("id"):
        terms.append(cur)
    return terms


def _obo_features(text: str, terms: list[dict[str, Any]]) -> tuple[list[str], int]:
    hay = text.lower()
    matched_ids: list[str] = []
    ancestors: set[str] = set()
    for t in terms:
        name = str(t.get("name") or "")
        if len(name) >= 3 and re.search(rf"\b{re.escape(name.lower())}\b", hay):
            matched_ids.append(t["id"])
            ancestors.update(t.get("parents") or [])
    return matched_ids[:8], len(ancestors)


def main() -> int:
    _load_env_file(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    obo_terms = _load_obo_terms()
    rows: list[tuple[str, str, str, str, str, float]] = []
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            for dom in TARGET_DOMAINS:
                cur.execute(
                    """
                    SELECT DISTINCT ON (source_ref)
                           packet_key, source_ref, coalesce(source_revision, 'unknown'),
                           domain_class, summary, COALESCE(pagerank, 0.0)::float8
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
    label_to_idx = {l: i for i, l in enumerate(labels)}
    client = Eg2OnnxClientV1()

    records: list[dict[str, Any]] = []
    for pkey, sref, srev, dom, summary, pr in rows:
        chunks = chunk_text_by_tokens(summary, max_tokens=256, overlap_tokens=32, max_chunks=1)
        if not chunks:
            continue
        emb768 = np.asarray(client.embed(chunks, dim=768, task_prompt_name="Classification").vectors[0], dtype=np.float32)
        obo_ids, anc_count = _obo_features(f"{sref} {summary}", obo_terms)
        records.append(
            {
                "packet_key": pkey,
                "source_ref": sref,
                "source_revision": srev,
                "domain_idx": label_to_idx[dom],
                "pagerank": float(pr),
                "obo_ids": obo_ids,
                "obo_ancestor_count": anc_count,
                "vec768": emb768,
            }
        )

    # Save immutable Arrow IPC feature matrix
    ARROW_OUT.parent.mkdir(parents=True, exist_ok=True)
    table = pa.table(
        {
            "packet_key": [r["packet_key"] for r in records],
            "source_ref": [r["source_ref"] for r in records],
            "source_revision": [r["source_revision"] for r in records],
            "domain_idx": pa.array([r["domain_idx"] for r in records], type=pa.int32()),
            "pagerank": pa.array([r["pagerank"] for r in records], type=pa.float32()),
            "obo_term_count": pa.array([len(r["obo_ids"]) for r in records], type=pa.int32()),
            "obo_ancestor_count": pa.array([r["obo_ancestor_count"] for r in records], type=pa.int32()),
            "vec768": pa.FixedSizeListArray.from_arrays(
                pa.array(np.concatenate([r["vec768"] for r in records]), type=pa.float32()),
                768,
            ),
        }
    )
    with pa.OSFile(str(ARROW_OUT), "wb") as sink:
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
    arrow_sha256 = "sha256:" + hashlib.sha256(ARROW_OUT.read_bytes()).hexdigest()

    # Compare 768D, 512D, 256D MRL profiles on source-grouped splits
    comparisons: dict[str, Any] = {}
    best_dim = 512
    best_acc = -1.0
    best_model = None
    best_sample = None

    for dim in (768, 512, 256):
        examples: list[ChallengerExample] = []
        for r in records:
            v = r["vec768"][:dim].copy()
            n = float(np.linalg.norm(v))
            if n > 0:
                v /= n
            examples.append(
                ChallengerExample(
                    vector=v.tolist(),
                    domain_label=r["domain_idx"],
                    relevance_score=r["pagerank"] + 0.01 * len(r["obo_ids"]),
                    primary_source_ref=r["source_ref"],
                    source_revision=r["source_revision"],
                )
            )
        model, receipt = train_and_evaluate_challenger(
            examples,
            input_dim=dim,
            num_domains=len(labels),
            hidden_dim=128,
            activation="gelu",
            epochs=35,
            lr=3e-3,
        )
        _, val_rows = grouped_source_split(examples)
        import torch

        x_val = torch.from_numpy(np.asarray([x.vector for x in val_rows], dtype=np.float32))
        y_val = np.asarray([x.domain_label for x in val_rows], dtype=np.int64)
        with torch.no_grad():
            preds = model(x_val)[0].argmax(dim=-1).numpy()
        macro_f1 = float(f1_score(y_val, preds, average="macro", zero_division=0))
        micro_f1 = float(f1_score(y_val, preds, average="micro", zero_division=0))
        comparisons[f"{dim}D"] = {
            **receipt.to_dict(),
            "val_macro_f1": round(macro_f1, 4),
            "val_micro_f1": round(micro_f1, 4),
        }
        if receipt.val_domain_accuracy > best_acc:
            best_acc = receipt.val_domain_accuracy
            best_dim = dim
            best_model = model
            best_sample = np.asarray([x.vector for x in val_rows[:8]], dtype=np.float32)

    assert best_model is not None and best_sample is not None
    onnx_out = REPO_ROOT / "models" / "domain-classifier" / f"eg2-obo-mlp-{best_dim}d.onnx"
    export_challenger_to_onnx(best_model, onnx_out)
    parity = verify_onnx_parity(best_model, onnx_out, best_sample)

    report = {
        "schema": "atlas.eg2-obo-classifier-comparison.v1",
        "arrowFeatureMatrix": {
            "path": str(ARROW_OUT.relative_to(REPO_ROOT)).replace("\\", "/"),
            "rows": len(records),
            "sha256": arrow_sha256,
        },
        "oboTermsLoaded": len(obo_terms),
        "labels": labels,
        "comparisons": comparisons,
        "selectedBestDim": best_dim,
        "exportedOnnxPath": str(onnx_out.relative_to(REPO_ROOT)).replace("\\", "/"),
        "onnxParity": parity,
    }
    REPORT_OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
