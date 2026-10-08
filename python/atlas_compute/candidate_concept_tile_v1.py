"""Read-only 4x6 feature tile; revision-qualified N-ary concept join.
Fixture adapter only: source-provided PROVEN flags are not live lineage proof.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import math
from typing import Iterable, Mapping

FEATURES=("exact_match","semantic_score","domain_alignment","nary_fact_overlap","graph_prior","provenance_confidence")
IDENTITY=("packet_key","source_revision","workspace_revision","graph_revision","representation_revision","domain_taxonomy_revision","feature_schema_revision")
@dataclass(frozen=True)
class ConceptTileV1:
    values: tuple[tuple[float,...],...]
    missing: tuple[tuple[int,...],...]
    valid_rows: tuple[int,...]
    identities: tuple[tuple[str,...],...]
    checksum: str

def materialize(rows: Iterable[Mapping[str,object]], *, row_count:int=4)->ConceptTileV1:
    if row_count != 4: raise ValueError("TILE_4_ROWS_REQUIRED")
    normalized=[]
    seen=set()
    for row in rows:
        key=tuple(str(row.get(k) or "").strip() for k in IDENTITY)
        if not all(key) or row.get("revision_status")!="PROVEN":
            raise ValueError("TILE_IDENTITY_UNPROVEN")
        if key in seen: raise ValueError("TILE_DUPLICATE_IDENTITY")
        seen.add(key)
        facts=row.get("nary_facts",[])
        if not isinstance(facts,list): raise ValueError("TILE_FACTS_NOT_LIST")
        for fact in facts:
            if not isinstance(fact,dict) or not all(fact.get(k) for k in ("fact_id","checksum","evidence_refs","participant_roles","participant_ids","graph_revision")):
                raise ValueError("TILE_FACT_UNGROUNDED")
            if fact["graph_revision"]!=key[3] or len(fact["participant_ids"])!=len(fact["participant_roles"]):
                raise ValueError("TILE_FACT_REVISION_OR_ROLES")
        vals=[]; miss=[]
        for name in FEATURES:
            absent=row.get(name) is None
            val=0.0 if absent else float(row[name])
            if not math.isfinite(val): raise ValueError("TILE_NONFINITE")
            vals.append(val); miss.append(int(absent))
        normalized.append((key,tuple(vals),tuple(miss)))
    if len(normalized)>4: raise ValueError("TILE_OVERFLOW")
    normalized.sort(key=lambda r:r[0])
    count=len(normalized)
    keys=tuple(r[0] for r in normalized)
    vals=tuple(r[1] for r in normalized)+((0.,)*6,)*(4-count)
    miss=tuple(r[2] for r in normalized)+((1,)*6,)*(4-count)
    valid=tuple([1]*count+[0]*(4-count))
    blob=json.dumps({"schema":"atlas.candidate-concept-tile.v1","features":FEATURES,"identity":keys,"values":vals,"missing":miss,"valid":valid},sort_keys=True,separators=(",",":"))
    return ConceptTileV1(vals,miss,valid,keys,hashlib.sha256(blob.encode()).hexdigest())
