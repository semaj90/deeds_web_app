"""Compact typed-array, CSR adjacency, and 64-byte concept bitset bridge (v1).

Aligns `OntologyTupleV1` dictionaries/maps with compact typed arrays (`uint16`,
`uint8`, `uint32`), CSR adjacency (`row_offsets`, `neighbor_ordinals`,
`relation_types`, `edge_ordinals`), and the existing `typed_graph_runtime` +
`topk_paginator` contracts without duplicating graph or ranking algorithms.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping, Sequence

import numpy as np

from atlas_graph_runtime.contracts import TypedGraphEdge

SCHEMA_ONTOLOGY_CSR_V1 = "atlas.compact-ontology-csr.v1"
CONCEPT_BITSET_BYTES = 64
CONCEPT_BITSET_CAPACITY = CONCEPT_BITSET_BYTES * 8  # 512 >= 506 concepts
TupleStatus = Literal["PROPOSED", "REVIEWED"]


@dataclass(frozen=True)
class OntologyTupleV1:
    subject_id: str
    predicate_id: str
    object_id: str
    source_revision: str | None
    evidence_ref: str | None
    status: TupleStatus = "PROPOSED"


@dataclass(frozen=True)
class OntologyCatalogV1:
    ontology_revision: str
    concept_ids: tuple[str, ...]
    predicate_ids: tuple[str, ...]
    concept_to_ordinal: Mapping[str, int]
    predicate_to_ordinal: Mapping[str, int]


@dataclass(frozen=True)
class CompactOntologyCsrV1:
    schema: str
    ontology_revision: str
    node_count: int
    edge_count: int
    subject_ordinals: np.ndarray  # uint16 (E,)
    predicate_ordinals: np.ndarray  # uint8 (E,)
    object_ordinals: np.ndarray  # uint16 (E,)
    evidence_ordinals: np.ndarray  # uint32 (E,)
    row_offsets: np.ndarray  # uint32 (N + 1,)
    neighbor_ordinals: np.ndarray  # uint16 (E,)
    relation_types: np.ndarray  # uint8 (E,)
    edge_ordinals: np.ndarray  # uint32 (E,)
    evidence_table: tuple[OntologyTupleV1, ...]
    csr_checksum: str
    canonical_authority: bool = False
    writes_performed: bool = False


def load_obo_catalog_v1(obo_path: str | Path) -> OntologyCatalogV1:
    """Parse [Term] and [Typedef] stanzas from an OBO file into a deterministic ordinal catalog."""
    path = Path(obo_path)
    raw_bytes = path.read_bytes()
    ontology_rev = "sha256:" + hashlib.sha256(raw_bytes).hexdigest()

    concepts: list[str] = []
    predicates: list[str] = ["is_a"]
    stanza: str | None = None
    for raw in raw_bytes.decode("utf-8", errors="replace").splitlines():
        line = raw.strip()
        if line in ("[Term]", "[Typedef]"):
            stanza = line
        elif line.startswith("[") and line.endswith("]"):
            stanza = None
        elif stanza == "[Term]" and line.startswith("id:"):
            cid = line.split(":", 1)[1].strip()
            if cid:
                concepts.append(cid)
        elif stanza == "[Typedef]" and line.startswith("id:"):
            pid = line.split(":", 1)[1].strip()
            if pid and pid not in predicates:
                predicates.append(pid)

    sorted_concepts = tuple(sorted(set(concepts)))
    sorted_preds = tuple(sorted(set(predicates)))
    if len(sorted_concepts) > 65535:
        raise ValueError("CONCEPT_COUNT_EXCEEDS_UINT16")
    if len(sorted_preds) > 255:
        raise ValueError("PREDICATE_COUNT_EXCEEDS_UINT8")

    return OntologyCatalogV1(
        ontology_revision=ontology_rev,
        concept_ids=sorted_concepts,
        predicate_ids=sorted_preds,
        concept_to_ordinal={cid: i for i, cid in enumerate(sorted_concepts)},
        predicate_to_ordinal={pid: i for i, pid in enumerate(sorted_preds)},
    )


def pack_concept_membership_64b(
    concept_ordinals: Sequence[int],
    *,
    max_concepts: int = 506,
) -> bytes:
    """Pack concept membership ordinals into a fixed 64-byte (512-bit) LSB0 bitset with zeroed tail bits."""
    if max_concepts < 1 or max_concepts > CONCEPT_BITSET_CAPACITY:
        raise ValueError("MAX_CONCEPTS_OUT_OF_64B_RANGE")
    buf = bytearray(CONCEPT_BITSET_BYTES)
    for raw_ord in concept_ordinals:
        ord_val = int(raw_ord)
        if ord_val < 0 or ord_val >= max_concepts:
            raise ValueError(f"CONCEPT_ORDINAL_OUT_OF_RANGE:{ord_val}")
        buf[ord_val >> 3] |= 1 << (ord_val & 7)
    return bytes(buf)


def unpack_concept_membership_64b(
    buf: bytes,
    *,
    max_concepts: int = 506,
) -> list[int]:
    if len(buf) != CONCEPT_BITSET_BYTES:
        raise ValueError(f"EXPECTED_64_BYTES_GOT_{len(buf)}")
    # Enforce zeroed tail bits past max_concepts
    for bit_idx in range(max_concepts, CONCEPT_BITSET_CAPACITY):
        if (buf[bit_idx >> 3] >> (bit_idx & 7)) & 1:
            raise ValueError(f"NON_ZERO_TAIL_BIT:{bit_idx}")
    present: list[int] = []
    for bit_idx in range(max_concepts):
        if (buf[bit_idx >> 3] >> (bit_idx & 7)) & 1:
            present.append(bit_idx)
    return present


def build_compact_ontology_csr_v1(
    tuples: Sequence[OntologyTupleV1],
    catalog: OntologyCatalogV1,
    *,
    require_reviewed: bool = False,
) -> CompactOntologyCsrV1:
    """Validate tuples against the catalog and compile compact ordinal arrays + CSR adjacency."""
    admitted: list[OntologyTupleV1] = []
    for t in tuples:
        if t.status not in ("PROPOSED", "REVIEWED"):
            raise ValueError(f"INVALID_TUPLE_STATUS:{t.status}")
        if require_reviewed and t.status != "REVIEWED":
            continue
        if t.subject_id not in catalog.concept_to_ordinal:
            raise ValueError(f"UNKNOWN_SUBJECT_CONCEPT:{t.subject_id}")
        if t.object_id not in catalog.concept_to_ordinal:
            raise ValueError(f"UNKNOWN_OBJECT_CONCEPT:{t.object_id}")
        if t.predicate_id not in catalog.predicate_to_ordinal:
            raise ValueError(f"UNKNOWN_PREDICATE_ID:{t.predicate_id}")
        admitted.append(t)

    e_count = len(admitted)
    n_count = len(catalog.concept_ids)

    subj = np.zeros((e_count,), dtype=np.uint16)
    pred = np.zeros((e_count,), dtype=np.uint8)
    obj = np.zeros((e_count,), dtype=np.uint16)
    ev_ord = np.arange(e_count, dtype=np.uint32)

    buckets: list[list[tuple[int, int, int]]] = [[] for _ in range(n_count)]
    for idx, t in enumerate(admitted):
        s_ord = catalog.concept_to_ordinal[t.subject_id]
        p_ord = catalog.predicate_to_ordinal[t.predicate_id]
        o_ord = catalog.concept_to_ordinal[t.object_id]
        subj[idx] = s_ord
        pred[idx] = p_ord
        obj[idx] = o_ord
        buckets[s_ord].append((o_ord, p_ord, idx))

    row_offsets = np.zeros((n_count + 1,), dtype=np.uint32)
    neighbor_ordinals = np.zeros((e_count,), dtype=np.uint16)
    relation_types = np.zeros((e_count,), dtype=np.uint8)
    edge_ordinals = np.zeros((e_count,), dtype=np.uint32)

    cursor = 0
    for node_ord in range(n_count):
        row_offsets[node_ord] = cursor
        # Deterministic neighbor sort: (neighbor_ordinal, predicate_ordinal, edge_ordinal)
        for o_ord, p_ord, e_idx in sorted(buckets[node_ord]):
            neighbor_ordinals[cursor] = o_ord
            relation_types[cursor] = p_ord
            edge_ordinals[cursor] = e_idx
            cursor += 1
    row_offsets[n_count] = cursor

    h = hashlib.sha256()
    h.update(catalog.ontology_revision.encode("utf-8"))
    h.update(row_offsets.tobytes())
    h.update(neighbor_ordinals.tobytes())
    h.update(relation_types.tobytes())
    h.update(edge_ordinals.tobytes())

    return CompactOntologyCsrV1(
        schema=SCHEMA_ONTOLOGY_CSR_V1,
        ontology_revision=catalog.ontology_revision,
        node_count=n_count,
        edge_count=e_count,
        subject_ordinals=subj,
        predicate_ordinals=pred,
        object_ordinals=obj,
        evidence_ordinals=ev_ord,
        row_offsets=row_offsets,
        neighbor_ordinals=neighbor_ordinals,
        relation_types=relation_types,
        edge_ordinals=edge_ordinals,
        evidence_table=tuple(admitted),
        csr_checksum="sha256:" + h.hexdigest(),
    )


def csr_to_typed_graph_edges(
    csr: CompactOntologyCsrV1,
    catalog: OntologyCatalogV1,
) -> list[TypedGraphEdge]:
    """Convert CSR adjacency into `TypedGraphEdge` items for `typed_graph_runtime`."""
    edges: list[TypedGraphEdge] = []
    for src_ord in range(csr.node_count):
        start = int(csr.row_offsets[src_ord])
        end = int(csr.row_offsets[src_ord + 1])
        for pos in range(start, end):
            dst_ord = int(csr.neighbor_ordinals[pos])
            rel_ord = int(csr.relation_types[pos])
            edges.append(
                TypedGraphEdge(
                    src_ordinal=src_ord,
                    dst_ordinal=dst_ord,
                    kind=catalog.predicate_ids[rel_ord],
                    weight=1.0,
                )
            )
    return edges
