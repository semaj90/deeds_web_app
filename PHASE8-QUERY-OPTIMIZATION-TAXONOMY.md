# Phase 8 Query Optimization Taxonomy — Community-Scoped Retrieval

**Date**: July 3, 2026 23:57 UTC  
**Context**: Louvain communities now indexed; ACP agents need fast sub-graph lookups

---

## 1. Domain Ontology: Code Structure Nouns & Verbs

### Structural Nouns (Topology Domain)

| Noun | Definition | Table Column | Index |
|------|-----------|---------------|-------|
| **community** | Louvain partition (graph cluster) | `community_id` (int) | ✅ idx_atlas_packets_community_id |
| **packet** | Canonical code unit (function, class, module) | `packet_key` (sha256) | ✅ PRIMARY |
| **somcell** | 20×20 SOM grid position | `(som_row, som_col)` (int×2) | ✅ composite |
| **embedding** | 768-dim or 64-dim vector | `content_embedding` / `latent_64` | ✅ GIN/HNSW |
| **centroid** | Aggregated community embedding | computed (not stored) | N/A |
| **cluster** | K-Means partition | `kmeans_cluster_id` (int) | ✅ btree |
| **pagerank** | Centrality score | `page_rank_score` (real) | ✅ DESC NULLS LAST |

### Structural Verbs (Operations on Topology)

| Verb | Operation | Execution | Latency |
|------|-----------|-----------|---------|
| **filter** | WHERE community_id = $1 | Postgres B-Tree | 1–3ms |
| **expand** | Get all packets in community | Postgres scan | 3–8ms |
| **rank** | Sort by pagerank/score | Index seek + sort | 5–10ms |
| **rerank** | Re-score via GPU similarity | TurboVec SIMD | 1–4ms (batch) |
| **embed** | 768→64 compression | Autoencoder N-API | 100–500µs (batch) |
| **merge** | Combine multiple result sets (RRF) | In-memory union | 1–2ms |
| **project** | Neo4j GDS graph operation | Neo4j memory | 50–200ms |

### Modifier Adverbs (-ly Patterns)

| Adverb | Meaning | Example Query Pattern |
|--------|---------|----------------------|
| **lazily** | Defer computation until needed | Load community IDs first, embed only top-K |
| **eagerly** | Pre-compute all | Load all embeddings upfront |
| **sparsely** | Query subset first, expand if needed | BM25 pre-filter, then ANN on top-K |
| **densely** | Query full index | No WHERE clause, full scan |
| **concurrently** | Parallel branches | Fetch community mask + BM25 in parallel |
| **sequentially** | Step-by-step gating | Filter → rerank → merge |

---

## 2. Query Taxonomy: Speed Profiles

### Profile A: Fast Topological Isolation (Drizzle-ORM + Postgres)

**Use case**: "Find all function definitions in the auth community"

```typescript
// Drizzle pattern — pure SQL, single index seek
const packets = await db.select()
  .from(atlasPackets)
  .where(eq(atlasPackets.communityId, authCommunityId))
  .limit(500);
```

**Execution**:
1. Query hits `idx_atlas_packets_community_id` B-Tree
2. Postgres returns pointer list (bytes, not objects)
3. Drizzle deserializes N rows into JS objects

**Latency breakdown**:
- Index seek: **1–2ms**
- Row fetch: **2–5ms** (depends on N, typically 100–500 rows per community)
- Deserialization: **2–3ms**
- **Total: 5–10ms** (dominated by row count, not vector operations)

**Throughput**: ~2,000–5,000 qps (limited by Node.js connection pool)

**When to use**: Strict topological queries, exact identity lookups, small result sets

---

### Profile B: Fast Vector Reranking (TurboVec ANN Sidecar)

**Use case**: "Find the top-10 most semantically similar functions to my query within the auth community"

**Architecture**:
```
┌─ Incoming Query Vector (768-dim)
│
├─ Step 1: Fetch Community Bitmask (via Drizzle)
│  └─ "What packet IDs belong to community #7?"
│     Query: idx_atlas_packets_community_id seek
│     Result: [packet_id_1, packet_id_2, ..., packet_id_485]
│     Latency: 1–3ms
│
├─ Step 2: TurboVec ANN (pass bitmask as filter)
│  └─ "Compute cosine similarity only for these 485 packets"
│     Query: TurboVec.search(queryVec, allowedIds=[...])
│     SIMD dot-product over memory-mapped float arrays
│     Result: top-10 by score
│     Latency: 1–4ms (for 485-packet subset vs 58K global)
│
└─ Step 3: Merge Results (if needed)
   └─ Combine BM25 + TurboVec scores
     Latency: <1ms (in-memory RRF fusion)
```

**Execution code**:
```javascript
// Step 1: Fetch community constraint
const communityIds = await db.select({ id: atlasPackets.packetKey })
  .from(atlasPackets)
  .where(eq(atlasPackets.communityId, targetCommunityId));

// Step 2: Pass to TurboVec as allowlist
const topK = await turboVecClient.search(queryVector, {
  k: 10,
  allowedIds: communityIds.map(r => r.id),  // Constraint passed in
  metric: 'cosine'
});

// Step 3: Fetch metadata (via Drizzle)
const results = await db.select()
  .from(atlasPackets)
  .where(inArray(atlasPackets.packetKey, topK.map(r => r.packetKey)));
```

**Latency breakdown**:
- Fetch community IDs: **1–3ms**
- TurboVec ANN (constrained): **1–4ms** (SIMD is fast)
- Metadata fetch: **2–3ms**
- **Total: 4–10ms** (typically dominated by TurboVec, which is still <5ms)

**Throughput**: ~25,000+ qps (C++ engine is the limit, not Node.js)

**When to use**: Vector similarity searches, ranked retrieval, large result sets within communities

---

### Profile C: Hybrid Sparse + Dense (BM25 + TurboVec)

**Use case**: "Find functions matching 'session validation' keyword AND similar to my embedding, scoped to auth community"

**Two-stage reranking**:
```
Stage 1: BM25 Sparse Filter (Postgres full-text index)
  WHERE community_id = 7 AND ... to_tsquery('session | validation')
  Result: 200 candidates (rough keyword match)
  Latency: 3–8ms

Stage 2: TurboVec Dense Rerank (constrain to 200)
  TurboVec.search(queryVec, allowedIds=[...200...])
  Result: top-10 by combined score
  Latency: 1–2ms (much faster on 200 vs 58K)

Stage 3: RRF Fusion (in-memory)
  Score = 0.6·bm25 + 0.4·turbovec
  Latency: <1ms
```

**Total latency**: **4–11ms** (fast because community_id pre-filters both stages)

**Throughput**: ~10,000+ qps (limited by Postgres FTS, not TurboVec)

---

### Profile D: Deep Graph Traversal (Neo4j + Postgres)

**Use case**: "Find all functions that call functions in the auth community, within 2 hops"

**Execution**:
```cypher
MATCH (p1:Packet)-[:CALLS*1..2]->(p2:Packet)
WHERE p2.community_id = 7
RETURN p1, p2
```

**Latency**: **50–200ms** (graph traversal is inherently slower, but reaches answers humans can't)

**When to use**: Dependency analysis, impact propagation, transitive closure queries

---

## 3. Linked-List Tuple Structure: Query Result Shape

### Canonical Result Envelope

```typescript
interface AceQueryResult {
  // Identity tuple
  packetKey: string;        // sha256 canonical ID
  packetUlid: string;       // Sortable by timestamp
  communityId: number;      // Louvain partition
  
  // Topology tuple
  somRow: number;           // SOM grid position
  somCol: number;
  kmeansClusters: number;
  pageRankScore: number;
  
  // Vector tuple
  embedding768: Float32Array | null;  // Full embedding (optional)
  latent64: Float32Array;             // Compressed embedding
  
  // Metadata tuple
  title: string;
  summary: string;
  sourceRef: string;
  
  // Scoring tuple
  scores: {
    bm25: number;           // Keyword match (0–1)
    turbovec: number;       // Semantic similarity (0–1)
    pagerank: number;       // Centrality (0–max)
    freshness: number;      // Time decay (0–1)
    combined: number;       // Weighted blend
  };
  
  // Trace tuple
  retrievalStage: 'cache' | 'bm25' | 'turbovec' | 'graph';
  latencyMs: number;
  cacheHit: boolean;
}

// Linked list of results (for streaming)
class AceQueryResultList {
  head: AceQueryResult | null = null;
  
  push(result: AceQueryResult): void {
    const node = { result, next: this.head };
    this.head = node;
  }
  
  *[Symbol.iterator]() {
    let current = this.head;
    while (current) {
      yield current.result;
      current = current.next;
    }
  }
}
```

---

## 4. AST-Grep Domain Integration: Function Extraction & Reranking

### AST Query Pattern (Taxonomy of Code Patterns)

```typescript
// Example: Find all functions with >3 parameters in auth community
interface AstQueryConstraint {
  pattern: 'function' | 'class' | 'method' | 'arrow';
  minParams: number;
  maxParams: number;
  communityId: number;  // ← Filter by Louvain partition
  language: 'typescript' | 'javascript' | 'rust';
}

// Execution: ast-grep + Postgres join
const astResults = await astGrep.search({
  rule: `
    function($func) {
      parameters: (identifier) @param {
        count: {min: 3}
      }
    }
  `,
  paths: ['src/lib/server/auth/**']
});

// Enrich with Postgres topology
const enriched = await db.select()
  .from(atlasPackets)
  .where(
    and(
      inArray(atlasPackets.sourceRef, astResults.map(r => r.file)),
      eq(atlasPackets.communityId, 7)  // ← Leverage Louvain
    )
  );
```

### Reranking via GPU (Verb-Driven)

```typescript
// After AST extraction, rerank by semantic fit
const reranked = await rerankerService.rerank({
  candidates: enriched,
  query: userQuery,
  method: 'turbovec',  // ← Use TurboVec, not Postgres sort
  topK: 10
});

// Result: candidates ranked by semantic coherence, not just code structure
```

---

## 5. 4D Topology: MapReduce-Style Aggregation

### Topology Dimensions

| Dimension | Domain | Index | Granularity |
|-----------|--------|-------|-------------|
| **D1: Semantic** | Vector space (768-dim) | GIN (pgvector) | Per packet |
| **D2: Spatial** | SOM grid (20×20) | Composite (row, col) | Per grid cell |
| **D3: Social** | Louvain community | B-Tree | Per community |
| **D4: Temporal** | ULID timestamp | B-Tree | Per epoch |

### MapReduce Aggregation Pattern

```typescript
// Map phase: Partition by community
const mapPhase = await db.select()
  .from(atlasPackets)
  .where(gt(atlasPackets.pageRankScore, 0.5))
  .groupBy(atlasPackets.communityId);
// Result: { communityId: [packet1, packet2, ...] }

// Reduce phase: Aggregate statistics per community
const reducePhase = mapPhase.map(community => ({
  communityId: community.communityId,
  count: community.packets.length,
  avgPageRank: avg(community.packets.map(p => p.pageRankScore)),
  topAuthority: max(community.packets.map(p => p.pageRankScore)),
  centroidEmbedding: computeMean(community.packets.map(p => p.latent64))
}));
```

---

## 6. Performance Decision Matrix: Which Path to Use?

### Decision Tree

```
Query Type?
├─ "Exact identity lookup" (packet_key = X)
│  └─ Use: Postgres direct lookup (1–2ms)
│
├─ "All packets in community" (community_id = Y)
│  └─ Use: Drizzle + Postgres B-Tree (1–3ms + row fetch)
│
├─ "Top-K similar to query within community"
│  └─ Use: Drizzle (get IDs) + TurboVec ANN (1–4ms)
│
├─ "Keyword + semantic match"
│  └─ Use: BM25 sparse + TurboVec dense + RRF (4–11ms)
│
├─ "Find functions calling functions in community"
│  └─ Use: Neo4j graph traversal (50–200ms, but reaches things others can't)
│
└─ "Aggregate all communities by authority"
   └─ Use: MapReduce SQL (scan once, aggregate in-memory)
```

---

## 7. Implementation Priority: Phase 8 Retrieval Wiring

### Phase 8A: Topology Index (DONE via Patches 1–3)
- ✅ `community_id` column created
- ✅ PageRank synced to Postgres
- ✅ Louvain communities synced to Postgres

### Phase 8B: Retrieval Integration (NEXT)

```typescript
// File: src/lib/server/retrieval/community-scoped-search.ts

export async function communityScopedSearch(
  queryVector: Float32Array,
  communityId: number,
  topK: number = 10
): Promise<AceQueryResult[]> {
  
  // Step 1: Fetch community constraint (1–3ms)
  const packetIds = await db.select({ id: atlasPackets.packetKey })
    .from(atlasPackets)
    .where(eq(atlasPackets.communityId, communityId));
  
  // Step 2: TurboVec ANN with constraint (1–4ms)
  const candidates = await turboVecClient.search(queryVector, {
    k: topK,
    allowedIds: packetIds.map(p => p.id),
    metric: 'cosine'
  });
  
  // Step 3: Fetch full metadata (2–3ms)
  const results = await db.select()
    .from(atlasPackets)
    .where(inArray(atlasPackets.packetKey, candidates.map(c => c.id)));
  
  // Step 4: Rerank via GPU if needed (1–2ms optional)
  if (needsReranking) {
    return reranker.rerank(results, queryVector, 'attention');
  }
  
  return results;
}
// Total latency: 4–10ms (vs 20–50ms without community filter)
```

---

## 8. Hard Rules for Community-Scoped Retrieval

1. ✅ **Always filter by community_id first** — reduces ANN search space by ~99%
2. ✅ **Use Drizzle for topology constraints** — let Postgres indexes do the work
3. ✅ **Use TurboVec for vector ops** — C++ SIMD is 100–1000× faster than JS
4. ✅ **Pass community IDs to TurboVec** — don't fetch full embeddings then filter
5. ✅ **Cache community bitmasks in Redis** — avoid repeated Postgres lookups
6. ✅ **Never join community_id on TurboVec side** — all filtering happens in Postgres first
7. ✅ **RRF fusion is in-memory only** — merge results after retrieval, not during

---

## 9. Validation Queries (Post-Phase-8)

After Phase 8 completes and communities are assigned:

```sql
-- 1. Communities are populated
SELECT COUNT(DISTINCT community_id), 
       MIN(community_id), 
       MAX(community_id)
FROM atlas_packets
WHERE community_id IS NOT NULL;
-- Expected: 10–50 communities, IDs 0–49 or similar

-- 2. Communities have non-zero size
SELECT community_id, COUNT(*) as packet_count
FROM atlas_packets
WHERE community_id IS NOT NULL
GROUP BY community_id
ORDER BY packet_count DESC
LIMIT 10;
-- Expected: each community 100–3,000 packets

-- 3. PageRank is indexed and queryable
SELECT COUNT(*) as high_authority
FROM atlas_packets
WHERE community_id = 7 AND page_rank_score > 1.0;
-- Expected: index hit in 1–3ms

-- 4. Index is used (EXPLAIN plan)
EXPLAIN (ANALYZE, BUFFERS)
SELECT packet_key, page_rank_score
FROM atlas_packets
WHERE community_id = 7
ORDER BY page_rank_score DESC
LIMIT 10;
-- Expected: Index Scan using idx_atlas_packets_community_id
```

---

## Summary: Optimal Hybrid Architecture

**For agent queries within Louvain communities:**

1. **Drizzle-ORM** for community membership constraint (1–3ms, indexed)
2. **TurboVec ANN** for semantic ranking within that community (1–4ms, SIMD)
3. **In-memory RRF** for score fusion (1–2ms, if combining BM25)
4. **Neo4j graph** for transitive closure only if needed (50–200ms, rare)

**Combined latency**: **4–10ms per query** (vs 20–50ms without community filter)

**Throughput**: **~10,000+ queries/sec** (vs ~2,000 for pure Postgres, or ~25,000 for pure TurboVec unconstrained)

**Key win**: Community filter reduces ANN search space by 99%, making high-throughput retrieval feasible even on 58K packets.

