"""Opt-in chunker / ast-grep / NetworkX alignment; no registry writes.

AST/CST spans are observations. Only caller-provided qualified membership
can supply canonical packet/symbol identity and graph edges.
"""
from dataclasses import dataclass
from hashlib import sha256
from typing import Iterable

@dataclass(frozen=True)
class AstObservation:
    source_ref: str
    source_revision: str
    language: str
    node_type: str
    start_byte: int
    end_byte: int
    content_hash: str

def ast_grep_observations(source: bytes, source_ref: str, language: str, kind: str):
    if not isinstance(source, bytes) or not source_ref or not language or not kind:
        raise ValueError("INVALID_SOURCE")
    try:
        from ast_grep_py import SgRoot
    except ImportError as exc:
        raise RuntimeError("AST_GREP_PY_NOT_INSTALLED") from exc
    parsed = SgRoot(source.decode("utf-8"), language).root()
    revision = "sha256:" + sha256(source).hexdigest()
    result = []
    for node in parsed.find_all(kind=kind):
        interval = node.range()
        a, b = interval.start.index, interval.end.index
        if not 0 <= a < b <= len(source):
            raise ValueError("INVALID_AST_SPAN")
        content = source[a:b]
        if content.decode("utf-8") != node.text():
            raise ValueError("AST_SPAN_CONTENT_MISMATCH")
        result.append(AstObservation(source_ref,revision,language,node.kind(),a,b,
                                     "sha256:" + sha256(content).hexdigest()))
    return tuple(result)

def align_exact(chunks: Iterable, observations: Iterable[AstObservation]):
    """Only byte-exact and revision-exact matches qualify; no fuzzy nearest span."""
    index = {}
    for obs in observations:
        key = (obs.source_ref,obs.source_revision,obs.start_byte,obs.end_byte,obs.content_hash)
        index.setdefault(key,[]).append(obs)
    out = []
    for chunk in chunks:
        key=(chunk.source_ref,chunk.source_revision,chunk.start_byte,chunk.end_byte,chunk.content_hash)
        matches=index.get(key,[])
        out.append({"chunk": chunk, "ast": matches[0] if len(matches)==1 else None,
                    "status": "EXACT_SYNTAX_SPAN" if len(matches)==1 else
                    ("AMBIGUOUS_AST_SPAN" if matches else "UNMATCHED_AST_SPAN")})
    return out

def explicit_graph(nodes: Iterable[str], edges: Iterable[tuple[str,str]], limit: int=10000):
    """NetworkX oracle for already-grounded directed edges, not inferred calls."""
    try:
        import networkx as nx
    except ImportError as exc:
        raise RuntimeError("NETWORKX_NOT_INSTALLED") from exc
    vertices=tuple(nodes)
    links=tuple(edges)
    if not 0 < len(vertices) <= limit or len(set(vertices)) != len(vertices):
        raise ValueError("INVALID_GRAPH_NODES")
    if len(links)>limit*4 or any(a not in vertices or b not in vertices for a,b in links):
        raise ValueError("INVALID_GRAPH_EDGES")
    g=nx.DiGraph()
    g.add_nodes_from(vertices)
    g.add_edges_from(links)
    if not nx.is_directed_acyclic_graph(g):
        raise ValueError("GRAPH_CYCLE")
    return {"nodes": tuple(sorted(g.nodes)), "edges":tuple(sorted(g.edges)),
            "order":tuple(nx.lexicographical_topological_sort(g,key=str)),
            "canonical_authority":False, "writes_performed":False}
