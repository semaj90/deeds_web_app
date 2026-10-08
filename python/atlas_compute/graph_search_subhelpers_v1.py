"""Bounded, read-only graph search + binary feature scoring CPU reference.
For frozen AST/Graphify snapshots. NEVER executes CRUD changes against sources.
"""
from __future__ import annotations
import heapq
import math
from collections import deque
from typing import Mapping, Sequence

def cosine(a:Sequence[float],b:Sequence[float])->float:
    if len(a)!=len(b) or not a: raise ValueError("VECTOR_DIM_MISMATCH")
    if not all(math.isfinite(x) for x in (*a,*b)): raise ValueError("VECTOR_NONFINITE")
    dot=sum(x*y for x,y in zip(a,b))
    na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(x*x for x in b))
    return dot/(na*nb) if na>0 and nb>0 else 0.0

def similarity_0_100(a,b)->float:
    """Affine scale maps cosine [-1,1] to [0,100]; not calibrated relevance."""
    return 50.0*(max(-1.,min(1.,cosine(a,b)))+1.)

def manhattan(a:Sequence[float],b:Sequence[float])->float:
    if len(a)!=len(b) or not a: raise ValueError("VECTOR_DIM_MISMATCH")
    if not all(math.isfinite(x) for x in (*a,*b)): raise ValueError("VECTOR_NONFINITE")
    return sum(abs(x-y) for x,y in zip(a,b))

def binary_polynomial(bits:Sequence[int], *,degree:int=2)->tuple[int,...]:
    """Boolean interaction monomials for degree 1 or 2; not a hash or identity."""
    if degree not in (1,2) or any(x not in (0,1) for x in bits): raise ValueError("BINARY_FEATURE_INVALID")
    out=list(bits)
    if degree==2: out.extend(bits[i]*bits[j] for i in range(len(bits)) for j in range(i+1,len(bits)))
    return tuple(out)

def bfs(adj:Mapping[str,Sequence[str]], start:str, *,max_nodes:int=128)->tuple[str,...]:
    if not 1<=max_nodes<=4096:raise ValueError("BFS_BUDGET")
    seen={start}; queue=deque([start]); out=[]
    while queue and len(out)<max_nodes:
        u=queue.popleft();out.append(u)
        for v in sorted(set(adj.get(u,()))):
            if v not in seen:seen.add(v);queue.append(v)
    return tuple(out)

def astar(adj:Mapping[str,Sequence[tuple[str,float]]],start:str,goal:str, *,
          heuristic:Mapping[str,float]|None=None,max_expansions:int=1024)->tuple[str,...]:
    """Dijkstra when heuristic omitted. Optimal only with admissible consistent heuristic."""
    if not 1<=max_expansions<=100000:raise ValueError("ASTAR_BUDGET")
    heuristic=heuristic or {}
    if any(not math.isfinite(v) or v<0 for v in heuristic.values()):raise ValueError("ASTAR_HEURISTIC_INVALID")
    pq=[(float(heuristic.get(start,0)),0.,start)]
    costs={start:0.};parents={};expanded=0
    while pq and expanded<max_expansions:
        _,g,u=heapq.heappop(pq)
        if g>costs.get(u,float("inf")):continue
        expanded+=1
        if u==goal:
            path=[u]
            while u in parents:u=parents[u];path.append(u)
            return tuple(reversed(path))
        for v,w in sorted(adj.get(u,()),key=lambda p:p[0]):
            if not math.isfinite(w) or w<0:raise ValueError("ASTAR_EDGE_WEIGHT_INVALID")
            cand=g+w
            if cand<costs.get(v,float("inf")):
                costs[v]=cand;parents[v]=u
                heapq.heappush(pq,(cand+heuristic.get(v,0),cand,v))
    return ()

def greedy_best_first(adj:Mapping[str,Sequence[str]],start:str,goal:str,
                      heuristic:Mapping[str,float],*,max_expansions:int=1024)->tuple[str,...]:
    """Heuristic-only greedy traversal, not guaranteed optimal."""
    if not 1<=max_expansions<=100000:raise ValueError("GREEDY_BUDGET")
    pq=[(heuristic.get(start,0.),start)];seen=set();parent={};expanded=0
    while pq and expanded<max_expansions:
        _,u=heapq.heappop(pq)
        if u in seen:continue
        seen.add(u);expanded+=1
        if u==goal:
            path=[u]
            while u in parent:u=parent[u];path.append(u)
            return tuple(reversed(path))
        for v in sorted(set(adj.get(u,()))):
            h=heuristic.get(v,0.)
            if not math.isfinite(h) or h<0:raise ValueError("GREEDY_HEURISTIC_INVALID")
            if v not in seen and v not in parent:parent[v]=u;heapq.heappush(pq,(h,v))
    return ()

def louvain_partition(graph, *,seed:int=42)->tuple[tuple[str,...],...]:
    import networkx as nx
    parts=nx.community.louvain_communities(graph,seed=seed)
    return tuple(sorted(tuple(sorted(str(x) for x in group)) for group in parts))
