#!/usr/bin/env python3
"""Read-only contract audit for existing nested latent representation owners."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/reports/fetch-latent-derived-views-v2.json"


def digest(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def main() -> None:
    paths = {
        "derive": ROOT / "sveltekit-frontend/src/lib/server/retrieval/latent-derive.ts",
        "family": ROOT / "sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.ts",
        "handler": ROOT / "sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-candidate-latent-handler-v1.ts",
        "provider": ROOT / "sveltekit-frontend/src/lib/server/retrieval/latent256-candidate-provider.ts",
        "candidate_fixture": ROOT / "sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.spec.ts",
    }
    text = {name: path.read_text(encoding="utf-8") for name, path in paths.items()}
    checks = {
        "latent128_prefix_l2_helper": "deriveLatent128" in text["derive"] and "slice(0, LATENT_128_DIM)" in text["derive"],
        "latent64_helper_is_existing_only": "deriveLatent64" in text["derive"],
        "latent256_provider_exists": "PostgresLatent256CandidateProvider" in text["provider"],
        "candidate_handler_is_fetch_latent": "FETCH_LATENT" in text["handler"] and "candidate_latent_256" in text["handler"],
        "latent128_virtual": "latent_128" in text["family"] and "physical: false" in text["family"],
        "latent64_physical": "latent_64" in text["family"] and "physical: true" in text["family"],
        "latent128_parent_latent256": "parentRepresentationId: 'latent_256'" in text["family"],
        "latent64_input_semantic768": "inputRepresentationId: 'semantic_768'" in text["family"],
        # The fixture intentionally retains one rejected stale binding to prove
        # fail-closed validation. Check that its admitted binding is physical;
        # do not mistake the negative case for production semantics.
        "latent64_candidate_fixture_has_physical_binding": (
            "representationId: 'latent_64'" in text["candidate_fixture"]
            and "projectionKind: 'LEARNED_AUTOENCODER'" in text["candidate_fixture"]
            and "sourceRepresentationId: 'semantic_768'" in text["candidate_fixture"]
        ),
        "writes_performed": False,
        "canonical_authority": False,
    }
    contract_checks = {key: value for key, value in checks.items() if key not in {"writes_performed", "canonical_authority"}}
    result = {
        "schema": "atlas.fetch-latent-derived-views-audit.v2",
        "status": "PROVEN_STATIC_CONTRACT" if all(contract_checks.values()) else "OPEN_CONTRACT_GAP",
        "representations": {
            "latent_256": {"dimensions": 256, "origin": "LEARNED", "materialization": "PERSISTED", "input": "semantic_768", "owner": "PostgresLatent256CandidateProvider"},
            "latent_128": {"dimensions": 128, "origin": "DERIVED", "materialization": "VIRTUAL", "parent": "latent_256", "transform": "PREFIX_L2", "owner": "latent-derive.ts"},
            "latent_64": {"dimensions": 64, "origin": "LEARNED", "materialization": "PERSISTED", "input": "semantic_768", "owner": "existing physical latent_64 storage", "derived_view": False},
        },
        "checks": checks,
        "sourceFiles": {name: str(path.relative_to(ROOT)).replace("\\", "/") for name, path in paths.items()},
        "contractChecksum": digest("\n".join(text.values())),
        "liveDatabaseReplay": "UNPROVEN",
        "candidateOrdinalParity": "UNPROVEN",
        "derivedChecksums": "UNPROVEN",
        "queryTimePromotion": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
