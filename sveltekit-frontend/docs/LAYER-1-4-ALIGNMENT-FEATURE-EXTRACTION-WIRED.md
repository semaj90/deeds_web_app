# Layer 1-4 Alignment: Feature Extraction → OpenSpec Init

**Date**: June 29, 2026  
**Status**: 🟢 WIRED & READY  
**Critical Path**: Feature Vectors (58,304) → K-Means/SOM/AE → Chrom97 Packets → Agent Scheduler → OpenSpec Specs

---

## The 4-Layer Stack (Canonical)

### Layer 1: Immutable Event Log (Postgres Truth)
**Purpose**: Append-only event source of truth  
**Canonical Tables**:
- `agent_os_events` — Agent lifecycle events (append-only)
- `gpu_compute_events` — GPU work (clustering, SOM, AE)
- `context_timeline_events` — User signal collection (Engram hotness)
- `atlas_packets` — 58,304 packets (canonical identity)
- **`atlas_feature_vectors`** ✅ NEW — 58,304 materialized features (THIS SESSION)

**What's Here**: All canonical packet identity + extracted features + centrality scores

### Layer 2: Projections & Cached Views (Postgres Derived)
**Purpose**: Deterministic rebuilds from Layer 1  
**Canonical Tables**:
- `packet_features` — GPU-computed features (embeddings, SOM, latent64, scores)
- `task_state_projection` — Rebuilt from agent_os_events
- `engram_recall_projection` — Rebuilt from context_timeline_events
- `gpu_feature_cache` — Pre-computed results (7-14 day TTL)

**What's Needed**: 
- ⏳ Populate `packet_features` from `atlas_feature_vectors` (Layer 2 materialization)
- ⏳ Link GPU compute results (k-means, SOM, AE) to Layer 2

### Layer 3: GPU Cache & Computed Vectors (Redis/Qdrant)
**Purpose**: Fast retrieval, expensive computations cached  
**Canonical Stores**:
- **Qdrant**: `codebase_chunks_768` (40,568 points with payload)
  - Payload will include: `som_cluster`, `community_id`, `keywords`, `semantic_tags`
- **Redis/BitFrost**: `gpu:karpathy:scores` (authority blend), `bitfrost:packet:*` (L1 cache)

**What's Needed**:
- ✅ Payload enrichment with `atlas_feature_vectors` metadata
- ✅ Redis cache warm with extracted features
- ✅ SOM coordinate tagging in Qdrant payload

### Layer 4: Runtime Memory (Valkey/RabbitMQ)
**Purpose**: Volatile, session-scoped state + event bus  
**Canonical Stores**:
- **Valkey**: Session cache, query results, temporary computations
- **RabbitMQ**: Job queue (`agent_scheduler_jobs`), event notifications

**What's Needed**:
- ✅ Agent Scheduler job generation from Layer 2 task_state_projection
- ✅ NATS event emission when GPU jobs complete

---

## The Wiring: Feature Vectors → Layers 1-4

### Stage 1: Feature Vectors Extracted ✅ (DONE THIS SESSION)

```
atlas_packets (58,304 rows)
  + atlas_tree_nodes (8,823 rows hierarchical context)
  + atlas_summary_layers (336 rows enrichment)
  → atlas_feature_vectors (58,304 rows materialized)
```

**Output**: All packets now have:
- `packet_key`, `source_ref`, `directory_path` (identity)
- `feature_id`, `feature_label`, `domain_class` (semantic)
- `keywords`, `semantic_tags`, `ontology_classes` (extracted)
- `pagerank`, `community_id`, `som_cluster`, `som_x/y` (topology)
- `tree_node_id` (hierarchical)

### Stage 2: Layer 2 Materialization (Session 96 — 20 min)

**Task**: Populate Layer 2 `packet_features` from `atlas_feature_vectors`

```sql
-- Copy extracted features into packet_features (Layer 2)
INSERT INTO packet_features (
  packet_key, source_ref, feature_id,
  keywords, semantic_tags, pagerank, community_id, som_cluster,
  embedding_dim, latent_64_dim
)
SELECT
  packet_key, source_ref, feature_id,
  keywords, semantic_tags, pagerank, community_id, som_cluster,
  768, 64  -- dimensions
FROM atlas_feature_vectors
ON CONFLICT (packet_key) DO UPDATE SET
  updated_at = NOW();
```

**Impact**: Layer 2 now has all feature metadata ready for GPU processing

### Stage 3: GPU Clustering & Reduction (Session 96 — 90 min)

**Task**: K-means, SOM 20×20, Autoencoder training

```bash
# K-Means clustering on 58k vectors
npm run clustering:kmeans:parallel --k=25

# SOM training (spatial mapping)
npm run som:train:20x20 --epochs=10

# Autoencoder training (768→64 compression)
npm run ae:train:gemma768-latent64 --validation-split=0.1
```

**Output**: GPU compute results written to Layer 2 `packet_features`:
- `cluster_id` (k-means result)
- `som_x`, `som_y` (SOM grid coordinates)
- `latent_64` (AE compressed vector)
- Upstream to Layer 3 Qdrant payload

### Stage 4: Layer 3 Cache Sync (Session 96 — 15 min)

**Task**: Enrich Qdrant payloads + warm Redis

```bash
# Sync GPU results to Qdrant payload
npm run atlas:payload:sync

# Warm Redis/BitFrost cache
npm run atlas:redis:warm
```

**Impact**: Layer 3 now has enriched vector search + cached features

### Stage 5: Chrom97 Packet Generation (Session 96 — 15 min)

**Task**: Generate agent workflow packets from all 4 layers

```bash
# Materialize chrom97 JSON packets (Layer 1 + Layer 2 + Layer 3 reference)
npm run chrom97:materialize --from-feature-vectors
```

**Output**: Chrom97 packets with:
- Identity (packet_key, source_ref, feature_id)
- Semantic (keywords, tags, ontology)
- Topology (cluster_id, som_x/y, pagerank, community_id)
- GPU metadata (embedding_dim, latent_64_dim)

### Stage 6: Agent Scheduler Wiring (Session 96 — 20 min)

**Task**: Generate Agent Scheduler jobs from Layer 2 task_state_projection

```bash
# Evaluate which jobs are needed based on Layer 2 state
npm run agent:scheduler:evaluate

# Dispatch jobs to workers
npm run agent:scheduler:dispatch
```

**Impact**: Layer 4 (Agent Scheduler) now has job queue populated with:
- K-means results to validate
- SOM topology to expand
- AE latent vectors to test
- Chrom97 packets to ingest

### Stage 7: OpenSpec Init (Session 96 — 20 min)

**Task**: Initialize OpenSpec with evidence from all 4 layers

```bash
cd sveltekit-frontend
openspec init --tools claude --force

# Create proposal citing all 4 layers + feature extraction done
openspec new  # proposal

# Create specs for each layer
openspec new  # layer-1-immutable-event-log (agent_os_events, gpu_compute_events)
openspec new  # layer-2-projections (packet_features, task_state_projection)
openspec new  # layer-3-cache (qdrant-enrichment, redis-warm)
openspec new  # layer-4-agent-scheduler (job-queue, nats-events)
openspec new  # chrom97-packets (materialization)

# Create designs for technical decisions
openspec new  # correlation-id-tracing
openspec new  # feature-vector-consolidation
openspec new  # packet-features-indexing

# Create tasks (execution work)
openspec new  # layer-2-materialization
openspec new  # gpu-clustering-kmeans
openspec new  # som-training-20x20
openspec new  # ae-training-768-64
openspec new  # layer-3-payload-sync
openspec new  # chrom97-materialization
openspec new  # agent-scheduler-wiring
openspec new  # end-to-end-validation
```

---

## What Each Layer Does

| Layer | Storage | Role | Canonical Source |
|-------|---------|------|-----------------|
| **L1** | Postgres (append-only) | Immutable truth | `atlas_packets`, `atlas_feature_vectors`, `agent_os_events` |
| **L2** | Postgres (projections) | Deterministic rebuilds + GPU staging | `packet_features`, `task_state_projection` |
| **L3** | Qdrant + Redis | Fast retrieval + cached computations | Qdrant `codebase_chunks_768` payload, Redis hashes |
| **L4** | Valkey + RabbitMQ | Volatile state + event bus | Agent Scheduler queue, NATS event stream |

---

## Critical Path Dependencies

```
Layer 1 (Feature Vectors ✅)
  ↓
Layer 2 (GPU Staging)
  ├─ K-Means clustering
  ├─ SOM 20×20 training
  └─ AE 768→64 training
  ↓
Layer 3 (Cache Enrichment)
  ├─ Qdrant payload sync
  └─ Redis warm
  ↓
Layer 4 (Agent Wiring)
  ├─ Chrom97 packet generation
  └─ Agent Scheduler job queue
  ↓
OpenSpec Init (Documentation + Planning)
```

**Total Time**: ~3 hours (K-Means 30min + SOM 60min + AE 30min + caching/wiring 60min)

---

## Validation Gates (All Must Pass)

1. **Layer 1**: `SELECT COUNT(*) FROM atlas_feature_vectors` = 58,304 ✅
2. **Layer 2**: `SELECT COUNT(*) FROM packet_features WHERE cluster_id IS NOT NULL` > 0
3. **Layer 3**: `SELECT COUNT(*) FROM qdrant_collections WHERE name='codebase_chunks_768'` = 1
4. **Layer 4**: `SELECT COUNT(*) FROM agent_scheduler_jobs` > 0
5. **OpenSpec**: `openspec validate` passes all specs + designs + tasks

---

## Why This Matters

**Feature extraction (58,304 vectors) is the load-bearing dependency** for:
- GPU clustering (k-means needs feature input vectors)
- Topology mapping (SOM needs spatial coordinates)
- Dimensionality reduction (AE needs high-dim input)
- Chrom97 materialization (needs all metadata)
- Agent Scheduler (needs task definitions + feature vectors)
- OpenSpec (needs evidence + concrete data to propose)

**You have Layer 1 complete.** Layers 2-4 flow from it deterministically. OpenSpec documents the whole stack.

---

## Next Session (96) Execution

```bash
# Verify Layer 1
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM atlas_feature_vectors"

# Stage 1: Layer 2 materialization (20 min)
npm run layer2:materialize:packet-features

# Stage 2: GPU processing (2.5 hrs)
npm run clustering:kmeans && npm run som:train:20x20 && npm run ae:train

# Stage 3: Layer 3 sync (15 min)
npm run atlas:payload:sync && npm run atlas:redis:warm

# Stage 4: Layer 4 wiring (20 min)
npm run chrom97:materialize && npm run agent:scheduler:evaluate

# Stage 5: OpenSpec init (20 min)
cd sveltekit-frontend && openspec init --tools claude --force

# Validation
npm run smoke:graphify && openspec validate
```

**Total**: ~3.5 hours from feature vectors to OpenSpec initialized with all 4 layers wired.
