"""Nested semantic autoencoder reference for Parent Atlas.

The model compresses exact semantic_768 rows into one physical latent_128 row.
latent_64 is the first 64 coordinates of latent_128, so hot and warm tiers do
not need independent vector copies. Both bottlenecks have reconstruction heads.

This module is a derived-routing experiment. It never promotes latent vectors to
canonical semantic evidence; exact semantic_768 remains the refinement oracle.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from typing import Any, Iterable

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


@dataclass(frozen=True)
class NestedAutoencoderConfig:
    input_dim: int = 768
    hidden_dim: int = 384
    latent256_dim: int = 256
    latent128_dim: int = 128
    latent64_dim: int = 64
    reconstruction_256_weight: float = 1.0
    reconstruction_128_weight: float = 0.85
    reconstruction_64_weight: float = 0.7
    cosine_weight: float = 0.25
    pairwise_weight: float = 0.10
    seed: int = 0xA71A5

    def validate(self) -> None:
        if self.input_dim != 768:
            raise ValueError("Parent Atlas canonical semantic dimension must remain 768")
        if self.latent256_dim != 256 or self.latent128_dim != 128 or self.latent64_dim != 64:
            raise ValueError("reference nested dimensions must be 256, 128, and 64")
        if self.latent64_dim > self.latent128_dim or self.latent128_dim > self.latent256_dim:
            raise ValueError("nesting must satisfy latent64 <= latent128 <= latent256")
        for name in (
            "reconstruction_256_weight",
            "reconstruction_128_weight",
            "reconstruction_64_weight",
            "cosine_weight",
            "pairwise_weight",
        ):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be non-negative")


class NestedSemanticAutoencoder(nn.Module):
    """768 -> 256, with latent128 == latent256[..., :128] and latent64 == latent128[..., :64].

    Three-tier Matryoshka-style nesting: one physical encoder produces latent256; latent128 and
    latent64 are prefix + L2-renormalize views of it, not independently learned branches. This is
    the same nesting principle as v1 (which only had a 128/64 tier), extended one level up so the
    learned representation can compete with semantic_mrl_256 at a comparable dimension.
    """

    def __init__(self, config: NestedAutoencoderConfig | None = None) -> None:
        super().__init__()
        self.config = config or NestedAutoencoderConfig()
        self.config.validate()
        torch.manual_seed(self.config.seed)
        self.encoder = nn.Sequential(
            nn.Linear(self.config.input_dim, self.config.hidden_dim),
            nn.GELU(),
            nn.Linear(self.config.hidden_dim, self.config.latent256_dim),
            nn.LayerNorm(self.config.latent256_dim),
        )
        self.decoder256 = nn.Sequential(
            nn.Linear(self.config.latent256_dim, self.config.hidden_dim),
            nn.GELU(),
            nn.Linear(self.config.hidden_dim, self.config.input_dim),
        )
        self.decoder128 = nn.Sequential(
            nn.Linear(self.config.latent128_dim, self.config.hidden_dim),
            nn.GELU(),
            nn.Linear(self.config.hidden_dim, self.config.input_dim),
        )
        self.decoder64 = nn.Sequential(
            nn.Linear(self.config.latent64_dim, self.config.hidden_dim),
            nn.GELU(),
            nn.Linear(self.config.hidden_dim, self.config.input_dim),
        )

    def encode(self, semantic_768: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        if semantic_768.ndim != 2 or semantic_768.shape[1] != self.config.input_dim:
            raise ValueError(f"expected [N,{self.config.input_dim}] semantic matrix")
        latent256 = F.normalize(self.encoder(semantic_768), p=2, dim=-1)
        latent128 = F.normalize(latent256[:, : self.config.latent128_dim], p=2, dim=-1)
        latent64 = F.normalize(latent128[:, : self.config.latent64_dim], p=2, dim=-1)
        return latent256, latent128, latent64

    def decode256(self, latent256: torch.Tensor) -> torch.Tensor:
        return F.normalize(self.decoder256(latent256), p=2, dim=-1)

    def decode128(self, latent128: torch.Tensor) -> torch.Tensor:
        return F.normalize(self.decoder128(latent128), p=2, dim=-1)

    def decode64(self, latent64: torch.Tensor) -> torch.Tensor:
        return F.normalize(self.decoder64(latent64), p=2, dim=-1)

    def forward(self, semantic_768: torch.Tensor) -> dict[str, torch.Tensor]:
        source = F.normalize(semantic_768, p=2, dim=-1)
        latent256, latent128, latent64 = self.encode(source)
        decoded256 = self.decode256(latent256)
        decoded128 = self.decode128(latent128)
        decoded64 = self.decode64(latent64)
        return {
            "source": source,
            "latent256": latent256,
            "latent128": latent128,
            "latent64": latent64,
            "decoded256": decoded256,
            "decoded128": decoded128,
            "decoded64": decoded64,
        }


def _pairwise_cosine(matrix: torch.Tensor) -> torch.Tensor:
    normalized = F.normalize(matrix, p=2, dim=-1)
    return normalized @ normalized.T


def nested_autoencoder_loss(
    outputs: dict[str, torch.Tensor],
    config: NestedAutoencoderConfig | None = None,
) -> tuple[torch.Tensor, dict[str, float]]:
    cfg = config or NestedAutoencoderConfig()
    source = outputs["source"]
    decoded256 = outputs["decoded256"]
    decoded128 = outputs["decoded128"]
    decoded64 = outputs["decoded64"]

    mse256 = F.mse_loss(decoded256, source)
    mse128 = F.mse_loss(decoded128, source)
    mse64 = F.mse_loss(decoded64, source)
    cos256 = 1.0 - F.cosine_similarity(decoded256, source, dim=-1).mean()
    cos128 = 1.0 - F.cosine_similarity(decoded128, source, dim=-1).mean()
    cos64 = 1.0 - F.cosine_similarity(decoded64, source, dim=-1).mean()

    if source.shape[0] > 1:
        source_pairs = _pairwise_cosine(source)
        latent256_pairs = _pairwise_cosine(outputs["latent256"])
        latent128_pairs = _pairwise_cosine(outputs["latent128"])
        latent64_pairs = _pairwise_cosine(outputs["latent64"])
        pairwise = (1.0 / 3.0) * (
            F.mse_loss(latent256_pairs, source_pairs) +
            F.mse_loss(latent128_pairs, source_pairs) +
            F.mse_loss(latent64_pairs, source_pairs)
        )
    else:
        pairwise = source.new_zeros(())

    total = (
        cfg.reconstruction_256_weight * mse256 +
        cfg.reconstruction_128_weight * mse128 +
        cfg.reconstruction_64_weight * mse64 +
        cfg.cosine_weight * (cos256 + cos128 + cos64) +
        cfg.pairwise_weight * pairwise
    )
    metrics = {
        "loss": float(total.detach().cpu()),
        "mse256": float(mse256.detach().cpu()),
        "mse128": float(mse128.detach().cpu()),
        "mse64": float(mse64.detach().cpu()),
        "cosine_loss256": float(cos256.detach().cpu()),
        "cosine_loss128": float(cos128.detach().cpu()),
        "cosine_loss64": float(cos64.detach().cpu()),
        "pairwise_loss": float(pairwise.detach().cpu()),
    }
    return total, metrics


def exact_knn_indices(matrix: np.ndarray, k: int) -> np.ndarray:
    """Small CPU exact cosine oracle used only for proof fixtures."""
    values = np.asarray(matrix, dtype=np.float32)
    if values.ndim != 2:
        raise ValueError("matrix must be rank-2")
    if not 0 < k < len(values):
        raise ValueError("k must be positive and less than row count")
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    if np.any(norms <= 0):
        raise ValueError("zero-norm vector")
    values = values / norms
    scores = values @ values.T
    np.fill_diagonal(scores, -np.inf)
    order = np.argsort(-scores, axis=1, kind="stable")
    return order[:, :k]


def knn_recall(reference: np.ndarray, candidate: np.ndarray, k: int) -> float:
    reference_neighbors = exact_knn_indices(reference, k)
    candidate_neighbors = exact_knn_indices(candidate, k)
    overlap = 0
    for ref_row, candidate_row in zip(reference_neighbors, candidate_neighbors, strict=True):
        overlap += len(set(map(int, ref_row)).intersection(map(int, candidate_row)))
    return overlap / (len(reference_neighbors) * k)


def evaluate_nested_latents(
    semantic_768: np.ndarray,
    latent256: np.ndarray,
    latent128: np.ndarray,
    latent64: np.ndarray,
    decoded256: np.ndarray,
    decoded128: np.ndarray,
    decoded64: np.ndarray,
    *,
    k: int = 10,
) -> dict[str, float]:
    source = np.asarray(semantic_768, dtype=np.float32)
    source_norm = source / np.linalg.norm(source, axis=1, keepdims=True)
    decoded256_norm = decoded256 / np.linalg.norm(decoded256, axis=1, keepdims=True)
    decoded128_norm = decoded128 / np.linalg.norm(decoded128, axis=1, keepdims=True)
    decoded64_norm = decoded64 / np.linalg.norm(decoded64, axis=1, keepdims=True)
    return {
        "reconstruction_mse_256": float(np.mean((source_norm - decoded256_norm) ** 2)),
        "reconstruction_mse_128": float(np.mean((source_norm - decoded128_norm) ** 2)),
        "reconstruction_mse_64": float(np.mean((source_norm - decoded64_norm) ** 2)),
        "reconstruction_cosine_256": float(np.mean(np.sum(source_norm * decoded256_norm, axis=1))),
        "reconstruction_cosine_128": float(np.mean(np.sum(source_norm * decoded128_norm, axis=1))),
        "reconstruction_cosine_64": float(np.mean(np.sum(source_norm * decoded64_norm, axis=1))),
        "knn_recall_256": knn_recall(source_norm, latent256, k),
        "knn_recall_128": knn_recall(source_norm, latent128, k),
        "knn_recall_64": knn_recall(source_norm, latent64, k),
    }


def state_dict_checksum(model: nn.Module) -> str:
    digest = sha256()
    for name, tensor in sorted(model.state_dict().items()):
        digest.update(name.encode("utf-8"))
        digest.update(np.ascontiguousarray(tensor.detach().cpu().numpy()).tobytes())
    return digest.hexdigest()


def build_training_receipt(
    *,
    model: NestedSemanticAutoencoder,
    source_snapshot_revision: str,
    row_identity_checksum: str,
    metrics: dict[str, float],
    producer_revision: str,
) -> dict[str, Any]:
    return {
        "schema": "atlas.nested-semantic-autoencoder-training-receipt.v2",
        "source_semantic_snapshot_revision": source_snapshot_revision,
        "row_identity_checksum": row_identity_checksum,
        "config": asdict(model.config),
        "model_checksum": state_dict_checksum(model),
        "metrics": metrics,
        "latent128_is_prefix_of_latent256": True,
        "latent64_is_prefix_of_latent128": True,
        "exact_semantic_promotion_required": True,
        "canonical_authority": False,
        "producer_revision": producer_revision,
    }


def receipt_checksum(receipt: dict[str, Any]) -> str:
    encoded = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256(encoded).hexdigest()
