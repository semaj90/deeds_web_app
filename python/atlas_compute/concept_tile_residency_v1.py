"""Pure immutable cache-key / lease transition contract (no cache writes)."""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
from typing import Mapping

STATES=("UNRESOLVED","GROUNDED","FEATURED","VALIDATED","INDEX_REFERENCED","CACHED","CONTEXT_ADMITTED","PREFILL_BOUND","REUSED","EVICTED","REJECTED","INVALIDATED")
NEXT={
 "UNRESOLVED":{"GROUNDED","REJECTED"}, "GROUNDED":{"FEATURED","REJECTED"},
 "FEATURED":{"VALIDATED","REJECTED"}, "VALIDATED":{"INDEX_REFERENCED","REJECTED"},
 "INDEX_REFERENCED":{"CACHED","REJECTED"}, "CACHED":{"CONTEXT_ADMITTED","INVALIDATED","EVICTED"},
 "CONTEXT_ADMITTED":{"PREFILL_BOUND","INVALIDATED"}, "PREFILL_BOUND":{"REUSED","INVALIDATED"},
 "REUSED":{"EVICTED","INVALIDATED"}, "INVALIDATED":{"UNRESOLVED"},
}
REQUIRED=("packet_key","source_revision","workspace_revision","graph_revision","representation_revision","domain_taxonomy_revision","feature_schema_revision","tile_checksum","evidence_checksum","cache_generation","lease_id")

def descriptor_key(fields: Mapping[str,object])->str:
    identity={}
    for key in REQUIRED:
        v=fields.get(key)
        if not isinstance(v,(str,int)) or not str(v).strip():
            raise ValueError("RESIDENCY_FIELD_MISSING:"+key)
        identity[key]=str(v)
    return hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(",",":")).encode()).hexdigest()

@dataclass(frozen=True)
class TileState:
    state: str
    descriptor: str

def transition(current: TileState, target: str, *, descriptor: str)->TileState:
    if target not in STATES or target not in NEXT.get(current.state,set()):
        raise ValueError("RESIDENCY_TRANSITION_FORBIDDEN")
    if descriptor != current.descriptor and target not in {"INVALIDATED","REJECTED"}:
        raise ValueError("RESIDENCY_DESCRIPTOR_MISMATCH")
    return TileState(target, descriptor if target=="INVALIDATED" else current.descriptor)
