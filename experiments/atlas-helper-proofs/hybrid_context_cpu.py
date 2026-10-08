"""HYBRID-04: bounded session-balanced greedy context proposal, no ContextManifest write."""
def select(items, token_budget, max_per_session=2):
    if token_budget<1 or max_per_session<1: raise ValueError("INVALID_BUDGET")
    picked=[];used=0;counts={};seen=set()
    for row in sorted(items,key=lambda x:(-x["score"],x["packet_key"])):
        key=row["packet_key"]
        if key in seen: continue
        seen.add(key)
        n=row["tokens"];sess=row["session"]
        if not isinstance(n,int) or n<=0: raise ValueError("INVALID_TOKEN_COUNT")
        if not isinstance(sess,str) or not sess: raise ValueError("INVALID_SESSION")
        if counts.get(sess,0)>=max_per_session or used+n>token_budget: continue
        picked.append(key);used+=n;counts[sess]=counts.get(sess,0)+1
    return {"status":"PROPOSAL_ONLY","selected_packet_keys":picked,
            "tokens_used":used,"token_budget":token_budget,
            "distinct_sessions":len(counts),"canonical_authority":False}
