"""Phase F clustering scaffold (SOM → K-Means hybrid).

This companion script consumes latent vectors (or SOM node weights)
produced by ``train_autoencoder.py`` and generates:

  * ``foaf_kmeans.joblib``: scikit-learn model with centroids/assignments
  * ``cluster_model.json``: lightweight metadata consumed by the orchestrator
  * Optional Redis cache updates (centroids + member sets)

Run after exporting your autoencoder so the cluster metadata stays aligned
with the latent space used at inference time.
"""

from __future__ import annotations

import argparse
import json
import logging
import pathlib
from dataclasses import asdict, dataclass
from typing import Iterable, Optional

import joblib
import numpy as np
from sklearn.cluster import KMeans

try:  # Optional dependency for direct Redis publishing
    import redis
except ImportError:  # pragma: no cover - optional path
    redis = None


LOGGER = logging.getLogger("cluster_trainer")


@dataclass
class ClusterModel:
    version: str
    created_at: str
    algorithm: str
    k: int
    dimension: int
    centroids: list[dict]
    metadata: dict


def load_latents(path: pathlib.Path) -> np.ndarray:
    LOGGER.info("Loading latents from %s", path)
    if path.suffix in {".pt", ".pth"}:
        import torch

        tensor = torch.load(path, map_location="cpu")
        if isinstance(tensor, dict) and "latents" in tensor:
            tensor = tensor["latents"]
        latents = tensor.numpy() if hasattr(tensor, "numpy") else np.asarray(tensor)
    elif path.suffix == ".npy":
        latents = np.load(path)
    else:
        raise ValueError(f"Unsupported latent format: {path}")

    LOGGER.info("Latent matrix shape: %s", latents.shape)
    return latents.astype(np.float32)


def train_kmeans(latents: np.ndarray, k: int, seed: int) -> KMeans:
    LOGGER.info("Training K-Means with k=%d, seed=%d", k, seed)
    model = KMeans(n_clusters=k, n_init="auto", random_state=seed)
    model.fit(latents)
    LOGGER.info("Inertia %.4f", float(model.inertia_))
    return model


def build_snapshot(model: KMeans, assignments: Iterable[int], *, version: str) -> ClusterModel:
    centroids = []
    for idx, centroid in enumerate(model.cluster_centers_):
        centroids.append(
            {
                "id": f"cluster_{idx}",
                "vector": centroid.tolist(),
            }
        )

    metadata = {
        "assignments_file": "cluster_assignments.json",
        "inertia": float(model.inertia_),
    }

    return ClusterModel(
        version=version,
        created_at=__import__("datetime").datetime.utcnow().isoformat() + "Z",
        algorithm="kmeans",
        k=model.n_clusters,
        dimension=model.cluster_centers_.shape[1],
        centroids=centroids,
        metadata=metadata,
    )


def save_outputs(
    output_dir: pathlib.Path,
    model: KMeans,
    assignments: Iterable[int],
    snapshot: ClusterModel,
) -> tuple[pathlib.Path, pathlib.Path, pathlib.Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    joblib_path = output_dir / "foaf_kmeans.joblib"
    joblib.dump(model, joblib_path)
    LOGGER.info("Saved KMeans model to %s", joblib_path)

    assignments_path = output_dir / "cluster_assignments.json"
    with assignments_path.open("w", encoding="utf-8") as handle:
        json.dump(list(map(int, assignments)), handle)
    LOGGER.info("Persisted cluster assignments to %s", assignments_path)

    snapshot_path = output_dir / "cluster_model.json"
    with snapshot_path.open("w", encoding="utf-8") as handle:
        json.dump(asdict(snapshot), handle, indent=2)
    LOGGER.info("Cluster snapshot saved to %s", snapshot_path)

    return joblib_path, assignments_path, snapshot_path


def publish_to_redis(
    snapshot_path: pathlib.Path,
    assignments_path: pathlib.Path,
    *,
    redis_url: str,
    cluster_key: str,
) -> None:
    if redis is None:  # pragma: no cover - optional path
        LOGGER.error("redis-py not installed; cannot publish snapshot")
        return

    client = redis.Redis.from_url(redis_url)
    LOGGER.info("Publishing cluster snapshot to Redis key %s", cluster_key)

    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    client.set(cluster_key, json.dumps(snapshot))

    assignments = json.loads(assignments_path.read_text(encoding="utf-8"))
    pipeline = client.pipeline(transaction=False)
    for person_idx, cluster_idx in enumerate(assignments):
        person_key = f"foaf:person:{person_idx}"
        cluster_set = f"foaf:cluster:cluster_{cluster_idx}:members"
        pipeline.hset(person_key, mapping={"cluster": f"cluster_{cluster_idx}"})
        pipeline.sadd(cluster_set, person_idx)
    pipeline.execute()
    LOGGER.info("Redis cluster metadata refreshed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and export SOM→KMeans clusters")
    parser.add_argument("latents", type=pathlib.Path, help="Path to latent vectors (.pt/.npy)")
    parser.add_argument("output", type=pathlib.Path, help="Output directory for cluster artifacts")
    parser.add_argument("--k", type=int, default=32, help="Number of clusters")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--version", type=str, default="v1", help="Snapshot version tag")
    parser.add_argument("--redis-url", type=str, help="Optional redis:// connection string")
    parser.add_argument(
        "--redis-key",
        type=str,
        default="foaf:cluster:model",
        help="Redis key for storing the cluster snapshot",
    )
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    args = parse_args()

    latents = load_latents(args.latents)
    model = train_kmeans(latents, args.k, args.seed)
    assignments = model.predict(latents)
    snapshot = build_snapshot(model, assignments, version=args.version)
    _, assignments_path, snapshot_path = save_outputs(args.output, model, assignments, snapshot)

    if args.redis_url:
        publish_to_redis(snapshot_path, assignments_path, redis_url=args.redis_url, cluster_key=args.redis_key)


if __name__ == "__main__":  # pragma: no cover
    main()

