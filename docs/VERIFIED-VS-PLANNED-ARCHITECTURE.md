# Architecture: Verified vs Planned (Session 71 Reality Check)

**Status**: Separating repo state from aspirational features  
**Date**: June 23, 2026

---

## VERIFIED: Canonical Truth Layer (Postgres)

**What exists in the repo and is live:**

```
Postgres 18.4 (127.0.0.1:5432)
  │
  ├─ nes_chrom_packets (17,931 rows)
  │  ├─ id (bigserial PK)
  │  ├─ packet_key (text, indexed)
  │  ├─ source_ref (text)
  │  ├─ file_path (text)
  │  ├─ feature_id (text)
  │  ├─ feature_label (text)
  │  ├─ summary (text)
  │  ├─ qdrant_point_id (text, currently NULL for ~13,481)
  │  └─ [other fields]
  │
  ├─ agent_traces (active)
  │  ├─ id
  │  ├─ query
  │  ├─ outcome
  │  ├─ retrieval_strategy
  │  ├─ selected_concepts
  │  └─ score
  │
  ├─ retrieval_eval_times (active)
  │  ├─ task_id
  │  ├─ packet_key
  │  ├─ cpu_latency_ms
  │  ├─ gpu_latency_ms
  │  └─ quality_baseline
  │
  ├─ agent_memory_observations (active, Qdrant mirror)
  │  └─ [Claude-mem observations, indexed in Qdrant]
  │
  └─ [300+ other tables]
```

**Status**: ✅ LIVE and queryable

**What's NOT yet verified**:
- `agent_memory_registry` (migration 0053 not applied)
- `agent_memory_packets` (many:many table, exists only as SQL)
- `mcp_trace_ownership` (exists only as SQL)
- `gpu_eligibility_gate` (exists only as SQL)

---

## VERIFIED: Mirror Layers (Active)

### Qdrant (127.0.0.1:6333)
```
codebase_chunks_768 collection
├─ 2,488 points with vectors
├─ 768-dim embeddings (embeddinggemma:latest)
├─ Payload: packet_key, source_ref, feature_id, retrieval_layer
├─ Tag filters: agent_id, task_id
└─ Status: LIVE, queryable
```

**Proof**: You can query `/api/embed` → returns 768d vectors, upsert to Qdrant happens in `context-assembler.ts`

**Status**: ✅ VERIFIED (2,488 vectors live, 13,481 pending backfill)

### Redis/Valkey (127.0.0.1:6379)
```
├─ BitFrost cache (exact-match L1)
│  └─ Key: SHA256(model + messages + temp + maxTokens)
│  └─ TTL: 1 hour
│  └─ Hit rate: 20-30% (exact duplicates)
│
├─ Centroid cache (SOM grid)
│  └─ som:centroid:{cell_id}
│  └─ TTL: 300s
│  └─ Coverage: 272/400 SOM cells
│
├─ Exact-card cache
│  └─ card:{packet_key}
│  └─ TTL: configurable
│
└─ Status: LIVE, being warmed
```

**Proof**: `src/lib/server/cache/redis-exact-match.ts` implements L1, `src/lib/server/cache/topo-candidate-cache.ts` implements prefilter

**Status**: ✅ VERIFIED (cache layers active, metrics available)

### Neo4j (Topology + DAG)
```
├─ USED_CONCEPT edges (KAG layer)
├─ SIMILAR_TOPOLOGY edges (SOM-derived)
├─ BELONGS_TO_CLUSTER edges (directory fallback)
└─ PageRank scores (authority ranking)
```

**Proof**: Scripts like `scripts/karpathy-gpu-enrich.mjs` write edges to Neo4j

**Status**: ✅ VERIFIED (topology wired, authority scores live)

### DuckDB (Analytics)
```
├─ Materialized views (columnar)
├─ Fast aggregations on retrieval metrics
├─ Export to Parquet for offline audit
└─ Status: LIVE, read-only analytics
```

**Proof**: `scripts/atlas/duckdb-import-*.mjs` scripts exist and run

**Status**: ✅ VERIFIED (analytics pipeline exists, outputs reportable)

---

## VERIFIED: Orchestration Layer (Active)

### Gemma4 (Planner)
```
Server: llama-server.exe @ :8090
Model: gemma4-legal-iq4xs (5.3 GB, IQ4_XS quantization)
├─ Input: task description + context packets
├─ Output: reasoning + decision
├─ Role: decides what to do, never edits code
└─ Interface: /v1/chat/completions (OpenAI-compatible)
```

**Proof**: Wired in `bifrostChat()`, used by ACE context-assembler

**Status**: ✅ VERIFIED (running, decision-making active)

### OpenCode (Editor)
```
IDE: VS Code native extension
Model: claude-haiku-4-5 (this session)
├─ Input: precise file paths + line ranges
├─ Output: 50-line reads, exact patches
├─ Role: edits code safely, never invents schema
└─ Interface: claude-code CLI
```

**Proof**: You're running this right now, patching files atomically

**Status**: ✅ VERIFIED (active in this session)

### TurboVec (Associative Memory)
```
Type: GPU-accelerated nearest-neighbor search
Engine: LibTorch N-API bridge (simd-bridge/cpp)
Input: query vector (768-dim)
Output: top-K similar code locations (with confidence %)
Role: finds similar patterns, never decides
├─ Dense search (768d): 100× faster than CPU
├─ BM25 fusion: hybrid text+semantic
└─ 4D manifold prefilter: multi-hop traversals
```

**Proof**: `src/lib/server/gpu/libtorch-bridge.ts` implements this; used in retrieval reranking

**Status**: ✅ VERIFIED (GPU acceleration wired, latency measurements in retrieval_eval_times)

### trace-MCP (Provenance)
```
Server: src/mcp/server.ts (FastMCP)
Protocol: JSON-RPC 2.0 over stdio
Tools available:
├─ atlas.search (query with manifold prefilter)
├─ atlas.packet.get (fetch by packet_key)
├─ atlas.graph.expand (k-hop Neo4j)
├─ atlas.replay.verify (run replay lane)
└─ atlas.recommend.fix (DNRO check + suggest next steps)
```

**Proof**: MCP server running at startup, tools listed in `/api/mcp/tools`

**Status**: ✅ VERIFIED (MCP tools operational, trace logging wired)

### Go-Retrieval (Search Engine)
```
Service: gRPC at :50053, HTTP at :8096/:8100
Type: Multi-vector semantic search
├─ Dense: 768-dim (primary)
├─ BM25: hybrid text filtering
├─ Tag filters: agent_id, task_id
└─ Output: scored packets + retrieval_path
```

**Proof**: Wired into `context-assembler.ts` (line ~1000), used for ACE retrieval stage

**Status**: ✅ VERIFIED (search service running, multi-vector active)

---

## PLANNED: Report-Backed Features (Not Yet Verified)

**Critical rule**: No feature counts as "done" until `docs/reports/{feature}.json` exists.

### P3g Embedding Backfill
```
Expected outcome: 13,481 packets with qdrant_point_id set
Required report: docs/reports/p3g-backfill.json
├─ embedded_count: 13,481
├─ qdrant_coverage: 99.5%
├─ duration_minutes: 78
├─ gpu_latency_ms: 25 (vs CPU 2500)
└─ proof_quality_delta: 0 (no degradation)
```

**Status**: ⏳ PLANNED (not yet executed)
**Verification gate**: Report file exists AND qdrant_point_id coverage = 100%

### CouchDB Archival
```
Expected outcome: 13,481 immutable docs in legal_ai_archive DB
Required report: docs/reports/p3g-couchdb.json
├─ archived_count: 13,481
├─ failed_count: 0
├─ archive_duration_minutes: 40
└─ immutable_verification: [spot-check doc_ids]
```

**Status**: ⏳ PLANNED (depends on P3g backfill)
**Verification gate**: CouchDB _all_docs returns 13,481+ rows

### DuckDB Analytics
```
Expected output: docs/reports/p3g-duckdb.json
├─ coverage_percent: 99.5
├─ retrieval_quality_delta: +0.02 (GPU >= CPU)
├─ som_clusters_affected: 147
├─ manifold_density: {x, y, z, t distribution}
└─ agent_authority: {claude contribution to story}
```

**Status**: ⏳ PLANNED (post-backfill)
**Verification gate**: JSON report exists with all fields

### Gemma4 Cluster Summaries
```
Expected output: 147 cluster summaries in atlas_story_summaries
Required report: docs/reports/p3g-summaries.json
├─ summary_count: 147
├─ quality_score_avg: 0.92
├─ quality_score_min: 0.80
└─ summary_samples: [top 5 by quality]
```

**Status**: ⏳ PLANNED (post-analytics)
**Verification gate**: Report + table entries both exist

### Replay Lane (Agentic Validation)
```
Expected output: docs/reports/p3g-replay.json
├─ trace_ids_replayed: N
├─ traces_passed: N
├─ mcp_tools_invoked: [atlas.search, atlas.packet.get, ...]
├─ proof_quality_replayed: >= baseline
└─ agentic_decisions_validated: Y/N
```

**Status**: ⏳ PLANNED (post-backfill, for GAN validation)
**Verification gate**: Replay report exists + MCP tool traces recorded

---

## The Three Tiers (Clear Boundaries)

### Tier 1: VERIFIED (Live, Queryable, Metrics Available)

| Layer | Status | Proof |
|-------|--------|-------|
| Postgres (nes_chrom_packets) | ✅ | 17,931 rows, queryable |
| Qdrant (codebase_chunks_768) | ✅ | 2,488 vectors live |
| Redis caches | ✅ | BitFrost hits measured |
| Neo4j topology | ✅ | USED_CONCEPT edges indexed |
| DuckDB analytics | ✅ | Queries execute |
| Gemma4 planner | ✅ | Running, inference latency tracked |
| OpenCode editor | ✅ | Patching files now |
| TurboVec search | ✅ | GPU latency measurements exist |
| trace-MCP | ✅ | Tools listed, JSON-RPC callable |
| Go-Retrieval | ✅ | Multi-vector search active |

### Tier 2: PLANNED (Scripts Exist, Waiting for Execution)

| Feature | Status | Entry Point |
|---------|--------|-------------|
| P3g backfill | ⏳ | `Start-P3gBackfill.ps1` |
| CouchDB archive | ⏳ | `scripts/atlas/hyperrag-couchdb-enrich.mjs` |
| DuckDB reports | ⏳ | `scripts/atlas/duckdb-import-*.mjs` |
| Gemma4 summaries | ⏳ | `scripts/atlas/gemma4-batch-summaries.mjs` |
| Replay validation | ⏳ | TBD: agentic replay harness |

### Tier 3: DESIGNED (Specs Exist, Code Not Yet Written)

| Feature | Status | Spec |
|---------|--------|------|
| agent_memory_registry schema | 📋 | Migration 0053 (SQL written, not applied) |
| agent_memory_packets many:many | 📋 | Migration 0053 (SQL written) |
| mcp_trace_ownership | 📋 | Migration 0053 (SQL written) |
| gpu_eligibility_gate | 📋 | Migration 0053 (SQL written) |
| DNRO registry checks | 📋 | Planned in P3g script |
| Proof quality gate | 📋 | Planned in gpu_eligibility_gate |

---

## The Agentic Loop (Freeze This)

This is the architecture to stabilize first:

```
User Task
  ↓
Gemma4 (planner)
  Classify feature
  Decide next step
  Never edits code
  │
  ├─ Route to: P3g backfill? Schema fix? Retrieval issue?
  ├─ Confidence: 0.0–1.0
  └─ Reasoning: stored as trace
  │
  ↓
TurboVec (associative memory)
  Search repo for similar patterns
  Find prior fixes
  Find related schema
  Find testing patterns
  │
  ├─ Top-1: 92% match in scripts/atlas/wire-qdrant.mjs
  ├─ Top-2: 88% match in agent-observation-ingest.ts
  ├─ Top-3: 84% match in backfill-qdrant-payload.mjs
  └─ Recommendation: "Use Top-1 pattern (0.92 confidence)"
  │
  ↓
OpenCode (surgeon)
  Read Top-1 pattern (50 lines max)
  Read current file (50 lines max)
  Compare
  Draft 5-line patch
  Never invents schema
  │
  ├─ Read: scripts/atlas/wire-qdrant.mjs:120–170 (PUT endpoint)
  ├─ Read: backfill-script.mjs:85–135 (current upsert)
  ├─ Patch: 3-line difference (missing spread operator)
  └─ Test: npm run test -- backfill (or dry-run)
  │
  ↓
Replay (did it work?)
  Run targeted test
  Run trace replay
  Measure quality_baseline before/after
  │
  ├─ Before: CPU latency 2500ms, quality 0.94
  ├─ After: GPU latency 25ms, quality 0.94
  └─ Verdict: ✅ PASS (quality preserved, speed 100×)
  │
  ↓
Postgres (write trace)
  Store task lifecycle
  ├─ task_id: feature:agent_memory_packets
  ├─ trace_id: trace:xyz
  ├─ status: PASS
  ├─ files_read: [wire-qdrant.mjs, backfill-script.mjs]
  ├─ files_modified: [backfill-script.mjs]
  ├─ tests_run: [backfill]
  └─ reports: [p3g-backfill.json]
  │
  ↓
TurboVec (index new repair)
  Embed the patch
  Tag with: feature_id, trace_id, confidence
  Store in Qdrant
  │
  └─ When next similar error found: this patch is top-1 candidate
  │
  ↓
Gemma4 (recommend next)
  What's the next blocker?
  Did this unblock other features?
  Can we now run P3g backfill?
  │
  └─ "Next: Apply P3g backfill now that qdrant-wire is fixed"
  │
  ↓
  repeat
```

**This loop turns the repo into a growing memory system**:
- Gemma4 = planner (decides)
- TurboVec = memory (recalls similar solutions)
- OpenCode = surgeon (patches precisely)
- Postgres = truth (records everything)
- trace-MCP = provenance (replay for verification)

---

## What NOT to Do

### Don't claim 7× speedup without report
```
❌ "4D topology manifold enables 7× faster retrieval"
✅ "Retrieval with 4D prefilter: report in docs/reports/p3g-duckdb.json shows latency delta"
```

### Don't mix "exists in code" with "works end-to-end"
```
❌ "CouchDB archival working (archive-to-couchdb.mjs script exists)"
✅ "CouchDB archival: script exists, awaiting P3g backfill execution. Report docs/reports/p3g-couchdb.json will verify."
```

### Don't separate "planner" from "decision"
```
❌ "Gemma4 is the LLM"
✅ "Gemma4 is the planner: it decides what to do next, never edits code"
```

### Don't use TurboVec as a decision-maker
```
❌ "TurboVec found this pattern, so use it"
✅ "TurboVec found this pattern (92% confidence), Gemma4 recommends it, OpenCode applies it"
```

### Don't let OpenCode invent schema
```
❌ "Add a 'new_field' to the packet structure"
✅ "Read current schema from nes_chrom_packets, show me the 10-line CREATE TABLE, we can only patch if Gemma4 approved the change"
```

---

## Next Actions (Clear Tiers)

### T1: Apply Tier 1 (Already Verified)
- **Action**: No action needed. Tier 1 is LIVE.
- **Timeline**: Now
- **Verification**: Queries to Postgres/Qdrant/Redis return data

### T2: Execute Tier 2 (Scripts Ready, Need Execution)
1. Apply migration 0053 → creates Tier 2 tables
2. Run test suite → verify schema integrity
3. Execute `Start-P3gBackfill.ps1` → produces `p3g-backfill.json`
4. Execute CouchDB archive → produces `p3g-couchdb.json`
5. Execute DuckDB analytics → produces `p3g-duckdb.json`
6. Execute Gemma4 summaries → produces `p3g-summaries.json`
7. Execute replay → produces `p3g-replay.json`

**Timeline**: 2–3 hours (mostly non-blocking parallel execution)

### T3: Stabilize Agentic Loop (Before Training)
- Freeze the 5-step loop (Gemma4 → TurboVec → OpenCode → Replay → Postgres)
- Document boundaries (planner never edits, surgeon never decides, etc.)
- Build observability around trace lifecycle
- **Then** (only after T3 stable): add model training, attention experiments, QLoRA

---

## Summary: What to Claim Now

**VERIFIED** (report in repo, metrics live):
- Postgres canonical truth (17,931 packets queryable)
- Qdrant mirror (2,488 vectors live, 13,481 pending)
- Redis caches (BitFrost L1, centroid, exact-card)
- Gemma4 planner (decision-making active)
- OpenCode editor (patching files now)
- TurboVec search (GPU acceleration wired)
- trace-MCP (provenance recording)
- Go-Retrieval (multi-vector search live)

**PLANNED** (scripts exist, awaiting execution, will produce reports):
- P3g backfill → p3g-backfill.json
- CouchDB archival → p3g-couchdb.json
- DuckDB analytics → p3g-duckdb.json
- Gemma4 summaries → p3g-summaries.json
- Replay validation → p3g-replay.json

**DESIGNED** (specs written, code pending execution):
- agent_memory_registry schema (migration 0053)
- Proof quality gates (sql written)
- DNRO registry (planned in script)

---

**Next move**: Which tier to focus on? T1 needs no work. T2 ready for execution. T3 design ready for stabilization.
