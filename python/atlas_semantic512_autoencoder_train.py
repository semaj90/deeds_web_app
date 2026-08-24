#!/usr/bin/env python3
"""Train Parent Atlas routing autoencoder from reconciled semantic_512 rows.

Training admission is intentionally two-step:
1. `atlas_semantic512_reconcile.py` proves Qdrant point -> codebase chunk -> atlas packet lineage.
2. This trainer consumes ONLY ADMITTED rows from that manifest, verifies its checksum
   against the reconciliation receipt, retrieves those exact point IDs from Qdrant,
   verifies each 512-vector digest, then trains 512 -> 256 -> 64.

No `source_revision` is required or invented. Offline lineage is:
packet_key + source_ref + representation lineage + source-version receipt +
reconciliation receipt.
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
ALGORITHM_REVISION = "atlas.semantic512-autoencoder.512-256-64.v2-reconciled"


@dataclass(frozen=True)
class Identity:
    point_id: int | str
    packet_key: str
    source_ref: str
    source_version_receipt_id: str
    reconciliation_receipt_id: str
    workspace_revision: int | None
    representation_revision: int | None
    source_representation_id: str
    source_dimension: int
    vector_digest: str
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


def http_json(url: str, body: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:  # nosec B310 - operator local Qdrant
        return json.load(response)


def canonical_manifest_bytes(path: Path) -> bytes:
    # Reconciliation already writes canonical JSON one object per line. Preserve
    # bytes exactly so the reviewed checksum remains the training gate.
    return path.read_bytes()


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


def vector_digest(vector: list[float]) -> str:
    values = np.asarray(vector, dtype=np.float32)
    if values.shape != (SEMANTIC_DIM,) or not np.isfinite(values).all():
        raise ValueError("invalid semantic_512 vector for digest")
    return hashlib.sha256(values.tobytes(order="C")).hexdigest()


def load_reconciliation(
    manifest_path: Path,
    receipt_path: Path,
    limit: int | None,
    *,
    allow_duplicate_packet_keys: bool = False,
) -> tuple[list[Identity], dict[str, Any]]:
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("schema") != "atlas.semantic512-reconciliation-receipt.v1":
        raise ValueError("unsupported reconciliation receipt schema")
    if receipt.get("collection") != COLLECTION or receipt.get("representationId") != REPRESENTATION_ID:
        raise ValueError("reconciliation receipt collection/representation mismatch")
    if int(receipt.get("dimension") or 0) != SEMANTIC_DIM:
        raise ValueError("reconciliation receipt dimension mismatch")

    raw_manifest = canonical_manifest_bytes(manifest_path)
    actual_checksum = hashlib.sha256(raw_manifest).hexdigest()
    expected_checksum = str(receipt.get("manifestChecksum") or "")
    if not expected_checksum or actual_checksum != expected_checksum:
        raise ValueError(
            f"reconciliation manifest checksum mismatch: expected {expected_checksum}, got {actual_checksum}"
        )
    receipt_id = str(receipt.get("receiptId") or "").strip()
    if not receipt_id:
        raise ValueError("reconciliation receipt missing receiptId")

    rows: list[Identity] = []
    seen_packets: set[str] = set()
    for line_number, raw in enumerate(raw_manifest.decode("utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        value = json.loads(raw)
        if value.get("status") != "ADMITTED":
            continue
        canonical = value.get("canonical") or {}
        representation = value.get("representation") or {}
        packet_key = str(canonical.get("packetKey") or "").strip()
        source_ref = str(canonical.get("sourceRef") or "").strip()
        source_version_receipt_id = str(value.get("sourceVersionReceiptId") or "").strip()
        digest = str(representation.get("vectorDigest") or "").strip()
        if not packet_key or not source_ref or not source_version_receipt_id or not digest:
            raise ValueError(f"line {line_number}: admitted row lacks canonical lineage")
        if packet_key in seen_packets and not allow_duplicate_packet_keys:
            raise ValueError(f"line {line_number}: duplicate admitted packet_key {packet_key}")
        if representation.get("representationId") != REPRESENTATION_ID:
            raise ValueError(f"line {line_number}: wrong representation")
        if int(representation.get("dimension") or 0) != SEMANTIC_DIM:
            raise ValueError(f"line {line_number}: wrong vector dimension")
        seen_packets.add(packet_key)
        rows.append(
            Identity(
                point_id=value.get("pointId"),
                packet_key=packet_key,
                source_ref=source_ref,
                source_version_receipt_id=source_version_receipt_id,
                reconciliation_receipt_id=receipt_id,
                workspace_revision=canonical.get("workspaceRevision"),
                representation_revision=canonical.get("representationRevision"),
                source_representation_id=REPRESENTATION_ID,
                source_dimension=SEMANTIC_DIM,
                vector_digest=digest,
                symbol_version_id=None,
                tree_node_id=None if canonical.get("treeNodeId") is None else str(canonical.get("treeNodeId")),
                feature_label=None if canonical.get("featureLabel") is None else str(canonical.get("featureLabel")),
            )
        )
        if limit is not None and len(rows) >= limit:
            break
    if not rows:
        raise ValueError("reconciliation manifest has no ADMITTED rows")
    return rows, receipt


def retrieve_vectors(qdrant_url: str, identities: list[Identity], batch_size: int = 256) -> np.ndarray:
    by_id = {str(identity.point_id): identity for identity in identities}
    vectors: dict[str, np.ndarray] = {}
    base = qdrant_url.rstrip("/")
    for start in range(0, len(identities), batch_size):
        batch = identities[start : start + batch_size]
        result = http_json(
            f"{base}/collections/{COLLECTION}/points",
            {"ids": [row.point_id for row in batch], "with_payload": False, "with_vector": True},
        ).get("result", [])
        for point in result:
            point_id = str(point.get("id"))
            identity = by_id.get(point_id)
            if identity is None:
                continue
            raw_vector = point.get("vector")
            if isinstance(raw_vector, dict):
                values = list(raw_vector.values())
                if len(values) != 1:
                    raise ValueError(f"point {point_id} has ambiguous named vectors")
                raw_vector = values[0]
            if not isinstance(raw_vector, list):
                raise ValueError(f"point {point_id} missing vector")
            if vector_digest(raw_vector) != identity.vector_digest:
                raise ValueError(f"point {point_id} vector digest changed since reconciliation")
            vectors[point_id] = l2_normalize(raw_vector)

    missing = [str(row.point_id) for row in identities if str(row.point_id) not in vectors]
    if missing:
        raise ValueError(f"Qdrant points disappeared after reconciliation: {missing[:10]}")
    return np.stack([vectors[str(row.point_id)] for row in identities])


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
        torch.cuda.reset_peak_memory_stats()
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

    if best_state is not None:
        model.load_state_dict(best_state)
    duration_ms = (time.perf_counter() - started) * 1000
    peak_vram = int(torch.cuda.max_memory_allocated(device)) if device.type == "cuda" else 0
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
    parser.add_argument("--reconciliation-manifest", type=Path, default=Path("data/atlas-ml/semantic512-reconciliation.ndjson"))
    parser.add_argument("--reconciliation-receipt", type=Path, default=Path("data/atlas-ml/semantic512-reconciliation-receipt.json"))
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

    identities, reconciliation_receipt = load_reconciliation(
        args.reconciliation_manifest,
        args.reconciliation_receipt,
        args.limit,
    )
    matrix = retrieve_vectors(args.qdrant_url, identities)
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
            "reconciliationReceiptId": reconciliation_receipt["receiptId"],
            "reconciliationManifestChecksum": reconciliation_receipt["manifestChecksum"],
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
                        "sourceRef": identity.source_ref,
                        "sourceRevision": None,
                        "sourceVersionReceiptId": identity.source_version_receipt_id,
                        "reconciliationReceiptId": identity.reconciliation_receipt_id,
                        "workspaceRevision": identity.workspace_revision,
                        "representationRevision": identity.representation_revision,
                        "sourceRepresentationId": identity.source_representation_id,
                        "sourceDimension": identity.source_dimension,
                        "semanticVectorDigest": identity.vector_digest,
                        "symbolVersionId": identity.symbol_version_id,
                        "treeNodeId": identity.tree_node_id,
                        "featureLabel": identity.feature_label,
                        "vector": latent.tolist(),
                        "latentRepresentationId": LATENT_REPRESENTATION_ID,
                        "autoencoderRevision": model_digest,
                    },
                    separators=(",", ":"),
                    sort_keys=True,
                )
                + "\n"
            )

    receipt = {
        "schema": "atlas.autoencoder-training-receipt.v2",
        "algorithmRevision": ALGORITHM_REVISION,
        "sourceCollection": COLLECTION,
        "sourceRepresentationId": REPRESENTATION_ID,
        "sourceDimension": SEMANTIC_DIM,
        "hiddenDimension": HIDDEN_DIM,
        "latentRepresentationId": LATENT_REPRESENTATION_ID,
        "latentDimension": LATENT_DIM,
        "rowCount": len(identities),
        "identityManifestChecksum": identity_checksum(identities),
        "reconciliationReceiptId": reconciliation_receipt["receiptId"],
        "reconciliationManifestChecksum": reconciliation_receipt["manifestChecksum"],
        "sourceRevisionPolicy": "ABSENT_DO_NOT_FABRICATE",
        "inputNormalization": "L2_VECTOR",
        "latentNormalization": "L2_VECTOR",
        "trainingRegularization": "ADAMW_WEIGHT_DECAY",
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
    args.receipt_out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
