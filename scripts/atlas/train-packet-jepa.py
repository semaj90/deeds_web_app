#!/usr/bin/env python3
"""
train-packet-jepa.py

Minimal Packet-JEPA experiment lane:
  A. EmbeddingGemma 384 cosine baseline
  B. PCA latent baseline
  C. Packet-JEPA 128

Outputs:
  models/packet-jepa/packet-jepa.pt
  models/packet-jepa/pca_components.npy
  .tmp/packet-jepa-latents.ndjson
  docs/reports/packet-jepa-train-report.{json,md}
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
TMP_DIR = ROOT / ".tmp"
MODEL_DIR = ROOT / "models" / "packet-jepa"
REPORT_DIR = ROOT / "docs" / "reports"
INPUT_PAIRS = TMP_DIR / "packet-jepa-training-pairs.ndjson"
INPUT_EVAL = TMP_DIR / "packet-jepa-eval-candidates.ndjson"
OUTPUT_LATENTS = TMP_DIR / "packet-jepa-latents.ndjson"
REPORT_JSON = REPORT_DIR / "packet-jepa-train-report.json"
REPORT_MD = REPORT_DIR / "packet-jepa-train-report.md"


def read_ndjson(path: Path) -> List[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def l2_normalize(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    norms = np.clip(norms, 1e-8, None)
    return x / norms


def cosine_score(a: np.ndarray, b: np.ndarray) -> float:
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na <= 1e-8 or nb <= 1e-8:
      return 0.0
    return float(np.dot(a, b) / (na * nb))


def dedupe_packet_vectors(pair_rows: List[dict], eval_rows: List[dict]) -> Tuple[List[str], Dict[str, np.ndarray], Dict[str, str]]:
    vectors: Dict[str, np.ndarray] = {}
    domains: Dict[str, str] = {}
    for row in pair_rows:
        vectors[row["anchor_packet_key"]] = np.asarray(row["anchor_vector"], dtype=np.float32)
        vectors[row["target_packet_key"]] = np.asarray(row["target_vector"], dtype=np.float32)
        domains[row["anchor_packet_key"]] = row.get("anchor_domain_class") or ""
        domains[row["target_packet_key"]] = row.get("target_domain_class") or ""
    for row in eval_rows:
        vectors[row["query_packet_key"]] = np.asarray(row["query_vector"], dtype=np.float32)
        domains[row["query_packet_key"]] = row.get("query_domain_class") or domains.get(row["query_packet_key"], "")
        for key, vec in zip(row.get("positive_packet_keys", []), row.get("positive_vectors", [])):
            vectors[key] = np.asarray(vec, dtype=np.float32)
        for key, vec in zip(row.get("negative_packet_keys", []), row.get("negative_vectors", [])):
            vectors[key] = np.asarray(vec, dtype=np.float32)
    dim_counts: Dict[int, int] = {}
    for vec in vectors.values():
        dim_counts[int(vec.shape[0])] = dim_counts.get(int(vec.shape[0]), 0) + 1
    dominant_dim = sorted(dim_counts.items(), key=lambda item: item[1], reverse=True)[0][0]
    vectors = {key: vec for key, vec in vectors.items() if int(vec.shape[0]) == dominant_dim}
    domains = {key: value for key, value in domains.items() if key in vectors}
    keys = sorted(vectors.keys())
    return keys, vectors, domains


def compute_pca(train_vectors: np.ndarray, dim: int = 128) -> Tuple[np.ndarray, np.ndarray]:
    mean = train_vectors.mean(axis=0, keepdims=True)
    centered = train_vectors - mean
    q = min(dim, centered.shape[1], max(2, centered.shape[0] - 1))
    _, _, vh = np.linalg.svd(centered, full_matrices=False)
    components = vh[:q].astype(np.float32)
    return mean.astype(np.float32), components


def apply_pca(vectors: np.ndarray, mean: np.ndarray, components: np.ndarray) -> np.ndarray:
    centered = vectors - mean
    return centered @ components.T


def ndcg_at_k(rels: List[int], k: int = 10) -> float:
    dcg = 0.0
    idcg = 0.0
    top = rels[:k]
    ideal = sorted(rels, reverse=True)[:k]
    for i, rel in enumerate(top):
        dcg += (2 ** rel - 1) / math.log2(i + 2)
    for i, rel in enumerate(ideal):
        idcg += (2 ** rel - 1) / math.log2(i + 2)
    return dcg / idcg if idcg > 0 else 0.0


def mrr_at_k(rels: List[int], k: int = 10) -> float:
    for i, rel in enumerate(rels[:k]):
        if rel > 0:
            return 1.0 / float(i + 1)
    return 0.0


def recall_at_k(rels: List[int], k: int = 10) -> float:
    positives = sum(1 for rel in rels if rel > 0)
    if positives == 0:
        return 0.0
    hit = sum(1 for rel in rels[:k] if rel > 0)
    return hit / positives


def nearest_centroid_f1(latents: Dict[str, np.ndarray], domains: Dict[str, str], train_keys: List[str], eval_keys: List[str]) -> float:
    grouped: Dict[str, List[np.ndarray]] = {}
    for key in train_keys:
        domain = domains.get(key, "")
        if not domain:
            continue
        grouped.setdefault(domain, []).append(latents[key])
    if not grouped:
        return 0.0
    centroids = {domain: np.mean(np.stack(vectors), axis=0) for domain, vectors in grouped.items()}
    labels = sorted(centroids.keys())
    f1s = []
    for label in labels:
        tp = fp = fn = 0
        for key in eval_keys:
            truth = domains.get(key, "")
            vec = latents.get(key)
            if vec is None or not truth:
                continue
            pred = max(centroids.keys(), key=lambda domain: cosine_score(vec, centroids[domain]))
            if pred == label and truth == label:
                tp += 1
            elif pred == label and truth != label:
                fp += 1
            elif pred != label and truth == label:
                fn += 1
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        f1s.append(f1)
    return float(sum(f1s) / len(f1s)) if f1s else 0.0


def evaluate_representation(latents: Dict[str, np.ndarray], eval_rows: List[dict]) -> Dict[str, float]:
    recalls, mrrs, ndcgs = [], [], []
    for row in eval_rows:
        query = latents.get(row["query_packet_key"])
        if query is None:
            continue
        candidates = []
        for key in row.get("positive_packet_keys", []):
            if key in latents:
                candidates.append((key, 1, cosine_score(query, latents[key])))
        for key in row.get("negative_packet_keys", []):
            if key in latents:
                candidates.append((key, 0, cosine_score(query, latents[key])))
        ranked = sorted(candidates, key=lambda item: item[2], reverse=True)
        rels = [item[1] for item in ranked]
        recalls.append(recall_at_k(rels, 10))
        mrrs.append(mrr_at_k(rels, 10))
        ndcgs.append(ndcg_at_k(rels, 10))
    return {
        "recall_at_10": float(sum(recalls) / len(recalls)) if recalls else 0.0,
        "mrr": float(sum(mrrs) / len(mrrs)) if mrrs else 0.0,
        "ndcg_at_10": float(sum(ndcgs) / len(ndcgs)) if ndcgs else 0.0,
    }


def build_train_split(keys: List[str]) -> Tuple[List[str], List[str]]:
    train, eval_keys = [], []
    for key in keys:
        if fnv1a(key) % 10 < 2:
            eval_keys.append(key)
        else:
            train.append(key)
    return train, eval_keys


def fnv1a(text: str) -> int:
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def render_markdown(report: dict) -> str:
    lines = [
        "# Packet-JEPA Train Report",
        "",
        f"Generated: {report['generatedAt']}",
        f"Mode: {report['mode']}",
        "",
        "## Evaluation",
        "",
    ]
    for name, metrics in report["evaluation"].items():
        lines.append(f"- {name}: Recall@10={metrics['recall_at_10']:.4f}, MRR={metrics['mrr']:.4f}, NDCG@10={metrics['ndcg_at_10']:.4f}, domain_F1={metrics['domain_f1']:.4f}")
    lines.extend(["", "## Next Safe Action", "", report["nextSafeAction"], ""])
    return "\n".join(lines)


def train_packet_jepa(pair_rows: List[dict], vectors_by_key: Dict[str, np.ndarray], input_dim: int, args) -> Tuple[Dict[str, np.ndarray], dict]:
    try:
        import torch
        import torch.nn as nn
        import torch.optim as optim
    except Exception as exc:
        raise RuntimeError(f"PyTorch unavailable: {exc}")

    train_pairs = [row for row in pair_rows if row.get("split") == "train"]
    x_ctx = np.stack([np.asarray(row["anchor_vector"], dtype=np.float32) for row in train_pairs])
    x_tgt = np.stack([np.asarray(row["target_vector"], dtype=np.float32) for row in train_pairs])
    x_ctx = l2_normalize(x_ctx)
    x_tgt = l2_normalize(x_tgt)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    class Encoder(nn.Module):
        def __init__(self):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_dim, 256),
                nn.ReLU(),
                nn.Linear(256, 128),
            )

        def forward(self, x):
            return self.net(x)

    class Predictor(nn.Module):
        def __init__(self):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(128, 128),
                nn.ReLU(),
                nn.Linear(128, 128),
            )

        def forward(self, x):
            return self.net(x)

    ctx_encoder = Encoder().to(device)
    tgt_encoder = Encoder().to(device)
    predictor = Predictor().to(device)
    tgt_encoder.load_state_dict(ctx_encoder.state_dict())
    for param in tgt_encoder.parameters():
        param.requires_grad = False

    optimizer = optim.AdamW(list(ctx_encoder.parameters()) + list(predictor.parameters()), lr=args.lr, weight_decay=1e-4)
    smooth_l1 = nn.SmoothL1Loss()

    ctx_tensor = torch.from_numpy(x_ctx)
    tgt_tensor = torch.from_numpy(x_tgt)
    batch_size = min(args.batch, len(train_pairs))
    steps = max(1, math.ceil(len(train_pairs) / batch_size))
    last_loss = 0.0

    for epoch in range(args.epochs):
        perm = torch.randperm(len(train_pairs))
        for step in range(steps):
            idx = perm[step * batch_size:(step + 1) * batch_size]
            ctx_batch = ctx_tensor[idx].to(device)
            tgt_batch = tgt_tensor[idx].to(device)

            ctx_latent = ctx_encoder(ctx_batch)
            pred_latent = predictor(ctx_latent)
            with torch.no_grad():
                tgt_latent = tgt_encoder(tgt_batch)

            loss_pred = smooth_l1(pred_latent, tgt_latent)
            std = torch.sqrt(pred_latent.var(dim=0) + 1e-4)
            loss_var = torch.mean(torch.relu(1.0 - std))
            centered = pred_latent - pred_latent.mean(dim=0, keepdim=True)
            cov = (centered.T @ centered) / max(1, pred_latent.shape[0] - 1)
            off_diag = cov - torch.diag(torch.diag(cov))
            loss_cov = (off_diag.pow(2).sum()) / off_diag.numel()
            loss = loss_pred + 0.10 * loss_var + 0.05 * loss_cov

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            last_loss = float(loss.item())

            with torch.no_grad():
                decay = args.ema
                for t_param, c_param in zip(tgt_encoder.parameters(), ctx_encoder.parameters()):
                    t_param.data.mul_(decay).add_(c_param.data, alpha=1.0 - decay)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.save({
        "context_encoder": ctx_encoder.state_dict(),
        "predictor": predictor.state_dict(),
        "target_encoder": tgt_encoder.state_dict(),
            "config": {
            "input_dim": input_dim,
            "latent_dim": 128,
            "epochs": args.epochs,
            "batch": args.batch,
            "lr": args.lr,
            "ema": args.ema,
        },
    }, MODEL_DIR / "packet-jepa.pt")

    latents = {}
    with torch.no_grad():
        for packet_key, vector in vectors_by_key.items():
            tensor = torch.from_numpy(l2_normalize(vector.reshape(1, -1).astype(np.float32))).to(device)
            latent = predictor(ctx_encoder(tensor)).cpu().numpy()[0].astype(np.float32)
            latents[packet_key] = latent

    return latents, {"final_loss": last_loss, "device": str(device)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=str, default=str(INPUT_PAIRS))
    parser.add_argument("--eval-input", type=str, default=str(INPUT_EVAL))
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch", type=int, default=128)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--ema", type=float, default=0.99)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pair_rows = read_ndjson(Path(args.input))
    eval_rows = read_ndjson(Path(args.eval_input))
    if not pair_rows:
        raise SystemExit(f"No training pairs found at {args.input}")

    keys, vectors_by_key, domains = dedupe_packet_vectors(pair_rows, eval_rows)
    train_keys, eval_keys = build_train_split(keys)
    input_dim = len(vectors_by_key[keys[0]]) if keys else 0
    if input_dim <= 0:
        raise SystemExit("No usable vectors in pair export")
    raw_matrix = np.stack([vectors_by_key[key] for key in keys]).astype(np.float32)
    raw_matrix = l2_normalize(raw_matrix)

    if args.dry_run:
        print(json.dumps({
            "status": "READY",
            "pair_rows": len(pair_rows),
            "eval_rows": len(eval_rows),
            "unique_packets": len(keys),
            "torch_required_for_apply": True,
        }, indent=2))
        return

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    train_matrix = np.stack([vectors_by_key[key] for key in train_keys]).astype(np.float32)
    train_matrix = l2_normalize(train_matrix)
    pca_mean, pca_components = compute_pca(train_matrix, dim=128)
    np.save(MODEL_DIR / "pca_mean.npy", pca_mean)
    np.save(MODEL_DIR / "pca_components.npy", pca_components)

    cosine_latents = {key: raw_matrix[idx] for idx, key in enumerate(keys)}
    pca_latent_matrix = apply_pca(raw_matrix, pca_mean, pca_components)
    pca_latents = {key: pca_latent_matrix[idx].astype(np.float32) for idx, key in enumerate(keys)}
    jepa_latents, train_meta = train_packet_jepa(pair_rows, vectors_by_key, input_dim, args)

    evaluation = {
        "embedding384_cosine": evaluate_representation(cosine_latents, eval_rows),
        "pca128_cosine": evaluate_representation(pca_latents, eval_rows),
        "packet_jepa_128": evaluate_representation(jepa_latents, eval_rows),
    }
    evaluation["embedding384_cosine"]["domain_f1"] = nearest_centroid_f1(cosine_latents, domains, train_keys, eval_keys)
    evaluation["pca128_cosine"]["domain_f1"] = nearest_centroid_f1(pca_latents, domains, train_keys, eval_keys)
    evaluation["packet_jepa_128"]["domain_f1"] = nearest_centroid_f1(jepa_latents, domains, train_keys, eval_keys)

    with OUTPUT_LATENTS.open("w", encoding="utf-8") as fh:
        for key in keys:
            fh.write(json.dumps({
                "packet_key": key,
                "domain_class": domains.get(key, ""),
                "pca_latent": pca_latents[key].tolist(),
                "jepa_latent": jepa_latents[key].tolist(),
            }) + "\n")

    report = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "mode": "train",
        "inputs": {
            "pairs": str(Path(args.input).relative_to(ROOT)).replace("\\", "/"),
            "eval": str(Path(args.eval_input).relative_to(ROOT)).replace("\\", "/"),
        },
        "outputs": {
            "latents": str(OUTPUT_LATENTS.relative_to(ROOT)).replace("\\", "/"),
            "model": str((MODEL_DIR / "packet-jepa.pt").relative_to(ROOT)).replace("\\", "/"),
        },
        "summary": {
            "pair_rows": len(pair_rows),
            "eval_rows": len(eval_rows),
            "unique_packets": len(keys),
            "train_packets": len(train_keys),
            "eval_packets": len(eval_keys),
            "input_dim": input_dim,
        },
        "training": train_meta,
        "evaluation": evaluation,
        "nextSafeAction": "node scripts/atlas/score-packet-jepa-similarity.mjs --dry-run --limit=500",
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    REPORT_MD.write_text(render_markdown(report) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": "READY",
        "report": str(REPORT_JSON.relative_to(ROOT)).replace("\\", "/"),
        "latents": str(OUTPUT_LATENTS.relative_to(ROOT)).replace("\\", "/"),
        "evaluation": evaluation,
    }, indent=2))


if __name__ == "__main__":
    main()
