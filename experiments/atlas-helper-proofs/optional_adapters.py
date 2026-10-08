"""No-network CPU adapters. Optional dependencies are imported only on invocation."""
from __future__ import annotations
from cpu_helpers import dag_topology, canonical_json_bytes, digest
import json

def parse_json_object(data: bytes, max_bytes: int=2_000_000, backend: str='stdlib') -> dict:
    if not isinstance(data, bytes) or len(data) > max_bytes:
        raise ValueError('INVALID_JSON_BYTES')
    if backend == 'stdlib':
        result = json.loads(data)
    elif backend == 'simdjson':
        try:
            import simdjson
        except ImportError as exc:
            raise RuntimeError('SIMDJSON_NOT_INSTALLED') from exc
        result = simdjson.Parser().parse(data, recursive=True)
    else:
        raise ValueError('UNKNOWN_JSON_BACKEND')
    if not isinstance(result, dict): raise ValueError('JSON_OBJECT_REQUIRED')
    return result

def networkx_dag_parity(nodes: list[str], edges: list[tuple[str,str]]) -> dict:
    """Optional comparison with the same explicit node/edge contract."""
    order = dag_topology(nodes, edges)
    try:
        import networkx as nx
    except ImportError as exc:
        raise RuntimeError('NETWORKX_NOT_INSTALLED') from exc
    graph = nx.DiGraph(); graph.add_nodes_from(nodes); graph.add_edges_from(edges)
    if not nx.is_directed_acyclic_graph(graph): raise ValueError('CYCLIC_DAG')
    if set(nx.topological_sort(graph)) != set(order): raise ValueError('TOPOLOGY_MISMATCH')
    return {'status':'CPU_PARITY_ONLY', 'nodes':len(nodes), 'edges':len(edges),
            'canonical_order':order, 'graph_checksum':digest({'nodes':sorted(nodes),'edges':sorted(edges)})}

def validated_jsonl_events(lines: list[bytes], max_bytes: int=2_000_000) -> list[dict]:
    """CPU-only bounded Kafka event preparation; no Kafka producer."""
    events=[]
    for index, line in enumerate(lines):
        record=parse_json_object(line,max_bytes)
        if not isinstance(record.get('event_id'),str) or not record['event_id']:
            raise ValueError(f'MISSING_EVENT_ID:{index}')
        if not isinstance(record.get('packet_key'),str) or not record['packet_key']:
            raise ValueError(f'MISSING_PACKET_KEY:{index}')
        events.append(record)
    ids=[event['event_id'] for event in events]
    if len(ids)!=len(set(ids)):raise ValueError('DUPLICATE_EVENT_ID')
    return events
