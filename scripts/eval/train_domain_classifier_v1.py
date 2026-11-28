#!/usr/bin/env python3
"""Gated grouped-split domain classifier trainer (challenger-only, fail-closed).

Linear softmax baseline over L2-normalised stored embeddings, with one temperature fitted on the
validation split. Reads PostgreSQL in a read-only session and writes only local files in a new folder.
Refuses to train unless the labels pass the gate, every reviewed row has exactly one stored vector,
and every class appears in train, validation and test. Run from the repository root.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "eval"))
from validate_domain_gold_labels_v1 import (  # noqa: E402
    CLASSES,
    build_grouped_splits,
    count_split_leakage,
    validate_gold_labels,
)

EMBEDDING_COLUMN = "codebase_chunk_index.content_embedding_768"


def collapse_identical_content(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """One reviewed row per distinct text, so copies cannot pad the floor. Conflicting labels fail."""
    kept: dict[str, dict[str, Any]] = {}
    result: list[dict[str, Any]] = []
    for row in rows:
        digest = row.get("content_digest")
        if row.get("status") != "reviewed" or not digest:
            result.append(dict(row))
        elif digest not in kept:
            kept[digest] = dict(row)
            result.append(kept[digest])
        elif kept[digest]["gold_label"] != row.get("gold_label"):
            raise ValueError(
                f"CONFLICTING_LABELS_FOR_IDENTICAL_CONTENT: {kept[digest]['chunk_id']} vs {row.get('chunk_id')}"
            )
    return result


def _softmax(logits: np.ndarray) -> np.ndarray:
    logits = logits - np.max(logits, axis=1, keepdims=True)
    probs = np.exp(logits)
    return probs / np.sum(probs, axis=1, keepdims=True)


def _fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    grid = np.exp(np.linspace(np.log(0.02), np.log(20.0), 400))
    losses = [-np.mean(np.log(_softmax(logits / t)[np.arange(len(y)), y] + 1e-12)) for t in grid]
    return float(grid[int(np.argmin(losses))])


def _ece(probs: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    confidence, correct = probs.max(axis=1), probs.argmax(axis=1) == y
    slot = np.minimum((confidence * bins).astype(int), bins - 1)
    return float(sum(
        np.mean(slot == i) * abs(correct[slot == i].mean() - confidence[slot == i].mean())
        for i in range(bins) if np.any(slot == i)
    ))


def _per_class(pred: np.ndarray, y: np.ndarray) -> dict[str, dict[str, float]]:
    out = {}
    for i, name in enumerate(CLASSES):
        tp = int(np.sum((pred == i) & (y == i)))
        precision = tp / max(int(np.sum(pred == i)), 1)
        recall = tp / max(int(np.sum(y == i)), 1)
        out[name] = {
            "support": int(np.sum(y == i)),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(2 * precision * recall / (precision + recall), 4) if precision + recall else 0.0,
        }
    return out


def train_and_evaluate_linear_classifier(
    rows: Sequence[Mapping[str, Any]],
    vectors_by_chunk: Mapping[str, np.ndarray],
    *,
    min_total: int = 200,
    min_per_class: int = 30,
    epochs: int = 20_000,
    tolerance: float = 1e-3,
    lr: float = 0.25,
    model_path: Path | None = None,
) -> dict[str, Any]:
    labelled = collapse_identical_content(rows)
    gate = validate_gold_labels(labelled, min_total=min_total, min_per_class=min_per_class)
    if not gate["passed"]:
        raise ValueError(f"GOLD_LABEL_GATE_FAILED: {json.dumps(gate)}")

    reviewed = [r for r in labelled if r.get("status") == "reviewed"]
    models = {str(r.get("embedding_model")) for r in reviewed if r.get("embedding_model") is not None}
    if len(models) > 1:
        raise ValueError(f"MIXED_EMBEDDING_MODELS: {sorted(models)}")
    reps = {str(r.get("representation_id") or r.get("representation_revision")) for r in reviewed if (r.get("representation_id") or r.get("representation_revision")) is not None}
    if len(reps) > 1:
        raise ValueError(f"MIXED_EMBEDDING_REPRESENTATIONS: {sorted(reps)}")
    missing = [r["chunk_id"] for r in reviewed if r["chunk_id"] not in vectors_by_chunk]
    if missing:
        raise ValueError(f"MISSING_VECTORS: {len(missing)} of {len(reviewed)}; first={missing[:3]}")
    dims = {vectors_by_chunk[r["chunk_id"]].shape for r in reviewed}
    if len(dims) != 1:
        raise ValueError(f"INCONSISTENT_VECTOR_SHAPES: {sorted(dims)}")

    splits = build_grouped_splits(reviewed)
    leakage = count_split_leakage(splits)
    if leakage:
        raise ValueError(f"SPLIT_LEAKAGE: {leakage}")
    for name, items in splits.items():
        absent = sorted(set(CLASSES) - {r["gold_label"] for r in items})
        if absent:
            raise ValueError(f"CLASS_MISSING_FROM_SPLIT: {name} lacks {absent}")
    label_to_idx = {c: i for i, c in enumerate(CLASSES)}

    def to_xy(items: Sequence[Mapping[str, Any]]) -> tuple[np.ndarray, np.ndarray]:
        x = np.vstack([vectors_by_chunk[it["chunk_id"]] for it in items]).astype(np.float32)
        norms = np.linalg.norm(x, axis=1, keepdims=True)
        if not np.isfinite(x).all() or np.any(norms <= 1e-12):
            raise ValueError("INVALID_VECTOR_NONFINITE_OR_ZERO")
        return x / norms, np.array([label_to_idx[it["gold_label"]] for it in items], dtype=np.int64)

    data = {name: to_xy(items) for name, items in splits.items()}
    x_train, y_train = data["train"]
    w = np.zeros((x_train.shape[1], len(CLASSES)), dtype=np.float32)
    b = np.zeros((len(CLASSES),), dtype=np.float32)
    y_onehot = np.eye(len(CLASSES), dtype=np.float32)[y_train]
    # `epochs` is a ceiling. Stop once the training objective improves by under `tolerance` per 100 steps.
    previous, epochs_run, converged = np.inf, 0, False
    while epochs_run < epochs and not converged:
        probs = _softmax(x_train @ w + b)
        if epochs_run % 100 == 0:
            objective = float(-np.mean(np.log(probs[np.arange(len(y_train)), y_train] + 1e-12))
                              + 0.5e-4 * np.sum(w * w))
            converged = previous - objective < tolerance * max(objective, 1e-12)
            previous = objective
            if converged:
                break
        epochs_run += 1
        grad = (probs - y_onehot) / float(len(y_train))
        w -= lr * (x_train.T @ grad + 1e-4 * w)
        b -= lr * np.sum(grad, axis=0)

    logits = {name: x @ w + b for name, (x, _) in data.items()}
    temperature = _fit_temperature(logits["val"], data["val"][1])
    majority = int(np.bincount(y_train, minlength=len(CLASSES)).argmax())

    def score(name: str) -> dict[str, float]:
        y = data[name][1]
        return {
            "count": int(len(y)),
            "accuracy": round(float(np.mean(logits[name].argmax(axis=1) == y)), 4),
            "majority_baseline_accuracy": round(float(np.mean(y == majority)), 4),
        }

    report: dict[str, Any] = {
        "schema": "atlas.domain-classifier-train.v1",
        "canonical_authority": False,
        "challenger_only": True,
        "classes": list(CLASSES),
        "epochs_run": epochs_run,
        "epoch_ceiling": epochs,
        "converged": converged,
        "learning_rate": lr,
        "reviewed_rows": sum(1 for r in rows if r.get("status") == "reviewed"),
        "distinct_rows_used": len(reviewed),
        "proposal_shown_rows": sum(1 for r in reviewed if r.get("proposal_shown")),
        "group_leakage_count": leakage,
        "train": score("train"),
        "validation": score("val"),
        "test": score("test"),
        "test_per_class": _per_class(logits["test"].argmax(axis=1), data["test"][1]),
        "calibration": {
            "method": "temperature scaling fitted on the validation split",
            "temperature": round(temperature, 4),
            "test_ece_before": round(_ece(_softmax(logits["test"]), data["test"][1]), 4),
            "test_ece_after": round(_ece(_softmax(logits["test"] / temperature), data["test"][1]), 4),
        },
        "weights_sha256": "sha256:" + hashlib.sha256(w.tobytes() + b.tobytes()).hexdigest(),
    }
    if model_path is not None:
        with model_path.open("xb") as handle:  # never overwrite a saved model
            np.savez(handle, weights=w, bias=b, temperature=np.float64(temperature), classes=np.array(CLASSES))
        report["model_file"] = str(model_path)
        report["model_file_sha256"] = "sha256:" + hashlib.sha256(model_path.read_bytes()).hexdigest()
    return report


def predict_with_saved_model(model_path: Path, vectors: np.ndarray) -> dict[str, Any]:
    """Reload a saved model.npz and compute calibrated probabilities over normalized vectors."""
    x = np.asarray(vectors, dtype=np.float32)
    if x.ndim != 2:
        raise ValueError(f"EXPECTED_2D_VECTORS_GOT_{x.ndim}D")
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    if not np.isfinite(x).all() or np.any(norms <= 1e-12):
        raise ValueError("INVALID_VECTOR_NONFINITE_OR_ZERO")
    x_norm = x / norms
    with np.load(model_path, allow_pickle=False) as data:
        w = data["weights"]
        b = data["bias"]
        temperature = float(data["temperature"])
        classes = [str(c) for c in data["classes"]]
    logits = x_norm @ w + b
    probs = _softmax(logits / temperature)
    preds = [classes[int(i)] for i in probs.argmax(axis=1)]
    return {"classes": classes, "logits": logits, "probs": probs, "predictions": preds, "temperature": temperature}


def load_training_inputs(
    rows: Sequence[Mapping[str, Any]],
    *,
    source: str = "legacy_768",
    representation_id: str | None = None,
    model_revision: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, np.ndarray]]:
    """Read each reviewed chunk's stored vector (read-only); match chunk id AND content digest."""
    import psycopg

    from export_domain_label_queue_v1 import load_database_url
    from refresh_domain_label_queue_v2 import COLUMNS, KEY

    if source not in {"legacy_768", "eg2"}:
        raise ValueError(f"UNSUPPORTED_EMBEDDING_SOURCE: {source}")
    if source == "eg2" and (not representation_id or not model_revision):
        raise ValueError("EG2_SOURCE_REQUIRES_REPRESENTATION_ID_AND_MODEL_REVISION")

    reviewed_ids = [r["chunk_id"] for r in rows if r.get("status") == "reviewed"]
    found: dict[tuple[str, str], list[tuple[str, str | None, str | None, str | None]]] = {}
    db_url = load_database_url(Path("sveltekit-frontend/.env"))
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            if source == "legacy_768":
                cur.execute(
                    f"SELECT {COLUMNS}, c.content_embedding_768::text, c.embedding_model, c.representation_revision "
                    f"FROM codebase_chunk_index c WHERE {KEY} = ANY(%s)",
                    (reviewed_ids,),
                )
            else:
                cur.execute(
                    f"SELECT {COLUMNS}, e.embedding::text, e.model_revision, e.representation_id "
                    f"FROM codebase_chunk_index c "
                    f"JOIN codebase_chunk_eg2_embeddings e ON e.source_id = c.id "
                    f"WHERE {KEY} = ANY(%s) AND e.representation_id = %s AND e.model_revision = %s",
                    (reviewed_ids, representation_id, model_revision),
                )
            for chunk_id, _ref, _path, digest, _hint, content, vector, emb_model, rep_rev in cur.fetchall():
                found.setdefault((chunk_id, digest), []).append((content, vector, emb_model, rep_rev))

    enriched, vectors = [], {}
    for row in rows:
        row = dict(row)
        if row.get("status") == "reviewed":
            matches = found.get((row["chunk_id"], row.get("sha256")), [])
            if len(matches) != 1 or matches[0][1] is None:
                raise ValueError(f"NOT_EXACTLY_ONE_STORED_VECTOR: {row['chunk_id']} matches={len(matches)}")
            content, vector, emb_model, rep_rev = matches[0]
            row["content_digest"] = hashlib.sha256(content.replace("\r\n", "\n").strip().encode("utf-8")).hexdigest()
            if emb_model is not None:
                row["embedding_model"] = emb_model
            if rep_rev is not None:
                row["representation_revision"] = rep_rev
            vectors[row["chunk_id"]] = np.array(json.loads(vector), dtype=np.float32)
            if vectors[row["chunk_id"]].shape != (768,):
                raise ValueError(f"VECTOR_NOT_768: {row['chunk_id']}")
        enriched.append(row)
    return enriched, vectors


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train gated domain classifier over gold labels")
    parser.add_argument("--gold", type=Path, default=Path("data/eval/domain_gold_labels_v1.jsonl"))
    parser.add_argument("--source", choices=("legacy_768", "eg2"), default="legacy_768")
    parser.add_argument("--representation-id", type=str, default=None)
    parser.add_argument("--model-revision", type=str, default=None)
    parser.add_argument("--out-dir", type=Path, help="New folder for report.json and model.npz")
    args = parser.parse_args(argv)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    out_dir = args.out_dir or Path(".tmp/review") / f"domain-classifier-{stamp}"

    try:
        if not args.gold.exists():
            raise ValueError(f"GOLD_FILE_NOT_FOUND: {args.gold}")
        if out_dir.exists():
            raise ValueError(f"REFUSING_EXISTING_OUTPUT_DIR: {out_dir}")
        gold_bytes = args.gold.read_bytes()
        rows = [json.loads(l) for l in gold_bytes.decode("utf-8").splitlines() if l.strip()]
        gate = validate_gold_labels(rows)
        if not gate["passed"]:
            print(json.dumps({"passed": False, "gate": gate}, indent=2))
            return 1
        enriched, vectors = (
            load_training_inputs(rows)
            if args.source == "legacy_768" and not args.representation_id and not args.model_revision
            else load_training_inputs(
                rows,
                source=args.source,
                representation_id=args.representation_id,
                model_revision=args.model_revision,
            )
        )
        # All gates run again on distinct text before anything is written.
        train_and_evaluate_linear_classifier(enriched, vectors)
        out_dir.mkdir(parents=True)
        report = train_and_evaluate_linear_classifier(enriched, vectors, model_path=out_dir / "model.npz")
    except ValueError as error:
        print(json.dumps({"passed": False, "error": str(error)}, indent=2))
        return 1

    report.update({
        "gold_file": str(args.gold),
        "gold_sha256": "sha256:" + hashlib.sha256(gold_bytes).hexdigest(),
        "embedding_source": args.source,
        "embedding_column": EMBEDDING_COLUMN if args.source == "legacy_768" else "codebase_chunk_eg2_embeddings.embedding",
        "representation_id": args.representation_id,
        "model_revision": args.model_revision,
        "database_writes_performed": False,
    })
    (out_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
