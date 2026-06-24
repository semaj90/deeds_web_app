# Legal-AI Parent Atlas Product Integration

**Status**: ✅ P0–P1 Complete | 🚀 Canonical Embedding Pipeline Live | ✅ GPU/CUDA Bridge Verified  
**Date**: 2026-06-24

---

## Overview

The Parent Atlas provides the foundational retrieval, graph, and GPU acceleration layers for retrieval-augmented generation (RAG) in the Deeds Web App. This document outlines how infrastructure (canonical embeddings, GPU kernels, multi-tier caching) integrates into user-facing product surfaces (Admin Copilot, CrimeAnalysisService, investigative planning).

**Current Working Contract**:
1. **Storage Tiering** (Postgres truth → Qdrant mirrors → Redis cache) ✅ **LIVE**
2. **Canonical Embeddings** (768-dim vectors via Ollama/ONNX) ✅ **LIVE** (3,251/17,995 packets complete, backfill in progress)
3. **Multi-Tier Caching** (Valkey L1 summary-hash + Bifrost L2 semantic + Redis centroid seeds) ✅ **LIVE**
4. **GPU Acceleration** (LibTorch N-API bridge for ranking/reranking) ✅ **VERIFIED**
5. **Retrieval Telemetry** (provenance + trust tiers) — ⏳ Wire into copilot UI (Phase 4)
6. **Neo4j Contextual Trees** (8,823 tree nodes, 100% packet linkage) ✅ **LIVE**
7. **Higher-Hop Enrichment** — ⏳ Phase 4–5 (graph traversal, topological reranking)
8. **Formal XGBoost Reranker** — ⏳ Phase 6 (after P3g/P4 lanes complete)

---

## Data Flow: From Evidence to Retrieval

### Step 1: Canonical Embedding Backfill (RabbitMQ Worker Pipeline)

**What**: Enrich `atlas_packets` with 768-dimensional embeddings.  
**Input**: 7,232 packets needing embeddings (59.8% → 100% coverage).  
**Process**:
```
Postgres atlas_packets.summary
  ↓ RabbitMQ job (claim + dedup)
  ↓ Valkey cache check (summary_hash)
  ↓ Ollama/ONNX embedding (768-dim)
  ↓ Postgres write (canonical truth)
  ↓ Redis centroid seed cache (7-day TTL, feature_id aggregate)
  ↓ Bifrost L2 warm (semantic index)
  ↓ Qdrant upsert (vector + payload mirror)
  ↓ ACP Gemma4 task (async summary synthesis)
  ↓ atlas_embedding_metrics (provider + latency + cache_hit)
```

**Output**: 
- `atlas_packets.embedding` — 768-dim vector (canonical)
- `centroid:seed:packet:{key}` — First 64 dims for SOM/KMeans (7-day TTL)
- `bifrost:embed:embeddinggemma:768:{summary_hash}` — Cache hit reduction (30-day TTL)
- `atlas_embedding_metrics` — Latency + provider breakdown for optimization

**Throughput**: 40 packets/min (4 workers) → ~3 hours for backfill  
**Deduplication**: Postgres claim lock + Valkey summary_hash cache → zero double-work

**See**: [Canonical Embedding Worker Setup](../reports/CANONICAL-EMBEDDING-WORKER-SETUP.md)

---

### Step 2: GPU Acceleration (Context Reranking)

**What**: Use CUDA kernels to rerank retrieved chunks by relevance and authority.  
**Inputs**: Query embedding (768-dim) + candidate chunks (n×768 matrix).  
**GPU Operations** (100× faster than CPU):

| Operation | Input | Output | Latency |
|-----------|-------|--------|---------|
| `batchCosineSimilarity` | query(768) vs corpus(1000×768) | scores(1000) | 2.3ms |
| `attentionScoreGPU` | query(768) vs keys(500×768) | weights(500) | 0.8ms |
| `pageRankGPU` | adjacency(1000×1000) | ranks(1000) | 4.1ms |
| `rewardScoreGPU` | gen(100×768) vs ref(100×768) | rewards(100) | 1.2ms |

**Flow**:
```
Qdrant ANN search (dense + sparse hybrid)
  ↓ N-API TypedArray (Float32Array[n×768])
  ↓ GPU kernel (batchCosineSimilarity)
  ↓ Result scores(n) — reranked top-k
  ↓ Neo4j graph boost (authority × pageRank)
  ↓ Final ranking for context assembly
```

**Memory Layout**:
- Input: Host pinned memory (Postgres → JS → GPU)
- CUDA unified memory: Copy H→D, kernel, D→H
- ArrayBuffer pool: Recycled per V8 GC (zero malloc churn)
- Fallback: CPU LibTorch if GPU unavailable

**See**: [GPU/CUDA N-API Memory Layout](GPU-CUDA-NAPI-MEMORY-LAYOUT.md)

---

### Step 3: Retrieval Provenance (Admin Copilot Surface)

**What**: Surface "why this result" metadata to users.  
**When**: User runs a search in Admin Copilot → system returns top-k results + provenance.

#### Surfaced Metadata:

1. **Qdrant SourceRefs** 
   - Direct links to file chunks, line numbers, feature_id
   - `source_ref`: "src/lib/server/auth.ts:validateSession()"
   - `file_path`: "src/lib/server/auth.ts"

2. **Embedding Provenance**
   - `embedding_provider`: "ollama" | "onnx" | "cache"
   - `summary_hash`: SHA-256 of summary (dedupe proof)
   - `latency_ms`: 50–25000 (API vs GPU vs cache)

3. **Cache Status**
   - **L1 Hit** (5ms): Exact summary match in Valkey → **Cache**: bifrost:embed:*
   - **L2 Hit** (2-5s): Semantic similarity in Bifrost → **Cache**: bifrost:packet:*
   - **GPU Compute** (25s): Fresh inference via Ollama/ONNX → **New**: first time seen

4. **Neo4j Graph Paths**
   - "File A imports File B which implements Feature C"
   - Authority score from PageRank (0–1)
   - Cluster membership (SOM grid cell or KMeans cluster)

5. **Trust Tier** (T0–T3)
   - **T0**: Deterministic analysis (packet_key exists in DB)
   - **T1**: Committed documentation (summary stable, embedding indexed)
   - **T2**: LLM-enriched synthesis (ACP Gemma4 processed)
   - **T3**: Draft/low-confidence (cache miss, low embedding confidence)

6. **Lane Breakdown**
   - `vector_lane`: Qdrant dense + sparse ANN
   - `graph_lane`: Neo4j k-hop traversal
   - `synthesis_lane`: Gemma4 + ACE reranking
   - `retrieval_lane`: BM25 FTS fallback
   - Multi-lane fusion score (ACE blend: 0.4·semantic + 0.3·authority + 0.3·graph)

---

## CrimeAnalysisService: Plan-Only Mode

**What**: Generate structured investigative plans before synthesis.  
**Use Case**: Attorney prepares discovery for deposition; system outlines argument structure and gaps.

### Investigative Plan Structure:

#### 1. Facts (Verified Evidence)
```json
{
  "fact_id": "fact:001",
  "statement": "Defendant was present at location X on date Y",
  "source_refs": ["doc:police-report:p12", "doc:witness-statement:p5"],
  "confidence": 0.95,
  "trust_tier": "T1",
  "embedding_id": "packet:evidence:001"
}
```

#### 2. Allegations (Claims by Parties)
```json
{
  "allegation_id": "allg:001",
  "party": "prosecution",
  "statement": "Defendant committed assault",
  "supporting_facts": ["fact:001", "fact:003"],
  "source_refs": ["doc:complaint:p2"],
  "contested_by": ["allg:counter-001"]
}
```

#### 3. Inferences (AI Logical Deductions)
```json
{
  "inference_id": "inf:001",
  "premise_facts": ["fact:001", "fact:002"],
  "conclusion": "Timeline is consistent with motive",
  "confidence": 0.72,
  "reasoning_chain": [
    "A: Defendant had access to location (fact:001)",
    "B: Victim was at location at same time (fact:002)",
    "C: Therefore, temporal overlap exists"
  ],
  "ai_generated": true,
  "source_inference_method": "acl_context_assembler",
  "trust_tier": "T2"
}
```

#### 4. Unknowns (Evidentiary Gaps)
```json
{
  "unknown_id": "unk:001",
  "category": "timeline",
  "description": "No documentation of defendant's location between 2pm–4pm",
  "consequence": "Alibi window unverified",
  "evidence_needed": ["surveillance footage", "cell tower records", "witness testimony"],
  "retrieval_hints": ["location tracking", "video evidence", "phone records"],
  "embedding_query": "Where was suspect between 2pm and 4pm?"
}
```

#### 5. Source References (Mandatory)
```
Every fact + allegation + inference MUST have:
  - source_refs: [doc_id_1, doc_id_2, ...]
  - confidence: float (0–1)
  - trust_tier: T0 | T1 | T2 | T3
  - embedding_id: Qdrant point ID (for reranking)
```

### Execution Flow (Plan-Only Mode):

```
1. User uploads case documents
   ↓
2. SvelteKit /api/case/analyze calls CrimeAnalysisService
   ↓
3. ACE context-assembler retrieves top-50 chunks (vector + graph lanes)
   ↓
4. Gemma4 (ACP) generates plan (JSON-RPC via MCP)
   - Extracts facts from chunks
   - Infers logical connections
   - Identifies gaps + unknowns
   ↓
5. System returns structured JSON plan (NO synthesis)
   ↓
6. UI visualizes timeline + connections + confidence scores
   ↓
7. User reviews → clicks "Generate Full Synthesis" (if satisfied with plan)
   ↓
8. CrimeAnalysisService.synthesize() produces narrative (Phase 5)
```

---

## Integration Checkpoints (Product → Infrastructure)

### Admin Copilot Search

**Endpoint**: `POST /api/admin/search`  
**Flow**:
1. Parse query (string) → embed via ONNX/Ollama → 768-dim query vector
2. Qdrant ANN + Neo4j graph fusion (ACE lane selection)
3. GPU reranking (batchCosineSimilarity + attentionScoreGPU)
4. Fetch result metadata:
   - Embedding provider + latency (from atlas_embedding_metrics)
   - Cache hit status (Valkey lookup)
   - Authority score (Neo4j pageRank)
   - Trust tier (Postgres packet metadata)
5. Return results + provenance JSON

**UI Shows**:
- Result text + highlighted chunks
- "Found via [lane]: [provider] (latency: Xms, cache: [hit|miss])"
- Trust badge: T0 ⭐ | T1 ⭐ | T2 ★ | T3 ✓
- "Similar in codebase" (other packets in same SOM cell)

### CrimeAnalysisService Plan Generation

**Endpoint**: `POST /api/case/analyze/plan-only`  
**Flow**:
1. Fetch case docs from Postgres (atlas_packets where feature_id = 'case:*')
2. Create ACE context (vector + graph lanes, GPU reranking)
3. Call ACP Gemma4 (MCP tool: `generateInvestigativePlan`)
4. Store plan in `crime_analysis_plans` table
5. Return facts/allegations/inferences with source links

**UI Shows**:
- Timeline of facts (sorted by date or confidence)
- Allegation ↔ Fact connections (graph visualization)
- Inference reasoning chain (collapsible)
- Unknowns with "Run New Search" button (re-query with unk:001 hints)
- Confidence badges + trust tiers

---

## Implementation Status (June 24, 2026)

| Component | Status | Details |
|-----------|--------|---------|
| **Canonical Embeddings** | 🚀 Backfill Live | 10,775/17,995 (59.9%), 7,232 pending, 40 packets/min throughput |
| **RabbitMQ Pipeline** | ✅ Complete | Dedup guard, multi-worker concurrency, metrics table |
| **Valkey Caching** | ✅ Complete | L1 summary_hash + L2 Bifrost + Redis centroid seeds |
| **GPU/CUDA Bridge** | ✅ Verified | 5 kernels operational, CPU fallback, ArrayBuffer pool |
| **Neo4j Tree Nodes** | ✅ Complete | 8,823 nodes (5,572 docs + 3,251 chunks), 100% linkage |
| **Qdrant Mirrors** | ✅ Live | 58 collections, 99.3% Neo4j sync'd, payload updates live |
| **Admin Copilot UI** | ⏳ Phase 4 | Infrastructure ready, UI wiring pending |
| **CrimeAnalysisService** | ⏳ Phase 4.2 | Plan-only scaffolded, Gemma4 MCP tool ready |
| **Investigative Plan Viz** | ⏳ Phase 4.3 | Timeline + graph components designed |
| **Formal Reranker (XGBoost)** | ⏳ Phase 6 | After P3g/P4 embedding layers complete |

---

## Next Steps (This Month)

### Week 1 (Canonical Embedding Completion)
- [ ] Finish 7,232 packet backfill (Ollama workers)
- [ ] Validate coverage = 100%
- [ ] Review atlas_embedding_metrics breakdown (provider distribution, latency percentiles)

### Week 2 (SOM Clustering → Centroid Aggregation)
- [ ] Compute SOM grid (20×20, 400 cells) from centroid:seed:packet:* keys
- [ ] Aggregate to `centroid:index:feature:{feature_id}` (KMeans means)
- [ ] Backfill Qdrant `som_cell` payload field

### Week 3 (Admin Copilot UI Wiring)
- [ ] Wire `/api/admin/search` to ACE context-assembler
- [ ] Fetch `atlas_embedding_metrics` for provenance display
- [ ] Add trust badges + lane breakdown

### Week 4 (CrimeAnalysisService Integration)
- [ ] Wire Gemma4 MCP `generateInvestigativePlan` tool
- [ ] Create crime_analysis_plans table
- [ ] Build timeline + inference graph visualization

---

## References

- [Canonical Embedding Worker Setup](../reports/CANONICAL-EMBEDDING-WORKER-SETUP.md) — RabbitMQ pipeline, dedup, metrics
- [GPU/CUDA N-API Memory Layout](GPU-CUDA-NAPI-MEMORY-LAYOUT.md) — Kernel performance, TypedArray binding, bitmap patterns
- [Parent Atlas Frozen Identity Contract](parent-atlas-frozen-identity-contract.md) — P0–P7 roadmap, lineage verification
- [Parent Atlas Operating System](../PARENT-ATLAS-OPERATING-SYSTEM.md) — Architecture master doc
- `src/lib/server/ai/context-assembler.ts` — ACE lane selection + fusion
- `src/routes/api/admin/search/+server.ts` — Copilot endpoint (to be wired)
- `src/lib/server/crime-analysis/CrimeAnalysisService.ts` — Plan-only mode scaffold
