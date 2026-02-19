"""
Phase 66 – Topic pipeline for YoRHa Legal AI

Takes a batch of embeddings for chunks (N, D) + metadata, then:
  - Trains a small autoencoder (optional but recommended)
  - Projects embeddings to a latent space
  - Runs k-means in latent space for topic clusters
  - Runs MiniSom in latent space for 2D topic coordinates
  - Writes everything to:
      * pgvector table (vectors)
      * Qdrant collection (legal_vectors)
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from sklearn.cluster import KMeans
from minisom import MiniSom

from sqlalchemy import insert, Engine

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm


# ---------- Data model ----------

@dataclass
class ChunkMeta:
  """Minimal metadata we need per chunk."""
  id: str                 # "docId:shardId:chunkIndex:checkpoint"
  case_id: str
  doc_id: str
  shard_id: int
  chunk_index: int
  checkpoint: int
  tags: List[str]
  severity: Optional[float] = None


# ---------- Autoencoder ----------

class AE(nn.Module):
  def __init__(self, input_dim: int, latent_dim: int = 64):
    super().__init__()
    self.encoder = nn.Sequential(
      nn.Linear(input_dim, 256),
      nn.ReLU(),
      nn.Linear(256, latent_dim),
    )
    self.decoder = nn.Sequential(
      nn.Linear(latent_dim, 256),
      nn.ReLU(),
      nn.Linear(256, input_dim),
    )

  def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
    z = self.encoder(x)
    x_hat = self.decoder(z)
    return x_hat, z


def train_autoencoder(
  embeddings_np: np.ndarray,
  latent_dim: int = 64,
  epochs: int = 5,
  batch_size: int = 256,
  lr: float = 1e-3,
  device: Optional[str] = None,
) -> Tuple[AE, np.ndarray]:
  """
  Train a tiny autoencoder on embeddings and return:
    - trained model
    - latent representations (N, latent_dim)
  """
  if device is None:
    device = "cuda" if torch.cuda.is_available() else "cpu"

  N, D = embeddings_np.shape
  model = AE(input_dim=D, latent_dim=latent_dim).to(device)

  x = torch.from_numpy(embeddings_np).float().to(device)
  ds = TensorDataset(x)
  dl = DataLoader(ds, batch_size=batch_size, shuffle=True)

  opt = torch.optim.Adam(model.parameters(), lr=lr)
  loss_fn = nn.MSELoss()

  model.train()
  for epoch in range(epochs):
    total_loss = 0.0
    for (batch_x,) in dl:
      opt.zero_grad()
      x_hat, _ = model(batch_x)
      loss = loss_fn(x_hat, batch_x)
      loss.backward()
      opt.step()
      total_loss += loss.item() * batch_x.size(0)
    avg_loss = total_loss / N
    print(f"[AE] epoch {epoch+1}/{epochs}  loss={avg_loss:.6f}")

  # Compute latent representations
  model.eval()
  with torch.no_grad():
    _, z = model(x)
  z_np = z.detach().cpu().numpy()
  return model, z_np


# ---------- k-means + SOM ----------

def run_kmeans(latent_np: np.ndarray, k: int = 32) -> Tuple[np.ndarray, np.ndarray]:
  """
  latent_np: (N, latent_dim)
  Returns:
    labels: (N,)
    centers: (k, latent_dim)
  """
  km = KMeans(n_clusters=k, n_init="auto", random_state=42)
  km.fit(latent_np)
  labels = km.labels_
  centers = km.cluster_centers_
  return labels, centers


def run_som(latent_np: np.ndarray, map_size: Tuple[int, int] = (20, 20)) -> np.ndarray:
  """
  Train MiniSom on latent vectors.
  Returns som_coords: (N, 2) with values in [0, 1]x[0,1] normalized.
  """
  x_len, y_len = map_size
  dim = latent_np.shape[1]

  som = MiniSom(x_len, y_len, dim, sigma=1.0, learning_rate=0.5)
  som.random_weights_init(latent_np)
  som.train_random(latent_np, 1000)

  coords = np.array([som.winner(v) for v in latent_np], dtype=np.float32)  # (N, 2)
  # Normalize to [0,1] for UI placement
  coords[:, 0] = coords[:, 0] / max(1, x_len - 1)
  coords[:, 1] = coords[:, 1] / max(1, y_len - 1)
  return coords  # (N, 2)


# ---------- Persistence helpers ----------

def upsert_qdrant_points(
  client: QdrantClient,
  collection_name: str,
  embeddings_np: np.ndarray,
  metas: List[ChunkMeta],
  topic_labels: np.ndarray,
  som_coords: np.ndarray,
):
  """
  Write points into Qdrant with payloads compatible with the Svelte evidence board.
  """
  points: List[qm.PointStruct] = []

  for i, meta in enumerate(metas):
    payload: Dict[str, Any] = {
      "case_id": meta.case_id,
      "doc_id": meta.doc_id,
      "shard_id": meta.shard_id,
      "chunk_index": meta.chunk_index,
      "checkpoint": meta.checkpoint,
      "tags": meta.tags,
      "topic_id": int(topic_labels[i]),
      "som_x": float(som_coords[i, 0]),
      "som_y": float(som_coords[i, 1]),
    }
    if meta.severity is not None:
      payload["severity"] = float(meta.severity)

    points.append(
      qm.PointStruct(
        id=meta.id,
        vector=embeddings_np[i].tolist(),
        payload=payload,
      )
    )

  client.upsert(collection_name=collection_name, points=points)


def insert_pgvector_rows(
  engine: Engine,
  vectors_table,
  embeddings_np: np.ndarray,
  latent_np: np.ndarray,
  metas: List[ChunkMeta],
  topic_labels: np.ndarray,
  som_coords: np.ndarray,
):
  """
  Bulk insert into a pgvector-backed table.
  Assumes `vectors_table` has at least:
    id, case_id, doc_id, shard_id, chunk_index, checkpoint,
    embedding, latent, topic_id, som_x, som_y, tags, severity
  """
  rows: List[Dict[str, Any]] = []
  for i, meta in enumerate(metas):
    rows.append(
      {
        "id": meta.id,
        "case_id": meta.case_id,
        "doc_id": meta.doc_id,
        "shard_id": meta.shard_id,
        "chunk_index": meta.chunk_index,
        "checkpoint": meta.checkpoint,
        "embedding": embeddings_np[i].tolist(),
        "latent": latent_np[i].tolist(),
        "topic_id": int(topic_labels[i]),
        "som_x": float(som_coords[i, 0]),
        "som_y": float(som_coords[i, 1]),
        "tags": meta.tags,
        "severity": meta.severity,
      }
    )

  with engine.begin() as conn:
    conn.execute(insert(vectors_table), rows)


# ---------- Main pipeline entrypoint ----------

def run_topic_pipeline(
  embeddings_np: np.ndarray,
  metas: List[ChunkMeta],
  *,
  case_id: Optional[str] = None,
  qdrant_client: Optional[QdrantClient] = None,
  qdrant_collection: str = "legal_vectors",
  pg_engine: Optional[Engine] = None,
  pg_vectors_table=None,
  latent_dim: int = 64,
  k_topics: int = 32,
  som_map_size: Tuple[int, int] = (20, 20),
):
  """
  High-level pipeline:
    1) normalize/clean embeddings
    2) train AE → latent vectors
    3) k-means in latent space
    4) SOM coordinates in latent space
    5) write to Qdrant + pgvector

  `metas` length must match embeddings_np rows.
  If `case_id` is provided, it will overwrite meta.case_id to keep things consistent.
  """

  assert len(metas) == embeddings_np.shape[0], "metas and embeddings must have same length"

  # optionally enforce case_id
  if case_id is not None:
    for m in metas:
      m.case_id = case_id

  # --- 1) basic normalization ---
  # (optional) mean-center & L2-normalize for stability; Qdrant can also normalize internally.
  eps = 1e-8
  norms = np.linalg.norm(embeddings_np, axis=1, keepdims=True) + eps
  embeddings_norm = embeddings_np / norms

  # --- 2) autoencoder / latent space ---
  _, latent_np = train_autoencoder(
    embeddings_norm,
    latent_dim=latent_dim,
    epochs=5,        # adjust for quality vs speed
    batch_size=256,
  )

  # --- 3) k-means topics ---
  topic_labels, _ = run_kmeans(latent_np, k=k_topics)

  # --- 4) SOM coordinates ---
  som_coords = run_som(latent_np, map_size=som_map_size)

  # --- 5) persist ---

  if qdrant_client is not None:
    upsert_qdrant_points(
      client=qdrant_client,
      collection_name=qdrant_collection,
      embeddings_np=embeddings_norm,
      metas=metas,
      topic_labels=topic_labels,
      som_coords=som_coords,
    )

  if pg_engine is not None and pg_vectors_table is not None:
    insert_pgvector_rows(
      engine=pg_engine,
      vectors_table=pg_vectors_table,
      embeddings_np=embeddings_norm,
      latent_np=latent_np,
      metas=metas,
      topic_labels=topic_labels,
      som_coords=som_coords,
    )

  print(
    f"[topic_pipeline] processed {len(metas)} vectors → "
    f"{k_topics} topics, SOM map {som_map_size[0]}x{som_map_size[1]}"
  )