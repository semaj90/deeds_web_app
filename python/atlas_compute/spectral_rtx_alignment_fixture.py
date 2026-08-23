"""Cross-language JSON adapter for the Parent Atlas spectral RTX fixture.

This is a CPU reference/receipt adapter. It is deliberately not a CUDA, cuBLAS,
cuGraph, or N-API owner. The JSON shape mirrors
`spectral-rtx-alignment-fixture-v1.ts` so a later native executor can replace
the computation without changing identity or promotion semantics.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def build_spectral_rtx_alignment_fixture(payload: dict[str, Any]) -> dict[str, Any]:
    rows = sorted(payload["rows"], key=lambda row: int(row["ordinal"]))
    ordinals = [int(row["ordinal"]) for row in rows]
    canonical_ids = [str(row["canonicalId"]) for row in rows]
    if len(set(ordinals)) != len(ordinals):
        raise ValueError("SPECTRAL_RTX_DUPLICATE_ORDINAL")
    if len(set(canonical_ids)) != len(canonical_ids):
        raise ValueError("SPECTRAL_RTX_DUPLICATE_CANONICAL_ID")
    for row in rows:
        if len(row["semantic768"]) != 768:
            raise ValueError("SPECTRAL_RTX_SEMANTIC_DIMENSION")
    cluster_count = int(payload.get("clusterCount", 2))
    if not 1 <= cluster_count <= 32:
        raise ValueError("SPECTRAL_RTX_INVALID_CLUSTER_COUNT")

    input_checksum = _sha256({"rows": rows, "ordinalMapChecksum": payload["ordinalMapChecksum"]})
    assignments = [
        {"ordinal": int(row["ordinal"]), "cluster": abs(int(float(row["pagerank"]) * 1_000_000)) % cluster_count}
        for row in rows
    ]
    output = {"assignments": assignments, "clusterCount": cluster_count, "dimension": 4}
    return {
        "schema": "atlas.spectral-rtx-alignment-fixture.v1",
        "fixtureId": payload["fixtureId"],
        "workspaceRevision": payload["workspaceRevision"],
        "sourceRevision": payload["sourceRevision"],
        "representationRevision": payload["representationRevision"],
        "graphRevision": payload["graphRevision"],
        "ordinalMapChecksum": payload["ordinalMapChecksum"],
        "inputChecksum": input_checksum,
        "outputChecksum": _sha256(output),
        "backend": "MOCK_CPU_REFERENCE",
        "cudaArchitecture": "sm_86",
        "rtxGemm": {
            "operation": "FEATURE_PROJECTION",
            "rows": len(rows),
            "inputDimension": 768,
            "outputDimension": 4,
            "parity": "FIXTURE_ONLY",
        },
        "spectral": {
            "operator": "NORMALIZED_LAPLACIAN",
            "dimension": 4,
            "clusterCount": cluster_count,
            "assignments": assignments,
        },
        "canonicalWritesAllowed": False,
        "identityAuthority": False,
        "promotionEligible": False,
    }
