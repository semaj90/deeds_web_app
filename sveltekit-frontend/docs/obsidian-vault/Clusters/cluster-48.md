---
type: "cluster"
cluster_id: "cluster-48"
clusterId: 48
topic: "unknown chunks in `src/lib/server/db/migrations` (tag: database)"
aliases: ["cluster-48","unknown chunks in `src/lib/server/db/migrations` (tag: database)"]
memberCount: 526
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["database","embedding","auth","vector"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__db__migrations__20241211000002_create_enhanced_evidence_table]]","[[Files/src__lib__server__db__migrations__005_pgvector_384_optimization]]","[[Files/src__lib__server__db__migrations__012_gin_jsonb_indexes]]","[[Files/src__lib__db__migrations__enhanced-grpo-migration]]","[[Files/src__lib__server__db__migrations__005_fix_app_requirements]]","[[Files/src__lib__server__db__schema-pgvector-512]]","[[Files/src__lib__server__db__migrations__010_add_uploads_table]]","[[Files/src__lib__server__db__migrations__meta___journal]]"]
same: ["[[Clusters/cluster-6]]","[[Clusters/cluster-15]]","[[Clusters/cluster-59]]","[[Clusters/cluster-10]]","[[Clusters/cluster-12]]"]
tags: ["cluster","cluster/48","topic/migrations","topic/auth"]
---

# unknown chunks in `src/lib/server/db/migrations` (tag: database)
## For future Claude
> This cluster provides utility functions for managing background job states, sending multi-channel notifications, retrieving vector database boost scores, and updating ingestion job progress.

**Purpose:** Utility and Service Layer
cluster:: cluster-48
cluster_id:: 48
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: database, embedding, auth, vector
## Agent hints
Use this cluster when investigating database, embedding, auth.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-6]] (jaccard 0.80)
- same:: [[Clusters/cluster-15]] (jaccard 0.75)
- same:: [[Clusters/cluster-59]] (jaccard 0.75)
- same:: [[Clusters/cluster-10]] (jaccard 0.50)
- same:: [[Clusters/cluster-12]] (jaccard 0.50)
## Top Directories
- `src/lib/server/db/migrations` (9)
- `src/lib/db/migrations` (3)
- `src/lib/server/db` (3)
## Top Tags
- database (16)
- embedding (12)
- auth (5)
- vector (3)
## Members (8)
- contains:: [[Files/src__lib__db__migrations__20241211000002_create_enhanced_evidence_table|src/lib/db/migrations/20241211000002_create_enhanced_evidence_table.sql]]
- contains:: [[Files/src__lib__server__db__migrations__005_pgvector_384_optimization|src/lib/server/db/migrations/005_pgvector_384_optimization.sql]]
- contains:: [[Files/src__lib__server__db__migrations__012_gin_jsonb_indexes|src/lib/server/db/migrations/012_gin_jsonb_indexes.sql]]
- contains:: [[Files/src__lib__db__migrations__enhanced-grpo-migration|src/lib/db/migrations/enhanced-grpo-migration.sql]]
- contains:: [[Files/src__lib__server__db__migrations__005_fix_app_requirements|src/lib/server/db/migrations/005_fix_app_requirements.sql]]
- contains:: [[Files/src__lib__server__db__schema-pgvector-512|src/lib/server/db/schema-pgvector-512.ts]]
- contains:: [[Files/src__lib__server__db__migrations__010_add_uploads_table|src/lib/server/db/migrations/010_add_uploads_table.sql]]
- contains:: [[Files/src__lib__server__db__migrations__meta___journal|src/lib/server/db/migrations/meta/_journal.json]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 48 SORT pagerank DESC LIMIT 30
```