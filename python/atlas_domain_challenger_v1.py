#!/usr/bin/env python3
"""
Phase 1 — Offline Naive Bayes & Logistic Regression Domain Challenger (SHADOW_ONLY).

Evaluates the 149 SHA-256 bound candidates in docs/reports/domain-calibration-draft-v3.jsonl
against the .okf validated domain taxonomy (.okf/domains/atlas-domain-taxonomy.yaml)
using a deterministic pure-NumPy TF-IDF + Multinomial Naive Bayes + Softmax Logistic Regression
challenger ensemble.

Authority rule:
- Strictly SHADOW_ONLY (canonicalAuthority = False, writesPerformed = False).
- Flags high-entropy candidates and rule-vs-challenger disagreements to prioritize
  human calibration review before any ontology promotion.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import yaml

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = WORKSPACE_ROOT / ".okf" / "domains" / "atlas-domain-taxonomy.yaml"
BOUND_CANDIDATES_PATH = WORKSPACE_ROOT / "docs" / "reports" / "domain-calibration-draft-v3.jsonl"
DEFAULT_REPORT_PATH = WORKSPACE_ROOT / "docs" / "reports" / "domain-challenger-calibration-v1.json"

TOKEN_RE = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]{1,31}")

# Exact alignment from legacy path/label signals to .okf group_id in .okf/domains/atlas-domain-taxonomy.yaml
SIGNAL_TO_OKF_GROUP: dict[str, str] = {
    "api": "api",
    "auth": "auth",
    "cache": "cache",
    "redis": "cache",
    "compiler": "compiler",
    "database": "database",
    "db": "database",
    "drizzle": "database.postgresql",
    "postgresql": "database.postgresql",
    "devops": "devops",
    "infrastructure": "devops",
    "env": "devops.env-config",
    "process": "devops.process-mgmt",
    "error": "error-handling",
    "error-handling": "error-handling",
    "frontend": "frontend",
    "sveltekit": "frontend.sveltekit",
    "gpu": "gpu",
    "cuda": "gpu",
    "graph": "graph",
    "machine-learning": "machine-learning",
    "ml": "machine-learning",
    "retrieval": "retrieval",
    "search": "retrieval",
    "test": "test",
    "backend": "api",
    "utility": "compiler",
}


def tokenize(text: str) -> list[str]:
    """Split camelCase, snake_case, and path tokens into lowercase terms."""
    expanded = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    expanded = expanded.replace("/", " ").replace("-", " ").replace(".", " ")
    return [m.group(0).lower() for m in TOKEN_RE.finditer(expanded)]


def load_okf_groups(taxonomy_path: Path = TAXONOMY_PATH) -> list[dict[str, Any]]:
    raw = yaml.safe_load(taxonomy_path.read_text(encoding="utf-8"))
    return list(raw.get("groups", []))


def build_tfidf_matrix(docs: list[list[str]], max_vocab: int = 1024) -> tuple[np.ndarray, list[str]]:
    df_counter: Counter[str] = Counter()
    tf_counters: list[Counter[str]] = []
    for tokens in docs:
        c = Counter(tokens)
        tf_counters.append(c)
        for term in c.keys():
            df_counter[term] += 1

    vocab = [term for term, _ in sorted(df_counter.items(), key=lambda kv: (-kv[1], kv[0]))[:max_vocab]]
    term_to_idx = {term: i for i, term in enumerate(vocab)}
    n_docs = max(len(docs), 1)
    mat = np.zeros((len(docs), len(vocab)), dtype=np.float64)

    for d_idx, c in enumerate(tf_counters):
        for term, count in c.items():
            v_idx = term_to_idx.get(term)
            if v_idx is not None:
                idf = math.log((1.0 + n_docs) / (1.0 + df_counter[term])) + 1.0
                mat[d_idx, v_idx] = (1.0 + math.log(count)) * idf

    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms = np.where(norms > 1e-12, norms, 1.0)
    return mat / norms, vocab


def fit_predict_nb_and_logreg(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_eval: np.ndarray,
    n_classes: int,
    alpha: float = 0.5,
    lr: float = 0.8,
    epochs: int = 150,
    l2_reg: float = 1e-3,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Fit deterministic Multinomial Naive Bayes + L2 Softmax Logistic Regression
    on seed prototypes + weak signals and return (probs_nb, probs_lr) on X_eval.
    """
    n_features = X_train.shape[1]

    # 1. Multinomial Naive Bayes with Laplace smoothing alpha
    class_counts = np.zeros(n_classes, dtype=np.float64)
    feature_sums = np.full((n_classes, n_features), alpha, dtype=np.float64)
    for idx, cls_id in enumerate(y_train):
        class_counts[cls_id] += 1.0
        feature_sums[cls_id] += np.maximum(X_train[idx], 0.0)

    log_priors = np.log((class_counts + 1.0) / (len(y_train) + n_classes))
    log_likelihoods = np.log(feature_sums / feature_sums.sum(axis=1, keepdims=True))

    logits_nb = np.maximum(X_eval, 0.0) @ log_likelihoods.T + log_priors
    logits_nb -= logits_nb.max(axis=1, keepdims=True)
    exp_nb = np.exp(logits_nb)
    probs_nb = exp_nb / exp_nb.sum(axis=1, keepdims=True)

    # 2. L2-Regularized Softmax Logistic Regression (deterministic batch GD)
    W = np.zeros((n_features, n_classes), dtype=np.float64)
    b = np.zeros(n_classes, dtype=np.float64)
    Y_onehot = np.eye(n_classes, dtype=np.float64)[y_train]
    n_samples = float(max(len(y_train), 1))

    for _ in range(epochs):
        scores = X_train @ W + b
        scores -= scores.max(axis=1, keepdims=True)
        probs = np.exp(scores)
        probs /= probs.sum(axis=1, keepdims=True)
        diff = (probs - Y_onehot) / n_samples
        grad_W = X_train.T @ diff + l2_reg * W
        grad_b = diff.sum(axis=0)
        W -= lr * grad_W
        b -= lr * grad_b

    logits_lr = X_eval @ W + b
    logits_lr -= logits_lr.max(axis=1, keepdims=True)
    exp_lr = np.exp(logits_lr)
    probs_lr = exp_lr / exp_lr.sum(axis=1, keepdims=True)

    return probs_nb, probs_lr


def run_challenger_calibration(
    candidates_path: Path = BOUND_CANDIDATES_PATH,
    taxonomy_path: Path = TAXONOMY_PATH,
    output_path: Path = DEFAULT_REPORT_PATH,
) -> dict[str, Any]:
    groups = load_okf_groups(taxonomy_path)
    group_ids = [g["group_id"] for g in groups]
    group_to_idx = {gid: i for i, gid in enumerate(group_ids)}

    rows = [
        json.loads(line)
        for line in candidates_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    bound_rows = [r for r in rows if r.get("revisionResolution") == "BINDING_EXACT"]

    # Build prototype training documents from .okf group descriptions + keywords
    train_docs: list[list[str]] = []
    train_labels: list[int] = []
    for g in groups:
        gid = g["group_id"]
        desc_text = " ".join(
            [
                gid,
                str(g.get("label", "")),
                str(g.get("description", "")),
                " ".join(g.get("keywords", []) or []),
            ]
        )
        # Weight prototype description tokens 3x to anchor the taxonomy semantics
        train_docs.append(tokenize(desc_text) * 3)
        train_labels.append(group_to_idx[gid])

    eval_docs: list[list[str]] = []
    heuristic_targets: list[str] = []

    for r in bound_rows:
        src_ref = str(r.get("resolvedFilePath") or r.get("sourceRef") or "")
        feat = str(r.get("featureLabel") or "")
        ev = str(r.get("textEvidence") or "")
        sig = str(r.get("selectionSignalDomain") or "").lower()
        orig = str(r.get("originalLabel") or "").lower()

        tokens = tokenize(f"{src_ref} {feat} {ev}")
        eval_docs.append(tokens)

        mapped_group = (
            SIGNAL_TO_OKF_GROUP.get(sig)
            or SIGNAL_TO_OKF_GROUP.get(orig)
            or (group_ids[0] if group_ids else "unknown")
        )
        if mapped_group not in group_to_idx:
            mapped_group = group_ids[0]
        heuristic_targets.append(mapped_group)

        # Include weak supervision in training corpus
        train_docs.append(tokens)
        train_labels.append(group_to_idx[mapped_group])

    all_tfidf, vocab = build_tfidf_matrix(train_docs + eval_docs, max_vocab=1024)
    n_train = len(train_docs)
    X_train = all_tfidf[:n_train]
    y_train = np.array(train_labels, dtype=np.int64)
    X_eval = all_tfidf[n_train:]

    probs_nb, probs_lr = fit_predict_nb_and_logreg(
        X_train=X_train,
        y_train=y_train,
        X_eval=X_eval,
        n_classes=len(group_ids),
    )
    probs_ensemble = 0.5 * (probs_nb + probs_lr)

    proposals: list[dict[str, Any]] = []
    disagreement_count = 0
    high_entropy_count = 0

    for idx, r in enumerate(bound_rows):
        p_nb = probs_nb[idx]
        p_lr = probs_lr[idx]
        p_ens = probs_ensemble[idx]

        nb_top_idx = int(np.argmax(p_nb))
        lr_top_idx = int(np.argmax(p_lr))
        ens_top_idx = int(np.argmax(p_ens))

        # Normalized Shannon entropy in [0, 1]
        clipped = np.clip(p_ens, 1e-12, 1.0)
        entropy = float(-np.sum(clipped * np.log(clipped)) / max(math.log(len(group_ids)), 1e-9))

        heuristic_group = heuristic_targets[idx]
        orig_raw = str(r.get("originalLabel") or "").strip().lower()
        orig_mapped = SIGNAL_TO_OKF_GROUP.get(orig_raw, orig_raw) if orig_raw else None
        nb_group = group_ids[nb_top_idx]
        lr_group = group_ids[lr_top_idx]
        ens_group = group_ids[ens_top_idx]

        disagrees_with_heuristic = (
            ens_group != heuristic_group
            or nb_group != lr_group
            or (orig_mapped is not None and orig_mapped != ens_group)
        )
        is_high_entropy = entropy >= 0.72
        if disagrees_with_heuristic:
            disagreement_count += 1
        if is_high_entropy:
            high_entropy_count += 1

        proposals.append(
            {
                "sourceRef": r.get("resolvedFilePath") or r.get("sourceRef"),
                "sourceRevision": r.get("sourceRevision"),
                "packetKey": r.get("packetKey"),
                "originalLabel": r.get("originalLabel"),
                "selectionSignalDomain": r.get("selectionSignalDomain"),
                "heuristicOkfGroup": heuristic_group,
                "naiveBayesTopGroup": nb_group,
                "naiveBayesConfidence": round(float(p_nb[nb_top_idx]), 6),
                "logisticRegressionTopGroup": lr_group,
                "logisticRegressionConfidence": round(float(p_lr[lr_top_idx]), 6),
                "ensembleProposedGroup": ens_group,
                "ensembleConfidence": round(float(p_ens[ens_top_idx]), 6),
                "normalizedEntropy": round(entropy, 6),
                "challengerDisagreement": disagrees_with_heuristic,
                "highEntropyReviewPriority": is_high_entropy,
                "authority": "SHADOW_ONLY",
                "canonicalAuthority": False,
                "writesPerformed": False,
            }
        )

    payload_without_checksum = {
        "schema": "atlas.domain-challenger-calibration.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "authority": "SHADOW_ONLY",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "okfDomainCount": len(group_ids),
        "vocabSize": len(vocab),
        "summary": {
            "totalBoundEvaluated": len(bound_rows),
            "challengerDisagreements": disagreement_count,
            "highEntropyCandidates": high_entropy_count,
            "agreementRate": round(1.0 - (disagreement_count / max(len(bound_rows), 1)), 6),
        },
        "highPriorityReviewQueue": [
            p for p in proposals if p["challengerDisagreement"] or p["highEntropyReviewPriority"]
        ][:25],
        "proposals": proposals,
    }

    canonical_bytes = json.dumps(payload_without_checksum, sort_keys=True, separators=(",", ":")).encode("utf-8")
    receipt_checksum = f"sha256:{hashlib.sha256(canonical_bytes).hexdigest()}"
    report = {**payload_without_checksum, "receiptChecksum": receipt_checksum}

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    res = run_challenger_calibration()
    print(
        json.dumps(
            {
                "schema": res["schema"],
                "authority": res["authority"],
                "okfDomainCount": res["okfDomainCount"],
                "vocabSize": res["vocabSize"],
                "summary": res["summary"],
                "receiptChecksum": res["receiptChecksum"],
            },
            indent=2,
        )
    )
