# Parent Atlas Missing Workstation Audit

Generated: 2026-07-01T01:20:43.732Z
Overall completion: 43%

## Lanes

| Lane | Status | Completion | Missing | Next action |
|---|---:|---:|---|---|
| identity_spine | PASS | 100% | none if 100% | Keep packet_key/source_ref/feature_id immutable. |
| summary_coverage | FAIL | 5.57% | 55058 packets still need clean summaries | Import completed Colab Gemma4 summary shards, then rerun this audit. |
| summary_embedding_coverage | FAIL | 5.56% | 55065 packet-level summary embeddings still missing | Run EmbeddingGemma batch worker against ONNX /v1/embeddings after summary import. |
| feature_envelope_storage | PASS | 100% | feature envelopes may need refresh after new summaries, even though row coverage is high | Re-materialize feature envelopes from newly imported summaries. |
| qdrant_payload_mirror | FAIL | 0% | Qdrant payload sample currently lacks packet_key/feature_id/canonicalSourceRef/file_path | Run qdrant payload sync/tag mirror after embeddings and packet-qdrant link repair. |
| packet_qdrant_linkage | FAIL | 4.99% | 55397 atlas_packets rows lack qdrant_point_id | Run packet-qdrant link backfill against restored Qdrant points. |
| redis_bitfrost_hot_cache | FAIL | 0% | semantic bifrost:* families are not warmed from canonical rows | Run warm-bitfrost-semantic-cache.mjs --apply after summary and payload mirror. |
| neo4j_feature_concept_reachability | WARN | 10% | Neo4j has Packet nodes but no Feature/Concept reachability edges in current proof | Project feature envelopes to Neo4j, then rerun concept reachability check. |
| neo4j_graph_density | PASS | 90% | feature/concept edge semantics still missing even though Packet graph density exists | Keep density check as read-only GDS proof gate. |
| hyperrag_runtime_proof | FAIL | 30% | qdrant_hits=0; bm25_hits=0; neo4j_hits=0; rrf_final_hits=0 | Rerun after Qdrant payload mirror and summary embeddings are refreshed. |
| onnx_embedding_server | PASS | 80% | GPU provider not active; current path is CPU ONNX batching | Use current ONNX batching now; install DirectML/CUDA provider later if needed. |
| summary_storage_contract | PASS | 90% | storage contract passes, but coverage is not complete | Do not reopen schema; widen data coverage. |

## Current Counts

```json
{
  "atlas_packets": 58304,
  "packets_feature_id": 58304,
  "packets_source_ref": 58304,
  "packets_qdrant_point_id": 2907,
  "summary_rows": 11939,
  "summarized_packets": 3246,
  "summary_embeddings": 3239,
  "feature_envelopes": 58304,
  "packet_features": 58304
}
```

## Next Patch

Import completed Colab Gemma4 summary shards, then rerun this audit.