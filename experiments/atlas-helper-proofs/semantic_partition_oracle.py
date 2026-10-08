"""Frozen semantic-vector partition hints compared to full exact CPU kNN.

This is an evaluation oracle, not a cuVS call or an admitted retrieval lane.
Graph expansion requires explicit typed, externally verified packet edges.
"""
import math

def _distance(a, b):
    return sum((x-y)**2 for x,y in zip(a,b))

def compare_partition_recall(vectors, packet_keys, assignments, query, centers,
                             probe_clusters=1, k=5, typed_edges=()):
    if not vectors or not packet_keys or len(vectors)!=len(packet_keys) or len(assignments)!=len(vectors):
        raise ValueError("INVALID_DATASET")
    dim=len(query)
    if dim != 768 or len(set(packet_keys))!=len(packet_keys):
        raise ValueError("INVALID_SEMANTIC_768")
    if not centers or not 1<=probe_clusters<=len(centers) or not 1<=k<=len(vectors):
        raise ValueError("INVALID_SEARCH_ARGUMENT")
    if any(len(x)!=dim for x in list(vectors)+list(centers)):
        raise ValueError("DIMENSION_MISMATCH")
    if any(not math.isfinite(v) for x in list(vectors)+list(centers)+[query] for v in x):
        raise ValueError("NONFINITE_VECTOR")
    if any(type(a) is not int or not 0<=a<len(centers) for a in assignments):
        raise ValueError("INVALID_CLUSTER_ASSIGNMENT")
    ranks=sorted(range(len(vectors)),key=lambda i:(_distance(query,vectors[i]),packet_keys[i]))
    truth=[packet_keys[i] for i in ranks[:k]]
    selected=set(sorted(range(len(centers)),key=lambda i:(_distance(query,centers[i]),i))[:probe_clusters])
    candidates=[i for i,a in enumerate(assignments) if a in selected]
    sparse=sorted(candidates,key=lambda i:(_distance(query,vectors[i]),packet_keys[i]))
    hinted=[packet_keys[i] for i in sparse[:k]]
    allowed_keys=set(packet_keys)
    graph={}
    for src,dst,kind in typed_edges:
        if src not in allowed_keys or dst not in allowed_keys or not kind:
            raise ValueError("UNQUALIFIED_GRAPH_EDGE")
        graph.setdefault(src,set()).add(dst)
    expanded=set(hinted)
    for key in hinted:
        expanded.update(graph.get(key,()))
    final=sorted((i for i,p in enumerate(packet_keys) if p in expanded),
                 key=lambda i:(_distance(query,vectors[i]),packet_keys[i]))
    reranked=[packet_keys[i] for i in final[:k]]
    denom=len(truth)
    return {"schema":"atlas.semantic-partition-eval.v1","full_exact_topk":truth,
            "hinted_topk":hinted,"expanded_topk":reranked,
            "partition_recall_at_k":len(set(hinted)&set(truth))/denom,
            "expanded_recall_at_k":len(set(reranked)&set(truth))/denom,
            "partition_candidate_count":len(candidates),
            "status":"EVALUATION_ONLY","oracle":"CPU_FULL_EXACT_SQUARED_L2",
            "gpu_cuvs_parity":"NOT_RUN","canonical_authority":False}
