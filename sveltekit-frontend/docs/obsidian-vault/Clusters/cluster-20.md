---
type: "cluster"
cluster_id: "cluster-20"
clusterId: 20
topic: "function chunks in `src/lib/webgpu` (tag: embedding)"
aliases: ["cluster-20","function chunks in `src/lib/webgpu` (tag: embedding)"]
memberCount: 883
pagerank_sum: 0.20716
pagerank_max: 0.20716
risk: "medium"
top_tags: ["embedding","redis","vector","auth","schema"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__webgpu__webgpu-similarity-service]]","[[Files/src__lib__webgpu__som-webgpu-cache]]","[[Files/src__lib__gpu__shader-registry]]","[[Files/src__lib__webgpu__compute-shader-engine]]","[[Files/src__lib__server__gpu__libtorch-bridge]]","[[Files/src__lib__server__grpc__graph-ml-client]]","[[Files/src__lib__server__indexer__gpu-karpathy-tagger]]","[[Files/src__routes__api__codebase-index__karpathy-tag__gpu___server]]"]
same: ["[[Clusters/cluster-29]]","[[Clusters/cluster-58]]","[[Clusters/cluster-60]]","[[Clusters/cluster-72]]","[[Clusters/cluster-74]]"]
tags: ["cluster","cluster/20","topic/topic_webgpu","topic/sym_web","topic/auth"]
---

# function chunks in `src/lib/webgpu` (tag: embedding)
## For future Claude
> This GPU cluster is specialized for high-performance Artificial Intelligence and Machine Learning workloads. It manages complex data pipelines involving vector embedding generation, similarity calculations (like SOM and graph attention), and low-level tensor operations using CUDA/WebGPU. The architecture supports advanced tasks such as quantization and map-reduce analysis.

**Purpose:** High-performance AI/ML computation and vector processing
cluster:: cluster-20
cluster_id:: 20
member_count:: 8
pagerank_sum:: 0.20716
risk:: medium
top_tags:: embedding, redis, vector, auth, schema
## Agent hints
Use this cluster when investigating embedding, redis, vector.
Risk: **medium** (pagerank_max=0.20716, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-29]] (jaccard 0.67)
- same:: [[Clusters/cluster-58]] (jaccard 0.67)
- same:: [[Clusters/cluster-60]] (jaccard 0.67)
- same:: [[Clusters/cluster-72]] (jaccard 0.67)
- same:: [[Clusters/cluster-74]] (jaccard 0.67)
## Top Directories
- `src/lib/webgpu` (3)
- `src/lib/server/gpu` (3)
- `src/lib/gpu` (2)
## Top Tags
- embedding (15)
- redis (6)
- vector (4)
- auth (2)
- schema (1)
## Members (8)
- contains:: [[Files/src__lib__webgpu__webgpu-similarity-service|src/lib/webgpu/webgpu-similarity-service.ts]]
- contains:: [[Files/src__lib__webgpu__som-webgpu-cache|src/lib/webgpu/som-webgpu-cache.ts]]
- contains:: [[Files/src__lib__gpu__shader-registry|src/lib/gpu/shader-registry.ts]]
- contains:: [[Files/src__lib__webgpu__compute-shader-engine|src/lib/webgpu/compute-shader-engine.ts]]
- contains:: [[Files/src__lib__server__gpu__libtorch-bridge|src/lib/server/gpu/libtorch-bridge.ts]]
- contains:: [[Files/src__lib__server__grpc__graph-ml-client|src/lib/server/grpc/graph-ml-client.ts]]
- contains:: [[Files/src__lib__server__indexer__gpu-karpathy-tagger|src/lib/server/indexer/gpu-karpathy-tagger.ts]]
- contains:: [[Files/src__routes__api__codebase-index__karpathy-tag__gpu___server|src/routes/api/codebase-index/karpathy-tag/gpu/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 20 SORT pagerank DESC LIMIT 30
```