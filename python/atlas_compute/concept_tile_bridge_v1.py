"""Pure bridge from validated domain/N-ary evidence to CandidateConceptTileV1.
No IO, no DB, no cache writes, no claim that supplied proof was verified live.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
from typing import Mapping, Sequence
from .candidate_concept_tile_v1 import materialize, ConceptTileV1

def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",",":"), ensure_ascii=False).encode()).hexdigest()

@dataclass(frozen=True)
class EvidenceBindingV1:
    fact_id: str
    graph_revision: str
    checksum: str
    participant_ids: tuple[str,...]
    participant_roles: tuple[str,...]
    evidence_refs: tuple[str,...]

def parse_fact(value: Mapping[str,object], *, graph_revision: str, packet_key: str) -> EvidenceBindingV1:
    keys=("fact_id","graph_revision","checksum","participant_ids","participant_roles","evidence_refs")
    if any(k not in value for k in keys):
        raise ValueError("BRIDGE_FACT_FIELDS_MISSING")
    fid, gr, checksum=(str(value[k]).strip() for k in keys[:3])
    ids=value["participant_ids"]; roles=value["participant_roles"]; refs=value["evidence_refs"]
    if (not fid or not checksum or gr!=graph_revision or not isinstance(ids,(tuple,list))
        or not isinstance(roles,(tuple,list)) or not isinstance(refs,(tuple,list))
        or len(ids)<2 or len(ids)!=len(roles) or not refs):
        raise ValueError("BRIDGE_FACT_UNGROUNDED")
    if not all(isinstance(s,str) and s.strip() for s in [*ids,*roles,*refs]):
        raise ValueError("BRIDGE_FACT_BLANK")
    if packet_key not in ids:
        raise ValueError("BRIDGE_FACT_CANDIDATE_ABSENT")
    return EvidenceBindingV1(fid,gr,checksum,tuple(ids),tuple(roles),tuple(refs))

def project_candidates(candidates: Sequence[Mapping[str,object]]) -> ConceptTileV1:
    """Adapter for up to four already authorized candidate/evidence envelopes.

    Score derivation is left to caller's proven producers. This adapter validates
    evidence binding and derives only the count-based N-ary overlap indicator.
    """
    rows=[]
    for candidate in candidates:
        row=dict(candidate)
        packet=str(row.get("packet_key") or "")
        gr=str(row.get("graph_revision") or "")
        if not packet or not gr:
            raise ValueError("BRIDGE_CANDIDATE_IDENTITY_MISSING")
        facts=row.get("nary_facts",[])
        if not isinstance(facts,list):
            raise ValueError("BRIDGE_FACT_LIST_REQUIRED")
        verified=[parse_fact(f,graph_revision=gr,packet_key=packet) for f in facts]
        fact_ids=[f.fact_id for f in verified]
        if len(set(fact_ids))!=len(fact_ids):
            raise ValueError("BRIDGE_DUPLICATE_FACT")
        # Only derive from actual fact list if caller did not supply a score;
        # do not fabricate an overlap score without a query concept denominator.
        if "nary_fact_overlap" in row and row["nary_fact_overlap"] is not None and not verified:
            raise ValueError("BRIDGE_UNSUPPORTED_NARY_SCORE")
        rows.append(row)
    return materialize(rows)
