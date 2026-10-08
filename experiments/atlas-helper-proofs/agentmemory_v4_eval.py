"""Parent Atlas agentmemory-style, retrieval-only evaluation. No generator/judge calls.

Input JSON has cases of {id, query, relevant_packet_keys, candidates},
where candidates carry {packet_key, signals, source_revision, admitted}.
Never expose gold relevance to a retriever, classifier, or synthesis endpoint.
"""
import hashlib
import json
from pathlib import Path

def evaluate_cases(data, variants, top_k=5):
    if not isinstance(data,dict) or not isinstance(data.get("cases"),list) or not data["cases"]:
        raise ValueError("INVALID_EVAL_DATA")
    if not 1<=top_k<=100 or not variants: raise ValueError("INVALID_EVAL_ARGUMENT")
    seen=set()
    outputs=[]
    for case in data["cases"]:
        cid=case["id"]
        if not isinstance(cid,str) or not cid or cid in seen: raise ValueError("DUPLICATE_CASE")
        seen.add(cid)
        candidates=case["candidates"]
        if not candidates or len({c["packet_key"] for c in candidates})!=len(candidates):
            raise ValueError("INVALID_CANDIDATES")
        if any(c.get("admitted") is not True or not c.get("source_revision") for c in candidates):
            raise ValueError("UNQUALIFIED_EVIDENCE")
        relevant=set(case["relevant_packet_keys"])
        if not relevant or not relevant.issubset({c["packet_key"] for c in candidates}):
            raise ValueError("INVALID_GOLD")
        for variant,weights in variants.items():
            def score(c):
                signals=c["signals"]
                if any(k not in signals for k in weights): raise ValueError("MISSING_SIGNAL")
                return sum(float(signals[k])*v for k,v in weights.items())
            ordered=sorted(candidates,key=lambda c:(-score(c),c["packet_key"]))[:top_k]
            picks=[c["packet_key"] for c in ordered]
            hit=sum(p in relevant for p in picks)
            rr=next((1/(i+1) for i,p in enumerate(picks) if p in relevant),0.)
            outputs.append({"case_id":cid,"variant":variant,"recall_at_k":hit/len(relevant),
                            "reciprocal_rank":rr,"selected_packet_keys":picks})
    summaries={}
    for variant in variants:
        subset=[x for x in outputs if x["variant"]==variant]
        summaries[variant]={"recall_at_k":sum(x["recall_at_k"] for x in subset)/len(subset),
                            "mrr":sum(x["reciprocal_rank"] for x in subset)/len(subset)}
    return {"schema":"atlas.agentmemory-style-retrieval-eval.v1","case_count":len(seen),
            "top_k":top_k,"summaries":summaries,"results":outputs,
            "generation_scored":False,"longmemeval_score":None}

def read_fixture(path):
    p=Path(path)
    if p.stat().st_size>2_000_000: raise ValueError("OVERSIZED_EVAL")
    return json.loads(p.read_text(encoding="utf-8"))
