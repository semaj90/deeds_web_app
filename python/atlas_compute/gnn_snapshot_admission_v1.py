"""Frozen graph-input admission before CPU GraphSAGE or cuGraph parity.

A pure structural validation gate: caller-provided digests are not independently
checked against PostgreSQL; missing real readback remains a separate proof gate.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib,json
from typing import Sequence,Mapping
REQUIRED=("packet_key","source_revision","workspace_revision","graph_revision",
          "feature_revision","ordinal","evidence_digest")
@dataclass(frozen=True)
class FrozenInput:
    graph_revision:str
    ordered_packet_keys:tuple[str,...]
    edges:tuple[tuple[int,int,str],...]
    checksum:str

def freeze_input(nodes:Sequence[Mapping[str,object]],edges:Sequence[Mapping[str,object]])->FrozenInput:
    if not nodes: raise ValueError("GNN_EMPTY_NODES")
    seen=set(); ords=set()
    for n in nodes:
        if any(n.get(k) is None or str(n[k]).strip()=="" for k in REQUIRED):
            raise ValueError("GNN_LINEAGE_MISSING")
        key=n["packet_key"]
        if key in seen or not isinstance(n["ordinal"],int) or n["ordinal"]<0 or n["ordinal"] in ords:
            raise ValueError("GNN_ORDINAL_DUPLICATE_OR_INVALID")
        seen.add(key);ords.add(n["ordinal"])
    ordered=sorted(nodes,key=lambda n:n["ordinal"])
    if [n["ordinal"] for n in ordered]!=list(range(len(ordered))):
        raise ValueError("GNN_ORDINAL_GAP")
    versions={(n["graph_revision"],n["workspace_revision"],n["feature_revision"]) for n in nodes}
    if len(versions)!=1:raise ValueError("GNN_SNAPSHOT_REVISION_MISMATCH")
    graph_revision=ordered[0]["graph_revision"]
    edge_set=set()
    for e in edges:
        src,dst,kind=e.get("source"),e.get("target"),e.get("kind")
        if not isinstance(src,int) or not isinstance(dst,int) or src not in ords or dst not in ords or not kind or not e.get("evidence_digest") or e.get("graph_revision")!=graph_revision:
            raise ValueError("GNN_EDGE_UNGROUNDED")
        edge_set.add((src,dst,str(kind)))
    sorted_edges=tuple(sorted(edge_set))
    payload={"nodes":[{k:str(n[k]) for k in REQUIRED} for n in ordered],"edges":sorted_edges}
    checksum=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return FrozenInput(str(graph_revision),tuple(str(n["packet_key"]) for n in ordered),sorted_edges,checksum)
