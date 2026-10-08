"""Read-only capability/provenance preflight: no GPU allocations, no datastore writes.

Requires independent source readback before a snapshot can be used for tests.
This module deliberately does not claim CPU/GPU parity.
"""
from __future__ import annotations
from dataclasses import asdict,dataclass
from importlib.util import find_spec
from typing import Mapping
from .gnn_snapshot_admission_v1 import freeze_input

@dataclass(frozen=True)
class ProofPlan:
    schema: str
    graph_revision: str
    ordinal_checksum: str
    nodes: int
    edges: int
    torch_available: bool
    nx_cugraph_available: bool
    cuvs_available: bool
    cpu_reference_required: bool
    gpu_executed: bool
    lineage_readback_proven: bool

def plan(nodes,edges,*,authoritative_readback: Mapping[str,str]|None=None):
    frozen=freeze_input(nodes,edges)
    verified=bool(authoritative_readback) and (
        authoritative_readback.get("graph_revision")==frozen.graph_revision
        and authoritative_readback.get("ordinal_checksum")==frozen.checksum
        and authoritative_readback.get("source")=="CANONICAL_READBACK"
    )
    return ProofPlan("atlas.graph-gpu-proof-plan.v1",frozen.graph_revision,
        frozen.checksum,len(frozen.ordered_packet_keys),len(frozen.edges),
        find_spec("torch") is not None,
        find_spec("nx_cugraph") is not None,
        find_spec("cuvs") is not None,True,False,verified)
