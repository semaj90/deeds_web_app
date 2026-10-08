"""Proposal-only deterministic CPU reference helpers. No store or runtime side effects."""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
import json, math
from typing import Mapping

def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False).encode('utf-8')

def digest(value: object) -> str:
    return 'sha256:' + sha256(canonical_json_bytes(value)).hexdigest()

def dense_features(values: Mapping[str, float], registry: Mapping[str, int]) -> tuple[float, ...]:
    if not registry or sorted(registry.values()) != list(range(len(registry))):
        raise ValueError('INVALID_REGISTRY')
    if set(values) - set(registry):
        raise ValueError('UNKNOWN_FEATURE')
    result = [0.0] * len(registry)
    for key, value in values.items():
        if type(value) not in (float, int) or not math.isfinite(value):
            raise ValueError('INVALID_FEATURE')
        result[registry[key]] = float(value)
    return tuple(result)

@dataclass(frozen=True)
class SourceSpan:
    source_ref: str
    source_revision: str
    start_byte: int
    end_byte: int
    language: str
    node_type: str
    def __post_init__(self):
        if not self.source_ref or not self.source_revision.startswith('sha256:') or len(self.source_revision) != 71:
            raise ValueError('UNQUALIFIED_SOURCE')
        if not (0 <= self.start_byte < self.end_byte):
            raise ValueError('INVALID_SPAN')

def chunk_from_tree_sitter(source: bytes, root: object, source_ref: str, language: str,
                            allowed_types: set[str]) -> list[SourceSpan]:
    """Adapter for an already-created tree-sitter node; does not own parsing."""
    revision = 'sha256:' + sha256(source).hexdigest()
    spans: list[SourceSpan] = []
    def walk(node: object) -> None:
        node_type = getattr(node, 'type')
        start, end = getattr(node, 'start_byte'), getattr(node, 'end_byte')
        if not isinstance(start, int) or not isinstance(end, int) or not (0 <= start <= end <= len(source)):
            raise ValueError('INVALID_TREE_SITTER_COORDINATES')
        if node_type in allowed_types and start < end:
            spans.append(SourceSpan(source_ref, revision, start, end, language, node_type))
        for child in getattr(node, 'children', ()):
            walk(child)
    walk(root)
    return sorted(spans, key=lambda span: (span.start_byte, span.end_byte, span.node_type))

def exact_cosine(query: tuple[float, ...], rows: Mapping[str, tuple[float, ...]], top_k: int = 5) -> list[tuple[str, float]]:
    """CPU exact-search oracle, NOT an ANN/TurboVec index."""
    if top_k < 0 or not query or not all(math.isfinite(x) for x in query):
        raise ValueError('INVALID_QUERY')
    nq = math.sqrt(sum(x*x for x in query))
    if nq == 0: raise ValueError('ZERO_QUERY_NORM')
    result = []
    for key, row in rows.items():
        if len(row) != len(query) or not all(math.isfinite(x) for x in row):
            raise ValueError('INVALID_ROW')
        nr = math.sqrt(sum(x*x for x in row))
        if nr == 0: raise ValueError('ZERO_ROW_NORM')
        result.append((key, sum(a*b for a,b in zip(query,row))/(nq*nr)))
    return sorted(result, key=lambda x: (-x[1], x[0]))[:top_k]

def dag_topology(nodes: list[str], edges: list[tuple[str, str]]) -> list[str]:
    """Dependency to dependent edges; deterministic CPU Kahn topological order."""
    if len(set(nodes)) != len(nodes): raise ValueError('DUPLICATE_NODE')
    incoming = {n: 0 for n in nodes}
    outgoing = {n: set() for n in nodes}
    for src, dst in edges:
        if src not in incoming or dst not in incoming: raise ValueError('UNKNOWN_NODE')
        if dst in outgoing[src]: raise ValueError('DUPLICATE_EDGE')
        outgoing[src].add(dst); incoming[dst] += 1
    ready = sorted(n for n,d in incoming.items() if d == 0)
    result = []
    while ready:
        n = ready.pop(0); result.append(n)
        for dst in sorted(outgoing[n]):
            incoming[dst] -= 1
            if incoming[dst] == 0:
                ready.append(dst); ready.sort()
    if len(result) != len(nodes): raise ValueError('CYCLIC_DAG')
    return result

def action_receipt(request_id: str, execution_id: str, plan_revision: str,
                   nodes: list[str], edges: list[tuple[str, str]]) -> dict:
    if not all((request_id, execution_id, plan_revision)):
        raise ValueError('MISSING_EXECUTION_IDENTITY')
    order = dag_topology(nodes, edges)
    data = {'request_id':request_id,'execution_id':execution_id,
            'plan_revision':plan_revision,'execution_order':order, 'edges':edges}
    return {'status':'PLAN_VALIDATED_PROPOSAL_ONLY','plan':data,'checksum':digest(data)}
