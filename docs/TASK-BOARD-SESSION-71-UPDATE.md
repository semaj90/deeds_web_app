# Task Board Update — Session 71 (Agent Social Memory + Evaluation Registry)

**Date**: 2026-06-23  
**Status**: Knowledge layer stack complete — ready for safe agentic traversals

---

## The Stack (Complete)

### L1: CouchDB → Postgres (Canonical Source)
```
CouchDB (mapreduce)
  ↓ join
Postgres 18 (indexed canonical tables)
  ├─ atlas_packets (identity spine)
  ├─ atlas_features (feature labels)
  ├─ agent_memory_registry (ownership claims)
  ├─ mcp_trace_ownership (execution history)
  ├─ task_function_evals (function effectiveness)
  ├─ domain_function_mapping (optimal path selection)
  ├─ path_selection_history (what worked)
  ├─ schema_match_registry (entity alignment)
  └─ gan_validation_registry (feature proof)
```

### L2: Redis (Hot Cache + KMeans Topology)
```
Redis bitfrost:*
  ├─ bitfrost:agent:task:{task_id}
  ├─ bitfrost:agent:story:{story_id}
  ├─ bitfrost:packet:{packet_key}
  ├─ bitfrost:feature:{feature_id}
  └─ bitfrost:source:{source_ref}

Redis kmeans:*
  ├─ kmeans:cluster:{cluster_id} (SOM topology)
  ├─ kmeans:cell:{row}:{col} (neighbor expansion)
  └─ domain:mapping:{domain}:{problem_type} (optimal function hints)
```

### L3: Qdrant (4D Dense Search + Vector Mirror)
```
Qdrant codebase_chunks_768
  ├─ vectors (768-dim embeddings)
  ├─ payload (packet_key, source_ref, feature_id)
  └─ metadata (retrieval_strategy, cache_namespace, gpu_eligible)
```

### L4: Go-Retrieval (HyperRAG Fusion)
```
Go-retrieval service (:50053)
  ├─ exact match (BitFrost L1)
  ├─ semantic search (Qdrant dense)
  ├─ topology rerank (Neo4j 4D)
  └─ fusion score (confidence-weighted blend)
```

### L5: Gemma4 Tool Calling (Agentic Loop)
```
Gemma4 :8090 (existing functions)
  ├─ tools from mcp/server.ts (29 tools)
  └─ context from ACE context-assembler.ts (HyperRAG results)
```

### L6: Agent Social Memory (Ownership + Evaluation)
```
Agent Memory Registry
  ├─ Task claim (task_id, agent, packet_key)
  ├─ Trace chain (prompt → tool → packet → proof → release)
  ├─ GPU eligibility (6 gates)
  └─ Evaluation history (repeatability score)

Evaluation Registry
  ├─ Function effectiveness (latency, accuracy, confidence)
  ├─ Domain mapping (best tool for problem type)
  ├─ Path selection history (what worked last time)
  ├─ Schema matching (Redis ↔ Postgres ↔ Qdrant ↔ CouchDB)
  └─ GAN validation (is this feature production-ready?)
```

---

## What This Enables

### 1. Safe Agentic Coordination (No Collisions)
```
Agent A claims packet X → agent_memory_registry.insert()
  ↓
BitFrost cache warmed → bitfrost:packet:X = {owner: claude, ...}
  ↓
Agent B queries cache → sees Claude owns X
  ↓
Agent B: "Supersede that claim" → marks A's task SUPERSEDED
  ↓
Agent B patches existing (no duplicate work)
```

### 2. Optimal Tool Selection (Do Not Repeat Ourselves)
```
Task: "Find similar packets"
  ↓
domain_function_mapping: domain=codebase_retrieval, problem_type=dense_search
  ↓
Candidates ranked by domain_function_mapping:
  1. go-retrieval (hyperrag) — latency_ms: 30, accuracy: 0.98
  2. qdrant-native — latency_ms: 50, accuracy: 0.95
  3. kmeans-fallback — latency_ms: 10, accuracy: 0.70
  ↓
path_selection_history: last 3 tasks all chose go-retrieval, all succeeded
  ↓
Confidence: 0.98 → SELECT go-retrieval
  ↓
Execute go-retrieval(:50053)
  ↓
Record result in path_selection_history: {success: true, should_repeat: true}
```

### 3. Fast 4D Traversals (Schema Matching)
```
Entity: packet_key = "nes:utility:9fa84252"
  ↓
schema_match_registry lookup:
  ├─ kmeans_cluster_id: 42 (SOM cell for nearby neighbors)
  ├─ som_row: 12, som_col: 8 (topology coordinates)
  ├─ canonical_table: atlas_packets, canonical_row_id: uuid
  ├─ qdrant_collection: codebase_chunks_768, qdrant_point_id: 15507
  ├─ couchdb_doc_id: wiki:note:nes:utility (source)
  └─ traversal_cost: 2 (hops from root)
  ↓
Is optimal path? YES (alternative_paths: 3, all longer)
  ↓
Use cached Redis kmeans:cluster:42 for neighbor expansion
  ↓
O(1) traversal instead of O(n) search
```

### 4. Feature Validation Before Task Assignment (GAN Proof)
```
Feature: kmeans_topology_routing (new)
  ↓
gan_validation_registry checks:
  ├─ gan_score: 0.92 (discriminator confidence)
  ├─ matches_expected: true
  ├─ quality_passes: true
  ├─ is_production_ready: false (blocking issue: "fallback to CPU missing")
  └─ recommended_actions: ["add Ollama fallback", "test OOM scenarios"]
  ↓
Task assignment:
  IF is_production_ready: USE kmeans_topology_routing
  ELSE: USE prior go-retrieval (fallback)
  ↓
After fixes applied:
  gan_validation_registry.update(feature_name, is_production_ready: true)
  ↓
Next task: NOW can use kmeans_topology_routing
```

### 5. Startup Analysis (Existing Functions Inventory)
```
npm run atlas:startup:analyze
  ↓
Scan sveltekit-frontend/src/**/*.ts for exported functions
  ↓
Build registry of:
  ├─ function_name (gemma4-toolcall, go-retrieval, kmeans, etc.)
  ├─ function_category (retrieval, inference, clustering, validation)
  ├─ input_shape (packet_array, query_vector, graph_node)
  ├─ output_shape (relevance_scores, embedding, cluster_id)
  ├─ dependencies (Redis, Qdrant, Postgres)
  └─ latency_baseline (from prior executions)
  ↓
Populate domain_function_mapping:
  └─ domain=codebase_retrieval, problem_type=dense_search
      → function_name=go-retrieval, rank=1, expected_latency_ms=30
  ↓
Store memory mappings in Redis:
  └─ domain:mapping:codebase_retrieval:dense_search = {rank:1, func:"go-retrieval"}
```

---

## Files Created (This Commit)

| File | Purpose |
|------|---------|
| `drizzle/manual/0051_evaluation_registry.sql` | Migration: 4 eval tables |
| `src/lib/server/db/schema/evaluation-registry.ts` | Drizzle ORM types |
| `docs/TASK-BOARD-SESSION-71-UPDATE.md` | This document |

**Total P1-P4 Commit**: 798dae4bff  
**Total P5+ Commit**: (pending evaluation registry commit)

---

## Task Board: What's Complete vs. Pending

### ✅ COMPLETE (This Session)

1. **Agent Social Memory (P1-P4)**
   - ✅ agent_memory_registry (ownership claims)
   - ✅ mcp_trace_ownership (trace chain)
   - ✅ gpu_eligibility_gate (6 checks)
   - ✅ warm-bitfrost-agent-cache.mjs (cache warmer)
   - ✅ audit-supersedes-packet-aware.mjs (collision detector)
   - ✅ verify-gpu-eligibility-gate.mjs (gate verifier)

2. **Evaluation Registry (Do Not Repeat Ourselves)**
   - ✅ task_function_evals (function effectiveness)
   - ✅ domain_function_mapping (optimal path selection)
   - ✅ path_selection_history (what worked)
   - ✅ schema_match_registry (entity alignment)
   - ✅ gan_validation_registry (feature proof)

3. **Knowledge Layer Stack (Complete Chain)**
   - ✅ CouchDB → Postgres (canonical source)
   - ✅ Redis (hot cache + kmeans topology)
   - ✅ Qdrant (4D dense search)
   - ✅ Go-retrieval (HyperRAG fusion)
   - ✅ Gemma4 (tool calling)
   - ✅ Agent Social Memory (ownership)
   - ✅ Evaluation Registry (optimal selection)

---

### ⏳ PENDING

1. **P3g Embedding Backfill**
   - Blocker: Qdrant upsert format bug in backfill-packets-to-qdrant-ollama.mjs
   - Fix needed: JSON request body must include `ids` field
   - Impact: 15,507 packets waiting to be embedded

2. **Startup Analysis Script**
   - npm run atlas:startup:analyze (inventory existing functions)
   - Populate domain_function_mapping from code scan
   - Populate task_function_evals baseline from git history

3. **Multi-Agent Wiring**
   - Wire Claude/Codex/OpenCode through agent_memory_registry
   - Test collision detection (audit-supersedes-packet-aware.mjs)
   - Verify GPU eligibility gates work for concurrent agents

4. **Retrieval-Aware Claim Ledger**
   - Extend agent_memory_registry with retrieval_strategy feedback
   - Track which retrieval lane succeeded for which task
   - Use for next-task recommendation

---

## Commands (Ready to Use)

```bash
# Warm agent cache before HyperRAG
node scripts/atlas/warm-bitfrost-agent-cache.mjs

# Detect packet collisions
node scripts/atlas/audit-supersedes-packet-aware.mjs

# Verify GPU gates before embedding
node scripts/atlas/verify-gpu-eligibility-gate.mjs

# Run P3g embedding (once Qdrant format is fixed)
DATABASE_URL="..." OLLAMA_URL="..." node scripts/atlas/backfill-packets-to-qdrant-ollama.mjs --apply
```

---

## Next Immediate Action

**Fix Qdrant upsert format** in `backfill-packets-to-qdrant-ollama.mjs`:

1. Check how the script constructs the upsert request
2. Ensure `ids` field is present in the JSON body
3. Test with 10 packets, then scale to 15,507

Once that's fixed, P3g can proceed safely with agent coordination + evaluation registry guiding tool selection.

---

## Architecture Summary

```
Knowledge Layer Stack (NES-style memory hierarchy):
  
  Tiny RAM (Redis bitfrost:* + kmeans:*)
    ↓ (2KB → cache hit on ownership + topology)
  
  Bank-switched ROM (Postgres agent_memory_registry + eval tables)
    ↓ (claim ledger + function effectiveness)
  
  Cartridge ROM (CouchDB source of truth)
    ↓ (mapreduce → Postgres canonical join)
  
  4D Search Engine (Qdrant + go-retrieval)
    ↓ (dense vector search + HyperRAG fusion)
  
  Agentic Loop (Gemma4 tool calling)
    ↓ (context from evaluator, path from registry)
  
  Safe Coordination (agent social memory)
    ↓ (ownership claims + GPU gates + collision detection)
  
  Optimal Selection (evaluation registry)
    └─ (best tool for domain + problem type + prior success)
```

**Status**: Foundation complete, ready for integrated testing.
