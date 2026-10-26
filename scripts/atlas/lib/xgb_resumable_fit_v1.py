"""Checksum-bound, atomic XGBoost training checkpoints."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np


def build_centroid_features(top_cosines, centroid_ids, cluster_count: int) -> np.ndarray:
    """Keep similarity scores numeric while encoding centroid identity categorically."""
    top_cosines = np.asarray(top_cosines, dtype=np.float32)
    centroid_ids = np.asarray(centroid_ids)
    if top_cosines.ndim != 2 or top_cosines.shape[1] < 2:
        raise ValueError("top_cosines must be a 2D matrix with at least two ranks")
    if centroid_ids.shape != top_cosines.shape or not np.issubdtype(centroid_ids.dtype, np.integer):
        raise ValueError("centroid_ids must be an integer matrix matching top_cosines")
    if cluster_count < 1 or np.any(centroid_ids < 0) or np.any(centroid_ids >= cluster_count):
        raise ValueError("centroid id outside declared cluster range")
    if not np.isfinite(top_cosines).all():
        raise ValueError("centroid similarities must be finite")
    nearest = np.zeros((len(top_cosines), cluster_count), dtype=np.float32)
    nearest[np.arange(len(top_cosines)), centroid_ids[:, 0]] = 1.0
    margin = (top_cosines[:, :1] - top_cosines[:, 1:2]).astype(np.float32)
    return np.hstack((top_cosines, margin, nearest))


def _fingerprint(features: np.ndarray, labels: np.ndarray, params: dict, rounds: int, version: str) -> str:
    digest = hashlib.sha256()
    for value in (features, labels):
        array = np.ascontiguousarray(value)
        digest.update(str(array.dtype).encode("ascii"))
        digest.update(json.dumps(array.shape).encode("ascii"))
        digest.update(array.tobytes())
    digest.update(json.dumps({"params": params, "rounds": rounds, "xgboost": version}, sort_keys=True).encode("utf-8"))
    return digest.hexdigest()


def fit_resumable(xgb, features, labels, checkpoint: Path, params: dict, rounds: int = 120, interval: int = 20):
    """Fit a native Booster, saving atomic checkpoints every interval rounds."""
    if rounds < 1 or interval < 1:
        raise ValueError("rounds and interval must be positive")
    features = np.ascontiguousarray(features, dtype=np.float32)
    labels = np.ascontiguousarray(labels, dtype=np.int32)
    if features.ndim != 2 or labels.ndim != 1 or len(features) != len(labels) or not len(labels):
        raise ValueError("invalid training matrix shapes")
    if not np.isfinite(features).all():
        raise ValueError("training features must be finite")

    checkpoint = Path(checkpoint)
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    fingerprint = _fingerprint(features, labels, params, rounds, xgb.__version__)
    booster = None
    completed = 0
    if checkpoint.exists():
        booster = xgb.Booster(params=params, model_file=str(checkpoint))
        if booster.attr("atlas_resume_fingerprint") != fingerprint:
            raise ValueError("XGBOOST_CHECKPOINT_INPUT_MISMATCH")
        completed = int(booster.num_boosted_rounds())
        if completed > rounds:
            raise ValueError("XGBOOST_CHECKPOINT_ROUND_COUNT_INVALID")

    if completed == rounds:
        return booster, {"status": "RESUMED_COMPLETE", "completedRounds": completed, "fingerprint": fingerprint}

    matrix = xgb.DMatrix(features, label=labels)

    class CheckpointCallback(xgb.callback.TrainingCallback):
        def after_iteration(self, model, epoch, evals_log):
            done = int(model.num_boosted_rounds())
            if done % interval == 0 or done == rounds:
                model.set_attr(atlas_resume_fingerprint=fingerprint)
                temporary = checkpoint.with_name(checkpoint.stem + ".tmp.json")
                model.save_model(str(temporary))
                os.replace(temporary, checkpoint)
            return False

    booster = xgb.train(
        params=params,
        dtrain=matrix,
        num_boost_round=rounds - completed,
        xgb_model=booster,
        callbacks=[CheckpointCallback()],
    )
    actual = int(booster.num_boosted_rounds())
    if actual != rounds:
        raise RuntimeError(f"XGBOOST_CHECKPOINT_ROUND_COUNT_MISMATCH:{actual}:{rounds}")
    booster.set_attr(atlas_resume_fingerprint=fingerprint)
    temporary = checkpoint.with_name(checkpoint.stem + ".tmp.json")
    booster.save_model(str(temporary))
    os.replace(temporary, checkpoint)
    status = "TRAINED" if completed == 0 else "RESUMED"
    return booster, {"status": status, "completedRounds": actual, "fingerprint": fingerprint}
