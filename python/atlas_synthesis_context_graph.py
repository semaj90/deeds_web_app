"""Bounded synthesis-context graph builder for the Parent Atlas NLP sidecar.

Combines two already-live, already-proven capabilities in this container into one
compact evidence graph for a downstream `llm_synthesis` (Ornith) call:

* LangExtract (`legacy._grounded_extractions`, patched by `miniforge_nlp_sidecar_v2`)
  supplies grounded concept-mention spans over each candidate's source text.
* oaklib (`atlas_oak_kernel`'s adapter accessor) supplies ontology concept
  labels/ancestors for any extraction whose `attributes.concept_id` resolves against
  the configured adapter.

This module does NOT call the "pre-fill neural decoder" (`atlas_neural_decoder_service.py`,
port 8121) itself -- that service is a pure `semantic_768 -> latent_256/128/64` numerical
projection with zero text/graph awareness. A caller building a DAG stage that combines this
context graph with a neural-decoder representation slice should pass that slice's
`representationRevision`/checksum as an opaque `packet_key` attribute (see
`sourceRepresentationRef` on `SynthesisContextCandidateV1`) -- this module never embeds raw
floats in the graph, matching this repo's own rule that large vector/matrix payloads travel
by reference, never inline in a JSON/graph descriptor.

Output is a networkx `DiGraph` serialized as node list + edge tuples (`(u, v, edge_type)`) --
never the graph object itself, which is not JSON-serializable. This endpoint hands off a
compact, structured, checksum-stable context graph; it is NOT the `llm_synthesis` call itself
-- per this repo's own retrieval boundary rule, raw evidence must pass through this kind of
bounded context assembly before it ever reaches a model, never straight from extraction to
prompt.

Degrades gracefully, never raises, when the OAK adapter is unconfigured (the default,
production-safe state -- see `atlas_oak_kernel.py`'s own `ATLAS_OAK_ADAPTER` handling): the
graph still returns PACKET -> CONCEPT_MENTION edges from LangExtract alone, with
`grounding.adapterConfigured: false` and zero ONTOLOGY_CONCEPT nodes.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

import networkx as nx
from fastapi import APIRouter
from pydantic import BaseModel, Field

import miniforge_nlp_sidecar as legacy
from atlas_oak_kernel import (
    OAKLIB_AVAILABLE,
    AtlasPostgresOntologyAdapter,
    OboGraphInterface,
    _adapter,
    _adapter_locator,
)

router = APIRouter(prefix="/synthesis", tags=["synthesis-context-graph"])

MAX_CANDIDATES = 16
MAX_TEXT_CHARS = 50_000
MAX_ONTOLOGY_NEIGHBORS_PER_CONCEPT = 20


class SynthesisContextCandidateV1(BaseModel):
    packet_key: str = Field(min_length=1, max_length=512)
    source_ref: str = Field(min_length=1, max_length=2000)
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    # Opaque reference to a neural-decoder representation slice (e.g. a
    # RepresentationArtifactV1/CandidateRepresentationSliceV1 checksum) for this candidate.
    # Never a raw vector -- this module does not call the neural-decoder service itself.
    source_representation_ref: Optional[str] = Field(default=None, max_length=256)


class SynthesisContextGraphRequest(BaseModel):
    candidates: list[SynthesisContextCandidateV1] = Field(min_length=1, max_length=MAX_CANDIDATES)
    model_id: Optional[str] = None
    ground_concepts: bool = True
    include_ontology_neighbors: bool = False


def _mention_node_id(packet_key: str, start_char: int, end_char: int) -> str:
    return f"mention:{packet_key}:{start_char}:{end_char}"


def _concept_node_id(concept_id: str) -> str:
    return f"concept:{concept_id}"


def _packet_node_id(packet_key: str) -> str:
    return f"packet:{packet_key}"


def _graph_checksum(nodes: list[dict[str, Any]], edges: list[tuple[str, str, str]]) -> str:
    payload = json.dumps({"nodes": nodes, "edges": edges}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _ground_concept(adapter: Any, concept_id: str) -> Optional[str]:
    """Best-effort label lookup. Never raises -- an ungrounded extraction just skips the
    ONTOLOGY_CONCEPT node/GROUNDS_TO edge rather than failing the whole request."""

    try:
        return adapter.label(concept_id)
    except Exception:
        return None


def _ontology_neighbors(adapter: Any, concept_id: str) -> list[tuple[str, Optional[str]]]:
    """Bounded 1-hop ancestor lookup, matching this repo's no-unbounded-traversal rule.
    Returns (concept_id, label) pairs; never raises."""

    try:
        if isinstance(adapter, AtlasPostgresOntologyAdapter):
            rows = adapter.traverse(concept_id, "ancestors", MAX_ONTOLOGY_NEIGHBORS_PER_CONCEPT, 1)
            return [(str(row["concept_id"]), row.get("canonical_label")) for row in rows]
        if isinstance(adapter, OboGraphInterface):
            ancestors = list(adapter.ancestors(concept_id) or [])[:MAX_ONTOLOGY_NEIGHBORS_PER_CONCEPT]
            return [(cid, _ground_concept(adapter, cid)) for cid in ancestors]
    except Exception:
        pass
    return []


@router.post("/context-graph")
def build_synthesis_context_graph(request: SynthesisContextGraphRequest) -> dict[str, Any]:
    graph = nx.DiGraph()
    adapter_configured = _adapter_locator() is not None
    adapter: Any = None
    if request.ground_concepts and adapter_configured:
        try:
            adapter = _adapter()
        except Exception:
            adapter = None

    grounded_count = 0
    ungrounded_count = 0
    extraction_errors: list[str] = []

    for candidate in request.candidates:
        packet_node = _packet_node_id(candidate.packet_key)
        graph.add_node(
            packet_node,
            type="PACKET",
            packet_key=candidate.packet_key,
            source_ref=candidate.source_ref,
            source_representation_ref=candidate.source_representation_ref,
        )

        extractions = legacy._grounded_extractions(candidate.text, request.model_id)
        if legacy._grounded_extraction_error:
            extraction_errors.append(f"{candidate.packet_key}:{legacy._grounded_extraction_error}")

        for extraction in extractions:
            start_char = extraction.get("start_char")
            end_char = extraction.get("end_char")
            if not isinstance(start_char, int) or not isinstance(end_char, int):
                continue
            mention_node = _mention_node_id(candidate.packet_key, start_char, end_char)
            graph.add_node(
                mention_node,
                type="CONCEPT_MENTION",
                extraction_class=extraction.get("class") or extraction.get("extraction_class"),
                text=extraction.get("text") or extraction.get("extraction_text"),
                start_char=start_char,
                end_char=end_char,
            )
            graph.add_edge(packet_node, mention_node, edge_type="MENTIONS")

            attributes = extraction.get("attributes") or {}
            concept_id = attributes.get("concept_id") if isinstance(attributes, dict) else None
            if not concept_id:
                continue
            if adapter is None:
                ungrounded_count += 1
                continue
            label = _ground_concept(adapter, str(concept_id))
            if label is None:
                ungrounded_count += 1
                continue
            grounded_count += 1
            concept_node = _concept_node_id(str(concept_id))
            if concept_node not in graph:
                graph.add_node(concept_node, type="ONTOLOGY_CONCEPT", concept_id=str(concept_id), label=label)
            graph.add_edge(mention_node, concept_node, edge_type="GROUNDS_TO")

            if request.include_ontology_neighbors:
                for neighbor_id, neighbor_label in _ontology_neighbors(adapter, str(concept_id)):
                    neighbor_node = _concept_node_id(neighbor_id)
                    if neighbor_node not in graph:
                        graph.add_node(
                            neighbor_node, type="ONTOLOGY_CONCEPT", concept_id=neighbor_id, label=neighbor_label
                        )
                    graph.add_edge(concept_node, neighbor_node, edge_type="IS_A")

    nodes = [{"id": node_id, **attrs} for node_id, attrs in graph.nodes(data=True)]
    edges: list[tuple[str, str, str]] = [
        (u, v, attrs.get("edge_type", "UNKNOWN")) for u, v, attrs in graph.edges(data=True)
    ]

    return {
        "schema": "atlas.synthesis-context-graph.v1",
        "nodeCount": graph.number_of_nodes(),
        "edgeCount": graph.number_of_edges(),
        "nodes": nodes,
        "edges": edges,
        "grounding": {
            "adapterConfigured": adapter_configured,
            "adapterAvailable": OAKLIB_AVAILABLE,
            "groundedCount": grounded_count,
            "ungroundedCount": ungrounded_count,
            "ontologyNeighborsIncluded": request.include_ontology_neighbors,
        },
        "extraction": {
            "candidateCount": len(request.candidates),
            "errors": extraction_errors,
        },
        "graphChecksum": _graph_checksum(nodes, edges),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "llmSynthesisPerformed": False,
    }
