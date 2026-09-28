"""schemaId -> Pydantic model. Add a contract = one import + one line here (and one entry in scripts/atlas/lib/contract-parity-registry-v1.mts)."""
from __future__ import annotations

from pydantic import BaseModel

from atlas_contract_parity.research_evidence_bundle_v1 import ResearchEvidenceBundleV1
from atlas_contract_parity.research_evidence_v1 import ResearchEvidenceV1
from atlas_contract_parity.hyperedge_evidence_v1 import HyperEdgeEvidenceV1
from atlas_contract_parity.learning_outcome_v1 import LearningOutcomeV1
from atlas_contract_parity.unknown_resolution_v1 import UnknownResolutionV1

PYDANTIC_CONTRACTS: dict[str, type[BaseModel]] = {
    "atlas.unknown-resolution.v1": UnknownResolutionV1,
    "atlas.research-evidence.v1": ResearchEvidenceV1,
    "atlas.research-evidence-bundle.v1": ResearchEvidenceBundleV1,
    "atlas.hyperedge-evidence.v1": HyperEdgeEvidenceV1,
    "atlas.recommendation-outcome-receipt.v1": LearningOutcomeV1,
}
