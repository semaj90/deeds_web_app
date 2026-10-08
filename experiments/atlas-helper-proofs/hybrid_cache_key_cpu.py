"""HYBRID-05: revision-complete experiment cache identity, no cache mutation."""
import hashlib,json
def key(query):
    required=("query_text","embedding_digest","namespace","session_id","filters",
              "query_time","workspace_revision","source_revision",
              "graph_revision","representation_revision","feature_revision",
              "model_revision","top_k","context_manifest_checksum")
    if set(required)-set(query): raise ValueError("MISSING_CACHE_DIMENSION")
    if any(query[k] is None for k in required): raise ValueError("NULL_CACHE_DIMENSION")
    raw=json.dumps({k:query[k] for k in required},sort_keys=True,separators=(",",":"),allow_nan=False)
    return "sha256:"+hashlib.sha256(raw.encode()).hexdigest()
