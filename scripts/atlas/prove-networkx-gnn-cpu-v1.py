from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = ROOT / "python"
sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.gnn_fixtures import fixture_gnn_input_v1, fixture_gnn_models_v1
from atlas_graph_runtime.gnn_reference import run_gnn_v1
import networkx as nx
import torch


def sha256_bytes(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def stable_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def main() -> int:
    graph_input = fixture_gnn_input_v1()
    models = fixture_gnn_models_v1()
    results = []
    for model in models:
        output, execution = run_gnn_v1(graph_input, model)
        results.append({
            "architecture": model.architecture,
            "modelRevision": model.model_revision,
            "modelChecksum": model.model_checksum(),
            "executionReceipt": execution.to_dict(),
            "fixtureNodeEmbeddings": [
                {"candidateOrdinal": ordinal, "values": list(output[ordinal])}
                for ordinal in graph_input.node_ordinals
            ],
        })

    source_paths = (
        ROOT / "python" / "atlas_graph_runtime" / "gnn_fixtures.py",
        ROOT / "python" / "atlas_graph_runtime" / "gnn_reference.py",
        ROOT / "python" / "tests" / "test_networkx_gnn_reference.py",
        ROOT / "python" / "tests" / "test_networkx_gnn_reference_unittest.py",
        Path(__file__).resolve(),
    )
    source_checksums = {
        str(path.relative_to(ROOT)): sha256_bytes(path.read_bytes())
        for path in source_paths
    }
    report = {
        "schema": "atlas.networkx-gnn-cpu-fixture-proof.v1",
        "status": "FIXTURE_PROVEN",
        "proofLevel": "CPU_FIXTURE_ONLY",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "owners": {
            "topology": "NetworkX CPU graph construction",
            "tensorMath": "PyTorch CPU float32",
            "rootRunner": "scripts/atlas/prove-networkx-gnn-cpu-v1.py",
            "implementation": "python/atlas_graph_runtime/gnn_reference.py",
            "networkxVersion": nx.__version__,
            "torchVersion": torch.__version__,
            "producerRevision": sha256_bytes(stable_json(source_checksums)),
            "sourceChecksums": source_checksums,
        },
        "input": graph_input.canonical_payload(),
        "inputChecksum": graph_input.input_checksum(),
        "architectures": results,
        "parentAtlasEvidence": {
            "candidateSnapshotRevision": None,
            "workspaceRevision": None,
            "graphRevision": None,
            "canonicalPayload": None,
            "canonicalPayloadStatus": "UNAVAILABLE_NO_ADMITTED_PARENT_ATLAS_COHORT",
            "acePacketV3": None,
            "acePacketV3Status": "UNAVAILABLE_NO_ADMITTED_PARENT_ATLAS_COHORT",
            "contextManifestV2": None,
            "contextManifestV2Status": "UNAVAILABLE_NO_ADMITTED_PARENT_ATLAS_COHORT",
            "topologyCoordinates": None,
            "topologyCoordinatesStatus": "UNAVAILABLE_NO_ADMITTED_TOPOLOGY_REPRESENTATION",
        },
        "evidenceTable": [
            {
                "evidenceId": "PARENT_ATLAS_CANONICAL_PAYLOAD",
                "status": "UNAVAILABLE_NO_ADMITTED_PARENT_ATLAS_COHORT",
                "value": None,
            },
            {
                "evidenceId": "ACE_PACKET_V3",
                "status": "UNAVAILABLE_NO_ADMITTED_PARENT_ATLAS_COHORT",
                "value": None,
            },
            {
                "evidenceId": "CONTEXT_MANIFEST_V2",
                "status": "UNAVAILABLE_NO_ADMITTED_PARENT_ATLAS_COHORT",
                "value": None,
            },
            {
                "evidenceId": "TOPOLOGY_COORDINATES",
                "status": "UNAVAILABLE_NO_ADMITTED_TOPOLOGY_REPRESENTATION",
                "value": None,
            },
        ],
        "fixtureOnly": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "persistentStoreWrites": {"postgres": 0, "neo4j": 0, "qdrant": 0, "valkey": 0, "graphify": 0},
        "evidenceRefs": [
            "python/atlas_graph_runtime/gnn_reference.py",
            "python/tests/test_networkx_gnn_reference.py",
            "python/tests/test_networkx_gnn_reference_unittest.py",
            "docs/.okf/schema.yaml#topology",
        ],
    }
    report["receiptChecksum"] = sha256_bytes(stable_json(report))
    output_dir = ROOT / ".tmp" / "atlas"
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output_path = output_dir / f"networkx-gnn-cpu-fixture-proof-v1-{stamp}.json"
    output_path.write_bytes(stable_json(report) + b"\n")
    readback = json.loads(output_path.read_text(encoding="utf-8"))
    checksum = readback.pop("receiptChecksum")
    readback_matches = checksum == sha256_bytes(stable_json(readback))
    if not readback_matches:
        raise RuntimeError("GNN_PROOF_RECEIPT_READBACK_MISMATCH")
    print(json.dumps({
        "status": report["status"],
        "architectures": [item["architecture"] for item in results],
        "receipt": str(output_path.relative_to(ROOT)),
        "receiptChecksum": checksum,
        "independentReadback": "MATCH",
        "parentAtlasPayload": report["parentAtlasEvidence"]["canonicalPayloadStatus"],
        "topologyCoordinates": report["parentAtlasEvidence"]["topologyCoordinatesStatus"],
        "writesPerformed": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
