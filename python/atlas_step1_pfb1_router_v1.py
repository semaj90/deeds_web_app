"""Read-only CPU NLP middleware router exposing Step 1 PFB1 bitset/nibble packing for :8095."""

from __future__ import annotations

import hashlib
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from atlas_graph_runtime.packed_feature_block_v1 import (
    build_feature_map_schema_v1,
    encode_packed_feature_block_v1,
)


def _assign_nes_lod_tier_v1(score: float) -> str:
    if score >= 0.75:
        return "LOD_1_5"
    if score >= 0.40:
        return "LOD_6_14"
    return "LOD_15_20"

router = APIRouter(prefix="/step1", tags=["step1-pfb1"])


class Step1PackItem(BaseModel):
    source_ref: str = Field(min_length=1, max_length=512)
    symbol_name: str = Field(min_length=1, max_length=256)
    domain_id: str = Field(default="ATLASDOM:general", min_length=1, max_length=128)
    score: float = Field(default=0.5, ge=0.0, le=1.0)
    active: bool = True


class Step1PackRequest(BaseModel):
    workspace_revision: str = Field(min_length=1, max_length=128)
    feature_map_revision: int = Field(default=1, ge=1)
    items: list[Step1PackItem] = Field(min_length=1, max_length=512)


@router.post("/pack-pfb1")
def pack_step1_pfb1(req: Step1PackRequest) -> dict[str, Any]:
    """Pack extracted Step 1 items into a canonical PFB1 bitset/nibble block on CPU."""
    try:
        feature_schema = build_feature_map_schema_v1(
            feature_map_revision=req.feature_map_revision,
            features=[
                {"ordinal": 0, "key": "gate:active"},
                {"ordinal": 1, "key": "score:nibble_q4"},
            ],
        )
        bits = [1 if item.active else 0 for item in req.items]
        nibbles = [min(15, max(0, int(round(item.score * 15.0)))) for item in req.items]
        pfb1_bytes = encode_packed_feature_block_v1(
            feature_map_rev=feature_schema.feature_map_revision,
            candidate_count=len(req.items),
            feature_count=len(feature_schema.features),
            bits=bits,
            nibbles=nibbles,
        )
        return {
            "schema": "atlas.step1-pfb1-response.v1",
            "workspace_revision": req.workspace_revision,
            "feature_map_digest": feature_schema.digest,
            "candidate_count": len(req.items),
            "lod_tiers": [_assign_nes_lod_tier_v1(item.score) for item in req.items],
            "pfb1_hex": pfb1_bytes.hex(),
            "pfb1_sha256": hashlib.sha256(pfb1_bytes).hexdigest(),
            "canonical_authority": False,
            "writes_performed": False,
        }
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


class QueryIntentRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    candidate_limit: int = Field(default=100, ge=1, le=200)
    graph_hops: int = Field(default=1, ge=0, le=2)


_INTENT_CUES: tuple[tuple[tuple[str, ...], str, float], ...] = (
    (("cuda", ".cu", "kernel", "ptx", "warp"), "ATLASLANG:cuda_cpp", 0.94),
    (("typescript", ".ts", "svelte", "webgpu", "wgsl"), "ATLASLANG:typescript", 0.90),
    (("postgres", "pgvector", "sql", "bytea", "hnsw", "halfvec"), "ATLASDOM:database", 0.91),
    (("qdrant", "bm25", "rrf", "turbo16", "turbo8", "retrieve"), "ATLASDOM:retrieval", 0.92),
    (("hypergraph", "neo4j", "calls", "imports", "graph"), "ATLASDOM:graph", 0.90),
)


@router.post("/query-intent")
def propose_query_intent(req: QueryIntentRequest) -> dict[str, Any]:
    """Propose a bounded structured query plan from user query on CPU (:8095).

    Strictly PROPOSAL_ONLY; Go Retrieval validates and enforces server-side auth & revisions.
    """
    q_lower = req.query.casefold()
    domain_candidates: list[dict[str, Any]] = []
    for cues, concept_id, conf in _INTENT_CUES:
        if any(cue in q_lower for cue in cues):
            domain_candidates.append(
                {
                    "concept_id": concept_id,
                    "confidence": conf,
                    "authority": "PROPOSAL_ONLY",
                }
            )
    if not domain_candidates:
        domain_candidates.append(
            {
                "concept_id": "ATLASDOM:general",
                "confidence": 0.5,
                "authority": "PROPOSAL_ONLY",
            }
        )

    kinds = ["function"] if any(w in q_lower for w in ("function", "kernel", "def ", "fn ")) else []
    ops: list[str] = []
    if any(w in q_lower for w in ("call", "launch", "invoke")):
        ops.append("CALLS")
    if any(w in q_lower for w in ("import", "depend", "require")):
        ops.append("IMPORTS")
    if not ops:
        ops = ["CALLS", "IMPORTS"]

    return {
        "schema_version": 1,
        "query": req.query,
        "intent": "code_retrieval",
        "domain_candidates": domain_candidates,
        "symbol_filters": {"kinds": kinds, "operations": ops},
        "retrieval": {
            "lexical": True,
            "semantic": True,
            "graph_hops": req.graph_hops,
            "candidate_limit": req.candidate_limit,
        },
        "canonical_authority": False,
        "writes_performed": False,
    }
