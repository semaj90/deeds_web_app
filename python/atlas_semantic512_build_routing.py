#!/usr/bin/env python3
"""Build the rebuildable Parent Atlas latent_64/KMeans Qdrant routing projection.

Consumes reconciled latent NDJSON emitted by atlas_semantic512_autoencoder_train.py,
runs the revisioned cuML KMeans executor, then optionally writes a separate
`codebase_topology_64_v2` collection. It never mutates semantic_512 vectors and
never invents source_revision.
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path
from typing import Any

from atlas_semantic512_runtime import Latent64KMeansRequest, Latent64Row, cluster_latent64

ROUTING_COLLECTION = "codebase_topology_64_v2"
LATENT_VECTOR_NAME = "latent_64"


def request_json(method: str, url: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:  # nosec B310 - operator local Qdrant
        return json.load(response)


def load_latents(path: Path) -> tuple[list[Latent64Row], str, str]:
    rows: list[Latent64Row] = []
    autoencoder_revisions: set[str] = set()
    reconciliation_receipts: set[str] = set()
    seen_packets: set[str] = set()
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        value = json.loads(raw)
        revision = str(value.get("autoencoderRevision") or "").strip()
        reconciliation_receipt_id = str(value.get("reconciliationReceiptId") or "").strip()
        source_version_receipt_id = str(value.get("sourceVersionReceiptId") or "").strip()
        packet_key = str(value.get("packetKey") or "").strip()
        source_ref = str(value.get("sourceRef") or "").strip()
        if not revision:
            raise ValueError(f"line {line_number}: missing autoencoderRevision")
        if not reconciliation_receipt_id or not source_version_receipt_id:
            raise ValueError(f"line {line_number}: missing reconciliation/source-version receipt")
        if not packet_key or not source_ref:
            raise ValueError(f"line {line_number}: missing packetKey/sourceRef")
        if packet_key in seen_packets:
            raise ValueError(f"line {line_number}: duplicate packetKey {packet_key}")
        if value.get("sourceRepresentationId") != "semantic_512" or int(value.get("sourceDimension") or 0) != 512:
            raise ValueError(f"line {line_number}: semantic representation lineage mismatch")
        seen_packets.add(packet_key)
        autoencoder_revisions.add(revision)
        reconciliation_receipts.add(reconciliation_receipt_id)
        rows.append(
            Latent64Row(
                packetKey=packet_key,
                sourceRef=source_ref,
                sourceRevision=None,
                sourceVersionReceiptId=source_version_receipt_id,
                reconciliationReceiptId=reconciliation_receipt_id,
                workspaceRevision=value.get("workspaceRevision"),
                representationRevision=value.get("representationRevision"),
                sourceRepresentationId="semantic_512",
                symbolVersionId=value.get("symbolVersionId"),
                treeNodeId=value.get("treeNodeId"),
                featureLabel=value.get("featureLabel"),
                vector=value.get("vector") or [],
            )
        )
    if not rows:
        raise ValueError("latent input is empty")
    if len(autoencoder_revisions) != 1:
        raise ValueError(f"latent input mixes autoencoder revisions: {sorted(autoencoder_revisions)}")
    if len(reconciliation_receipts) != 1:
        raise ValueError(f"latent input mixes reconciliation receipts: {sorted(reconciliation_receipts)}")
    return rows, next(iter(autoencoder_revisions)), next(iter(reconciliation_receipts))


def ensure_collection(qdrant_url: str) -> None:
    base = qdrant_url.rstrip("/")
    try:
        request_json("GET", f"{base}/collections/{ROUTING_COLLECTION}")
        return
    except Exception:
        pass
    request_json(
        "PUT",
        f"{base}/collections/{ROUTING_COLLECTION}",
        {
            "vectors": {
                LATENT_VECTOR_NAME: {
                    "size": 64,
                    "distance": "Cosine",
                    "on_disk": True,
                }
            },
            "on_disk_payload": True,
        },
    )


def ensure_payload_indexes(qdrant_url: str) -> None:
    base = qdrant_url.rstrip("/")
    fields: dict[str, str] = {
        "packet_key": "keyword",
        "source_ref": "keyword",
        "source_version_receipt_id": "keyword",
        "reconciliation_receipt_id": "keyword",
        "symbol_version_id": "keyword",
        "tree_node_id": "keyword",
        "feature_label": "keyword",
        "source_representation_id": "keyword",
        "latent_representation_id": "keyword",
        "autoencoder_revision": "keyword",
        "kmeans_revision": "keyword",
        "kmeans_cluster_id": "integer",
        "workspace_revision": "integer",
        "representation_revision": "integer",
    }
    for field_name, field_schema in fields.items():
        try:
            request_json(
                "PUT",
                f"{base}/collections/{ROUTING_COLLECTION}/index?wait=true",
                {"field_name": field_name, "field_schema": field_schema},
            )
        except Exception as exc:
            if "already" not in str(exc).lower() and "exists" not in str(exc).lower():
                raise


def upsert_routing(
    qdrant_url: str,
    rows: list[Latent64Row],
    receipt: dict[str, Any],
    autoencoder_revision: str,
    reconciliation_receipt_id: str,
    batch_size: int,
) -> int:
    assignment_by_key = {row["packetKey"]: int(row["clusterId"]) for row in receipt["assignments"]}
    points: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        points.append(
            {
                "id": index,
                "vector": {LATENT_VECTOR_NAME: row.vector},
                "payload": {
                    "packet_key": row.packetKey,
                    "source_ref": row.sourceRef,
                    "source_revision": None,
                    "source_version_receipt_id": row.sourceVersionReceiptId,
                    "reconciliation_receipt_id": reconciliation_receipt_id,
                    "workspace_revision": row.workspaceRevision,
                    "representation_revision": row.representationRevision,
                    "symbol_version_id": row.symbolVersionId,
                    "tree_node_id": row.treeNodeId,
                    "feature_label": row.featureLabel,
                    "source_representation_id": "semantic_512",
                    "source_dimension": 512,
                    "latent_representation_id": "latent_64",
                    "latent_dimension": 64,
                    "autoencoder_revision": autoencoder_revision,
                    "kmeans_revision": receipt["algorithmRevision"],
                    "kmeans_cluster_id": assignment_by_key[row.packetKey],
                    "evidence_authority": False,
                },
            }
        )

    base = qdrant_url.rstrip("/")
    for start in range(0, len(points), batch_size):
        batch = points[start : start + batch_size]
        request_json(
            "PUT",
            f"{base}/collections/{ROUTING_COLLECTION}/points?wait=true",
            {"points": batch},
        )
    return len(points)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--latent-in", type=Path, default=Path("data/atlas-ml/semantic512-latent64.ndjson"))
    parser.add_argument("--receipt-out", type=Path, default=Path("data/atlas-ml/semantic512-kmeans-receipt.json"))
    parser.add_argument("--qdrant-url", default="http://127.0.0.1:6333")
    parser.add_argument("--clusters", type=int, default=256)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--max-iter", type=int, default=300)
    parser.add_argument("--tol", type=float, default=1e-4)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    rows, autoencoder_revision, reconciliation_receipt_id = load_latents(args.latent_in)
    request = Latent64KMeansRequest(
        rows=rows,
        sourceRepresentationId="semantic_512",
        autoencoderRevision=autoencoder_revision,
        reconciliationReceiptId=reconciliation_receipt_id,
        nClusters=args.clusters,
        randomState=args.random_state,
        maxIter=args.max_iter,
        tol=args.tol,
    )
    receipt = cluster_latent64(request)
    receipt["routingCollection"] = ROUTING_COLLECTION
    receipt["sourceRevisionPolicy"] = "ABSENT_DO_NOT_FABRICATE"
    receipt["applied"] = False

    if args.apply:
        ensure_collection(args.qdrant_url)
        ensure_payload_indexes(args.qdrant_url)
        receipt["upsertedRows"] = upsert_routing(
            args.qdrant_url,
            rows,
            receipt,
            autoencoder_revision,
            reconciliation_receipt_id,
            args.batch_size,
        )
        receipt["applied"] = True

    args.receipt_out.parent.mkdir(parents=True, exist_ok=True)
    args.receipt_out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
