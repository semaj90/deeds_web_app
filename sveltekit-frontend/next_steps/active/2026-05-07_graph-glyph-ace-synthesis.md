# Graph → Glyph → ACE → Gemma4 Synthesis Pipeline
> Created: 2026-05-07  
> Status: ACTIVE — ACE multi-lane spine green, relationship extraction done, synthesis wiring next

---

## What's Already Done (don't re-implement)

| Component | File | Status |
|-----------|------|--------|
| ACE multi-lane spine | `ace/multi-lane-retrieval.ts` | ✅ wired |
| aceTopkKey() shared | `ace/cache-keys.ts` | ✅ canonical |
| context_timeline logging | `ace/context-assembler.ts` P4-A | ✅ done |
| topFiles boost | `ace/context-assembler.ts` P3-B | ✅ done |
| Semantic edge extraction | `graph/relationship-extractor.ts` | ✅ done |
| code_relations Postgres table | `db/schema-postgres.ts` + migration | ✅ done |
| extract-code-relations.mjs | `scripts/wiki/` | ✅ 11,388 edges written |
| NES glyph architecture JSON | `docs/graph/nes-glyph-architecture.json` | ✅ 95 GPU clusters |
| Startup plan generator | `scripts/startup-plan.mjs` | ✅ wired to npm run dev |
| Retrieval tests | `tests/retrieval-lanes.spec.ts` (8) + `tests/multi-lane-spine.spec.ts` (4) | ✅ 12/12 pass |

---

## Phase A: Qdrant Cluster Tags → ACE Synthesis (P0, ~45 min)

**Goal**: Gemma4 receives cluster-aware context — not just raw chunk text but which NES cluster each chunk belongs to and its summary lens.

### A1. Extend ACEContext with cluster field

**File**: `src/lib/server/ace/types.ts`

```typescript
export interface ACEContext {
  // ... existing fields ...
  clusterContext?: {
    clusterKey: string;
    summaryLens: string;   // from nes-glyph-architecture.json node.summaryLens
    topoLabel: string;     // topo class (e.g. "api-route", "server-lib", "ui-component")
    topFiles: string[];    // top 5 files in cluster
    tags: string[];        // cluster tags from NES
  }[];
}
```

### A2. Inject cluster context in context-assembler.ts

**After** the P3-B fast-AST boost block (~line 630), add:

```typescript
// A2: Inject NES cluster context for top ragChunks
if (baseContext.ragChunks?.length && nesGlyphData) {
  const topChunkFiles = new Set(baseContext.ragChunks.slice(0, 5).map(c => c.filePath).filter(Boolean));
  const matchedClusters = nesGlyphData.nodes
    .filter(n => topChunkFiles.has(n.stableKey))
    .map(n => n.clusterKey)
    .filter((k, i, a) => k && a.indexOf(k) === i)
    .slice(0, 3);
  if (matchedClusters.length > 0) {
    baseContext.clusterContext = matchedClusters.map(k => {
      const clusterNodes = nesGlyphData.nodes.filter(n => n.clusterKey === k);
      return {
        clusterKey: k,
        summaryLens: clusterNodes[0]?.summaryLens ?? '',
        topoLabel: clusterNodes[0]?.topoLabel ?? '',
        topFiles: clusterNodes.map(n => n.stableKey).slice(0, 5),
        tags: [...new Set(clusterNodes.flatMap(n => n.tags ?? []))].slice(0, 8),
      };
    });
  }
}
```

**Load NES data** at module top (lazy, cached):
```typescript
let _nesGlyph: any = null;
function nesGlyphData() {
  if (_nesGlyph) return _nesGlyph;
  try { _nesGlyph = JSON.parse(readFileSync(new URL('../../docs/graph/nes-glyph-architecture.json', import.meta.url), 'utf8')); }
  catch { _nesGlyph = { nodes: [] }; }
  return _nesGlyph;
}
```

### A3. Include cluster context in synthesisBlock

**In the synthesisBlock assembly** (look for `synthesisBlock` near line 650), add cluster section:

```typescript
if (multiLaneResult?.clusterContext?.length) {
  synthesisBlock += '\n\n### Codebase Clusters\n';
  for (const c of multiLaneResult.clusterContext.slice(0, 3)) {
    synthesisBlock += `**${c.clusterKey}** (${c.topoLabel}): ${c.summaryLens}\n`;
    synthesisBlock += `Tags: ${c.tags.join(', ')}\n`;
  }
}
```

---

## Phase B: MCP Tools for Graph + Cluster Context (P0, ~60 min)

**Goal**: Gemma4 can call `graph.expand_neighborhood` and `clusters.get_summary_lenses` via the TRACE MCP server.

### B1. Add tools to trace-mcp-server.ts

**File**: `src/mcp/trace-mcp-server.ts`

**Tool 1: `graph.expand_neighborhood`**
```typescript
server.tool('graph.expand_neighborhood', {
  description: 'Get 1-hop import/export neighbors of a file from Neo4j IMPORTS edges',
  inputSchema: {
    filePath: z.string().describe('Relative path e.g. src/lib/server/ace/context-assembler.ts'),
    maxHops: z.number().int().min(1).max(2).default(1),
    maxNodes: z.number().int().min(1).max(50).default(20),
  },
}, async ({ filePath, maxHops, maxNodes }) => {
  // Query Neo4j: MATCH (f:CodebaseFile {filePath: $fp})-[:IMPORTS*1..maxHops]->(n) RETURN n LIMIT maxNodes
  // Also check code_relations for READS_REDIS_KEY / QUERIES_TABLE edges from this file
  // Return: { neighbors: [{path, kind, tags}], redisKeys: string[], tables: string[] }
});
```

**Tool 2: `clusters.get_summary_lenses`**
```typescript
server.tool('clusters.get_summary_lenses', {
  description: 'Get NES cluster summary lenses for a list of file paths or cluster keys',
  inputSchema: {
    filePaths: z.array(z.string()).max(20).optional(),
    clusterKeys: z.array(z.string()).max(10).optional(),
  },
}, async ({ filePaths, clusterKeys }) => {
  // Read from nes-glyph-architecture.json (cached)
  // Return: { clusters: [{ key, summaryLens, topoLabel, tags, topFiles }] }
});
```

**Tool 3: `trace.validate_ace_hit`**
```typescript
server.tool('trace.validate_ace_hit', {
  description: 'Validate an ACE retrieval hit: check if file has code_relations edges for Redis/table/Qdrant',
  inputSchema: {
    filePath: z.string(),
    relationType: z.enum(['READS_REDIS_KEY','WRITES_REDIS_KEY','QUERIES_TABLE','QUERIES_QDRANT_COLLECTION','QUERIES_NEO4J_LABEL']).optional(),
  },
}, async ({ filePath, relationType }) => {
  // Query Postgres: SELECT target_key, relation_type, confidence FROM code_relations WHERE source_file = $fp
  // Return validation: { hasRedisReads, hasTableQueries, hasQdrantAccess, edges: [...] }
});
```

### B2. Wire tools in gemma4-agent.ts

Add `graph_expand` and `cluster_lenses` to the allowlist in `gemma4-agent.ts`:

```typescript
const ALLOWED_TOOLS = new Set([
  'rag_search', 'case_search', 'memory_recall', 'hyperedge_stats',
  'graph.expand_neighborhood',        // NEW
  'clusters.get_summary_lenses',      // NEW
  'trace.validate_ace_hit',           // NEW
]);
```

---

## Phase C: Glyph Embed → NES Cluster → ACE Packet (P1, ~90 min)

**Goal**: The glyph tile atlas becomes a queryable source for ACE's graph expansion step.

### C1. `glyph-atlas-builder.ts` → ACE read path

Currently `buildGlyphTileAtlas()` writes to Redis (`ace:topo:*`) and CouchDB.

Add a **read function** for ACE context assembly:

```typescript
// In glyph-atlas-builder.ts
export async function getGlyphContextForFiles(
  filePaths: string[],
  redis: Redis
): Promise<{ clusterKey: string; summaryLens: string; glyphTiles: GlyphTile[] }[]> {
  // 1. For each filePath, get its clusterKey from NES graph
  // 2. Fetch cluster atlas from Redis ace:topo:{clusterKey} (TTL 300s)
  // 3. Return top 3 clusters with their summaryLens + top 5 tiles
}
```

### C2. Wire into multiLaneSearch as lane 7 (glyph_cluster)

In `multi-lane-retrieval.ts`, add after lane 6 (vector):

```typescript
// Lane 7: glyph_cluster — NES cluster context for top files
async function runGlyphClusterLane(
  topFiles: string[],
  redis: Redis
): Promise<LaneResult> {
  if (!topFiles.length) return { lane: 'glyph_cluster', hits: [], skipped: true, reason: 'no topFiles' };
  const glyphCtx = await getGlyphContextForFiles(topFiles, redis);
  return {
    lane: 'glyph_cluster',
    hits: glyphCtx.flatMap(c => c.glyphTiles.map(t => ({
      sourceFile: t.filePath,
      text: `[${c.clusterKey}] ${c.summaryLens}`,
      score: 0.65,
      metadata: { clusterKey: c.clusterKey, glyphId: t.glyphId },
    }))),
    skipped: false,
  };
}
```

---

## Phase D: Relation Map Artifacts + Per-Run Memory (P1, ~30 min)

**Goal**: Every extraction run writes canonical `memory/runs/<run_id>/` artifacts that ACE and Gemma4 can read.

After `extract-code-relations.mjs` succeeds, also write:

```
memory/runs/<run_id>/
  relationship_map.json        ← edge summary by type + top files
  agents_scope_map.json        ← { filePath → agentsMdPath } for all HAS_AGENTS_SCOPE edges
  schema_access_map.json       ← { table → [files] } for all QUERIES_TABLE edges
  redis_key_map.json           ← { key_pattern → { reads: [files], writes: [files] } }
  qdrant_access_map.json       ← { collection → [files] }
```

Add to `extract-code-relations.mjs` Step 4 (`writeArtifact`):

```javascript
// relationship_map.json
const relMap = {
  runId: artifact.runId,
  totalEdges: artifact.totalEdges,
  edgeCounts: artifact.edgeCounts,
  topFilesByEdgeCount: topN(edges, 'sourceFile', 20),
};

// agents_scope_map.json
const agentsScopeMap = Object.fromEntries(
  edges.filter(e => e.relationType === 'HAS_AGENTS_SCOPE')
    .map(e => [e.sourceFile, e.targetKey])
);

// schema_access_map.json
const schemaAccessMap = groupBy(
  edges.filter(e => e.relationType === 'QUERIES_TABLE'),
  e => e.targetKey
);
```

---

## Phase E: TurboQuant + MLA Math for Production Config (P2, reference)

### Current VRAM budget (RTX 3060 Ti, gemma4-legal-vlm 5.3GB Q4_K_M)

```
Model weights (Q4_K_M):   5.3 GB
KV cache (turbo3/turbo4):
  turbo3 key: 3-bit, 8 heads×128 dim × 3/16 = 192 B/token/layer
  turbo4 val: 4-bit, 8 heads×128 dim × 4/16 = 256 B/token/layer
  4K context, 32 layers: (192+256) × 4096 × 32 = ~57 MB
mmproj (vision):          ~0.5 GB
Overhead:                 ~0.3 GB
───────────────────────────
TOTAL estimated:          ~6.1 GB  (1.9 GB headroom on 8 GB)
```

**DeepSeek MLA comparison** (not available in Gemma4, reference only):
- MLA compresses (K+V) latent to 512 dims vs standard 128×num_kv_heads×2
- Effective compression: 512/(16×128×2) = 512/4096 = 12.5% of standard
- With turbo3 on top: 12.5% × 3/16 = ~2.3% of f16 baseline
- Not needed here — turbo3 alone is sufficient for 8GB GPU

**Recommended command** (asymmetric, Flash Attention required):
```bash
llama-server.exe -m <gemma4-legal-vlm.gguf> --mmproj <mmproj-BF16.gguf> \
  -ctk turbo3 -ctv turbo4 -fa on -ngl 99 --port 8090 -c 4096
```

---

## Claude TODO (concrete, ordered)

- [ ] **A1-A3**: Add `clusterContext` to ACEContext, inject in context-assembler, include in synthesisBlock  
- [ ] **B1**: Add 3 new MCP tools to `trace-mcp-server.ts` (expand_neighborhood, cluster_lenses, validate_ace_hit)  
- [ ] **B2**: Extend Gemma4 agent allowlist for new tools  
- [ ] **C1**: Add `getGlyphContextForFiles()` read function to `glyph-atlas-builder.ts`  
- [ ] **C2**: Add lane 7 `glyph_cluster` to `multi-lane-retrieval.ts`  
- [ ] **D**: Write 5 artifact JSON files per extraction run in `extract-code-relations.mjs`  
- [ ] **P2-A**: Implement Qdrant vector lane in multi-lane-retrieval.ts (weight 0.75)  
- [ ] **Run**: `npm run relation:extract` when Docker up → mirror to Neo4j  
- [ ] **Run**: Apply `drizzle/manual/20260506_code_relations.sql` if not yet applied  
- [ ] **Verify**: `npm run startup:plan` at start of each session for fresh context  

---

## Files to touch in next session

| File | Change |
|------|--------|
| `src/lib/server/ace/types.ts` | Add `clusterContext` to ACEContext |
| `src/lib/server/ace/context-assembler.ts` | A2+A3: inject cluster context + synthesisBlock |
| `src/mcp/trace-mcp-server.ts` | B1: 3 new MCP tools |
| `src/lib/server/ai/gemma4-agent.ts` | B2: extend tool allowlist |
| `src/lib/server/graph/glyph-atlas-builder.ts` | C1: add read function |
| `src/lib/server/ace/multi-lane-retrieval.ts` | C2: lane 7 glyph_cluster |
| `scripts/wiki/extract-code-relations.mjs` | D: write 5 artifact JSON files |
