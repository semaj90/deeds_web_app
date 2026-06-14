# Phase 14/15 → Production: Hardening Contract

**Status**: Architecture locked  
**Date**: 2026-06-14  
**Purpose**: Freeze identity, retrieval order, and ledger semantics before scale

---

## 1. Canonical Spine — Immutable

### Identity Fields (NEVER enrich)
```
packet_key          — stable, deterministic
source_ref          — file path (normalized)
feature_id          — semantic category
feature_label       — human-readable
metadata.identity.*  — birthplace, creator, lineage
```

### What Goes Where (NOT into identity)

```
❌ WRONG: identity.summary_feature = "..."
✅ RIGHT: metadata.ranking.summary_feature = "..."

❌ WRONG: identity.somCluster = "cluster:5:3"
✅ RIGHT: metadata.topology.somCluster = "cluster:5:3"

❌ WRONG: identity.karpathyBlend = 0.75
✅ RIGHT: metadata.ranking.karpathyBlend = 0.75

❌ WRONG: identity.neo4jNodeId = "node:xyz"
✅ RIGHT: metadata.graph.neo4jNodeId = "node:xyz"

❌ WRONG: identity.authorityScore = 0.92
✅ RIGHT: metadata.ranking.authorityScore = 0.92
```

### Metadata Structure (JSONB)
```json
{
  "identity": {
    "source": "atlas_packets|nes_chrom|external",
    "version": "1.0",
    "created_at": "2026-06-14T...",
    "lineage": {
      "mapper": "mapreduce_phase_3",
      "enricher": "gemma4_batch_summarizer",
      "processor": "phase_14_15"
    }
  },
  "topology": {
    "latent_64": [0.123, ...],
    "som_row": 5,
    "som_col": 3,
    "som_cluster": "cluster:5:3",
    "kmeans_cluster": 12,
    "community_id": 42,
    "manifold_density": 0.78
  },
  "ranking": {
    "karpathy_blend": 0.75,
    "authority_score": 0.92,
    "pagerank": 1.23,
    "attention_score": 0.88,
    "reward_prior": 0.65
  },
  "graph": {
    "neo4j_node_id": "node:abc123",
    "tree_node_key": "node:def456",
    "parent_id": "node:ghi789",
    "root_id": "node:root000"
  },
  "memory": {
    "nes_chrom_episode_id": "ep:xyz123",
    "engagement_count": 5,
    "last_retrieved": "2026-06-14T...",
    "reward_history": [0.6, 0.7, 0.8]
  }
}
```

### Postgres Schema (Enforced)
```sql
-- Canonical spine (indexed, immutable)
packet_key VARCHAR PRIMARY KEY
source_ref VARCHAR UNIQUE NOT NULL
feature_id VARCHAR NOT NULL
feature_label VARCHAR
metadata JSONB NOT NULL

-- Never put topology/ranking/graph fields at top level
-- Everything else lives in metadata.* JSONB subtrees

CREATE INDEX idx_packets_feature_id ON atlas_packets(feature_id);
CREATE INDEX idx_packets_identity ON atlas_packets USING GIN (metadata->'identity');
CREATE INDEX idx_packets_topology ON atlas_packets USING GIN (metadata->'topology');
CREATE INDEX idx_packets_ranking ON atlas_packets USING GIN (metadata->'ranking');
```

---

## 2. Retrieval Order — Fixed (7 Layers)

```
INCOMING QUERY
       ↓
┌──────────────────────────────────────────┐
│ L0: Redis / Bifrost Semantic Cache       │
│ TTL: 5min (L1) + 24h (L2)                │
│ Hit rate: 70-90%                         │
└──────────────────────────────────────────┘
       ↓ (miss)
┌──────────────────────────────────────────┐
│ L1: Qdrant ANN (768-dim, multi-vector)   │
│ - content (primary)                      │
│ - summary_feature (semantic intent)      │
│ - summary_system (architecture)          │
│ Payload filters: feature_id, community_id│
│ Return: top-100 candidates               │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ L2: Postgres (GIN JSONB + pgvector)      │
│ - GIN (metadata->'ranking')              │
│ - GIN (metadata->'topology')             │
│ - TSVECTOR full-text (summary_*)         │
│ - pgvector cosine (latent_64)            │
│ Return: supplementary matches            │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ L3: TurboVec (fast SIMD/GPU prefilter)   │
│ - Quantized cosine on latent_64          │
│ - Community neighborhood (SOM adjacency) │
│ - Confidence thresholding                │
│ Return: top-50 SOM neighbors             │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ L4: Neo4j (bounded context expansion)    │
│ - MATCH (p:Packet)-[:SIMILAR_TOPOLOGY]   │
│ - MATCH (p)-[:SHARES_CONCEPT]-(c:Concept)
│ - Max 2 hops (bounded)                   │
│ - Return: conceptual neighbors           │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ L5: Karpathy Blend (authority ranking)   │
│ Rerank via:                              │
│ - 0.4 × PageRank (Neo4j cached)          │
│ - 0.3 × Attention (query-weighted)       │
│ - 0.3 × Authority (Karpathy GPU)         │
│ Cache: Redis gpu:karpathy:scores (24h)   │
│ Return: top-20 re-ranked                 │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ L6: XGBoost (learned statistical rerank) │
│ Features:                                │
│ - BM25 score                             │
│ - Cosine similarity                      │
│ - Community co-occurrence                │
│ - Topology distance                      │
│ - Engagement history (NES/CHROM)         │
│ Return: top-10 final                     │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ L7: Gemma4 (reasoning + tool calls)      │
│ Input: top-10 packets + context          │
│ Output:                                  │
│ - summary                                │
│ - reasoning                              │
│ - tool_calls (MCP)                       │
│ - confidence                             │
│ Artifacts: ACE/KAG/DAG trace             │
└──────────────────────────────────────────┘
```

### Hard Rules
- **No layer duplicates another** — each has distinct responsibility
- **Cache between layers** — L0→L1 miss doesn't re-query L0
- **Neo4j bounded** — max 2 hops (O(V²) protection)
- **Karpathy stateless** — consumes metadata, returns score
- **XGBoost deterministic** — same input → same rank
- **Gemma4 is endpoint** — reasoning happens here, not earlier

---

## 3. Qdrant Payload Contract (Unified)

Every point in `codebase_chunks_768` follows this schema:

```json
{
  "packet_key": "src/lib/server/db/client.ts:abc123",
  "source_ref": "src/lib/server/db/client.ts",
  "feature_id": "database.postgres",
  "feature_label": "PostgreSQL Client",
  
  "domain_class": "backend.data",
  "community_id": 5,
  
  "som_cluster": "cluster:7:3",
  "som_row": 7,
  "som_col": 3,
  
  "karpathy_blend": 0.75,
  "authority_score": 0.92,
  "reward_prior": 0.65,
  
  "summary_chunk": "Postgres pool initialization and query execution",
  "summary_file": "Primary database client wrapper",
  "summary_folder": "Server-side data layer abstraction",
  "summary_feature": "Manages connection pooling and error handling",
  "summary_system": "Core data persistence and transaction management",
  
  "ledger_type": "atlas_packets",
  "metadata": {
    "identity": { ... },
    "topology": { ... },
    "ranking": { ... },
    "graph": { ... },
    "memory": { ... }
  }
}
```

### Qdrant Index Design
```sql
-- Vector indexes
- content (768-dim, primary ANN)
- summary_feature (768-dim, semantic intent)
- summary_system (768-dim, architecture)
- latent_64 (64-dim, SOM compressed)

-- Payload filters (enable L1 prefiltering)
- feature_id (exact match)
- community_id (exact match)
- som_cluster (exact match)
- karpathy_blend (range filter)
- domain_class (text search)

-- All fields + metadata searchable
-- Enables: ANN + filtered ANN + payload-only queries
```

---

## 4. Dual Ledgers (NOT merged)

### atlas_packets (Filesystem Truth)
```
Identity: packet_key, source_ref, feature_id
Source: MapReduce Phase 3 (file discovery)
Enrichment: Gemma4 Phase 14/15 (summaries)
Purpose: Retrieval truth, canonical identity
Linkage: 1:1 source_ref→file
```

### nes_chrom_packets (Agent Memory)
```
Identity: episode_id, session_id, tool_call_id
Source: Gemma4 tool calls + MCP traces
Enrichment: Agent workflow outcomes
Purpose: Episodic memory, learning signal
Linkage: N:M (one tool call → multiple atlas packets)
```

### Join Strategy
```
NEVER: SELECT * FROM atlas_packets JOIN nes_chrom_packets ON packet_key
       ↑ packet_key doesn't exist in nes_chrom

CORRECT: 
SELECT ap.*, nc.engagement
FROM atlas_packets ap
LEFT JOIN (
  SELECT ap2.feature_id, COUNT(*) as engagement
  FROM nes_chrom_packets nc
  JOIN atlas_packets ap2 ON ap2.feature_id = nc.feature_id
  GROUP BY ap2.feature_id
) AS engagement ON ap.feature_id = engagement.feature_id
```

### Gemma4 Usage
```
Retrieval:  atlas_packets
            (what to say)

Memory:     nes_chrom_packets
            (what I said before)

Tool calls: MCP
            (what I can do)

Artifacts:  ACE/KAG/DAG traces
            (how I decided)
```

---

## 5. SOM/Autoencoder Lane (Post-Summary)

Once Phase 14/15 summaries exist:

```
EmbeddingGemma (768-dim)
    ↓
Autoencoder
- Encoder: 768 → 256 → 64
- Decoder: 64 → 256 → 768
    ↓
latent_64 (compressed representation)
    ↓
SOM training (20×20 grid)
- Input: latent_64
- Topology: hexagonal
- Learning: iterative
    ↓
KMeans on SOM BMU (Bougain-Lindenstrauss)
    ↓
community_id assignment
```

### Persist to JSONB
```json
"topology": {
  "latent_64": [0.123, 0.456, ..., 0.789],
  "som_row": 7,
  "som_col": 3,
  "som_index": "7_3",
  "som_cluster": "cluster:7:3",
  "kmeans_cluster": 12,
  "community_id": 5,
  "manifold_density": 0.78,
  "pca_variance": 0.92
}
```

### New Retrieval Flow
```
query
  ↓
embed → latent_64
  ↓
SOM nearest neighbor (O(400) vs O(54k))
  ↓
community members (O(3k) vs O(54k))
  ↓
Qdrant cosine rerank (top-100)
  ↓
TurboVec latent distance (top-50)
  ↓
Neo4j expansion (top-30)
  ↓
Karpathy rerank (top-20)
  ↓
XGBoost rerank (top-10)
  ↓
Gemma4
```

This makes "4D topology" **real** (not conceptual):
- X = cosine similarity (dense)
- Y = graph distance (Neo4j)
- Z = SOM coordinate (topology)
- W = authority blend (Karpathy)

---

## 6. Karpathy (Consume, Never Index)

### What Karpathy Reads
```
Input (per packet):
- packet_key
- source_ref
- feature_id
- community_id
- reward_prior
- authority (static)
- pagerank (from Neo4j cache)
- attention_score (query-weighted)
- summaries (context)

From Redis cache:
- gpu:karpathy:scores:{packet_key}
- TTL: 24h
```

### What Karpathy Produces
```
Output (per query):
- karpathy_blend (0.4·PR + 0.3·attn + 0.3·auth)
- authority_score (0.0-1.0)
- topological_score (SOM distance)
- attention_score (query relevance)

Cache result:
- bifrost:karpathy:packet:{packet_key}
- TTL: 24h (hot memory)
```

### Hard Rule
```
❌ Karpathy should NOT scan atlas_packets
❌ Karpathy should NOT create new packets
❌ Karpathy should NOT modify identity

✅ Karpathy reads metadata.ranking
✅ Karpathy returns blend score
✅ Karpathy caches in Redis
```

---

## 7. Agentic Workflow (End-to-End)

```
OpenCode / IDE
    ↓ (startup briefing)
ACE cartridge
    ↓ (query + context)
Bifrost semantic cache (L0)
    ↓ (miss)
Qdrant ANN (L1)
    ↓
Postgres filters (L2)
    ↓
TurboVec prefilter (L3)
    ↓
Neo4j expansion (L4)
    ↓
Karpathy rerank (L5)
    ↓
XGBoost rerank (L6)
    ↓
Gemma4 reasoning (L7)
    ├─ summary
    ├─ tool_calls
    └─ artifacts
    ↓
MCP (tool execution)
    ↓
Trace (provenance)
    ↓
Engram memory (learning)
    ↓
NES/CHROM (episodic store)
    ↓
ACE/KAG/DAG replay
    ↓
atlas_packets update
    ↓
Validation gate
    ↓
(Pass)
Report + Commit
(Fail)
Rollback
```

### Mutation Contract
```
Every write to atlas_packets:
1. Producer artifact (what changed)
2. Validation gate (does it pass?)
3. Consumer dry-run (would ACE accept it?)
4. ACE/KAG/DAG hit (is it sound?)
5. Smoke test (basic functionality)
6. Gate pass (ready to apply)
7. Apply report (audit trail)
```

---

## 8. What Phase 14/15 Locks Down

✅ **Identity immutability** — packet_key, source_ref, feature_id never change  
✅ **Dual-ledger semantics** — atlas_packets ≠ nes_chrom_packets (join via Neo4j)  
✅ **Retrieval order** — 7-layer cascade with no duplication  
✅ **Metadata hierarchy** — identity/topology/ranking/graph/memory in JSONB  
✅ **Qdrant contract** — unified payload schema across all collections  
✅ **Karpathy as consumer** — reads metadata, returns score, never indexes  
✅ **Provenance on all writes** — enriched_by, source, lineage tracked  
✅ **Fail-safe enrichment** — 60s timeout, fail-open, no retries  

---

## 9. Verification Gates (Pre-Production)

Run these before calling it production-ready:

```bash
# 1. Identity immutability gate
npm run atlas:identity:audit
# PASS: packet_key/source_ref/feature_id never changed post-enrichment

# 2. Retrieval order gate
npm run atlas:retrieval:audit
# PASS: 7 layers tested, no duplication, cache between layers

# 3. Ledger separation gate
npm run atlas:ledger:audit
# PASS: atlas_packets and nes_chrom_packets correctly isolated

# 4. Qdrant payload schema gate
npm run atlas:qdrant:payload:verify
# PASS: 100% of points match payload contract

# 5. Karpathy consumption gate
npm run atlas:karpathy:audit
# PASS: Karpathy reads-only, never writes identity

# 6. Provenance gate
npm run atlas:provenance:audit
# PASS: all enriched_by/source/lineage fields populated

# 7. Topology quality gate
npm run atlas:topology:validate
# PASS: SOM depth ≤ 50, no cycles, community coverage ≥90%
```

---

## 10. Remaining Work (Not Architecture)

Once Phase 14/15 + Phase D production-hardening is complete:

1. **Determinism** — ensure XGBoost + Gemma4 are seeded/reproducible
2. **Provenance** — complete ACE/KAG/DAG trace logging
3. **Topology quality** — train SOM/KMeans, measure manifold density
4. **Scale testing** — benchmark at 50k+ packets
5. **Cold archive** — implement git-diff cold storage for old packets
6. **Engram training** — collect nes_chrom episodes, train reward model

**But architecture is locked. No more "add another model." Everything from here is:**
- Determinism (seeding)
- Provenance (tracing)
- Topology (quality)
- Mutation safety (gates)
- Memory (learning)

---

**This is the Packet Identity OS. Ship it.**
