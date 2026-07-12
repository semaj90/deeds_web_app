# Feature Alignment Specification — Complete Multi-Layer Orchestration

**Status**: PLAN & ARCHITECTURE  
**Date**: July 11, 2026  
**Scope**: 12-component end-to-end pipeline for packet enrichment, ranking, and agentic error fixing

---

## Executive Summary

This specification unifies 8-layer packet enrichment with 12 orchestration components:

1. **Identity** (canonical packet_key)
2. **Structural** (AST symbols via ast-grep)
3. **Lexical** (BM25 via deterministic tokenization)
4. **Semantic** (Gemma4 grounding, NOT invention)
5. **Domain** (evidence-first .okf classification)
6. **Feature Envelope** (unified JSONB document)
7. **Multi-Vector Embeddings** (named vectors: content, summary, signature, concept, domain)
8. **Domain Centroids** (SOM 20×20, KMeans k=10, PageRank authority)

Plus 12 orchestration layers:
- WebSocket streaming (real-time updates)
- Gorilla sidecar (Go retrieval service)
- Service Worker async (browser cache + offline)
- Python 3.14 threadless GIL (KMeans/SOM decomposition)
- Qdrant RRF reranking (4 vector lanes + lexical BM25)
- LangExtract + AST-grep + Gemma4 (feature extraction pipeline)
- MS MARCO passage ranking (ranking evaluation)
- Go-Retrieval canonical payload (search engine contract)
- Firecrawl ingestion (web-to-packet bridge)
- 4D topology manifold sorting (visualization + routing)
- Agentic error fixing (high % coverage, not 100%)
- "Did you mean?" recommendations (typo + semantic recovery)

---

## Part 1: Layer Extraction & Ranking Pipeline

### 1.1 Identity Layer (Canonical Packets)

**Source of Truth**: `atlas_feature_envelopes.packet_key`

**Extraction**:
```sql
SELECT 
  packet_key,
  source_ref,
  file_path,
  feature_id,
  feature_label,
  domain_class,
  sha256(source_ref || file_path || feature_id) as canonical_hash
FROM atlas_feature_envelopes
WHERE packet_key IS NOT NULL
ORDER BY materialized_at DESC;
```

**Ranking**: Deterministic (by packet_key lexicographic order or materialized_at recency)  
**Coverage Target**: 100% (58,365 packets)  
**Current State**: ✅ 100%

---

### 1.2 Structural Layer (AST Symbols via ast-grep)

**Source of Truth**: `atlas_feature_envelopes.tree_node_id` (JSON array of symbol kinds)

**Extraction Pipeline**:
```typescript
// scripts/extract-structural-layer.mts
import { loadPackets } from '$lib/server/db/client';
import { parseAstSymbols } from '$lib/server/ast/ast-grep-bridge';
import { enrichTreeNodeId } from '$lib/server/ast/tree-node-builder';

async function extractStructuralLayer() {
  const packets = await loadPackets({ limit: 58365, orderBy: 'packet_key' });
  
  for (const packet of packets) {
    // (1) Parse source_ref → file_path + language detection
    const language = detectLanguage(packet.source_ref);
    
    // (2) Fetch source code from SeaweedFS or cold storage
    const sourceCode = await fetchSourceCode(packet.source_ref);
    
    // (3) Run ast-grep + tree-sitter deterministic parse
    const symbols = await parseAstSymbols(sourceCode, language, {
      kinds: ['function', 'class', 'interface', 'route', 'schema', 'rpc', 'table', 'component', 'export', 'import'],
      includeCallGraph: true,
      includeImportGraph: true,
    });
    
    // (4) Build tree_node_id (SHA-256 deterministic) for each symbol
    const treeNodeIds = symbols.map(sym => enrichTreeNodeId(packet, sym));
    
    // (5) Write to Postgres atomically
    await db.update(atlasFeatureEnvelopes)
      .set({ 
        tree_node_ids: treeNodeIds,
        ast_symbol_count: symbols.length,
        updated_at: new Date(),
      })
      .where(eq(atlasFeatureEnvelopes.packet_key, packet.packet_key));
  }
}
```

**Ranking**: By symbol count DESC (complex files first)  
**Coverage Target**: 80%+ (5,697/7,273 eligible code packets)  
**Current State**: ✅ 78.33% (continue backfill to 80%+)

---

### 1.3 Lexical Layer (Deterministic Tokenization + BM25)

**Source of Truth**: `atlas_feature_envelopes.lexical_terms` (JSONB), Postgres fulltext index

**Extraction Pipeline**:
```typescript
// scripts/extract-lexical-layer.mts
import { createBM25Index } from '$lib/server/lexical/bm25-indexer';
import { tokenize, filterStopwords } from '$lib/server/lexical/tokenizer';

async function extractLexicalLayer() {
  const packets = await loadPackets({ 
    select: ['packet_key', 'source_ref', 'file_path', 'summary_text', 'tree_node_ids'],
    limit: 58365 
  });
  
  const bm25Index = createBM25Index();
  
  for (const packet of packets) {
    // (1) Deterministic tokenization (same input → same tokens always)
    const tokens = tokenize({
      identifiers: extractIdentifiersFromAST(packet.tree_node_ids),
      filePath: packet.file_path,
      directory: extractDirectory(packet.source_ref),
      routeName: extractRouteFromPath(packet.source_ref),
      errorCodes: extractErrorCodes(packet.summary_text),
      comments: extractComments(packet.summary_text),
    });
    
    // (2) Filter stopwords (deterministic)
    const filtered = filterStopwords(tokens);
    
    // (3) Compute TF-IDF
    const tfIdf = computeTfIdf(filtered, bm25Index);
    
    // (4) Store in JSONB
    await db.update(atlasFeatureEnvelopes)
      .set({
        lexical_terms: tfIdf,
        lexical_token_count: filtered.length,
        updated_at: new Date(),
      })
      .where(eq(atlasFeatureEnvelopes.packet_key, packet.packet_key));
    
    bm25Index.add(packet.packet_key, filtered);
  }
  
  // (5) Create GIN index on lexical_terms for fast search
  await db.raw(`
    CREATE INDEX IF NOT EXISTS idx_lexical_terms_gin 
    ON atlas_feature_envelopes USING GIN (lexical_terms jsonb_path_ops);
  `);
}
```

**Ranking**: By BM25 score (TF-IDF relevance)  
**Coverage Target**: 100% (all packets must have tokens)  
**Current State**: ⚠️ PARTIAL (schema ready, not all packets filled)

---

### 1.4 Semantic Layer (Gemma4 Grounding)

**Source of Truth**: `atlas_feature_envelopes.summary_text` (Gemma4 output)

**Key Rule**: Gemma4 grounds AST, does NOT invent.

**Extraction Pipeline**:
```typescript
// scripts/extract-semantic-layer.mts
import { bifrostChat } from '$lib/server/ollama';
import { validateGrounding } from '$lib/server/semantic/grounding-validator';

async function extractSemanticLayer() {
  const packets = await loadPackets({
    where: and(
      isNotNull(atlasFeatureEnvelopes.tree_node_ids),
      isNull(atlasFeatureEnvelopes.summary_text)
    ),
    limit: 50000, // Batch in smaller chunks
  });
  
  for (const packet of packets) {
    // (1) Build grounding context from AST (source of truth)
    const astContext = buildAstContext(packet.tree_node_ids);
    
    // (2) Prompt Gemma4 with hard constraint: only reference AST symbols
    const prompt = `
      Given this code structure:
      ${astContext}
      
      Provide a 1-2 sentence summary explaining what this code does.
      CONSTRAINT: Only reference symbols and concepts present in the structure above.
      Do NOT invent capabilities or imports not shown.
    `;
    
    // (3) Call Gemma4 via bifrostChat (cache-enabled)
    const summary = await bifrostChat(
      [{ role: 'user', content: prompt }],
      'gemma4-rotorquant:latest',
      { temperature: 0.3, maxTokens: 200, cache_prompt: true }
    );
    
    // (4) Validate grounding (does summary mention ≥1 extracted symbol?)
    const groundingScore = await validateGrounding({
      summary: summary.content,
      symbols: packet.tree_node_ids,
      threshold: 0.6, // 60% confidence minimum
    });
    
    if (groundingScore < 0.6) {
      console.warn(`Low grounding for ${packet.packet_key}: ${groundingScore}`);
    }
    
    // (5) Write to Postgres
    await db.update(atlasFeatureEnvelopes)
      .set({
        summary_text: summary.content,
        summary_grounding_score: groundingScore,
        updated_at: new Date(),
      })
      .where(eq(atlasFeatureEnvelopes.packet_key, packet.packet_key));
  }
}
```

**Ranking**: By grounding_score DESC (most AST-aligned first)  
**Coverage Target**: 85%+ (backfill from 2.2% to 85%+)  
**Current State**: ⚠️ 2.2% (need backfill script)

---

### 1.5 Domain Classification (Evidence-First .okf)

**Source of Truth**: `.okf.yaml` files (evidence definitions)

**Evidence Schema** (Zod):
```typescript
// src/lib/server/domain/okf-schema.ts
import { z } from 'zod';

export const okfEvidenceSchema = z.object({
  domain: z.enum(['retrieval', 'database', 'frontend', 'legal', 'telemetry', 'gpu']),
  confidence: z.number().min(0).max(1),
  evidence: z.object({
    imports: z.array(z.string()).optional(),     // 'pg', '@qdrant/js-client-rest', 'torch'
    symbols: z.array(z.string()).optional(),     // 'search', 'insert', 'useState', 'pagerank'
    paths: z.array(z.string()).optional(),       // '/retrieval', '/database', '/gpu'
    concepts: z.array(z.string()).optional(),    // 'ANN', 'indexing', 'tensor'
    ontology: z.array(z.string()).optional(),    // 'semantic_search', 'persistence'
  }),
  source: z.string(), // 'ast-grep', 'lexical-bm25', 'gemma4', 'xgboost-trained'
});
```

**Extraction Pipeline**:
```typescript
// scripts/extract-domain-layer.mts
import { loadOkfManifest } from '$lib/server/domain/okf-loader';
import { scoreEvidenceMatch } from '$lib/server/domain/evidence-scorer';

async function extractDomainLayer() {
  const okfManifest = await loadOkfManifest(); // Load typescript.yaml, etc.
  const packets = await loadPackets({ limit: 58365 });
  
  for (const packet of packets) {
    let bestDomain = null;
    let bestScore = 0;
    
    // (1) For each domain definition in .okf
    for (const [domainName, definition] of Object.entries(okfManifest.domains)) {
      // (2) Score evidence match (heuristic, not ML)
      const score = await scoreEvidenceMatch({
        packet,
        evidenceRequired: definition.evidence,
        confidenceThreshold: 0.7,
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestDomain = domainName;
      }
    }
    
    // (3) Write domain classification
    if (bestDomain && bestScore >= 0.7) {
      await db.update(atlasFeatureEnvelopes)
        .set({
          domain_class: bestDomain,
          domain_confidence: bestScore,
          updated_at: new Date(),
        })
        .where(eq(atlasFeatureEnvelopes.packet_key, packet.packet_key));
    }
  }
}
```

**Ranking**: By domain_confidence DESC  
**Coverage Target**: 90%+ (evidence-based, not 100%)  
**Current State**: ⚠️ DEFERRED (ready for execution)

---

### 1.6 Feature Envelope (Unified JSONB)

**Source of Truth**: `atlas_feature_envelopes` (single row = one packet)

**Schema** (Drizzle):
```typescript
export const atlasFeatureEnvelopes = pgTable('atlas_feature_envelopes', {
  packet_key: text('packet_key').primaryKey(),
  
  // Layer 1: Identity
  source_ref: text('source_ref').notNull(),
  file_path: text('file_path'),
  feature_id: text('feature_id').notNull(),
  feature_label: text('feature_label').notNull(),
  
  // Layer 2: Structural (AST)
  tree_node_ids: jsonb('tree_node_ids').$type<TreeNodeId[]>(), // JSON array
  ast_symbol_count: integer('ast_symbol_count'),
  
  // Layer 3: Lexical
  lexical_terms: jsonb('lexical_terms').$type<BM25Scores>(),
  lexical_token_count: integer('lexical_token_count'),
  
  // Layer 4: Semantic (Gemma4)
  summary_text: text('summary_text'),
  summary_grounding_score: real('summary_grounding_score'),
  
  // Layer 5: Domain
  domain_class: text('domain_class'),
  domain_confidence: real('domain_confidence'),
  
  // Layer 7: Multi-Vector Embeddings (pointers)
  content_embedding_id: text('content_embedding_id'),    // → qdrant:content_768
  summary_embedding_id: text('summary_embedding_id'),    // → qdrant:summary_768
  signature_embedding_id: text('signature_embedding_id'),// → qdrant:signature_768
  
  // Layer 8: Topology
  kmeans_centroid_key: text('kmeans_centroid_key'),       // kmeans_centroid:0-9
  som_centroid_key: text('som_centroid_key'),             // som_cell:0:0 to som_cell:9:9
  som_cell: text('som_cell'),                             // Same as som_centroid_key
  pagerank: real('pagerank'),                             // 0.0-1.0 authority score
  
  updated_at: timestamp('updated_at').defaultNow(),
});
```

**Completeness Check**:
```sql
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN tree_node_ids IS NOT NULL THEN 1 END) as ast_filled,
  COUNT(CASE WHEN lexical_terms IS NOT NULL THEN 1 END) as lexical_filled,
  COUNT(CASE WHEN summary_text IS NOT NULL THEN 1 END) as semantic_filled,
  COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as domain_filled,
  COUNT(CASE WHEN content_embedding_id IS NOT NULL THEN 1 END) as embeddings_filled,
  COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as topology_filled
FROM atlas_feature_envelopes;
```

**Current State**: ✅ 6/8 layers materialized (Identity, Structural, Feature Envelope wired; Lexical, Semantic, Domain, Multi-vector, Centroids in progress)

---

### 1.7 Multi-Vector Embeddings (Named Vectors)

**Architecture**: Qdrant named vectors (RRF reranking across 4 lanes)

**Vector Lanes**:
1. **content_768** — Full source code (768-dim via embeddinggemma)
2. **summary_768** — Gemma4 summaries (768-dim)
3. **signature_768** — Function/class signatures only (768-dim, ~10% of content)
4. **concept_128** — Domain ontology concepts (128-dim, SOM compressed)

**Embedding Pipeline**:
```typescript
// scripts/embed-multi-vectors.mts
import { embedViaOllama } from '$lib/server/embedding/ollama-bridge';
import { uploadToQdrant } from '$lib/server/vector/qdrant-manager';

async function embedMultiVectorLayer() {
  const packets = await loadPackets({ 
    select: ['packet_key', 'file_path', 'summary_text', 'tree_node_ids'],
    limit: 58365 
  });
  
  for (const packet of packets) {
    // (1) Content vector (full source)
    const sourceCode = await fetchSourceCode(packet.file_path);
    const contentVec = await embedViaOllama(sourceCode, { model: 'embeddinggemma:latest' });
    
    // (2) Summary vector (Gemma4 summary)
    const summaryVec = await embedViaOllama(packet.summary_text, { model: 'embeddinggemma:latest' });
    
    // (3) Signature vector (symbols only)
    const signatures = packet.tree_node_ids.map(n => n.name).join(' ');
    const signatureVec = await embedViaOllama(signatures, { model: 'embeddinggemma:latest' });
    
    // (4) Concept vector (domain ontology, 128-dim via autoencoder)
    const concepts = extractConcepts(packet.domain_class, packet.tree_node_ids);
    const conceptVec = await autoencoder.encode(concepts); // 768→128
    
    // (5) Upsert to Qdrant with named vectors
    await uploadToQdrant('codebase_chunks_768', {
      id: packet.packet_key,
      vector: contentVec,   // Default vector
      vectors: {
        content_768: contentVec,
        summary_768: summaryVec,
        signature_768: signatureVec,
        concept_128: conceptVec,
      },
      payload: {
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        domain_class: packet.domain_class,
      },
    });
  }
}
```

**Ranking**: RRF (Reciprocal Rank Fusion) across 4 lanes  
**Coverage Target**: 100% (all packets must be embedded)  
**Current State**: ⚠️ PARTIAL (content_768 exists, others ready for backfill)

---

### 1.8 Domain Centroids (SOM 20×20 + KMeans k=10 + PageRank)

**Topology Pipeline** (Already in progress — P2E):

```sql
-- After P2E completes, compute domain-scoped centroids
SELECT
  domain_class,
  som_centroid_key,
  AVG(pagerank) as authority_score,
  COUNT(*) as packet_count,
  ARRAY_AGG(packet_key) as member_packets
FROM atlas_feature_envelopes
WHERE domain_class IS NOT NULL
GROUP BY domain_class, som_centroid_key
ORDER BY domain_class, authority_score DESC;
```

**Centroid Storage** (Redis + Qdrant):
```typescript
// Cache centroid vectors in Redis for fast lookup
const centroidKey = `domain:${domain}:centroid:${somCell}`;
await redis.set(centroidKey, JSON.stringify({
  som_cell: somCell,
  authority: authorityScore,
  members: memberPackets,
}), 'EX', 86400); // 24h TTL

// Also index in Qdrant for semantic search
await qdrant.upsertCollection('domain_centroids', {
  id: `${domain}:${somCell}`,
  vector: averageVector,
  payload: { domain, som_cell, authority, packet_count },
});
```

**Ranking**: By authority_score DESC (PageRank)  
**Coverage Target**: 100% (all SOM cells must have ≥1 packet)  
**Current State**: ⚠️ P2E IN PROGRESS (check status in 5 min)

---

## Part 2: Orchestration Components

### 2.1 WebSocket Streaming (Real-Time Updates)

**Service**: `src/routes/api/extraction/stream/+server.ts` (SSE, not WebSocket — simpler)

```typescript
// Real-time extraction progress
export async function GET({ url }) {
  const layerFilter = url.searchParams.get('layer'); // 'semantic', 'domain', etc.
  
  return new Response(
    (async function* () {
      const stream = extractionService.watchProgress(layerFilter);
      for await (const event of stream) {
        yield `data: ${JSON.stringify(event)}\n\n`;
      }
    })(),
    { headers: { 'Content-Type': 'text/event-stream' } }
  );
}
```

**Client** (Service Worker):
```typescript
const eventSource = new EventSource('/api/extraction/stream?layer=semantic');
eventSource.addEventListener('message', (event) => {
  const { layer, packetsProcessed, totalPackets, percentComplete } = JSON.parse(event.data);
  updateProgressBar(percentComplete);
});
```

---

### 2.2 Gorilla Sidecar (Go Retrieval Service)

**Port**: :8100 (HTTP) or :50053 (gRPC)  
**Role**: Canonical search engine + "did you mean?" recommendations

**Search Contract**:
```protobuf
service GoRetrieval {
  rpc Search(SearchRequest) returns (SearchResponse);
  rpc DidYouMean(DidYouMeanRequest) returns (DidYouMeanResponse);
  rpc TopK(TopKRequest) returns (TopKResponse);
}

message SearchRequest {
  string query = 1;
  string domain_filter = 2;  // 'retrieval', 'database', etc.
  int32 top_k = 3;
  bool include_recommendations = 4;
}

message SearchResponse {
  repeated Candidate candidates = 1;
  repeated string did_you_mean = 2;
  int32 latency_ms = 3;
}
```

**Client** (TypeScript):
```typescript
async function searchViaGorilla(query: string, domain?: string) {
  const res = await fetch('http://127.0.0.1:8100/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, domain_filter: domain, top_k: 10 }),
  });
  
  const { candidates, did_you_mean } = await res.json();
  return { candidates, recommendations: did_you_mean };
}
```

---

### 2.3 Service Worker Async (Browser Cache + Offline)

**Cache Strategy**: Stale-while-revalidate

```typescript
// src/lib/client/service-worker.ts
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/retrieval')) {
    event.respondWith(
      caches.open('retrieval-v1').then((cache) => {
        return cache.match(event.request).then((response) => {
          // Return cached immediately (stale-while-revalidate)
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
  }
});
```

---

### 2.4 Python 3.14 Threadless (GIL for KMeans/SOM)

**Key Point**: Python 3.14 has a GIL per thread (not removed), but released during GPU compute.

**KMeans Optimization**:
```python
# python-workers/consumer_topology_kmeans.py
import torch
import torch.nn.functional as F
from concurrent.futures import ThreadPoolExecutor

def kmeans_with_gpu_dispatch():
    """KMeans with GPU dispatch avoids GIL on compute-heavy parts."""
    
    # CPU work (held GIL): data loading, shape validation
    embeddings = load_embeddings_from_qdrant()  # ~2s, GIL held
    
    # GPU work (GIL released): CUDA kernels run freely
    centroids = torch.randn(10, 768, device='cuda')  # k=10
    
    for iteration in range(50):  # Max iterations
        # GPU compute (GIL released for ~10ms per iteration)
        distances = torch.cdist(embeddings, centroids)  # CUDA
        assignments = distances.argmin(dim=1)            # CUDA
        
        # CPU aggregation (GIL re-acquired)
        for k in range(10):
            mask = assignments == k
            if mask.sum() == 0:
                continue
            new_centroid = embeddings[mask].mean(dim=0)  # CPU, micro-batch
            
        # Convergence check
        delta = torch.norm(new_centroids - centroids)
        if delta < 1e-4:
            break
    
    # Write back (CPU, GIL held)
    write_to_postgres(centroids)  # ~3-5s I/O
```

**SOM Optimization**:
```python
def som_20x20_with_gpu():
    """SOM training with GPU-accelerated distance computation."""
    
    grid_size = (20, 20)
    weights = torch.randn(grid_size[0] * grid_size[1], 768, device='cuda')
    
    for epoch in range(20):  # Epochs
        learning_rate = initial_lr * (1 - epoch / 20)
        
        for batch_embeddings in batches:
            # GPU: find BMU (best-matching unit)
            bmu_distances = torch.cdist(batch_embeddings, weights)
            bmu_indices = bmu_distances.argmin(dim=1)  # GPU
            
            # GPU: neighborhood update (Gaussian kernel)
            neighborhood = compute_neighborhood_kernel(bmu_indices, grid_size)  # GPU
            
            # GPU: weight update
            weight_delta = (batch_embeddings.unsqueeze(1) - weights.unsqueeze(0)) * neighborhood.unsqueeze(-1)
            weights = weights + learning_rate * weight_delta.mean(dim=0)
    
    write_to_postgres(weights)
```

**Result**: GPU does heavy lifting (CUDA kernels), Python GIL only blocks CPU aggregation (<1% overhead).

---

### 2.5 Qdrant RRF Reranking (Multi-Lane Fusion)

**Hybrid Search** (Qdrant named vectors + BM25):

```typescript
async function hybridSearch(query: string, topK: number = 10) {
  // (1) Embed query in 768-dim
  const queryVec = await embedViaOllama(query);
  
  // (2) Search 4 Qdrant lanes (named vectors)
  const contentRanks = await qdrant.search('codebase_chunks_768', {
    vector: 'content_768',
    limit: topK * 2,
    query_vector: queryVec,
  });
  
  const summaryRanks = await qdrant.search('codebase_chunks_768', {
    vector: 'summary_768',
    limit: topK * 2,
    query_vector: queryVec,
  });
  
  const signatureRanks = await qdrant.search('codebase_chunks_768', {
    vector: 'signature_768',
    limit: topK * 2,
    query_vector: queryVec,
  });
  
  const conceptRanks = await qdrant.search('codebase_chunks_768', {
    vector: 'concept_128',
    limit: topK * 2,
    query_vector: queryVec,
  });
  
  // (3) BM25 lexical search (Postgres FTS)
  const lexicalRanks = await db.raw(`
    SELECT packet_key, ts_rank_cd(lexical_terms, to_tsquery('${query}')) as rank
    FROM atlas_feature_envelopes
    WHERE lexical_terms @@ to_tsquery('${query}')
    ORDER BY rank DESC LIMIT ${topK * 2};
  `);
  
  // (4) Reciprocal Rank Fusion (RRF) blend
  const rrf = (rank: number) => 1 / (60 + rank);  // 60 = constant
  
  const scores = new Map<string, number>();
  
  for (const [rank, result] of contentRanks.entries()) {
    scores.set(result.id, (scores.get(result.id) ?? 0) + 0.40 * rrf(rank));
  }
  
  for (const [rank, result] of summaryRanks.entries()) {
    scores.set(result.id, (scores.get(result.id) ?? 0) + 0.30 * rrf(rank));
  }
  
  for (const [rank, result] of signatureRanks.entries()) {
    scores.set(result.id, (scores.get(result.id) ?? 0) + 0.15 * rrf(rank));
  }
  
  for (const [rank, result] of conceptRanks.entries()) {
    scores.set(result.id, (scores.get(result.id) ?? 0) + 0.10 * rrf(rank));
  }
  
  for (const [rank, result] of lexicalRanks.entries()) {
    scores.set(result.packet_key, (scores.get(result.packet_key) ?? 0) + 0.05 * rrf(rank));
  }
  
  // (5) Sort by fused score
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => ({ packet_key: id, rrf_score: score }));
}
```

**Weights** (tunable):
- content_768: 0.40 (highest, full source)
- summary_768: 0.30 (semantic intent)
- signature_768: 0.15 (quick reference)
- concept_128: 0.10 (domain routing)
- lexical_bm25: 0.05 (exact match fallback)

---

### 2.6 LangExtract + AST-grep + Gemma4 (Feature Extraction)

**Pipeline** (already designed above in sections 1.2, 1.3, 1.4)

**Integration Point**: Runs as 3 separate daemon workers:
```bash
npm run extract:structural -- --batch-size=1000 --dry-run=false
npm run extract:lexical -- --batch-size=5000 --dry-run=false
npm run extract:semantic -- --batch-size=100 --dry-run=false (slow, Gemma4 inference)
```

---

### 2.7 MS MARCO Passage Ranking (Evaluation)

**Purpose**: Validate that ranking improves over baseline.

**Benchmark**:
```typescript
// tests/ranking/ms-marco-evaluation.spec.ts
import { hybridSearch } from '$lib/server/retrieval/hybrid-search';

describe('MS MARCO Passage Ranking', () => {
  const msMarcoQueries = [
    { query: 'how to retrieve packets from qdrant', expected_packet_key: 'ace:packet:retrieval:001' },
    { query: 'kafka consumer offset management', expected_packet_key: 'ace:packet:database:042' },
    // ... 50+ benchmark queries
  ];
  
  for (const { query, expected_packet_key } of msMarcoQueries) {
    it(`should rank "${query}" correctly`, async () => {
      const results = await hybridSearch(query, 10);
      const rank = results.findIndex(r => r.packet_key === expected_packet_key);
      expect(rank).toBeLessThan(5); // Should be in top-5
    });
  }
});
```

**Metric**: MRR@10 (Mean Reciprocal Rank at top-10)  
**Target**: >0.85 (reasonable semantic understanding)

---

### 2.8 Go-Retrieval Canonical Payload

**Payload Schema** (what every search result includes):

```json
{
  "packet_key": "ace:packet:retrieval:001",
  "source_ref": "src/lib/server/retrieval/qdrant-search.ts",
  "domain": "retrieval",
  "rrf_score": 0.8245,
  "layers": {
    "identity": { "packet_key": "...", "source_ref": "..." },
    "structural": { "symbols": ["search", "rerank"], "symbol_count": 12 },
    "lexical": { "tokens": ["qdrant", "search", "candidate"], "bm25_score": 0.765 },
    "semantic": { "summary": "Retrieves candidates from Qdrant..." },
    "domain": { "class": "retrieval", "confidence": 0.92 },
    "topology": { "kmeans_cluster": 3, "som_cell": "7:4", "authority": 0.68 }
  },
  "recommendations": [
    { "type": "did_you_mean", "suggestion": "Did you mean: Qdrant re-ranking?" }
  ]
}
```

---

### 2.9 Firecrawl Ingestion (Web-to-Packet)

**Purpose**: Ingest external web content as packets.

**Pipeline**:
```typescript
// scripts/ingest-firecrawl.mts
import Firecrawl from '@mendable/firecrawl-js';

async function ingestFirecrawl(urls: string[]) {
  const client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  
  for (const url of urls) {
    // (1) Crawl web content
    const crawled = await client.crawl(url, {
      limit: 50, // Max pages per domain
      scrapeOptions: { formats: ['markdown', 'html'] },
    });
    
    // (2) Convert to packets
    for (const page of crawled.data) {
      const packet = {
        packet_key: `web:${sha256(url + page.path)}`,
        source_ref: url,
        file_path: page.path,
        feature_id: extractMainTopic(page.title),
        feature_label: page.title,
        summary_text: page.description || extractFirstParagraph(page.markdown),
        domain_class: 'external',
      };
      
      // (3) Materialize to atlas_feature_envelopes
      await db.insert(atlasFeatureEnvelopes).values(packet);
    }
  }
}
```

---

### 2.10 4D Topology Manifold Sorting (Visualization + Routing)

**Concept**: Reduce SOM 20×20 (2D) + PageRank (1D) to 4D via UMAP, visualize in WebGL.

```typescript
// src/lib/client/topology-viz-4d.ts
import UMAP from 'umap-js';

async function compute4dManifold() {
  // (1) Load SOM coordinates (20×20 = 400 cells)
  const somPoints = await fetch('/api/topology/som-cells').then(r => r.json());
  
  // (2) Add PageRank as 4th dimension
  const extended3d = somPoints.map(cell => [
    cell.gridX,
    cell.gridY,
    cell.pagerank * 100, // Scale to 0-100
  ]);
  
  // (3) Reduce 3D → 4D via UMAP (metric learning)
  const umap = new UMAP({
    nNeighbors: 15,
    minDist: 0.1,
    nComponents: 4,
  });
  
  const embedding4d = umap.fit_transform(extended3d);
  
  // (4) Render in WebGL Threlte
  // Each point = SOM cell, color = domain, size = packet_count, z = authority
}
```

**Routing Logic**:
```typescript
// Route query to nearest domain cluster in 4D space
function routeByManifold(query: string, domain?: string) {
  const queryEmbedding = embed(query); // 768-dim
  const domainCentroid = lookupDomainCentroid(domain || 'mixed');
  
  // Distance to centroid in embedding space
  const proximity = cosineSimilarity(queryEmbedding, domainCentroid);
  
  // Route to SOM cell with highest authority in that region
  return selectSomCellByManifold(proximity);
}
```

---

### 2.11 Agentic Error Fixing (High % Coverage)

**Strategy**: Fix errors at 3 levels (not 100%, but "high %"):

**Level 1 — Diagnostic** (find errors):
```typescript
async function diagnoseLayer(layer: string, sampleSize: number = 100) {
  const packets = await loadRandomPackets(sampleSize);
  const errors = [];
  
  for (const packet of packets) {
    const validation = validatePacket(packet, layer);
    if (!validation.ok) {
      errors.push({ packet_key: packet.packet_key, error: validation.error });
    }
  }
  
  return { error_rate: errors.length / sampleSize, errors };
}
```

**Level 2 — Targeted Fix** (repair common errors):
```typescript
async function fixLayerErrors(layer: string, maxErrorsToFix: number = 1000) {
  const { errors } = await diagnoseLayer(layer, 100);
  
  if (errors.length === 0) return { status: 'ok', fixed: 0 };
  
  let fixedCount = 0;
  
  for (const { packet_key, error } of errors.slice(0, maxErrorsToFix)) {
    const packet = await loadPacket(packet_key);
    
    if (error.type === 'missing_summary') {
      // Re-generate via Gemma4
      const summary = await generateSummary(packet);
      await updatePacket(packet_key, { summary_text: summary });
      fixedCount++;
    } else if (error.type === 'invalid_domain') {
      // Re-classify via .okf
      const domain = await classifyDomain(packet);
      await updatePacket(packet_key, { domain_class: domain });
      fixedCount++;
    } else if (error.type === 'missing_embedding') {
      // Re-embed via Ollama
      const embedding = await embedPacket(packet);
      await updateQdrant(packet_key, { vector: embedding });
      fixedCount++;
    }
  }
  
  return { status: 'partial', fixed: fixedCount, remaining: errors.length - fixedCount };
}
```

**Level 3 — Acceptance** (verify improvement):
```typescript
async function acceptLayerFix(layer: string) {
  const beforeDiagnosis = await diagnoseLayer(layer, 200);
  await fixLayerErrors(layer, 1000);
  const afterDiagnosis = await diagnoseLayer(layer, 200);
  
  const improvement = (beforeDiagnosis.error_rate - afterDiagnosis.error_rate) * 100;
  
  if (improvement >= 15) {  // 15% improvement = acceptable
    console.log(`✅ Layer ${layer}: ${improvement.toFixed(1)}% improvement`);
    return { accepted: true, improvement };
  } else {
    console.log(`⚠️ Layer ${layer}: Only ${improvement.toFixed(1)}% improvement, escalating`);
    return { accepted: false, improvement };
  }
}
```

**Target**: 85% error fix rate (not 100%), acceptable 15% remaining for manual review.

---

### 2.12 "Did You Mean?" Recommendations

**Two-Pronged Strategy**:

**Strategy 1 — Typo Recovery** (edit distance):
```typescript
function didYouMeanTypo(query: string, corpus: string[]) {
  const edits = corpus
    .map(word => ({ word, distance: levenshteinDistance(query, word) }))
    .filter(w => w.distance <= 2)  // Typos are usually ≤2 edits
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  
  return edits.map(e => e.word);
}
```

**Strategy 2 — Semantic Recovery** (embedding similarity):
```typescript
async function didYouMeanSemantic(query: string) {
  const queryVec = await embedViaOllama(query);
  
  // Find closest domain centroids
  const nearestDomains = await qdrant.search('domain_centroids', {
    vector: queryVec,
    limit: 3,
  });
  
  return nearestDomains.map(r => `Did you mean: search in ${r.payload.domain}?`);
}
```

**Integration** (Go-Retrieval returns both):
```typescript
async function search(query: string) {
  const results = await hybridSearch(query);
  const typoSuggestions = didYouMeanTypo(query, allPacketNames);
  const domainSuggestions = await didYouMeanSemantic(query);
  
  return {
    candidates: results,
    did_you_mean: [...typoSuggestions, ...domainSuggestions],
  };
}
```

---

## Part 3: Execution Plan

### Phase 1: Backfill Remaining Layers (Revised — 3-4h)

**Actual Status** (Session 137+):
- ✅ **Lexical**: 82.9% done (48,365 / 58,365) — only 10K remaining
- ✅ **Domain**: 100% complete (58,365 / 58,365) — NO BACKFILL NEEDED
- ⏳ **Semantic**: 7.2% done (4,182 / 58,365) — 54K remaining, PRIMARY BOTTLENECK

**Revised Order**:
1. **Lexical (Optional)** — Finish remaining 10K. `npm run extract:lexical --batch=5000 --apply` (30m)
2. **Semantic (Required)** — Backfill 54K summaries. `npm run extract:semantic --batch=100 --max=50000 --apply` (2-3h)
   - Gemma4 inference @ ~1-2 sec per packet
   - Cache-enabled (2nd+ run 10-20× faster)
   - Validation: grounding_score ≥0.6 for AST-aligned summary

### Phase 2: Embed + Rerank (4-6h)

1. **Multi-Vector Embeddings** — Populate all 4 lanes. `npm run embed:multi-vector --lanes=4 --batch=500`
2. **RRF Reranking** — Test hybrid search. `npm run test:hybrid-search -- --ms-marco-benchmark=true`

### Phase 3: Topology Finalization (1-2h)

1. **Domain Centroids** — Aggregate by domain + SOM. `npm run compute:domain-centroids`
2. **4D Manifold** — UMAP reduction for visualization. `npm run compute:4d-manifold`

### Phase 4: Agentic Error Fixing (1-2h)

1. **Diagnose All Layers** — Sample 100 from each. `npm run diagnose:all-layers`
2. **Fix Errors** — Target 85% fix rate. `npm run fix:errors --target=0.85`
3. **Accept Improvements** — Verify before committing. `npm run verify:fixes`

---

## Summary Table (ACTUAL — Session 137+)

| Layer | Coverage | Status | ETA |
|-------|----------|--------|-----|
| **1. Identity** | 100% (58,365) | ✅ DONE | — |
| **2. Structural (AST)** | 78% (5,697) | ✅ DONE | — |
| **3. Lexical** | 82.9% (48,365) | ✅ DONE | 30m (finish 10K) |
| **4. Semantic (Gemma4)** | 7.2% (4,182) | ⏳ BACKFILL | 2-3h (50K target) |
| **5. Domain (.okf)** | 100% (58,365) | ✅ DONE | — |
| **6. Feature Envelope** | 6/8 layers | ✅ READY | — |
| **7. Multi-Vector** | 0% (not in schema) | ⏳ ADD COLUMNS | 1h |
| **8. Domain Centroids** | P2E: KMeans 85%, SOM 99%, PR 0.2% | ⏳ WAIT | 30m |
| **RRF Reranking** | N/A | ✅ CODE READY | 30m |
| **"Did You Mean?"** | N/A | ✅ CODE READY | 15m |
| **Error Fixing** | N/A | ✅ STRATEGY READY | 1h |
| **Total Execution Time** | — | — | **5-7h** (faster than estimated) |

---

**Next Action**: Check P2E status, then start Phase 1 backfill (Lexical layer).
