#!/usr/bin/env python3
"""Plan the representation-aware feature-matrix manifest without materializing data."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/reports/candidate-feature-matrix-representation-plan-v1.json"


def sha256(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def main() -> None:
    manifest = {
        "schema": "atlas.candidate-feature-matrix-representation-manifest.v1",
        "candidateSnapshotRevision": None,
        "ordinalMapChecksum": None,
        "representationAlignmentChecksum": None,
        "representations": {
            "semantic_768": {"role": "CANONICAL_REQUIRED", "artifactRef": None, "representationRevision": None, "availabilityByOrdinalRef": None},
            "latent_256": {"role": "OPTIONAL_PERSISTED_PARENT", "artifactRef": None, "representationRevision": None, "availabilityByOrdinalRef": None},
            "latent_128": {"role": "OPTIONAL_VIRTUAL_DERIVED_VIEW", "parentRepresentationId": "latent_256", "artifactRef": None, "representationRevision": None, "availabilityByOrdinalRef": None},
            "latent_64": {"role": "OPTIONAL_PERSISTED_PHYSICAL_OUTPUT", "parentRepresentationId": None, "artifactRef": None, "representationRevision": None, "availabilityByOrdinalRef": None},
        },
        "rawVectorsInline": False,
        "rankingBehaviorChanged": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    result = {
        "schema": "atlas.candidate-feature-matrix-representation-plan.v1",
        "status": "MANIFEST_SHAPE_DEFINED_LIVE_BINDING_REQUIRED",
        "manifest": manifest,
        "nullPolicy": "null means unavailable or unproven; no fallback identity is permitted",
        "alignmentRule": "all available representations share candidateSnapshotRevision and ordinalMapChecksum",
        "checksumRule": "alignment checksum covers ordered candidateOrdinal plus representation id, revision, artifact ref, and availability state; never raw vectors",
        "nextProof": "bind one existing CandidateFeatureSnapshotV1 and independently replay ordinal/checksum alignment",
        "sourceAudit": "docs/reports/candidate-feature-matrix-representation-v1.json",
        "planChecksum": sha256(json.dumps(manifest, sort_keys=True, separators=(",", ":"))),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
