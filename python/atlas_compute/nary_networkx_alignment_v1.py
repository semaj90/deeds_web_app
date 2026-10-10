"""Revision-pinned N-ary incidence projection and bounded NetworkX CPU oracle.
Read-only. Requires preverified evidence envelopes; this module is not a DB verifier.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping, Sequence
import hashlib
import json

@dataclass(frozen=True)
class GraphSnapshot:
    graph_revision: str
    nodes: tuple[str,...]
    edges: tuple[tuple[str,str,str],...]
    fact_nodes: tuple[str,...]
    checksum: str

def build_snapshot(facts: Sequence[Mapping[str,object]], *, graph_revision: str) -> GraphSnapshot:
    if not graph_revision.strip(): raise ValueError("GRAPH_REVISION_REQUIRED")
    nodes=set(); edges=set(); fact_nodes=set(); ids=set()
    for fact in facts:
        fid=str(fact.get("fact_id") or "")
        if not fid or fid in ids: raise ValueError("GRAPH_FACT_ID_DUPLICATE_OR_MISSING")
        ids.add(fid)
        if fact.get("graph_revision")!=graph_revision: raise ValueError("GRAPH_FACT_REVISION_MISMATCH")
        if not fact.get("checksum") or not fact.get("evidence_refs"):
            raise ValueError("GRAPH_FACT_EVIDENCE_REQUIRED")
        participants=fact.get("participant_ids")
        roles=fact.get("participant_roles")
        if not isinstance(participants,(tuple,list)) or not isinstance(roles,(tuple,list)) or len(participants)<2 or len(roles)!=len(participants):
            raise ValueError("GRAPH_FACT_ROLES_MISMATCH")
        fact_node="fact:"+fid
        fact_nodes.add(fact_node); nodes.add(fact_node)
        for participant,role in zip(participants,roles):
            if not isinstance(participant,str) or not participant.strip() or not isinstance(role,str) or not role.strip():
                raise ValueError("GRAPH_FACT_PARTICIPANT_INVALID")
            node="packet:"+participant
            nodes.add(node); edges.add((fact_node,node,role))
    ordered_nodes=tuple(sorted(nodes))
    ordered_edges=tuple(sorted(edges))
    payload=dict(revision=graph_revision,nodes=ordered_nodes,edges=ordered_edges)
    checksum=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return GraphSnapshot(graph_revision,ordered_nodes,ordered_edges,tuple(sorted(fact_nodes)),checksum)

def bounded_neighbors(snapshot: GraphSnapshot, *, packet_key: str, max_hops:int=2, max_nodes:int=128) -> tuple[str,...]:
    import networkx as nx
    if not 0<=max_hops<=4 or not 1<=max_nodes<=4096: raise ValueError("GRAPH_BUDGET_INVALID")
    origin="packet:"+packet_key
    if origin not in snapshot.nodes: return ()
    graph=nx.Graph()
    graph.add_nodes_from(snapshot.nodes)
    graph.add_edges_from((a,b) for a,b,_ in snapshot.edges)
    distances=nx.single_source_shortest_path_length(graph, origin, cutoff=max_hops)
    return tuple(x for x in sorted(distances,key=lambda n:(distances[n],n))[:max_nodes] if x!=origin)

def pagerank_cpu(snapshot: GraphSnapshot, *, alpha:float=.85)->dict[str,float]:
    import networkx as nx
    graph=nx.DiGraph()
    graph.add_nodes_from(snapshot.nodes)
    # Preserve the canonical tuple -> participant direction. This incidence
    # projection is still not a canonical typed code edge or an admitted fact.
    graph.add_edges_from((a,b) for a,b,_ in snapshot.edges)
    return dict(nx.pagerank(graph,alpha=alpha)) if snapshot.nodes else {}
