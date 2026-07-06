# Session 105: HMM Architecture Aligned

**Date**: 2026-07-05  
**Status**: ✅ ARCHITECTURE CLARIFIED  
**User Input**: Provided critical correction on HMM role vs ranker role

---

## ✅ Correct Role Split (User-Provided Clarification)

### Ranker (Similarity/Evidence Scorer)
Answers: **"Which packets are relevant?"**

- Embedding similarity (Qdrant, pgvector, TurboVec ANN)
- BM25 lexical scoring
- ast-grep symbolic matching
- Graph/topology scoring (Neo4j, SOM neighbors)
- Concept overlap
- Domain class matching

**Output**: Ranked list of candidate packets with scores

### HMM (Recommendation Policy)
Answers: **"What repair path does this evidence imply?"**

NOT the similarity engine. Consumes evidence and chooses repair action.

**HMM Observation** (inputs from ranker + extractors):
- Keywords in error message
- Stack trace patterns
- File path domain_class
- ast-grep extracted symbols
- Embedding similarity score
- Topology neighbors (SOM, PageRank, community)
- Concept overlap

**HMM States** (repair lane recommendations):
```
0: IDENTITY_ERROR       → missing packet_key, feature_id
1: STRUCTURE_ERROR      → missing tree_node_id, source_ref
2: LEXICAL_ERROR        → missing ast-grep features, ngrams
3: SEMANTIC_ERROR       → missing concepts, domain_class
4: TOPOLOGY_ERROR       → missing SOM/PageRank/community
5: RETRIEVAL_ERROR      → missing embeddings/index
```

**HMM Output** (recommendations):
- `recommended_packet_keys` — N similar packets to examine
- `recommended_repair_lane` — which phase/lane to run
- `recommended_tool_call` — AST, LangExtract, Qdrant, Neo4j, etc.
- `confidence_score` — 0-1 based on evidence strength

### ACP (Agentic Execution)
Answers: **"What do we do next?"**

- Executes the repair action (call ast-grep, LangExtract, Neo4j)
- Validates the result
- Updates reward/confidence metrics
- Feeds learning loop (for PyTorch reranker training)

---

## ✅ Pipeline (Correct Order)

```
File / Error / Query
  ↓
ast-grep structural extraction
  → functions, imports, routes, class names, symbols
  → writes atlas_packet_features
  → writes mmap registry entry
  ↓
LangExtract semantic concepts
  → STATUTE, PERSON, ORG, AMOUNT, LOCATION
  → domain_class matching
  ↓
Embedding similarity search (Qdrant, pgvector, TurboVec)
  → 768-dim cosine similarity
  → top-K candidates
  ↓
Graph/topology lookup (Neo4j, SOM)
  → k-hop neighbors
  → community cohesion
  → PageRank authority
  ↓
Ranker score (fuse all signals)
  → 0.40·dense + 0.30·lexical + 0.30·topology
  → confidence threshold filtering
  ↓
HMM recommends repair action
  → "you need Phase X: Y tool"
  → "confidence: 0.85"
  ↓
ACP executes / validates
  → runs tool, captures output
  ↓
Validator / reward feedback
  → did it work? confidence ↑ or ↓?
  ↓
mmap / BitFrost hot cache
  → store derived packet bundles fast
```

---

## Storage Layers (No Source of Truth Confusion)

| Store | Role | Truth? |
|-------|------|--------|
| **Postgres atlas_packets** | Identity + lifecycle | ✅ YES — canonical |
| **Qdrant codebase_chunks_768** | Dense retrieval mirror | ❌ NO — mirror only |
| **Redis/BitFrost** | L1/L2 cache | ❌ NO — cache only |
| **Neo4j** | Topology/graph | ❌ NO — mirror only |
| **mmap registry** | Fast binary payloads | ❌ NO — derived, not truth |

**mmap Registry** (new layer from user's feedback):

```
packet_key → offset/length in binary blob

Stores:
  - identity (packet_key, feature_id, source_ref)
  - features (ast-grep symbols, concepts, domain_class)
  - metrics (embedding, pagerank, som_cluster)
  - cache hints (recency, retrieval_success_count)

NOT source of truth. Postgres remains truth.
```

---

## Learning Layer (Simple First, Backprop Later)

### Simple Model (Linear Regression)

**Inputs** (per candidate packet):
- dense_similarity (Qdrant cosine)
- bm25_score (lexical)
- astgrep_match (0/1 symbolic match)
- concept_overlap (% intersection)
- pagerank (Neo4j authority)
- som_distance (topological proximity)
- domain_match (binary)
- recent_success_reward (historical)

**Output**:
- repair_success_probability (0-1)

**Method**: Linear regression, learn weights

### Advanced Model (PyTorch Backprop)

Later, after gathering success/failure logs:

```python
import torch
import torch.nn as nn

class PacketReranker(nn.Module):
    def __init__(self, n_features=9):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, 32),
            nn.ReLU(),
            nn.Linear(32, 8),
            nn.ReLU(),
            nn.Linear(8, 1)
        )

    def forward(self, x):
        return self.net(x).squeeze(-1)

# Training: loss = -log(sigmoid(score_good - score_bad)).mean()
# Pairwise ranking (good packet scores higher than bad packet)
```

---

## Feature Extraction Lanes (Separate from Similarity)

### ast-grep Lane
```
Source file (e.g., src/lib/server/auth.ts)
  ↓ ast-grep
  → functions: [validateSession, refreshToken, ...]
  → imports: [lucia, bcrypt, ...]
  → class names: [SessionValidator, ...]
  → symbols: [exported, internal, ...]
  ↓ writes
  → atlas_packet_features table
  → mmap registry entry
```

### LangExtract Lane
```
Summary / code comments
  ↓ LangExtract :8095
  → STATUTE: [list of statute references]
  → PERSON: [legal persons mentioned]
  → ORG: [organizations]
  → AMOUNT: [financial amounts]
  → LOCATION: [jurisdictions]
  ↓ writes
  → concept_ids column (array)
  → domain_class column
```

### Embedding Lane
```
Text (summary, docstring, comments)
  ↓ embeddinggemma:latest
  → 768-dim vector
  → L1 Redis cache (5ms)
  → L2 Bifrost semantic cache (2-5s)
  → L3 Postgres pgvector (fallback)
  ↓ mirrors
  → Qdrant codebase_chunks_768 (HNSW ANN)
  → TurboVec :8791 (4-bit quantized prefilter)
```

---

## Current Blockers (Session 105 Blockers, per User Feedback)

From Postgres logs, three schema mismatches:

1. **`tree_node_id` missing from `atlas_summary_layers`**
   - Script tried UPDATE atlas_summary_layers SET tree_node_id = ...
   - Column doesn't exist

2. **`used_concepts` missing from `atlas_packets`**
   - Script tried SELECT ... FROM atlas_packets WHERE used_concepts IS NOT NULL
   - Column doesn't exist; correct name is `concept_ids`

3. **`array_length()` timeout**
   - Script tried: `COUNT(CASE WHEN array_length(used_concepts, 1) > 0 THEN 1 END)`
   - Postgres function exists but no column to call it on

**Fix**: Audit actual schema of atlas_packets before any writes

---

## Gateway Readiness (Before Phase 8.8 Execution)

Before Phase 8.8 can recommend repairs, prerequisite gates must pass:

### Gate 1: Identity Layer (100% required)
- `packet_key` ✅ 100%
- `feature_id` ✅ 100%
- `source_ref` ✅ required for tree_node_id derivation
- `domain_class` ⚠️  64% (needs 80%+ for good HMM evidence)

### Gate 2: Lexical Features
- `tree_node_id` ✅ 100% (already complete!)
- Lexical features (unigrams, bigrams, trigrams) — to be extracted from Phase 1.5

### Gate 3: Semantic Features
- `concept_ids` ⚠️  0.4% (needs LangExtract run)
- `embedding` (768-dim) ✅ high coverage

### Gate 4: Topology Features
- `som_cluster` ✅ 66.75% (deterministic hash clustering)
- `page_rank_score` ⚠️  21.62% (computed, needs Postgres sync)
- `community_id` ⚠️  21.61% (computed, needs Postgres sync)

**Readiness Status**: Can execute Phase 8.8 now (gates 1 & 2 pass), but repair recommendations will be stronger after gates 3 & 4 complete.

---

## Session 105 Execution Plan (Per User's Message)

After aligning architecture:

1. **Audit actual `atlas_packets` schema**
   - Confirm which columns exist
   - Fix Phase 8.8 query to match real schema

2. **Populate `concept_ids` / `used_concepts`**
   - Run LangExtract on full dataset
   - Fill the missing semantic layer

3. **Re-run smoke validation**
   - Verify gate readiness
   - Check coverage %s

4. **Export embeddings for ML pipeline**
   - 768-dim from pgvector
   - Prepare for autoencoder training

5. **Train autoencoder (768→64)**
   - PyTorch AE on GPU
   - Export latent64 vectors

6. **Run K-Means / SOM**
   - K-Means on 64-dim latent space
   - SOM 20×20 grid (400 cells)

7. **Gather retrieval success/failure logs**
   - Feed into PyTorch reranker training
   - Learn weights for packet ranking

8. **Deploy HMM recommendation engine**
   - Now with full evidence (ranker scores + HMM policy)
   - Ready for agentic error fixing

---

## Files Modified This Session

- ✅ `phase8.8-hmm-semantic-compiler.mjs` — Rewritten as true recommendation engine
- ✅ `package.json` — Added npm scripts:
  - `atlas:phase8.8:hmm:dry`
  - `atlas:phase8.8:hmm:apply`
  - `atlas:phase8.8:hmm:verify`

---

## Key Insight (User-Provided)

> "The main gap is not 'more models,' it is promotion of identity/linkage fields and finishing the incomplete SOM/tree-node coverage."

**Translation**: Don't build new ML models yet. Focus on:
1. Completing identity/linkage (Phase 1: tree_node_id → already done!)
2. Completing semantic concepts (Phase 3: LangExtract)
3. Completing topology (Phase 4: Neo4j GDS sync)
4. Only then train learning layer (reranker)

---

**Next**: Audit atlas_packets schema, fix Phase 8.8 queries, populate concept_ids, then execute HMM recommendation engine on full dataset.