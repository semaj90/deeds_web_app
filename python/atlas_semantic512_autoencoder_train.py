#!/usr/bin/env python3
"""Train Parent Atlas routing autoencoder from canonical Qdrant semantic_512.

Canonical evidence stays in Qdrant `codebase_chunks_512` (cosine, 512d).
This script derives a revisioned routing-only latent_64 representation:

    semantic_512 -> Linear(512,256)+ReLU -> Linear(256,64) -> L2 normalize

and a symmetric decoder for reconstruction training. It never generates packet
identity, tree_node_id, feature_label, or semantic evidence. Those fields are
copied from the canonical payload when present.

Outputs:
- PyTorch checkpoint (`--model-out`)
- JSON training receipt (`--receipt-out`)
- optional NDJSON latent rows (`--latent-out`) for the cuML KMeans endpoint

The script fails closed if a training row lacks packet_key/source_revision or is
not exactly 512 dimensions. This deliberately prevents the older anonymous
Qdrant corpus from becoming the source of a new supposedly-canonical latent.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset, random_split

SEMANTIC_DIM = 512
HIDDEN_DIM = 256
LATENT_DIM = 64
REPRESENTATION_ID = "semantic_512"
LATENT_REPRESENTATION_ID = "latent_64"
COLLECTION = "codebase_chunks_512"
ALGORITHM_REVISION = "atlas.semantic512-autoencoder.512-256-64.v1"


@dataclass(frozen=True)
class Identity:
    point_id: str
    packet_key: str
    source_revision: str
    symbol_version_id: str | None
    tree_node_id: str | None
    feature_label: str | None


class RoutingAutoencoder(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(SEMANTIC_DIM, HIDDEN_DIM),
            nn.ReLU(),
            nn.Linear(HIDDEN_DIM, LATENT_DIM),
        )
        self.decoder = nn.Sequential(
            nn.Linear(LATENT_DIM, HIDDEN_DIM),
            nn.ReLU(),
            nn.Linear(HIDDEN_DIM, SEMANTIC_DIM),
        )

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        return torch.nn.functional.normalize(self.encoder(x), p=2, dim=1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        z_raw = self.encoder(x)
        reconstructed = self.decoder(z_raw)
        return reconstructed, torch.nn.functional.normalize(z_raw, p=2, dim=1)


def http_json(url: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="GET" if body is None else "POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:  # nosec B310 - operator-configured local Qdrant
        return json.load(response)


def l2_normalize(vector: list[float]) -> np.ndarray:
    if len(vector) != SEMANTIC_DIM:
        raise ValueError(f"expected {SEMANTIC_DIM} values, got {len(vector)}")
    array = np.asarray(vector, dtype=np.float32)
    if not np.isfinite(array).all():
        raise ValueError("vector contains non-finite values")
    norm = float(np.linalg.norm(array))
    if norm <= 0:
        raise ValueError("zero-norm vector")
    return array / norm


def scroll_qdrant(qdrant_url: str, limit: int | None) -> tuple[list[Identity], np.ndarray]:
    identities: list[Identity] = []
    vectors: list[np.ndarray] = []
    offset: Any = None
    while limit is None or len(vectors) < limit:
        page_limit = min(256, (limit - len(vectors)) if limit is not None else 256)
        body: dict[str, Any] = {
            "limit": page_limit,
            "with_payload": True,
            "with_vector": True,
        }
        if offset is not None:
            body["offset"] = offset
        result = http_json(f"{qdrant_url.rstrip('/')}/collections/{COLLECTION}/points/scroll", body).get("result", {})
        points = result.get("points", [])
        if not points:
            break
        for point in points:
            payload = point.get("payload") or {}
            packet_key = str(payload.get("packet_key") or "").strip()
            source_revision = str(payload.get("source_revision") or "").strip()
            if not packet_key or not source_revision:
                raise ValueError(
                    f"point {point.get('id')} lacks packet_key/source_revision; canonical AE training refuses anonymous rows"
                )
            raw_vector = point.get("vector")
            if isinstance(raw_vector, dict):
                # `codebase_chunks_512` is expected to be unnamed-vector. Accept a
                # single named vector only for migration diagnostics, not ambiguity.
                values = list(raw_vector.values())
                if len(values) != 1:
                    raise ValueError(f"point {point.get('id')} has ambiguous named vectors")
                raw_vector = values[0]
            if not isinstance(raw_vector, list):
                raise ValueError(f"point {point.get('id')} missing vector")
            vectors.append(l2_normalize(raw_vector))
            identities.append(
                Identity(
                    point_id=str(point.get("id")),
                    packet_key=packet_key,
                    source_revision=source_revision,
                    symbol_version_id=None if payload.get("symbol_version_id") is None else str(payload.get("symbol_version_id")),
                    tree_node_id=None if payload.get("tree_node_id") is None else str(payload.get("tree_node_id")),
                    feature_label=None if payload.get("feature_label") is None else str(payload.get("feature_label")),
                )
            )
            if limit is not None and len(vectors) >= limit:
                break
        offset = result.get("next_page_offset")
        if offset is None:
            break
    if not vectors:
        raise ValueError(f"no canonical {SEMANTIC_DIM}d vectors found in {COLLECTION}")
    return identities, np.stack(vectors)


def identity_checksum(rows: list[Identity]) -> str:
    payload = [row.__dict__ for row in rows]
    return hashlib.sha256(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()).hexdigest()


def train(
    matrix: np.ndarray,
    *,
    seed: int,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    weight_decay: float,
    validation_fraction: float,
) -> tuple[RoutingAutoencoder, dict[str, Any]]:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    tensor = torch.from_numpy(matrix)
    dataset = TensorDataset(tensor)
    validation_size = max(1, int(len(dataset) * validation_fraction)) if len(dataset) > 1 else 0
    train_size = len(dataset) - validation_size
    if train_size <= 0:
        raise ValueError("not enough rows for train/validation split")
    generator = torch.Generator().manual_seed(seed)
    train_set, validation_set = random_split(dataset, [train_size, validation_size], generator=generator)
    train_loader = DataLoader(train_set, batch_size=min(batch_size, train_size), shuffle=True, generator=generator)
    validation_loader = DataLoader(validation_set, batch_size=min(batch_size, max(1, validation_size)), shuffle=False) if validation_size else None

    model = RoutingAutoencoder().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
    loss_fn = nn.MSELoss()
    history: list[dict[str, float]] = []
    best_validation = math.inf
    best_state: dict[str, torch.Tensor] | None = None

    started = time.perf_counter()
    peak_vram = 0
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        samples = 0
        for (batch,) in train_loader:
            batch = batch.to(device)
            optimizer.zero_grad(set_to_none=True)
            reconstructed, _ = model(batch)
            loss = loss_fn(reconstructed, batch)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach()) * len(batch)
            samples += len(batch)
        train_loss = total_loss / max(1, samples)

        validation_loss = train_loss
        if validation_loader is not None:
            model.eval()
            total = 0.0
            count = 0
            with torch.no_grad():
                for (batch,) in validation_loader:
                    batch = batch.to(device)
                    reconstructed, _ = model(batch)
                    loss = loss_fn(reconstructed, batch)
                    total += float(loss) * len(batch)
                    count += len(batch)
            validation_loss = total / max(1, count)

        if validation_loss < best_validation:
            best_validation = validation_loss
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        history.append({"epoch": epoch + 1, "trainMse": train_loss, "validationMse": validation_loss})
        if device.type == "cuda":
            peak_vram = max(peak_vram, int(torch.cuda.max_memory_allocated(device)))

    if best_state is not None:
        model.load_state_dict(best_state)
    duration_ms = (time.perf_counter() - started) * 1000
    return model.cpu(), {
        "device": str(device),
        "durationMs": round(duration_ms, 3),
        "peakVramBytes": peak_vram,
        "bestValidationMse": best_validation,
        "history": history,
        "trainRows": train_size,
        "validationRows": validation_size,
    }


def encode_all(model: RoutingAutoencoder, matrix: np.ndarray, batch_size: int) -> np.ndarray:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device).eval()
    output: list[np.ndarray] = []
    with torch.no_grad():
        for start in range(0, len(matrix), batch_size):
            batch = torch.from_numpy(matrix[start : start + batch_size]).to(device)
            output.append(model.encode(batch).cpu().numpy().astype(np.float32))
    return np.concatenate(output, axis=0)


def state_digest(model: RoutingAutoencoder) -> str:
    digest = hashlib.sha256()
    for name, tensor in sorted(model.state_dict().items()):
        digest.update(name.encode())
        digest.update(tensor.detach().cpu().numpy().tobytes())
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qdrant-url", default="http://127.0.0.1:6333")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-5)
    parser.add_argument("--validation-fraction", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--model-out", type=Path, default=Path("data/atlas-ml/semantic512-autoencoder.pt"))
    parser.add_argument("--receipt-out", type=Path, default=Path("data/atlas-ml/semantic512-autoencoder-receipt.json"))
    parser.add_argument("--latent-out", type=Path, default=Path("data/atlas-ml/semantic512-latent64.ndjson"))
    args = parser.parse_args()

    identities, matrix = scroll_qdrant(args.qdrant_url, args.limit)
    model, metrics = train(
        matrix,
        seed=args.seed,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        weight_decay=args.weight_decay,
        validation_fraction=args.validation_fraction,
    )
    latents = encode_all(model, matrix, args.batch_size)
    model_digest = state_digest(model)

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "algorithmRevision": ALGORITHM_REVISION,
            "sourceRepresentationId": REPRESENTATION_ID,
            "sourceDimension": SEMANTIC_DIM,
            "latentRepresentationId": LATENT_REPRESENTATION_ID,
            "latentDimension": LATENT_DIM,
            "seed": args.seed,
            "modelDigest": model_digest,
            "stateDict": model.state_dict(),
        },
        args.model_out,
    )

    args.latent_out.parent.mkdir(parents=True, exist_ok=True)
    with args.latent_out.open("w", encoding="utf-8") as handle:
        for identity, latent in zip(identities, latents):
            handle.write(
                json.dumps(
                    {
                        "packetKey": identity.packet_key,
                        "sourceRevision": identity.source_revision,
                        "symbolVersionId": identity.symbol_version_id,
                        "treeNodeId": identity.tree_node_id,
                        "featureLabel": identity.feature_label,
                        "vector": latent.tolist(),
                        "sourceRepresentationId": REPRESENTATION_ID,
                        "latentRepresentationId": LATENT_REPRESENTATION_ID,
                        "autoencoderRevision": model_digest,
                    },
                    separators=(",", ":"),
                )
                + "\n"
            )

    receipt = {
        "schema": "atlas.autoencoder-training-receipt.v1",
        "algorithmRevision": ALGORITHM_REVISION,
        "sourceCollection": COLLECTION,
        "sourceRepresentationId": REPRESENTATION_ID,
        "sourceDimension": SEMANTIC_DIM,
        "hiddenDimension": HIDDEN_DIM,
        "latentRepresentationId": LATENT_REPRESENTATION_ID,
        "latentDimension": LATENT_DIM,
        "rowCount": len(identities),
        "identityManifestChecksum": identity_checksum(identities),
        "modelDigest": model_digest,
        "seed": args.seed,
        "epochs": args.epochs,
        "batchSize": args.batch_size,
        "learningRate": args.lr,
        "weightDecay": args.weight_decay,
        "metrics": metrics,
        "modelPath": str(args.model_out),
        "latentPath": str(args.latent_out),
    }
    args.receipt_out.parent.mkdir(parents=True, exist_ok=True)
    args.receipt_out.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
