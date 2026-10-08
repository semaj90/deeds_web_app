"""HYBRID-01/02/03/06: CPU-only frozen-candidate ablations, not a new RRF owner."""
import math
from collections import defaultdict
from datetime import datetime, timezone

def graph_activation(seeds, edges, depth=2, decay=.5):
    if not 0<=depth<=4 or not 0<decay<=1: raise ValueError("INVALID_GRAPH_CONFIG")
    state={k:float(v) for k,v in seeds.items()}
    if any(not math.isfinite(x) or x<0 for x in state.values()): raise ValueError("INVALID_SEED")
    neighbor=defaultdict(set)
    for a,b,kind in edges:
        if not kind or not a or not b: raise ValueError("UNQUALIFIED_EDGE")
        neighbor[a].add(b)
    frontier=dict(state)
    for _ in range(depth):
        next_step=defaultdict(float)
        for a,score in frontier.items():
            for b in sorted(neighbor[a]): next_step[b]+=score*decay/max(1,len(neighbor[a]))
        for b,score in next_step.items(): state[b]=state.get(b,0)+score
        frontier=next_step
    return state

def temporal_signal(event_iso, center_iso, width_seconds):
    if width_seconds<=0: raise ValueError("INVALID_TIME_WIDTH")
    def parse(value):
        t=datetime.fromisoformat(value.replace("Z","+00:00"))
        if t.tzinfo is None: raise ValueError("TIMEZONE_REQUIRED")
        return t.astimezone(timezone.utc)
    delta=(parse(event_iso)-parse(center_iso)).total_seconds()
    return math.exp(-.5*(delta/width_seconds)**2)

def rank(candidates, signals, weights, top_k):
    if not 1<=top_k<=len(candidates): raise ValueError("INVALID_TOPK")
    if len(set(candidates))!=len(candidates) or set(weights)-set(signals): raise ValueError("INVALID_SIGNALS")
    if any(not math.isfinite(v) or v<0 for v in weights.values()): raise ValueError("INVALID_WEIGHT")
    def score(key):
        return sum(weights[n]*signals[n].get(key,0.) for n in weights)
    if any(not math.isfinite(value) for s in signals.values() for value in s.values()):
        raise ValueError("NONFINITE_SIGNAL")
    return sorted(candidates,key=lambda k:(-score(k),k))[:top_k]

def ablate(candidates, relevance, signals, baseline_weights, top_k):
    """Metric: recall over known relevant IDs; not an answer-quality benchmark."""
    if not relevance or not set(relevance).issubset(candidates): raise ValueError("INVALID_RELEVANCE")
    variants={"baseline":baseline_weights}
    for key in baseline_weights:
        variants["without_"+key]={k:v for k,v in baseline_weights.items() if k!=key}
    out={}
    for name,weights in variants.items():
        ids=rank(candidates,signals,weights,top_k)
        out[name]={"top_k":ids,"relevant_recall":len(set(ids)&set(relevance))/len(relevance)}
    return out
