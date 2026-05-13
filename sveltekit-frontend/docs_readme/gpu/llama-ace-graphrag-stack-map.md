# llama-server + ACE/GraphRAG Stack Map

This is the runtime truth for the local RTX stack. It separates stable paths from experimental acceleration work so logs and capability flags stay honest.

## Runtime Roles

| Layer | Role | Current stance |
| --- | --- | --- |
| llama-server | Controllable local inference backend | Primary stable backend |
| Ollama | Model manager and simple local API | Convenience/testing lane |
| TurboQuant | Experimental KV/weight compression | Disabled until fork is installed and health-checked |
| RotorQuant | Experimental rotation/quant compression | IQ4_XS GGUF weights are usable with stock llama.cpp; RotorQuant KV requires a fork |
| Gemma 4 MTP | Speculative decode speed lane | Disabled until AtomicBot/Gemma MTP binary and head file exist |
| RAPTOR | Hierarchical summary tree retrieval | Long docs, case law, evidence narratives, code docs |
| GraphRAG | Relationship/path/entity retrieval | Code, legal, evidence, graph paths |
| ACE | Router, cache planner, context packet builder | Decides retrieval, cache reuse, and model-call policy |
| Redis | Hot cache, locks, health, traces | Result cache only, not durable truth |
| Postgres | Durable registry and audit | Context cache registry, inference trace, RAG metadata |
| Qdrant | Vector retrieval | Semantic memory |
| Neo4j | Graph retrieval | Relationship memory |
| CouchDB | Readable snapshots/views | MapReduce snapshots and wiki-like notes |
| NVMe | Cold artifacts | Context packs, graph snapshots, future session/KV files |
| CUDA streams | Ordered/overlapped GPU work | Backend/kernel dependent |
| CUDA graphs | Repeated fixed-shape GPU replay | Use after logical cache path is working |
| RTX GPU | Hot inference, embeddings, reranking | Main accelerator |

## Stable Flow

```text
User request
  -> SvelteKit API route
  -> ACE router
  -> cheap classifier/reranker
  -> compute cache key
  -> Redis lookup
  -> cache hit?
       yes: load context pack, retrieve deltas only
       no: run RAPTOR + GraphRAG, build context pack, persist it
  -> llama-server / Gemma4 backend
  -> trace result and cache metadata
```

The cache key should include model, tokenizer, system prompt hash, tool definition hash, repo SHA, evidence bundle hash, corpus hash, RAPTOR tree hash, GraphRAG snapshot hash, and runtime capability flags.

## Hot Cache Keys

```text
ace:ctx:{cacheKey}
ace:ctx:{cacheKey}:summary
ace:ctx:{cacheKey}:chunks
ace:ctx:{cacheKey}:graph
ace:trace:{runId}
ace:locks:{cacheKey}
ace:queue:retrieval
ace:health:qdrant
ace:health:neo4j
ace:health:llama
gpu:encoded64:{queryHash}
gpu:topk_clusters:{queryHash}
gpu:karpathy:scores
gpu:karpathy:clusters
cluster:summary:{clusterId}
cluster:pagerank:{clusterId}
cluster:pagerank:top5:{clusterId}
```

Redis should cache results, not raw GPU memory.

## Backend Capability Truth

Experimental features must remain explicit runtime capabilities:

```ts
type BackendCapabilities = {
  supportsKvQuant: boolean;
  supportsTurboQuant: boolean;
  supportsRotorQuant: boolean;
  supportsMtp: boolean;
  supportsPromptCache: boolean;
  supportsNvmeKvOffload: boolean;
};
```

Current stable Path B should report:

```json
{
  "selectedBackend": "stock-llama-cpp-cuda",
  "router": "bifrost",
  "weightQuant": "IQ4_XS",
  "turboQuant": false,
  "rotorQuantKv": false,
  "mtp": false
}
```

Do not label the current IQ4_XS GGUF path as true RotorQuant KV, AtomicBot, TurboQuant, TensorRT-LLM, or MTP unless the matching binary/files exist and pass a health check.

## Priority Order

1. Logical context-cache registry.
2. PageRank-aware cluster summaries.
3. Redis/Postgres/NVMe context packet persistence.
4. ACE final-score fusion.
5. Benchmark prefill/decode/cache-hit behavior.
6. CUDA graphs/streams for repeated fixed-shape work.
7. TurboQuant/RotorQuant/MTP/NanoFlow experiments after runtime health checks.
