#!/usr/bin/env python3
"""Compose derived graph artifacts into a bounded DAG/LangExtract input receipt.

This is a read-only composition proof. It references the live Neo4j/NetworkX
export and the existing validated OntologyLinkedTupleV1 fixture; it does not
merge their schemas or persist a new graph/context authority.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))

from parent_atlas_ontology.adapter import OntologyLinkedTupleAdapter
from parent_atlas_ontology.models import OntologyLinkedTupleV1


ROOT = Path(__file__).resolve().parents[2]
GRAPH_PATH = ROOT / "docs" / "reports" / "neo4j-concept-networkx-export-v1.json"
TUPLE_PATH = ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
REPORT_PATH = ROOT / "docs" / "reports" / "graph-context-dag-composition-v1.json"


def checksum(value: object) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def main() -> int:
    graph = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    tuple_value = OntologyLinkedTupleV1.from_dict(json.loads(TUPLE_PATH.read_text(encoding="utf-8")))
    adapter = OntologyLinkedTupleAdapter()
    adapter.validate(tuple_value)
    tuple_snapshot = adapter.to_graph_projection((tuple_value,), graph_revision=graph["graphRevision"])

    bundle = {
        "schema": "atlas.graph-context-dag-input.v1",
        "generatedAt": datetime.now().astimezone().isoformat(),
        "graphArtifactRef": str(GRAPH_PATH.relative_to(ROOT)).replace("\\", "/"),
        "graphRevision": graph["graphRevision"],
        "graphProjectionChecksum": graph["projectionChecksum"],
        "ontologyTupleArtifactRef": str(TUPLE_PATH.relative_to(ROOT)).replace("\\", "/"),
        "ontologyTupleProjectionChecksum": checksum(tuple_snapshot),
        "nodeCount": graph["nodeCount"],
        "edgeCount": graph["edgeCount"],
        "ontologyTupleCount": 1,
        "tupleNodeCount": len(tuple_snapshot["nodes"]),
        "tupleEdgeCount": len(tuple_snapshot["edges"]),
        "consumers": ["LangExtract", "Ornith", "bounded DAG synthesis"],
        "canonicalAuthority": False,
        "writesPerformed": False,
        "containsEmbeddings": False,
        "containsTensors": False,
        "containsHiddenReasoning": False,
    }
    bundle["compositionChecksum"] = checksum(bundle)
    REPORT_PATH.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({**bundle, "reportPath": str(REPORT_PATH)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
