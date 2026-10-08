"""Pure read-only DAG planning and append-only event validation oracle.

NetworkX is transient computation. This module NEVER persists events or writes
canonical packet state. Production state ownership remains in existing TS DAG
and OpenSpec evidence_receipts implementations.
"""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Mapping, Sequence

STATES=("PENDING","READY","RUNNING","SUCCEEDED","FAILED","CANCELLED")
TRANSITIONS={"PENDING":{"READY","CANCELLED"},"READY":{"RUNNING","CANCELLED"},
 "RUNNING":{"SUCCEEDED","FAILED","CANCELLED"},"FAILED":{"READY"}}
@dataclass(frozen=True)
class FrozenDag:
    revision: str
    nodes: tuple[str,...]
    edges: tuple[tuple[str,str],...]
    topological: tuple[str,...]
    checksum: str

def freeze_dag(nodes:Sequence[str],edges:Sequence[tuple[str,str]],*,revision:str)->FrozenDag:
    import networkx as nx
    if not revision.strip() or not nodes or any(not isinstance(n,str) or not n for n in nodes):
        raise ValueError("DAG_INVALID_IDENTITY")
    if len(set(nodes))!=len(nodes): raise ValueError("DAG_DUPLICATE_NODE")
    node_set=set(nodes)
    pairs=[]
    for edge in edges:
        if len(edge)!=2 or edge[0] not in node_set or edge[1] not in node_set:
            raise ValueError("DAG_UNKNOWN_ENDPOINT")
        pairs.append(tuple(edge))
    if len(set(pairs))!=len(pairs): raise ValueError("DAG_DUPLICATE_EDGE")
    graph=nx.DiGraph()
    graph.add_nodes_from(sorted(nodes))
    graph.add_edges_from(sorted(pairs))
    if not nx.is_directed_acyclic_graph(graph): raise ValueError("DAG_CYCLE")
    order=tuple(nx.lexicographical_topological_sort(graph))
    snapshot={"revision":revision,"nodes":sorted(nodes),"edges":sorted(pairs)}
    checksum=sha256(json.dumps(snapshot,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    return FrozenDag(revision,tuple(sorted(nodes)),tuple(sorted(pairs)),order,checksum)

@dataclass(frozen=True)
class TransitionReceipt:
    dag_revision: str
    dag_checksum: str
    run_id: str
    step_id: str
    sequence: int
    prior_state: str
    next_state: str
    evidence_digest: str
    event_digest: str

def apply_transition(dag:FrozenDag,current:Mapping[str,str],*,run_id:str,step_id:str,
                     next_state:str,sequence:int,evidence_digest:str)->tuple[dict[str,str],TransitionReceipt]:
    if step_id not in dag.nodes or not run_id or not evidence_digest or sequence<1:
        raise ValueError("DAG_EVENT_FIELDS_INVALID")
    prior=current.get(step_id,"PENDING")
    if next_state not in TRANSITIONS.get(prior,set()):
        raise ValueError("DAG_INVALID_TRANSITION")
    if next_state=="READY":
        parents=(a for a,b in dag.edges if b==step_id)
        if any(current.get(parent,"PENDING")!="SUCCEEDED" for parent in parents):
            raise ValueError("DAG_DEPENDENCY_NOT_SUCCEEDED")
    new=dict(current)
    new[step_id]=next_state
    payload=dict(revision=dag.revision,checksum=dag.checksum,run=run_id,step=step_id,
        sequence=sequence,prior=prior,next=next_state,evidence=evidence_digest)
    receipt=TransitionReceipt(dag.revision,dag.checksum,run_id,step_id,sequence,
        prior,next_state,evidence_digest,sha256(json.dumps(payload,sort_keys=True,separators=(",",":")).encode()).hexdigest())
    return new,receipt
