from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.compact_ontology_csr_bridge_v1 import (
    CONCEPT_BITSET_BYTES,
    OntologyTupleV1,
    build_compact_ontology_csr_v1,
    csr_to_typed_graph_edges,
    load_obo_catalog_v1,
    pack_concept_membership_64b,
    unpack_concept_membership_64b,
)
from atlas_compute.typed_graph_runtime import build_networkx_graph

OBO_FILE = REPO_ROOT / ".okf" / "ontologies" / "atlas-domain-and-language-terms-v1.obo"


def test_64b_concept_bitset_roundtrip_and_tail_guard() -> None:
    packed = pack_concept_membership_64b([0, 7, 8, 255, 505], max_concepts=506)
    assert len(packed) == CONCEPT_BITSET_BYTES == 64
    assert unpack_concept_membership_64b(packed, max_concepts=506) == [0, 7, 8, 255, 505]

    with pytest.raises(ValueError, match="CONCEPT_ORDINAL_OUT_OF_RANGE"):
        pack_concept_membership_64b([506], max_concepts=506)

    tampered = bytearray(packed)
    tampered[63] |= 1 << 7  # bit 511 >= 506
    with pytest.raises(ValueError, match="NON_ZERO_TAIL_BIT"):
        unpack_concept_membership_64b(bytes(tampered), max_concepts=506)


def test_obo_catalog_csr_and_typed_graph_runtime_bridge() -> None:
    catalog = load_obo_catalog_v1(OBO_FILE)
    assert len(catalog.concept_ids) == 110
    assert "associated_language" in catalog.predicate_ids
    assert "targets_platform" in catalog.predicate_ids
    assert "compiles_to" in catalog.predicate_ids

    c0, c1, c2 = catalog.concept_ids[0], catalog.concept_ids[1], catalog.concept_ids[2]
    tuples = [
        OntologyTupleV1(
            subject_id=c0,
            predicate_id="targets_platform",
            object_id=c1,
            source_revision="sha256:" + "1" * 64,
            evidence_ref="doc:1#0-10",
            status="REVIEWED",
        ),
        OntologyTupleV1(
            subject_id=c0,
            predicate_id="compiles_to",
            object_id=c2,
            source_revision="sha256:" + "2" * 64,
            evidence_ref="doc:2#0-10",
            status="PROPOSED",
        ),
    ]

    with pytest.raises(ValueError, match="UNKNOWN_PREDICATE_ID"):
        build_compact_ontology_csr_v1(
            [
                OntologyTupleV1(
                    subject_id=c0,
                    predicate_id="PART_OF_UNREGISTERED",
                    object_id=c1,
                    source_revision=None,
                    evidence_ref=None,
                )
            ],
            catalog,
        )

    csr_all = build_compact_ontology_csr_v1(tuples, catalog, require_reviewed=False)
    assert csr_all.subject_ordinals.dtype == np.uint16
    assert csr_all.predicate_ordinals.dtype == np.uint8
    assert csr_all.object_ordinals.dtype == np.uint16
    assert csr_all.evidence_ordinals.dtype == np.uint32
    assert csr_all.row_offsets.dtype == np.uint32
    assert csr_all.edge_count == 2
    assert csr_all.canonical_authority is False

    csr_rev = build_compact_ontology_csr_v1(tuples, catalog, require_reviewed=True)
    assert csr_rev.edge_count == 1
    assert csr_rev.evidence_table[0].evidence_ref == "doc:1#0-10"

    edges = csr_to_typed_graph_edges(csr_all, catalog)
    assert len(edges) == 2
    nx_graph = build_networkx_graph(range(csr_all.node_count), edges)
    assert nx_graph.number_of_edges() == 2
