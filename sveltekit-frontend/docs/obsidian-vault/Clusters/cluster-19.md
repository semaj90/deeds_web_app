---
type: "cluster"
cluster_id: "cluster-19"
clusterId: 19
topic: "type chunks in `src/lib/types` (tag: embedding)"
aliases: ["cluster-19","type chunks in `src/lib/types` (tag: embedding)"]
memberCount: 136
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["embedding","vector","redis","rabbitmq","ai"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__ai__ollama-client]]","[[Files/src__lib__types__external-services]]","[[Files/src__lib__utils__webgpu-array-utils]]","[[Files/src__lib__server__utils__avatar-upload]]","[[Files/src__lib__services__error-analysis__learningpipeline]]","[[Files/src__lib__components__ui__gaming__types__gaming-types]]","[[Files/src__lib__services__error-analysis__experiencerecorder]]","[[Files/src__lib__types__yorha-interface]]"]
same: ["[[Clusters/cluster-75]]","[[Clusters/cluster-46]]","[[Clusters/cluster-22]]","[[Clusters/cluster-24]]","[[Clusters/cluster-72]]"]
tags: ["cluster","cluster/19","topic/types","topic/utils","topic/sym_ollama","topic/sym_qdrant"]
---

# type chunks in `src/lib/types` (tag: embedding)
## For future Claude
> This cluster defines the comprehensive data models and response types used across various backend services. It standardizes the structure for results coming from knowledge bases, web searches, document processing, and AI synthesis.

**Purpose:** Data Contract Definitions
cluster:: cluster-19
cluster_id:: 19
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: embedding, vector, redis, rabbitmq, ai
## Agent hints
Use this cluster when investigating embedding, vector, redis.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-75]] (jaccard 1.00)
- same:: [[Clusters/cluster-46]] (jaccard 0.80)
- same:: [[Clusters/cluster-22]] (jaccard 0.67)
- same:: [[Clusters/cluster-24]] (jaccard 0.67)
- same:: [[Clusters/cluster-72]] (jaccard 0.67)
## Top Directories
- `src/lib/types` (6)
- `src/lib/server/ai` (3)
- `src/lib/utils` (2)
## Top Tags
- embedding (11)
- vector (5)
- redis (5)
- rabbitmq (4)
- ai (3)
## Members (8)
- contains:: [[Files/src__lib__server__ai__ollama-client|src/lib/server/ai/ollama-client.ts]]
- contains:: [[Files/src__lib__types__external-services|src/lib/types/external-services.ts]]
- contains:: [[Files/src__lib__utils__webgpu-array-utils|src/lib/utils/webgpu-array-utils.ts]]
- contains:: [[Files/src__lib__server__utils__avatar-upload|src/lib/server/utils/avatar-upload.ts]]
- contains:: [[Files/src__lib__services__error-analysis__learningpipeline|src/lib/services/error-analysis/LearningPipeline.ts]]
- contains:: [[Files/src__lib__components__ui__gaming__types__gaming-types|src/lib/components/ui/gaming/types/gaming-types.ts]]
- contains:: [[Files/src__lib__services__error-analysis__experiencerecorder|src/lib/services/error-analysis/ExperienceRecorder.ts]]
- contains:: [[Files/src__lib__types__yorha-interface|src/lib/types/yorha-interface.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 19 SORT pagerank DESC LIMIT 30
```