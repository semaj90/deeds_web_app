#!/usr/bin/env python3
"""
Phase 45 – Tensor cache bridge

This utility ties together Redis cache entries, TensorRT embeddings,
cosine-similarity ranking, and Neo4j persistence. It can be executed
manually or scheduled via VS Code tasks.

Prerequisites:
  pip install redis neo4j numpy
  pip install torch --index-url https://download.pytorch.org/whl/cu121  # adjust for GPU

Environment variables (see .env additions):
  REDIS_URL
  REDIS_PASSWORD
  REDIS_EMBED_CHANNEL
  TENSORRT_PLAN_PATH
  NEO4J_URI / NEO4J_USER / NEO4J_PASS
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
from dataclasses import dataclass
from typing import Iterable, List

import numpy as np
import redis
from neo4j import GraphDatabase

try:
  import torch

  TORCH_AVAILABLE = True
except Exception:  # pragma: no cover - graceful fallback
  torch = None
  TORCH_AVAILABLE = False

LOGGER = logging.getLogger("tensor-cache-job")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

EMBED_DIM = int(os.getenv("EMBEDDING_DIM", "384"))
REDIS_EMBED_CHANNEL = os.getenv("REDIS_EMBED_CHANNEL", "ai:embedding:new")


def connect_redis() -> redis.Redis:
  redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
  password = os.getenv("REDIS_PASSWORD") or None
  LOGGER.info("Connecting to Redis at %s", redis_url)
  client = redis.Redis.from_url(redis_url, password=password, decode_responses=True)
  client.ping()
  return client


def connect_neo4j():
  uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
  user = os.getenv("NEO4J_USER", "neo4j")
  password = os.getenv("NEO4J_PASS", "password")
  LOGGER.info("Connecting to Neo4j at %s", uri)
  driver = GraphDatabase.driver(uri, auth=(user, password))
  return driver


def cosine_similarity(vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
  vec_norm = np.linalg.norm(vec) + 1e-9
  mat_norm = np.linalg.norm(matrix, axis=1) + 1e-9
  return (matrix @ vec) / (mat_norm * vec_norm)


def cosine_similarity_torch(vec: torch.Tensor, matrix: torch.Tensor) -> torch.Tensor:
  vec = vec.unsqueeze(0)
  vec_norm = torch.linalg.norm(vec, dim=1, keepdim=True) + 1e-9
  mat_norm = torch.linalg.norm(matrix, dim=1, keepdim=True) + 1e-9
  sim = (matrix @ vec.T) / (mat_norm * vec_norm)
  return sim.squeeze(1)


@dataclass
class EmbeddingEntry:
  key: str
  vector: np.ndarray
  metadata: dict


def parse_embedding(payload: str, redis_key: str) -> EmbeddingEntry | None:
  try:
    data = json.loads(payload)
    vector = np.array(data.get("vector") or data.get("embedding"), dtype=np.float32)
    if vector.size != EMBED_DIM:
      LOGGER.warning(
        "Skipping %s (dimension mismatch: %s != %s)",
        redis_key,
        vector.size,
        EMBED_DIM,
      )
      return None
    metadata = data.get("metadata") or {}
    return EmbeddingEntry(key=data.get("id") or redis_key, vector=vector, metadata=metadata)
  except Exception as exc:  # pragma: no cover - log and continue
    LOGGER.error("Failed to parse embedding for %s: %s", redis_key, exc)
    return None


def load_recent_embeddings(redis_client: redis.Redis, limit: int = 128) -> List[EmbeddingEntry]:
  LOGGER.info("Fetching up to %d embeddings from Redis list %s", limit, REDIS_EMBED_CHANNEL)
  entries: List[EmbeddingEntry] = []
  raw_items = redis_client.lrange(REDIS_EMBED_CHANNEL, -limit, -1) or []
  for raw in raw_items:
    entry = parse_embedding(raw, REDIS_EMBED_CHANNEL)
    if entry:
      entries.append(entry)
  LOGGER.info("Loaded %d embeddings from cache", len(entries))
  return entries


def ensure_tensorrt_container():
  try:
    import docker

    client = docker.from_env()
    containers = client.containers.list()
    matches = [
      container.name
      for container in containers
      if "tensorrt" in container.name.lower() or "tensor" in container.image.tags[0]
    ]
    if not matches:
      LOGGER.warning(
        "No running TensorRT containers found. Start legal-ai-tensorrt-llm before heavy workloads.",
      )
    else:
      LOGGER.info("Detected TensorRT containers: %s", ", ".join(matches))
  except Exception as exc:  # pragma: no cover - optional dependency
    LOGGER.debug("Docker SDK unavailable, skipping container check: %s", exc)


def process_embeddings(entries: List[EmbeddingEntry], driver) -> None:
  if not entries:
    LOGGER.warning("No embeddings available for processing.")
    return

  # Prepare matrix for similarity computation
  matrix = np.stack([entry.vector for entry in entries])
  matrix_torch = None
  if TORCH_AVAILABLE:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    matrix_torch = torch.tensor(matrix, dtype=torch.float32, device=device)
    LOGGER.info("Torch available (device=%s). Using CUDA accelerated cosine similarity.", device)
  else:
    LOGGER.info("Torch not available; falling back to NumPy implementation.")

  neo4j_session = driver.session()
  try:
    for idx, entry in enumerate(entries):
      # Compute similarity vector
      if matrix_torch is not None:
        sims = cosine_similarity_torch(matrix_torch[idx], matrix_torch).detach().cpu().numpy()
      else:
        sims = cosine_similarity(entry.vector, matrix)

      top_indices = sims.argsort()[::-1][1: 1 + int(os.getenv("SIM_TOP_K", "5"))]
      recommendations = [
        {
          "id": entries[i].key,
          "score": float(sims[i]),
        }
        for i in top_indices
        if sims[i] > float(os.getenv("SIM_THRESHOLD", "0.65"))
      ]

      if not recommendations:
        continue

      LOGGER.info(
        "Embedding %s => %d recommendations (top score %.3f)",
        entry.key,
        len(recommendations),
        recommendations[0]["score"],
      )

      neo4j_session.run(
        """
        MERGE (src:Embedding {id:$sourceId})
        SET src.metadata = $metadata,
            src.updatedAt = datetime()
        WITH src
        UNWIND $recs AS rec
          MERGE (dst:Embedding {id:rec.id})
          MERGE (src)-[r:RELATED]->(dst)
          SET r.score = rec.score,
              r.updatedAt = datetime()
        """,
        sourceId=entry.key,
        metadata=entry.metadata,
        recs=recommendations,
      )
  finally:
    neo4j_session.close()


def main():
  ensure_tensorrt_container()
  redis_client = connect_redis()
  driver = connect_neo4j()

  entries = load_recent_embeddings(redis_client, limit=int(os.getenv("REDIS_BATCH_LIMIT", "128")))
  process_embeddings(entries, driver)

  driver.close()
  LOGGER.info("Tensor cache job complete.")


if __name__ == "__main__":
  try:
    main()
  except KeyboardInterrupt:
    LOGGER.info("Interrupted by user, exiting.")
    sys.exit(0)

