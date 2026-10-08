"""Fail-closed alignment of graph ranks to an already identified [C,25] row map."""
from dataclasses import dataclass
from math import isfinite

@dataclass(frozen=True)
class QualifiedRow:
    packet_key: str
    source_revision: str
    workspace_revision: str
    graph_revision: str
    graph_node_id: str

def align_graph_ranks(rows, scores, graph_revision):
    rows=tuple(rows)
    scores=tuple(scores)
    if not graph_revision or not rows or len({r.packet_key for r in rows})!=len(rows):
        raise ValueError("INVALID_ROW_MAP")
    if any(not all((r.packet_key,r.source_revision,r.workspace_revision,r.graph_revision,r.graph_node_id)) or r.graph_revision!=graph_revision for r in rows):
        raise ValueError("REVISION_UNQUALIFIED")
    mapping={}
    for entry in scores:
        if entry.node in mapping or not all(isfinite(x) and x>=0 for x in (entry.pagerank,entry.cheirank)):
            raise ValueError("INVALID_GRAPH_RANK")
        mapping[entry.node]=entry
    if {r.graph_node_id for r in rows} != set(mapping):
        raise ValueError("GRAPH_ROW_COVERAGE_MISMATCH")
    return tuple({"packet_key":r.packet_key,"graph_revision":graph_revision,
                  "pagerank":mapping[r.graph_node_id].pagerank,
                  "cheirank":mapping[r.graph_node_id].cheirank,
                  "status":"PROPOSAL_ONLY"} for r in rows)
