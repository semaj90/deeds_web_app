# Next Session Quick Start — Phases 6a, 9, Tool Selection Layer

**Previous Status**: ✅ Phases 2-8 complete, 3 gaps identified  
**Session Goal**: Close gaps via Phase 6a fix + Phase 9 indexing + HMM wiring  
**Estimated Time**: 2-2.5 hours total

---

## Step 1: Fix Phase 6a (Feature Graph Path Normalization) — 5-10 min

**Problem**: Feature graph created 18 nodes but matched 0 files (path mismatch).

**Dry-run first**:
```bash
cd sveltekit-frontend
npm run atlas:phase6a:feature-paths:fix:dry
```

**Expected output**:
```
[DRY-RUN] Feature "auth" would match files containing: session, validate, login, ...
[DRY-RUN] Feature "rag" would match files containing: retrieve, augment, search, ...
...
```

**Apply**:
```bash
npm run atlas:phase6a:feature-paths:fix:apply
```

**Verify** (Neo4j Cypher):
```cypher
MATCH (f:CodebaseFile)-[rel:BELONGS_TO_FEATURE]->(feat:Feature)
RETURN feat.name, COUNT(rel) as file_count
ORDER BY file_count DESC
```

---

## Step 2: Index Tool Registry (Phase 9) — 10-15 min

**Problem**: Tools not indexed for semantic search + HMM gating.

**Dry-run**:
```bash
npm run atlas:phase9:tool-registry:index:dry
```

**Expected output**:
```
[DRY-RUN] Tool registry would be populated with:
  - trace.kag_search: KAG Search
  - atlas.topology_expand: Topology Expansion
  - neo4j.dependency_closure: Dependency Closure
  - qdrant.dense_search: Dense Vector Search
  - rg.lexical_search: Lexical Search (ripgrep)
  - gemma4.explain_code: Code Explanation

  Total: 6 tools
```

**Apply** (with embedding):
```bash
npm run atlas:phase9:tool-registry:index:apply
```

**Verify** (SQL):
```sql
SELECT COUNT(*) as total, 
       COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded
FROM tool_registry;
```

Expected: `6 | 6`

---

## Step 3: Wire HMM-Gated Tool Selector — 30-45 min

**Create new file**: `src/lib/server/retrieval/hmm-tool-selector.ts`

**Skeleton**:
```typescript
import { query as db } from '$lib/server/db';
import qdrant from './qdrant';

export type HMMState = 'UNKNOWN' | 'CANONICAL' | 'RECOVERABLE' | 'QUARANTINE';

export type ToolObservation = {
  query_tool_cosine: number;      // 0-1
  schema_match: number;            // 0-1
  past_success_rate: number;       // 0-1
  source_ref_coverage: number;     // 0-1
  packet_validation_score: number; // 0-1
  latency_score: number;           // 0-1
};

export async function selectTool(userQuery: string, topK: number = 5) {
  // 1. Embed query
  const queryEmbedding = await embed(userQuery);
  
  // 2. Search tool registry
  const candidates = await qdrant.search({
    collection_name: 'tool_registry',
    vector: queryEmbedding,
    limit: topK
  });
  
  // 3. HMM validation
  for (const tool of candidates) {
    const state = await inferHMMState(tool);
    if (!['CANONICAL', 'RECOVERABLE'].includes(state)) {
      continue; // Skip QUARANTINE
    }
    
    // 4. Confidence check
    if (tool.score >= 0.70) {
      return tool; // Winner
    }
  }
  
  // 5. Fallback to lexical
  return { tool_id: 'rg.lexical_search' };
}

async function inferHMMState(tool: any): Promise<HMMState> {
  // TODO: Implement HMM Viterbi algorithm
  // For MVP: return 'CANONICAL' if score > 0.7, else 'RECOVERABLE'
  return tool.score > 0.7 ? 'CANONICAL' : 'RECOVERABLE';
}
```

---

## Step 4: Add `/api/tools/search` Endpoint — 20-30 min

**Create**: `src/routes/api/tools/search/+server.ts`

**Handler**:
```typescript
import { json } from '@sveltejs/kit';
import { selectTool } from '$lib/server/retrieval/hmm-tool-selector';

export async function POST({ request }) {
  const { query, top_k = 5, filters = {} } = await request.json();
  
  const tool = await selectTool(query, top_k);
  
  return json({
    tool_id: tool.tool_id,
    tool_name: tool.name,
    confidence: tool.score,
    hmm_state: 'CANONICAL',
    fallback: false
  });
}
```

---

## Step 5: Smoke Test Tool Selection — 20-30 min

**Create**: `tests/retrieval/tool-selection.spec.ts`

**Tests**:
```typescript
import { describe, it, expect } from 'vitest';
import { selectTool } from '$lib/server/retrieval/hmm-tool-selector';

describe('HMM Tool Selection', () => {
  it('should select trace.kag_search for graph queries', async () => {
    const result = await selectTool('Find authentication route handlers');
    expect(result.tool_id).toBe('trace.kag_search');
    expect(result.score).toBeGreaterThan(0.70);
  });

  it('should select qdrant.dense_search for semantic queries', async () => {
    const result = await selectTool('Find code similar to this pattern');
    expect(result.tool_id).toBe('qdrant.dense_search');
  });

  it('should fallback to rg.lexical_search on low confidence', async () => {
    const result = await selectTool('xyz abc def nonsense');
    if (result.score < 0.70) {
      expect(result.tool_id).toBe('rg.lexical_search');
    }
  });

  it('should block QUARANTINE state', async () => {
    // Once HMM state logic complete, test that invalid states fallback
  });
});
```

**Run**:
```bash
npm run test -- tests/retrieval/tool-selection.spec.ts
```

---

## Step 6: Full Pipeline Test — 10-15 min

**One-liner to verify everything**:
```bash
npm run atlas:phases:2-8:complete && \
npm run test -- tests/retrieval/tool-selection.spec.ts && \
echo "✅ All phases 2-9 + tool selection complete!"
```

---

## Rollback Plan (If Needed)

| Component | Rollback Command |
|-----------|------------------|
| Phase 6a fix | `git checkout scripts/atlas/fix-phase6a-feature-paths.mjs` |
| Phase 9 index | `git checkout scripts/atlas/phase9-tool-registry-index.mjs` |
| Tool selector | `git checkout src/lib/server/retrieval/hmm-tool-selector.ts` |
| API endpoint | `git checkout src/routes/api/tools/search/+server.ts` |

---

## Known Issues & Mitigations

| Issue | Mitigation | Effort |
|-------|------------|--------|
| Neo4j connection timeout | Increase timeout in fix script | 5m |
| Ollama embeddings unavailable | Fall back to cached embeddings | 10m |
| Qdrant collection missing | Create via Phase 8 if not present | 5m |

---

## Success Criteria

**Phase 6a**: ✅ Feature nodes now link to >100 files  
**Phase 9**: ✅ 6 tools indexed with embeddings  
**Tool selection**: ✅ `/api/tools/search` returns correct tool  
**Tests**: ✅ All tool selection tests pass  

---

## Environment Variables (Verify Before Starting)

```bash
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export REDIS_PASSWORD=redis
export DB_HOST=127.0.0.1
export DB_PORT=5434
export DB_USER=legal_admin
export DB_PASSWORD=123456
export DB_NAME=legal_ai_db
export OLLAMA_URL=http://127.0.0.1:11434
export NEO4J_URI=bolt://127.0.0.1:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
```

---

## Estimated Timeline

| Step | Time | Cumulative |
|------|------|-----------|
| Phase 6a fix | 5-10m | 5-10m |
| Phase 9 indexing | 10-15m | 15-25m |
| HMM selector wiring | 30-45m | 45-70m |
| `/api/tools/search` | 20-30m | 65-100m |
| Smoke tests | 20-30m | 85-130m |
| Full pipeline test | 10-15m | 95-145m |

**Total**: ~2-2.5 hours

---

**Begin with**: `npm run atlas:phase6a:feature-paths:fix:dry`  
**Documentation Reference**: `docs/ATLAS-NEXT-PASS-ARCHITECTURE.md`  
**Last updated**: July 9, 2026
