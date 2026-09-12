#!/usr/bin/env python3
"""OAKLIB-ADAPTER-01 workstation proof runner.

Default mode is deterministic and offline. Pass --selector plus one or more
--subject values for a live oaklib read. Neither mode writes canonical Atlas
state. Optional --report writes only a derived JSON receipt.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

from parent_atlas_ontology.oaklib_external_adapter import (  # noqa: E402
    build_oaklib_candidate_bundle_v1,
    load_oaklib_candidate_bundle_v1,
)


class FixtureAdapter:
    def label(self, entity_id: str):
        return {
            "CL:0000540": "neuron",
            "RO:0002215": "capable of",
            "GO:0019226": "transmission of nerve impulse",
            "BFO:0000040": "material entity",
        }.get(entity_id)

    def definition(self, entity_id: str):
        return {
            "CL:0000540": "A cell that is capable of transmitting a nerve impulse.",
            "GO:0019226": "The process in which a nerve impulse is transmitted.",
            "BFO:0000040": "An independent continuant that is spatially extended.",
        }.get(entity_id)

    def relationships(self, subjects):
        allowed = set(subjects)
        return [
            row
            for row in (
                ("CL:0000540", "RO:0002215", "GO:0019226"),
                ("CL:0000540", "rdfs:subClassOf", "BFO:0000040"),
            )
            if row[0] in allowed
        ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selector", help="oaklib adapter selector, e.g. sqlite:obo:cl or hp.obo")
    parser.add_argument("--subject", action="append", default=[], help="ontology entity/CURIE; repeatable")
    parser.add_argument("--ontology-revision", default="fixture:cl:v1")
    parser.add_argument("--producer-revision", default="oaklib-adapter-v1")
    parser.add_argument("--namespace", default="external-oaklib")
    parser.add_argument("--report", action="store_true", help="write derived docs/reports receipt")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.selector:
        if not args.subject:
            raise SystemExit("--selector requires at least one --subject")
        bundle = load_oaklib_candidate_bundle_v1(
            resource_selector=args.selector,
            subjects=args.subject,
            ontology_revision=args.ontology_revision,
            producer_revision=args.producer_revision,
            namespace=args.namespace,
        )
        mode = "LIVE_OAKLIB_READ"
    else:
        bundle = build_oaklib_candidate_bundle_v1(
            FixtureAdapter(),
            subjects=["CL:0000540"],
            source_selector="fixture:cell-ontology",
            ontology_revision="fixture:cl:v1",
            producer_revision=args.producer_revision,
            namespace="obo",
        )
        mode = "OFFLINE_FIXTURE"

    payload = bundle.to_dict()
    payload.update(
        {
            "gate": "OAKLIB-ADAPTER-01",
            "mode": mode,
            "status": "CANDIDATES_ONLY",
            "writesPerformed": False,
            "canonicalConceptOwner": "entity-concept-taxonomy-v1.ts::createConceptV1",
            "canonicalRelationOwner": "HyperedgeV1 promotion",
        }
    )

    print(json.dumps(payload, indent=2))

    if args.report:
        report = REPO_ROOT / "docs" / "reports" / "oaklib-external-adapter-v1.json"
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"report_path={report}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
