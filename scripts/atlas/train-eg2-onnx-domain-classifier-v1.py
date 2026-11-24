from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import joblib
import numpy as np
import psycopg
import sklearn
from dotenv import load_dotenv
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_domain_classifier_runtime import NumpyCentroidKMeans, cluster_distance_features
from atlas_graph_runtime.eg2_onnx_adapter_v1 import Eg2OnnxClientV1, chunk_text_by_tokens

TARGET_DOMAINS = ("Graph", "documentation", "UI", "test", "gpu", "database")
PER_DOMAIN_LIMIT = 25


def main() -> int:
    load_dotenv(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set")

    rows: list[tuple[str, str, str]] = []
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for dom in TARGET_DOMAINS:
                cur.execute(
                    """
                    SELECT DISTINCT ON (source_ref) source_ref, domain_class, summary
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

    if len(rows) < len(TARGET_DOMAINS) * 5:
        raise RuntimeError(f"Insufficient labeled rows from PG18: {len(rows)}")

    client = Eg2OnnxClientV1()
    health = client.health()
    if health.get("status") != "ok":
        raise RuntimeError(f"ONNX EG2 server :8094 not ready: {health}")

    all_chunk_vecs: list[list[float]] = []
    doc_records: list[dict] = []
    for idx, (source_ref, domain_class, summary) in enumerate(rows):
        chunks = chunk_text_by_tokens(summary, max_tokens=256, overlap_tokens=32, max_chunks=4)
        if not chunks:
            continue
        res = client.embed(chunks, dim=768, task_prompt_name="Classification")
        all_chunk_vecs.extend(res.vectors)
        is_val = (idx % 4 == 0)
        doc_records.append(
            {
                "source_ref": source_ref,
                "label": domain_class,
                "vectors": np.asarray(res.vectors, dtype=np.float32),
                "is_val": is_val,
            }
        )

    chunk_matrix = np.asarray(all_chunk_vecs, dtype=np.float32)
    train_chunk_vecs = np.vstack([r["vectors"] for r in doc_records if not r["is_val"]])

    n_clusters = 15
    km_fit = KMeans(n_clusters=n_clusters, random_state=20261123, n_init=10)
    km_fit.fit(train_chunk_vecs)
    portable_kmeans = NumpyCentroidKMeans(km_fit.cluster_centers_.astype(np.float32))

    labels = sorted(TARGET_DOMAINS)
    label_to_idx = {lbl: i for i, lbl in enumerate(labels)}

    x_train, y_train = [], []
    x_val, y_val = [], []
    for rec in doc_records:
        feats = cluster_distance_features(portable_kmeans, rec["vectors"])
        vec = [
            feats["cluster_mean_distance"],
            feats["cluster_distance_std"],
            feats["cluster_diversity"],
            feats["chunk_count"],
        ]
        target = label_to_idx[rec["label"]]
        if rec["is_val"]:
            x_val.append(vec)
            y_val.append(target)
        else:
            x_train.append(vec)
            y_train.append(target)

    x_train_np = np.asarray(x_train, dtype=np.float64)
    y_train_np = np.asarray(y_train, dtype=np.int64)
    x_val_np = np.asarray(x_val, dtype=np.float64)
    y_val_np = np.asarray(y_val, dtype=np.int64)

    nb = MultinomialNB()
    nb.fit(np.maximum(x_train_np, 0.0), y_train_np)

    lr = LogisticRegression(max_iter=1000, random_state=20261123)
    lr.fit(x_train_np, y_train_np)

    val_nb_acc = float(np.mean(nb.predict(np.maximum(x_val_np, 0.0)) == y_val_np))
    val_lr_acc = float(np.mean(lr.predict(x_val_np) == y_val_np))

    centroid_sha256 = hashlib.sha256(portable_kmeans.cluster_centers_.tobytes()).hexdigest()
    model_revision = f"eg2-onnx-nblr-v1-{centroid_sha256[:10]}"

    ckpt_path = REPO_ROOT / "models" / "domain-classifier" / "eg2-onnx-checkpoint.joblib"
    ckpt_path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_payload = {
        "kmeans": portable_kmeans,
        "nb": nb,
        "lr": lr,
        "labels": labels,
        "model_revision": model_revision,
        "trained_on_files": len(doc_records),
        "n_clusters": n_clusters,
        "embed_model": health["model_id"],
        "encoder_profile": "eg2-onnx-q8-mrl-768",
        "dimensions": 768,
        "sklearn_version": sklearn.__version__,
        "centroid_sha256": f"sha256:{centroid_sha256}",
    }
    joblib.dump(checkpoint_payload, ckpt_path)

    report = {
        "schema": "atlas.eg2-onnx-domain-classifier-train.v1",
        "checkpointPath": str(ckpt_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "modelRevision": model_revision,
        "encoderProfile": "eg2-onnx-q8-mrl-768",
        "embedModel": health["model_id"],
        "dimensions": 768,
        "sklearnVersion": sklearn.__version__,
        "nClusters": n_clusters,
        "totalDocs": len(doc_records),
        "trainDocs": len(x_train),
        "valDocs": len(x_val),
        "totalEmbeddedChunks": int(chunk_matrix.shape[0]),
        "valNbAccuracy": round(val_nb_acc, 4),
        "valLrAccuracy": round(val_lr_acc, 4),
        "centroidSha256": f"sha256:{centroid_sha256}",
        "labels": labels,
    }
    report_path = REPO_ROOT / "docs" / "reports" / "eg2-onnx-domain-classifier-train-v1.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
