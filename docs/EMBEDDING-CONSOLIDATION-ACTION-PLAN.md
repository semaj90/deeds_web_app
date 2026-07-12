# Embedding Pipeline Consolidation Action Plan

**Status**: POST-GATE-2, PRE-GATE-3  
**Date**: July 11, 2026 (Session 137+)  
**Blocking**: Gate 3 (Neo4j PageRank) can proceed in parallel with consolidation

---

## Executive Summary

Embedding pipeline is **functionally complete** but **fragmented** (12+ duplicate clients, 6 stale 768-dim collections, 2 cache implementations). Gate 1 (vectorName contract) is correctly designed but incompletely deployed.

**Impact**: Consolidation unblocks Phase 9 multi-vector migration and improves queryability by removing dual-system burden.

**Effort**: ~2-3 days (Tier 1), 1 week (Tier 2), ongoing (Tier 3+)

---

## Consolidation Board (Kanban)

### TIER 1: CRITICAL (Blocks Phase 9)

| Task | Priority | Files | Est. Hours | Owner | Status |
|------|----------|-------|-----------|-------|--------|
| **T1-1: Converge Embedding Clients** | P0 | `src/lib/server/retrieval/index.ts`, `sveltekit-frontend/src/lib/server/grpc/embedding-client.ts` | 4 | Dev | 📋 TODO |
| **T1-2: Qdrant Singleton Pooling** | P0 | 48 files (5/48 done: singleton module + 4 pilot routes) | 3 | Dev | 🟢 WIRED (50% pilot) |
| **T1-3: Enforce vectorName Propagation** | P0 | 15+ retrieval call-sites (grep `_denseSearch`, `hybridSearch`) | 6 | Dev | ⏳ BLOCKED (awaits T1-2) |
| **T1-4: Audit Gate 1 Compliance** | P0 | All callers of `_denseSearch()` | 2 | QA | ⏳ BLOCKED (awaits T1-3) |

**Total Tier 1**: 15h dev + 2h QA

---

### TIER 2: HIGH (Phase 9 Prerequisites)

| Task | Priority | Files | Est. Hours | Owner | Status |
|------|----------|-------|-----------|-------|--------|
| **T2-1: Collection → Named-Vector Migration Plan** | P1 | `vector-config.ts`, `drizzle/0101_gate2.sql`, `drizzle/*` | 4 | Architect | 📋 TODO |
| **T2-2: Consolidate Redis Clients** | P1 | `valkey.ts`, `cache/valkey-client*.ts`, `llm-cache.ts` | 3 | Dev | 📋 TODO |
| **T2-3: Unified Entity Extraction Layer** | P1 | `entity-extraction.ts`, `qdrant-payload-enricher.ts`, `domain-classifier.ts` | 8 | Dev | 📋 TODO |
| **T2-4: Cache Key Versioning** | P1 | `cache-keys.ts`, `redis-exact-match.ts`, `bifrost-cache-manager.ts` | 6 | Dev | 📋 TODO |
| **T2-5: Archive Stale Code** | P2 | `embedding-cache-v1.ts`, `ace-materializer-v1.ts`, old phase layers | 2 | DevOps | 📋 TODO |

**Total Tier 2**: 23h dev + 4h arch

---

### TIER 3: MEDIUM (Operational Excellence)

| Task | Priority | Files | Est. Hours | Owner | Status |
|------|----------|-------|-----------|-------|--------|
| **T3-1: GPU Reranking** | P2 | `qdrant-manager.ts`, native `cosineDistance` | 5 | GPU Team | 🔄 RESEARCH |
| **T3-2: Summary Embedding Schema Finalization** | P2 | `drizzle/*`, `codebase_chunk_index` | 3 | Dev | 📋 TODO |
| **T3-3: Phase 7 Worker Type Safety** | P2 | `phase101-summary-cache.ts`, RabbitMQ queue | 4 | Dev | 📋 TODO |
| **T3-4: Bifrost LLM Cache Formalization** | P2 | `bifrost-cache-manager.ts`, key scheme docs | 3 | Dev | 📋 TODO |

**Total Tier 3**: 15h dev

---

## Task Specifications

### T1-1: Converge Embedding Clients

**Problem**: Two independent embedding subsystems:
- `src/lib/server/retrieval/index.ts` — Direct Ollama HTTP (legacy)
- `sveltekit-frontend/src/lib/server/grpc/embedding-client.ts` — 4-tier (gRPC→HTTP, canonical)

**Solution**: Route `src/` onto sveltekit-frontend gRPC stack.

**Steps**:
1. Create bridge in `src/lib/server/embedding/embedding-bridge.ts`:
   ```typescript
   export async function embedTextViaSvelteKit(text: string): Promise<number[]> {
     const response = await fetch('http://localhost:5173/api/embed', {
       method: 'POST',
       body: JSON.stringify({ text }),
       headers: { 'Content-Type': 'application/json' }
     });
     return response.json();
   }
   ```
2. Replace `src/lib/server/retrieval/index.ts` embedding calls with bridge
3. Verify type compatibility (768-dim output)
4. Remove `src/lib/server/embedding/ollama-embed.ts` (delegated to sveltekit-frontend)
5. Test: Run `npm run test:embedding:convergence`

**Verification**: All embedding calls in src/ route through sveltekit-frontend /api/embed

---

### T1-2: Qdrant Singleton Pooling

**Problem**: New `QdrantManager()` per request instead of reusing connection pool.

**Current Broken Pattern** (routes/api/atlas/studio/**/+server.ts):
```typescript
export async function GET() {
  const qdrant = new QdrantManager(); // ❌ New client per request
  return qdrant.search(...);
}
```

**Correct Pattern** (vector/qdrant-manager.ts):
```typescript
export const qdrant = new QdrantManager(); // ✅ Singleton
// Reuse: qdrant.search(...) everywhere
```

**Steps**:
1. Audit all Qdrant instantiations:
   ```bash
   grep -r "new QdrantManager" src/ sveltekit-frontend/src/
   ```
2. Create `vector/qdrant-singleton.ts`:
   ```typescript
   export const qdrantClient = new QdrantManager();
   ```
3. Replace all `new QdrantManager()` with import + singleton
4. Add connection pooling config (max 5 concurrent HTTP clients)
5. Test: Monitor connection pool via `/api/health` metrics

**Verification**: `npm run test:qdrant:pool` confirms single pooled client

---

### T1-3: Enforce vectorName Propagation

**Problem**: Many callers still assume 768-dim default without specifying `vectorName`.

**Audit Checklist**:
```bash
# Find all _denseSearch calls
grep -r "_denseSearch" src/ sveltekit-frontend/src/ | grep -v "vectorName" | wc -l
# Should be 0 after consolidation
```

**Callsites to Fix** (15+):
1. `src/lib/server/retrieval/index.ts:searchCodebase()`
2. `src/lib/server/retrieval/index.ts:searchLegalDocs()`
3. `sveltekit-frontend/src/routes/api/search/+server.ts`
4. `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` (4 sites)
5. `sveltekit-frontend/src/lib/server/features/rag/multi-lane-retrieval.ts`
6. `sveltekit-frontend/src/routes/api/whisper/transcribe/+server.ts`
7. `sveltekit-frontend/src/lib/server/analytics/minified-research-cache.ts`
8. (Add 5+ more from audit results)

**For Each Callsite**:
1. Determine semantic intent: search for code chunks? summaries? topology?
2. Assign vectorName:
   - Code chunks → `semantic_embedding` (384-dim)
   - Summaries → `semantic_embedding` (384-dim, reuse)
   - Topology → `topology_embedding` (128-dim, Phase 9)
   - Routing → `latent_embedding` (64-dim, Phase 9)
3. Update call: `{ query, queryVector, vectorName: 'semantic_embedding' }`
4. Test: Run callsite test, verify correct dimension validation

**Verification**: `npm run audit:gate1:compliance` reports 0 violations

---

### T1-4: Audit Gate 1 Compliance

**Script**: `scripts/atlas/audit-gate1-compliance.mjs`

```bash
npm run audit:gate1:compliance
```

**Output**:
```
✅ Gate 1 Audit Results
├─ Total _denseSearch calls: 47
├─ With vectorName specified: 47 ✅
├─ Without vectorName: 0 ✅
├─ Default vectorName override: 0 ✅
└─ Status: COMPLIANT ✅
```

**Failure Criteria** (must fix):
- Any call without vectorName parameter
- Any hardcoded dimension assumption (768 in retrieval code)

---

## T2-1: Collection → Named-Vector Migration Plan

**Current State** (dual-system):
```sql
-- OLD: 768-dim only, unnamed vector
SELECT * FROM codebase_chunks_768
WHERE content -> 'embedding' @> '768';

-- NEW: Multiple named vectors (Phase 9)
SELECT * FROM codebase_chunks_named
WHERE vectors -> 'semantic_embedding' IS NOT NULL;
```

**Plan**:
1. **Phase 8.6** (NOW): Keep codebase_chunks_768 (legacy)
2. **Phase 9** (Migrate):
   - Create `codebase_chunks_named` with 3 vectors:
     - `semantic_embedding` (384-dim, from embeddinggemma truncated)
     - `topology_embedding` (128-dim, deterministic from semantic)
     - `latent_embedding` (64-dim, optional, from autoencoder)
   - Migrate chunks: Recompute vectors for 40K+ chunks
   - Switch Qdrant search to use `semantic_embedding` named vector
   - Keep `codebase_chunks_768` as fallback (Phase 9.1+)

**Migration SQL** (Phase 9 task):
```sql
CREATE TABLE codebase_chunks_named AS
SELECT
  id, qdrant_id, relative_path, ..., content,
  JSONB_BUILD_OBJECT(
    'semantic_embedding', array_to_vector(content_embedding),  -- 384-dim
    'topology_embedding', compute_topology_embedding(...),     -- 128-dim
    'latent_embedding', ae_encode(content_embedding)           -- 64-dim
  ) as vectors
FROM codebase_chunk_index
WHERE content_embedding IS NOT NULL;
```

**Qdrant Schema** (Phase 9 config):
```yaml
collections:
  codebase_chunks_named:
    vectors:
      semantic_embedding:
        size: 384
        distance: Cosine
      topology_embedding:
        size: 128
        distance: Cosine
      latent_embedding:
        size: 64
        distance: Cosine
```

---

## T2-2: Consolidate Redis Clients

**Problem**: 4 independent Redis client instances:

| File | Lines | Init Pattern | Status |
|------|-------|--------------|--------|
| `valkey.ts` | 50 | Singleton ✓ | Keep |
| `cache/valkey-client.ts` | 30 | Re-exported | Remove |
| `cache/valkey-client-corrected.ts` | 35 | Duplicate | Remove |
| `llm-cache.ts` | 40 | Embedded init ⚠️ | Consolidate |

**Action**:
1. Keep `valkey.ts` as canonical singleton
2. Audit imports across codebase:
   ```bash
   grep -r "from.*valkey" src/ sveltekit-frontend/src/ | sort | uniq -c
   ```
3. Redirect all `cache/valkey-client*` imports → `valkey.ts`
4. Update `llm-cache.ts` to import singleton instead of creating new client
5. Test: Monitor connection pool in Redis CLI:
   ```bash
   redis-cli CLIENT LIST | wc -l  # Should be constant
   ```

---

## T2-3: Unified Entity Extraction Layer

**Components**:
- `entity-extraction.ts` — LLM-based NER (Gemma4)
- `domain-classifier.ts` — Keyword-based domain detection
- `qdrant-payload-enricher.ts` — Post-embed tagging

**Unified Layer Design**:
```typescript
// src/lib/server/extraction/unified-extractor.ts
export async function extractEntitiesAndDomain(text: string) {
  return {
    entities: await llmExtractEntities(text),    // Gemma4 NER
    domain: await classifyDomain(text),          // Keyword → domain
    tags: deriveSemanticTags(entities, domain),  // Qdrant tags
    confidence: computeConfidence(...)           // 0.0-1.0
  };
}

// Redis cache key
const cacheKey = `extraction:${hash(text)}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

**Wiring**:
- Add call in Qdrant payload enricher
- Cache results in Redis (1-day TTL)
- Reuse in ACE context assembly

---

## T2-4: Cache Key Versioning

**Problem**: No versioning → collision risk when cache schema changes.

**Solution**: Add version field to cache keys:

```typescript
// Before (collision risk)
const key = `semantic:${hash(query)}`;

// After (versioned)
const CACHE_VERSION = '2'; // Increment on schema change
const key = `semantic:v${CACHE_VERSION}:${hash(query)}`;
```

**Files to Refactor**:
1. `cache-keys.ts` — Central CacheKeyBuilder
2. `redis-exact-match.ts` — Query hash cache
3. `bifrost-cache-manager.ts` — LLM output cache
4. `embedding-cache.ts` — Embedding cache

**Implementation**:
```typescript
export class CacheKeyBuilder {
  static exactQuery(text: string, model: string) {
    return `exact:v1:${model}:${hash(text)}`;
  }
  static semanticCache(embedding: number[]) {
    return `semantic:v1:${hash(embedding)}`;
  }
  static entityCache(text: string) {
    return `extract:v1:${hash(text)}`;
  }
}
```

---

## T2-5: Archive Stale Code

**Files to Archive**:
1. `embedding-cache-v1.ts` → move to `deeds_labs/archive/embedding-cache-v1.ts`
2. `ace-materializer-v1.ts` → move to deeds_labs
3. Phase 6 summary layer → move to deeds_labs
4. Old Bifrost test files → move to deeds_labs

**Process**:
```bash
git add <files>
git commit -m "chore: archive stale embedding v1 code to deeds_labs"
git tag archive/embedding-consolidation/<YYYYMMDD>
```

---

## Daily Graphify Integration

**Add to `npm run graphify:daily`:**
```bash
# After semantic indexing
npm run atlas:audit:gate1:compliance --verbose
npm run atlas:audit:embedding:clients --dry
npm run atlas:consolidation:report
```

**Report Output** (Grafana dashboard):
- Embedding client count (should trend to 1)
- Qdrant pool size (should be stable 5)
- Cache key versions (should be latest)
- Consolidation coverage % (should trend to 100%)

---

## Success Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| **Gate 1 Compliance** | 0 vectorName violations | 0 |
| **Client Consolidation** | Qdrant clients active | 1 |
| **Cache Consolidation** | Redis clients | 1 |
| **Collection Migration** | Collections using names | 100% Phase 9 |
| **Entity Extraction** | Unified layer usage | 90%+ |
| **Cache Versioning** | Keys with version | 100% |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking existing retrieval | Run full test suite (npm run test:retrieval) before merge |
| Connection pool exhaustion | Monitor `qdrant.pool.size` in health endpoint |
| Cache collision during transition | Increment CACHE_VERSION before deploy |
| Data loss during archival | git tag + verify deeds_labs before rm |

---

## Related Documentation

- `PHASE-8-6-CRITICAL-IMPLEMENTATION-ORDER.md` — Gate roadmap (Gate 1-8)
- `VECTOR-DIMENSION-CANONICAL-REFERENCE.md` — Dimension policy
- `PHASE-8-6-GATE-2-AUTOENCODER-PROVENANCE-COMPLETE.md` — Encoder validation
- `docs/architecture/retrieval-layer-separation.md` — Retrieval contract
- `memory/hypergraph-4-lanes-vault.md` — Phase 9 multi-vector design

---

**Status**: Ready for Tier 1 execution  
**Next**: Assign tasks to dev team, schedule 3-day sprint (Tier 1 only)  
**Gate 3**: Can proceed in parallel with consolidation (independent paths)
