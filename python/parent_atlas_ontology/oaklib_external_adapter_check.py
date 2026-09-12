"""OAKLIB-ADAPTER-01 read-only fixture proof.

Runs without oaklib/network access. It proves the Parent Atlas normalization
boundary and authority rules. A live oaklib adapter is a separate optional
workstation proof.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parent_atlas_ontology.oaklib_external_adapter import (  # noqa: E402
    build_oaklib_candidate_bundle_v1,
)


class FixtureAdapter:
    labels = {
        "CL:0000540": "neuron",
        "RO:0002215": "capable of",
        "GO:0019226": "transmission of nerve impulse",
        "rdfs:subClassOf": None,
        "BFO:0000040": "material entity",
    }
    definitions = {
        "CL:0000540": "A cell that is capable of transmitting a nerve impulse.",
        "GO:0019226": "The process in which a nerve impulse is transmitted.",
        "BFO:0000040": "An independent continuant that is spatially extended.",
    }

    def label(self, entity_id: str):
        return self.labels.get(entity_id)

    def definition(self, entity_id: str):
        return self.definitions.get(entity_id)

    def relationships(self, subjects):
        rows = [
            ("CL:0000540", "RO:0002215", "GO:0019226"),
            ("CL:0000540", "rdfs:subClassOf", "BFO:0000040"),
        ]
        allowed = set(subjects)
        return [row for row in rows if row[0] in allowed]


def main() -> int:
    adapter = FixtureAdapter()
    first = build_oaklib_candidate_bundle_v1(
        adapter,
        subjects=["CL:0000540"],
        source_selector="fixture:cell-ontology",
        ontology_revision="fixture:cl:v1",
        producer_revision="oaklib-adapter-v1",
        namespace="obo",
    )
    second = build_oaklib_candidate_bundle_v1(
        adapter,
        subjects=["CL:0000540"],
        source_selector="fixture:cell-ontology",
        ontology_revision="fixture:cl:v1",
        producer_revision="oaklib-adapter-v1",
        namespace="obo",
    )

    checks = {
        "bundle_is_noncanonical": first.canonicalAuthority is False,
        "three_concept_candidates": len(first.concepts) == 3,
        "two_relation_candidates": len(first.relations) == 2,
        "all_concepts_are_proposed": all(row.status == "PROPOSED" for row in first.concepts),
        "all_relations_are_proposed": all(row.status == "PROPOSED" for row in first.relations),
        "relations_target_existing_hyperedge_owner": all(row.promotionTarget == "HyperedgeV1" for row in first.relations),
        "no_parent_atlas_concept_id_minted": all(not row.externalId.startswith("concept:") for row in first.concepts),
        "concept_promotion_input_targets_existing_contract": first.concepts[0].parent_atlas_concept_input()["taxonomyRevision"] == "fixture:cl:v1",
        "deterministic_candidate_ids": [row.candidateId for row in first.concepts] == [row.candidateId for row in second.concepts]
        and [row.candidateId for row in first.relations] == [row.candidateId for row in second.relations],
        "missing_predicate_label_is_allowed": any(row.predicateExternalId == "rdfs:subClassOf" and row.predicateLabel is None for row in first.relations),
    }

    ok = all(checks.values())
    payload = {
        "gate": "OAKLIB-ADAPTER-01",
        "status": "PASS" if ok else "FAIL",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "checks": checks,
        "conceptCandidates": [
            {
                "candidateId": row.candidateId,
                "externalId": row.externalId,
                "label": row.label,
                "status": row.status,
            }
            for row in first.concepts
        ],
        "relationCandidates": [
            {
                "candidateId": row.candidateId,
                "subject": row.subjectExternalId,
                "predicate": row.predicateExternalId,
                "object": row.objectExternalId,
                "status": row.status,
                "promotionTarget": row.promotionTarget,
            }
            for row in first.relations
        ],
    }
    print(json.dumps(payload, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
