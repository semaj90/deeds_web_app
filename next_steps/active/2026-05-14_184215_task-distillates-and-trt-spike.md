# Task Distillates + TRT-LLM Spike Prompt

Use this as the next implementation pass.

## Goal
Build task-specific ACE context distillates on top of the completed hypergraph pipeline, and keep TRT-LLM as an optional later spike only.

## Why
- TRT-LLM can improve execution efficiency, but it does not replace good retrieval.
- Smaller/quantized Gemma4 works better when it gets compact, high-quality task context.
- The app should not try to hold entire corpora or raw KV cache in memory.

## Distillate concept
Create reusable task packs that combine:
- summary
- source chunk refs
- graph paths
- cluster IDs / SOM coordinates
- index refs
- tool policy
- adapter hints

## Example shape
```json
{
  "taskKey": "fix.upload.route.response",
  "intent": "debug_upload_pipeline",
  "summary": "Upload route delegates to shared upload-file-service; evidence upload returns flat and nested compatibility fields.",
  "sourceChunks": ["chunk_123", "chunk_456"],
  "paths": [
    "src/routes/api/evidence/upload/+server.ts",
    "src/routes/api/files/+server.ts",
    "src/lib/server/files/upload-file-service.ts"
  ],
  "qdrantTags": ["upload", "uploaded_files", "seaweedfs"],
  "graphPaths": ["Route:/api/evidence/upload -> Service:upload-file-service -> Table:uploaded_files"],
  "cluster": {
    "gpu_cluster": "cluster_17",
    "som_cluster": "som_8_3",
    "pixel": [8, 3],
    "manifold4": [8, 3, 0.84, 0.31]
  },
  "indexRefs": {
    "postgres": "metadata_envelopes:env_123",
    "qdrant": "codebase_chunks_768:point_456",
    "neo4j": "Feature:upload_pipeline",
    "redis": "ace:feature:upload_pipeline"
  },
  "adapterHints": {
    "preferredModel": "gemma4-e4b",
    "toolPolicy": "read_only",
    "retrievalMode": "cluster_filtered"
  }
}
```

## Immediate work
1. Build task distillates from `hypergraph-clusters.md` / cluster digests.
2. Cache cluster cards in Redis as `ace:cluster:{clusterId}`.
3. Add Qdrant collection(s) for task distillates if needed.
4. Add a router that classifies prompts into `taskKey` + retrieval profile.
5. Use distillates before falling back to raw chunks.
6. Add validation that distillates preserve index refs and cluster coordinates.

## Suggested Redis keys
- `ace:cluster:{clusterId}`
- `ace:task:{taskKey}`
- `ace:feature:{featureKey}`
- `ace:ctx:{cacheKey}`
- `hypergraph:v1:centroids`
- `hypergraph:v1:nearest:{queryHash}`

## Suggested Qdrant collections
- `codebase_chunks_768`
- `docs_chunks`
- `error_notes`
- `cluster_summaries`
- `task_distillates`
- `evidence_chunks`

## Do not do yet
- Do not make TRT-LLM the default path.
- Do not replace TurboQuant.
- Do not store raw KV cache in Redis.
- Do not expose raw vectors to browser clients.

## Suggested next tests
- distillate schema validation
- Redis cluster-card read/write
- cluster-filtered retrieval fallback
- context packet under token budget

## Best next commit shape
- `feat(ace): add task distillates from hypergraph clusters`
- `feat(hyperrag): retrieve task distillates before raw chunks`
- `docs(gpu): document TRT-LLM as optional engine spike`
