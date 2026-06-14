# Parent Atlas: Identity Reconciliation as the Real Completion Criterion

**Status**: Infrastructure complete. Retrieval intelligence incomplete.  
**Blocker**: Qdrant/Postgres reconciliation shows `sampled_agreement: 0/50`  
**Next script**: `scripts/atlas/debug-qdrant-postgres-mismatch.mjs`  
**Gate criterion**: `sampled_agreement > 95%`

---

## What Parent Atlas Actually Is (Not What I Thought)

Not a single unified data lake.

**Five parallel ledgers**, each owned by different layers:

| Layer | Purpose | Source of Truth | Identity Key |
|-------|---------|-----------------|--------------|
| **Postgres** | Canonical packet identity | atlas_packets | packet_key + source_ref + feature_id |
| **Qdrant** | Semantic serving (vectors) | codebase_chunks_768 | (content, summary, memory vectors) |
| **Redis/Valkey** | Hot semantic cache + Karpathy | gpu:karpathy:scores, Bifrost | blend = 0.4×pagerank + 0.3×attention + 0.3×authority |
| **Neo4j** | Bounded topology/context expansion | USED_CONCEPT, USED_PACKET edges | feature_id (NOT packet_key) |
| **NES/CHROM** | Episodic memory cards (agent experience) | nes_chrom_packets | feature_id (NOT packet_key) |

Each ledger is **independent**. They **converge at retrieval time**, not at storage time.

---

## Why Sampled Agreement = 0/50 Is the Real Blocker

**The problem**: Qdrant and Postgres are disagreeing on basic identity fields.

When you don't know why:
- You can't trust Qdrant payloads as source of truth
- You can't enrich with Neo4j (wrong neighborhoods)
- You can't train autoencoder (learns corrupted drift)
- You can't compute Karpathy blend (ranks wrong packets)
- You can't call Gemma4 (garbage in, garbage out)

**Every enrichment amplifies drift.**

---

## The Debug Script: Identity Transparency

**File**: `scripts/atlas/debug-qdrant-postgres-mismatch.mjs` (434 lines)

### What It Does

1. **Fetch random sample** from Qdrant (default 50 points)
2. **Extract source_ref** from each Qdrant point
3. **Lookup in Postgres** atlas_packets by source_ref
4. **Compare fields**:
   - packet_key
   - source_ref
   - feature_id
   - feature_label
5. **Report agreement**: per-point reconciliation + aggregate stats
6. **Gate**: `agreement_percent >= 95%` → proceed with enrichment

### Usage

```bash
# Run reconciliation (50 random points)
npm run atlas:debug:qdrant-postgres

# Verbose mode (show every comparison)
npm run atlas:debug:qdrant-postgres:verbose

# Custom sample size
SAMPLE_SIZE=200 npm run atlas:debug:qdrant-postgres
```

### Output

**JSON** (`docs/reports/qdrant-postgres-mismatch-debug.json`):

```json
{
  "timestamp": "2026-06-14T...",
  "qdrant": {
    "host": "localhost",
    "port": 6333,
    "collection": "codebase_chunks_768",
    "points_sampled": 50
  },
  "postgres": {
    "host": "127.0.0.1:5434",
    "packets_found": 48
  },
  "reconciliation": {
    "total_points": 50,
    "agreements": 48,
    "mismatches": 2,
    "agreement_percent": 96.0,
    "gate_pass": true
  },
  "results": [
    {
      "qdrant_point_id": "12345...",
      "source_ref": "src/lib/server/auth.ts",
      "qdrant": {
        "packet_key": "ace:packet:auth:001",
        "source_ref": "src/lib/server/auth.ts",
        "feature_id": "auth.sessions",
        "feature_label": "Authentication Sessions",
        "metadata_keys": ["domain", "tags"]
      },
      "postgres": {
        "packet_key": "ace:packet:auth:001",
        "source_ref": "src/lib/server/auth.ts",
        "feature_id": "auth.sessions",
        "feature_label": "Authentication Sessions",
        "metadata_keys": ["domain", "tags"]
      },
      "normalized_source_ref": "src/lib/server/auth.ts",
      "mismatch_fields": [],
      "agreement": true
    },
    {
      "qdrant_point_id": "54321...",
      "source_ref": "src/lib/server/cache.ts",
      "qdrant": {
        "packet_key": "ace:packet:cache:002",
        "source_ref": "src/lib/server/cache.ts",
        "feature_id": "cache.redis",
        "feature_label": "Redis Cache",
        "metadata_keys": ["domain"]
      },
      "postgres": {
        "packet_key": "ace:packet:cache:001",
        "source_ref": "src/lib/server/cache.ts",
        "feature_id": "cache.valkey",
        "feature_label": "Valkey Cache",
        "metadata_keys": ["domain"]
      },
      "normalized_source_ref": "src/lib/server/cache.ts",
      "mismatch_fields": ["packet_key", "feature_id"],
      "agreement": false
    }
  ]
}
```

**Markdown** (`docs/reports/qdrant-postgres-mismatch-debug.md`):

```markdown
# Qdrant ↔ Postgres Identity Reconciliation

**Generated**: 2026-06-14T...

## Summary

| Metric | Value |
|--------|-------|
| Points Sampled | 50 |
| Agreements | 48 |
| Mismatches | 2 |
| Agreement % | 96.0% |
| **Gate Status** | **✅ PASS** |

## Mismatches

### src/lib/server/cache.ts

**Qdrant Point ID**: `54321...`

| Field | Qdrant | Postgres |
|-------|--------|----------|
| `packet_key` | `ace:packet:cache:002` | `ace:packet:cache:001` |
| `feature_id` | `cache.redis` | `cache.valkey` |

## Recommendations

✅ **Agreement > 95%** — Identity is consistent.

Proceed with:
1. Higher-hop Neo4j enrichment
2. Autoencoder 768→64 training
3. SOM 20×20 computation
4. Karpathy blend reindex
5. Gemma4 topology-aware planning
```

### Exit Codes

- **0** (success): `agreement_percent >= 95%` → GATE PASS
- **1** (failure): `agreement_percent < 95%` → GATE FAIL

---

## What Karpathy Actually Is (Not an Indexer)

**Karpathy consumes**:
- packet_key (from Postgres)
- source_ref (from Postgres)
- feature_id (from Postgres)
- community_id (from Postgres)
- som_cluster (computed)
- authority (Neo4j PageRank)
- pagerank (Neo4j computed)
- reward_prior (from traces/training)
- attention (from Qdrant query context)

**Karpathy computes**:
```
blend = 0.4 * pagerank + 0.3 * attention + 0.3 * authority
```

**Karpathy stores**:
```
gpu:karpathy:scores = {
  "packet_key": blend,
  ...
}
```

**Karpathy does NOT**:
- Index files
- Upsert to Qdrant
- Decide what goes in the lake
- Create new packet_key
- Modify feature_id

Karpathy is a **ranking expert**, not an indexer.

---

## The Real Retrieval Path (Post-Identity-Fix)

Once `sampled_agreement > 95%`:

```
Repo Root (source of truth: filesystem)
  ↓
atlas_packets (Postgres: canonical identity)
  packet_key (hash(source_ref + feature_id))
  source_ref (file path)
  feature_id (feature label)
  metadata (domain, tags, community_id)
  ↓
embeddinggemma:latest (Ollama: 768-dim)
  ↓
Qdrant (vector storage + payload indexes)
  "content" vector (768-dim semantic)
  "summary" vector (768-dim optional)
  "memory" vector (768-dim optional)
  ↓
TurboVec (ANN prefilter)
  Dense semantic prefilter
  ↓
Redis/Bifrost (hot semantic cache)
  bifrost:packet:{key} (5min TTL)
  gpu:karpathy:scores (24h TTL)
  ↓
Neo4j (bounded topology expansion)
  USED_CONCEPT edges (feature_id join)
  USED_PACKET edges (feature_id join)
  3-hop bounded expansion
  ↓
XGBoost (rerank top-100 → top-20)
  Features: cosine, pagerank, attention, authority, reward
  ↓
Gemma4 (reasoning + planning)
  Receives: top_packets, tools, graph_context (NOT raw embeddings)
  ↓
OpenCode mutation gate (ACE policy)
  ↓
ACE/KAG/DAG (agent orchestration)
```

**Each layer owns one responsibility**:
- **Gemma4**: Reasons
- **Karpathy**: Ranks (blend)
- **Neo4j**: Expands (bounded hops)
- **TurboVec**: Filters (ANN)
- **Qdrant**: Serves (vectors)
- **Postgres**: Owns identity (source of truth)

This **separation of responsibilities** is what keeps Parent Atlas deterministic instead of becoming a vector store with graphs attached.

---

## Why SOM/Autoencoder Training Is Deferred

**Do NOT train** 768→256→64 autoencoder until `agreement > 95%`.

**Why**: Autoencoder learns from corrupted neighborhoods.

If drift exists at retrieval time:
- Autoencoder learns identity mistakes → latent_64 corrupted
- SOM 20×20 inherits corruption → centroids wrong
- KMeans assignment inherits corruption → clusters wrong
- Karpathy blend inherits corruption → authority scores wrong
- Gemma4 planning inherits corruption → reasoning degraded

**The training sequence** (only after identity fix):

```
768-dim (Qdrant content vector)
  ↓ (verify agreement >95%)
debug-qdrant-postgres-mismatch
  ↓ (sample agreement validated)
768→256 (autoencoder encoder)
  ↓
256→64 (autoencoder compress)
  ↓
latent_64 (clean neighborhoods)
  ↓
SOM 20×20 (topological clustering)
  ↓
KMeans (centroid assignment)
  ↓
Karpathy reindex (blend recalculation)
  ↓
Gemma4 topology-aware planning
```

---

## NES/CHROM Relationship (Not Merged)

**atlas_packets** (file-centric, canonical):
- file
- function
- route
- gRPC endpoint
- API response
- component

**nes_chrom_packets** (session-centric, episodic):
- agent session
- workflow execution
- screenshot memory
- agent action trace
- retrieval card
- decision log

**Do NOT merge**. They are orthogonal:
- atlas_packets = "what exists in the codebase"
- nes_chrom_packets = "what the agent experienced"

**Join rule**: `feature_id` AND Neo4j Concept nodes (NOT packet_key, NOT row id, NOT source_ref).

Example:
- atlas_packet: `feature_id = auth.sessions` → SessionStore class
- nes_chrom_packet: `feature_id = auth.sessions` → "agent fixed session timeout bug" (workflow trace)
- Neo4j Concept: `Authentication` → links both via USED_CONCEPT edges

---

## What Gemma4 Should Receive

**NOT**:
- 300 tools (unfiltered)
- 50k files (raw corpus)
- Neo4j neighbors (all edges)
- Raw embeddings (768-dim vectors)
- Hidden states
- Attention weights

**YES** (curated context):

```json
{
  "query": "authentication session",
  
  "top_packets": [
    {
      "packet_key": "ace:packet:auth:001",
      "source_ref": "src/lib/server/auth.ts",
      "feature_id": "auth.sessions",
      "feature_label": "Authentication Sessions",
      "domain": "auth",
      "karpathy_blend": 3.29,
      "reward_prior": 0.77
    },
    {
      "packet_key": "ace:packet:session:002",
      "source_ref": "src/lib/server/session.ts",
      "feature_id": "session.management",
      "feature_label": "Session Management",
      "domain": "infrastructure",
      "karpathy_blend": 2.94,
      "reward_prior": 0.65
    }
  ],
  
  "tools": [
    "AuthService.ValidateSession",
    "RedisCache.GetSession",
    "SessionRepairTool",
    "LogAuditEvent"
  ],
  
  "graph_context": [
    "USED_CONCEPT:Authentication",
    "USED_PACKET:SessionStore",
    "USED_PACKET:RedisClient"
  ]
}
```

Gemma4 reasons about this **curated context**, not raw state.

---

## The Remaining Path to Agent OS

**Gate sequence**:

```
1. debug-qdrant-postgres-mismatch.mjs
   ↓ (achieve agreement > 95%)

2. Comparator contract locked
   ↓ (verify identity consistency)

3. Higher-hop Neo4j enrichment
   ↓ (expand from USED_CONCEPT edges)

4. Autoencoder 768→64
   ↓ (compress clean vectors)

5. SOM 20×20
   ↓ (topological clustering)

6. Karpathy reindex
   ↓ (recalculate blend with SOM coordinates)

7. Gemma4 topology-aware planning
   ↓ (reason with bounded context)

8. OpenCode mutation gate
   ↓ (policy-gated tool calls)

9. ACE/KAG/DAG orchestration
   ↓
TOPOLOGY-AWARE AGENT OPERATING SYSTEM ✅
```

This is the path from "large RAG system" to deterministic, topology-aware reasoning.

---

## Files

| File | Purpose | Status |
|------|---------|--------|
| `scripts/atlas/debug-qdrant-postgres-mismatch.mjs` | Identity reconciliation (434 lines) | ✅ Ready |
| `docs/reports/qdrant-postgres-mismatch-debug.json` | Generated by debug script | (generated) |
| `docs/reports/qdrant-postgres-mismatch-debug.md` | Generated by debug script | (generated) |
| `npm run atlas:debug:qdrant-postgres` | Run reconciliation (50 points) | ✅ Registered |
| `npm run atlas:debug:qdrant-postgres:verbose` | Run with detailed output | ✅ Registered |

---

## What This Means for Phase D

**Phase D completion criterion: NOT the embedding script.**

**Phase D completion criterion: `sampled_agreement > 95%`.**

Once debug-qdrant-postgres-mismatch.mjs passes:
- ✅ Identity is consistent across Postgres ↔ Qdrant
- ✅ Safe to enrich with Neo4j topology
- ✅ Safe to train autoencoder (won't learn drift)
- ✅ Safe to compute Karpathy blend
- ✅ Ready for Gemma4 topology-aware planning

---

**The real work is not more models. It's identity consistency, retrieval observability, and topology truth.**