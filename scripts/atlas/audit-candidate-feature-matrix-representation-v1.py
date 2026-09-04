#!/usr/bin/env python3
"""Read-only audit of representation references at the feature-matrix boundary.

This stage intentionally does not create a new package contract or materialize
vectors. It checks whether the existing CandidateOrdinal and feature-row owners
already expose the references needed for a future manifest.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/reports/candidate-feature-matrix-representation-v1.json"


def checksum(parts: list[str]) -> str:
    return "sha256:" + hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def main() -> None:
    paths = {
        "ordinal_owner": ROOT / "sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts",
        "feature_row": ROOT / "sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-row-v1.ts",
        "feature_snapshot": ROOT / "sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.ts",
        "latent_receipt": ROOT / "sveltekit-frontend/src/lib/server/atlas/features/candidate-latent256-hydration-receipt-v1.ts",
        "representation_family": ROOT / "sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts",
    }
    text = {name: path.read_text(encoding="utf-8") for name, path in paths.items()}
    checks = {
        "ordinal_owner_has_representation_bindings": "representationBindings" in text["ordinal_owner"],
        "feature_row_has_representation_bindings": "representationBindings" in text["feature_row"],
        "feature_snapshot_binds_ordinal_checksum": "ordinalMapChecksum" in text["feature_snapshot"],
        "latent256_receipt_has_vectors_checksum": "vectorsChecksum" in text["latent_receipt"],
        "latent256_receipt_has_candidate_snapshot_revision": "candidateSnapshotRevision" in text["latent_receipt"],
        "representation_family_declares_latent256": "latent_256" in text["representation_family"],
        "representation_family_declares_latent128": "latent_128" in text["representation_family"],
        "representation_family_declares_latent64": "latent_64" in text["representation_family"],
        "raw_vectors_absent_from_feature_row_contract": "vectors:" not in text["feature_row"],
    }
    missing_manifest_fields = [
        "latent256Ref",
        "latent128ViewRef",
        "latent64ViewRef",
        "representationAlignmentChecksum",
        "representationAvailabilityByOrdinal",
    ]
    result = {
        "schema": "atlas.candidate-feature-matrix-representation-audit.v1",
        "status": "STATIC_OWNER_SURFACE_PROVEN_MANIFEST_OPEN" if all(checks.values()) else "OWNER_SURFACE_GAP",
        "checks": checks,
        "existingOwners": {
            "candidateOrdinal": "canonical-candidate-v1.ts",
            "featureRow": "candidate-feature-row-v1.ts",
            "featureSnapshot": "candidate-feature-snapshot-v1.ts",
            "latent256Hydration": "candidate-latent256-hydration-receipt-v1.ts",
            "representationFamily": "representation-artifact-v1.ts",
        },
        "requiredManifestFieldsNotYetOwned": missing_manifest_fields,
        "representationAlignment": {
            "candidateOrdinal": "same ordinal map required",
            "semantic_768": "required canonical semantic lane",
            "latent_256": "optional persisted parent reference",
            "latent_128": "optional virtual derived-view reference",
            "latent_64": "optional persisted physical reference",
        },
        "liveSnapshotReplay": "UNPROVEN",
        "vectorMaterialization": "NOT_PERFORMED",
        "rankingBehaviorChanged": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "sourceChecksum": checksum(list(text.values())),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
