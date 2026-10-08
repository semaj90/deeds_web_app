"""Read-only NetworkX / optional nx-cugraph / cuVS alignment oracle.
Graph edges encode evidence relationships; nearest-neighbor indices encode similarity.
No canonical store writes; no invented graph revisions.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
from typing import Sequence

@dataclass(frozen=True)
class FrozenSnapshot:
    canonical_ids: tuple[str, ...]
    graph_revision: str
    representation_revision: str
    edges: tuple[tuple[int, int], ...]
    vectors: object

    def validated(self):
        import numpy as np
        if not self.graph_revision or not self.representation_revision:
            raise ValueError("REVISION_REQUIRED")
        if len(set(self.canonical_ids)) != len(self.canonical_ids):
            raise ValueError("DUPLICATE_CANONICAL_ID")
        x=np.asarray(self.vectors, dtype=np.float32)
        if x.shape != (len(self.canonical_ids),768) or not np.isfinite(x).all():
            raise ValueError("SEMANTIC_768_INVALID")
        if any(a<0 or b<0 or a>=len(self.canonical_ids) or b>=len(self.canonical_ids) for a,b in self.edges):
            raise ValueError("EDGE_ORDINAL_INVALID")
        return np.ascontiguousarray(x)

    def checksum(self):
        x=self.validated()
        header=json.dumps(dict(ids=self.canonical_ids,graph_revision=self.graph_revision,
          representation_revision=self.representation_revision,edges=self.edges),
          sort_keys=True,separators=(",",":")).encode()
        return hashlib.sha256(header+x.tobytes()).hexdigest()

def graph_bfs(snapshot:FrozenSnapshot, source:int, *, backend:str="networkx", cutoff:int=2):
    """Same frozen ordinals; fail closed if GPU backend is unavailable."""
    snapshot.validated()
    if source<0 or source>=len(snapshot.canonical_ids) or cutoff<0: raise ValueError("INVALID_SOURCE_OR_CUTOFF")
    import networkx as nx
    graph=nx.DiGraph()
    graph.add_nodes_from(range(len(snapshot.canonical_ids)))
    graph.add_edges_from(snapshot.edges)
    if backend=="networkx":
        result=nx.single_source_shortest_path_length(graph,source,cutoff=cutoff)
    elif backend=="cugraph":
        import nx_cugraph  # noqa:F401 : capability fail-closed
        result=nx.single_source_shortest_path_length(graph,source,cutoff=cutoff,backend="cugraph")
    else:
        raise ValueError("INVALID_GRAPH_BACKEND")
    return tuple(sorted((int(k),int(v)) for k,v in result.items()))

def exact_knn_cpu(snapshot:FrozenSnapshot, query, *, k:int=10):
    import numpy as np
    vectors=snapshot.validated()
    q=np.asarray(query,dtype=np.float32)
    if q.shape!=(768,) or not np.isfinite(q).all() or not 1<=k<=len(vectors):
        raise ValueError("KNN_QUERY_INVALID")
    # Squared Euclidean reference, stable ties by canonical ordinal.
    distances=np.sum((vectors.astype(np.float64)-q.astype(np.float64))**2,axis=1)
    order=np.lexsort((np.arange(len(distances)),distances))[:k]
    return tuple((int(i),float(distances[i])) for i in order)

def exact_knn_cuvs(snapshot:FrozenSnapshot,query,*,k:int=10):
    """Opt-in real GPU execution; caller must ensure device residency budget."""
    import numpy as np
    import cupy as cp
    from cuvs.neighbors import brute_force
    vectors=snapshot.validated()
    q=np.asarray(query,dtype=np.float32)
    if q.shape!=(768,) or not np.isfinite(q).all() or not 1<=k<=len(vectors):
        raise ValueError("KNN_QUERY_INVALID")
    dataset=cp.asarray(vectors)
    queries=cp.asarray(q.reshape(1,768))
    index=brute_force.build(dataset,metric="sqeuclidean")
    distances, neighbors=brute_force.search(index,queries,k)
    cp.cuda.get_current_stream().synchronize()
    d=cp.asnumpy(distances)[0]; ix=cp.asnumpy(neighbors)[0]
    return tuple(sorted(((int(i),float(v)) for i,v in zip(ix,d)),key=lambda p:(p[1],p[0])))

def knn_overlap(reference,challenger):
    return len({i for i,_ in reference}&{i for i,_ in challenger})/len(reference)
