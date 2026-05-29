# Script Organization Guide

**Date**: 2026-05-29 9:00 AM PDT  
**Status**: Plan + Library Implementation Complete  
**Next**: Begin migration to new directory structure

---

## New Directory Structure

```
scripts/
├── lib/                              # Shared utilities (NEW)
│   ├── duplicate-detector.mjs        # Prevent concurrent pipeline runs (NEW)
│   ├── redis-semantic.mjs            # Semantic caching + embeddings (NEW)
│   ├── mcp-streaming.mjs             # MCP JSON-RPC 2.0 transports (NEW)
│   └── bounded-output.mjs            # (existing, already here)
│
├── graphify/                         # Graph enrichment pipeline (NEW)
│   ├── deep-imports.mjs              # Neo4j sync → scripts/graphify-deep-imports.mjs
│   ├── gds.mjs                       # GDS algorithms → scripts/neo4j-graph-enrich.mjs (NEW)
│   ├── pagerank.mjs                  # GPU PageRank → scripts/run-pagerank.ts
│   ├── pagerank-couchdb.mjs          # (NEW) Persist PageRank to CouchDB
│   ├── cluster-pagerank.mjs          # Cluster-specific → scripts/graphify-cluster-pagerank.mjs
│   ├── semantic-cluster.mjs          # Semantic clustering → scripts/graphify-semantic-cluster.mjs
│   ├── som-topology.mjs              # SOM coords → scripts/graphify-som-topology.mjs
│   ├── som-summaries.mjs             # Summaries → scripts/graphify-som-cluster-summaries.mjs
│   ├── authority.mjs                 # Authority blend → scripts/graphify-authority.mjs
│   ├── kag-notes.mjs                 # KAG ingestion → scripts/graphify-kag-notes-missing.mjs
│   └── health.mjs                    # Health check → scripts/graphify-health.mjs
│
├── atlas/                            # Atlas phase 17-19 pipeline (MOVE EXISTING)
│   ├── build.mjs                     # Orchestrator (NEW)
│   ├── feature-extract.mjs           # Phase 17 PyTorch features
│   ├── rerank.mjs                    # Phase 18 XGBoost reranking
│   ├── seed.mjs                      # Phase 19 retrieval seeding
│   ├── packet.mjs                    # ACE packet generation
│   └── ... (60+ existing atlas files)
│
├── codebase/                         # Codebase analysis (NEW)
│   ├── index-fast.mjs                # → scripts/index-codebase-fast.mjs
│   ├── index-deep.mjs                # Deep AST indexing (NEW)
│   ├── relations.mjs                 # → scripts/build-codebase-relationships.mjs
│   ├── recommendations.mjs           # → scripts/build-codebase-recommendations.mjs
│   ├── semantic-index.mjs            # Semantic indexing (NEW)
│   ├── directory-map.mjs             # Directory mapping
│   └── nes-gpu-index.mjs             # NES GPU indexing
│
├── analysis/                         # Analysis & diagnostics (NEW)
│   ├── deep-ast.mjs                  # AST deep analysis
│   ├── directory-audit.mjs           # Directory audit
│   ├── orphan-detector.mjs           # Orphan detection (gate G2)
│   ├── shallow-wiring.mjs            # Shallow wiring analysis
│   ├── error-fingerprints.mjs        # Error clustering
│   └── corruption-patterns.mjs       # Corruption detection
│
├── mcp/                              # MCP servers (MOVE + ENHANCE)
│   ├── atlas-tools-mcp.mjs           # Atlas tools (JSON-RPC 2.0 + streaming)
│   ├── redis-semantic-cache-mcp.mjs  # Semantic Redis cache (NEW)
│   ├── gemma4-offload-mcp.mjs        # Gemma4 offload
│   ├── turbovec-sidecar-mcp.mjs      # TurboVec sidecar
│   └── engram-embed-mcp.mjs          # Engram embeddings
│
├── opencode/                         # OpenCode/Cline integration (MOVE EXISTING)
│   ├── smoke-atlas-tools-mcp.mjs     # Atlas MCP smoke test
│   ├── smoke-neo4j-graph-enrich.mjs  # GDS smoke test
│   ├── tools-registry.mjs            # (NEW) MCP tool registry
│   └── ... (existing opencode tests)
│
├── seed/                             # Database seeding (MOVE EXISTING)
├── audit/                            # Audits (MOVE EXISTING)
├── startup/                          # Startup pipeline (MOVE EXISTING)
├── tests/                            # Test scripts (MOVE EXISTING)
└── ... (other existing dirs)
```

---

## Key Implementation Details

### 1. Duplicate Prevention

**Pattern**: Every pipeline script acquires a Redis lock before running.

```javascript
// At top of graphify/deep-imports.mjs
import DuplicateDetector from '../lib/duplicate-detector.mjs';

const detector = new DuplicateDetector();
const { lockKey, lockId } = await detector.acquireLock('graphify:deep:neo4j', 300);

try {
  // Pipeline code
  await syncToNeo4j();
} finally {
  await detector.releaseLock(lockKey, lockId);
}
```

**In package.json**:
```json
{
  "graphify:deep:neo4j": "node scripts/lib/duplicate-detector.mjs graphify:deep:neo4j 300 && node scripts/graphify/deep-imports.mjs"
}
```

### 2. Semantic Redis Caching

**Usage in scripts**:
```javascript
import { SemanticRedisCache } from '../lib/redis-semantic.mjs';

const cache = new SemanticRedisCache();
await cache.connect();

// Semantic search with cache + Qdrant fallback
const results = await cache.semanticSearch(
  'find files related to authentication',
  'codebase_chunks_768',
  10,
  'semantic_cache:codebase'
);

console.log(results);
// { source: 'redis_cache' | 'qdrant_fallback', results: [...], cached: boolean }
```

### 3. MCP Streaming Transport

**Usage in MCP servers**:
```javascript
import { JsonRpc2Server, McpToolHandler, McpToolRegistry } from '../lib/mcp-streaming.mjs';

class MyTool extends McpToolHandler {
  async execute(args) {
    return { data: 'result' };
  }
}

const registry = new McpToolRegistry();
registry.register(new MyTool('my-tool', 'Tool description', { /* schema */ }));

const server = new JsonRpc2Server('my-server', registry);
// Stdio JSON-RPC 2.0 now streaming-ready
```

---

## Migration Checklist

### Phase 1: Create New Directories
- [x] `scripts/lib/` (core utilities)
- [x] `scripts/graphify/` (graph pipeline)
- [ ] `scripts/atlas/` (Atlas phase 17-19)
- [ ] `scripts/codebase/` (codebase analysis)
- [ ] `scripts/analysis/` (diagnostics)
- [ ] `scripts/mcp/` (MCP servers)

### Phase 2: Migrate Core Scripts
- [ ] Migrate `graphify-*.mjs` → `graphify/`
- [ ] Migrate `run-pagerank.ts` → `graphify/pagerank.mjs`
- [ ] Migrate `neo4j-graph-enrich.mjs` → `graphify/gds.mjs`
- [ ] Migrate `index-codebase-fast.mjs` → `codebase/index-fast.mjs`
- [ ] Migrate `build-codebase-relationships.mjs` → `codebase/relations.mjs`

### Phase 3: Add Duplicate Detection
- [ ] Update `package.json` scripts with duplicate-detector wrapper
- [ ] Test: two concurrent runs should fail on second (lock held)

### Phase 4: Wire Semantic Caching
- [ ] Update `atlas-tools-mcp.mjs` to use `redis-semantic.mjs`
- [ ] Update `graphify/semantic-cluster.mjs` for cache + fallback
- [ ] Smoke test: semantic search via MCP returns cached results

### Phase 5: Streaming Transport
- [ ] Wire `mcp-streaming.mjs` into all MCP servers
- [ ] Test: tools/list via stdio JSON-RPC 2.0
- [ ] Optional: Add Streamable HTTP fallback

---

## Commands After Migration

```bash
# Graphify pipeline (with duplicate prevention)
npm run graphify:deep:neo4j          # Neo4j sync
npm run graphify:gds                 # GDS algorithms
npm run graphify:pagerank            # GPU PageRank

# Codebase analysis
npm run codebase:index:fast          # Fast indexing
npm run codebase:relations           # Code relations
npm run codebase:recommendations     # Missing imports

# Analysis & diagnostics
npm run analysis:orphan-detector     # Find dead code
npm run analysis:shallow-wiring      # Shallow wiring check

# Atlas pipeline
npm run atlas:build                  # Full build
npm run atlas:feature-extract        # Phase 17
npm run atlas:rerank                 # Phase 18
npm run atlas:seed                   # Phase 19

# MCP servers
npm run mcp:atlas-tools              # Atlas tools (stdio JSON-RPC)
npm run mcp:redis-semantic-cache     # Redis semantic cache
```

---

## Benefits of This Organization

| Aspect | Before | After |
|--------|--------|-------|
| **Discoverability** | 60+ root scripts | Grouped by function |
| **Duplicates** | No prevention | Redis lock-based |
| **Semantic search** | Manual | Automatic cache + fallback |
| **MCP servers** | Scattered | Centralized in `scripts/mcp/` |
| **Maintenance** | Hard (context jumping) | Easy (feature-focused dirs) |
| **Streaming** | Basic | JSON-RPC 2.0 + Valkey :stream |

---

## Next Steps

1. ✅ Create utilities: `lib/duplicate-detector.mjs`, `lib/redis-semantic.mjs`, `lib/mcp-streaming.mjs`
2. ⏳ Create directory structure
3. ⏳ Begin script migration
4. ⏳ Update package.json aliases
5. ⏳ Smoke test duplicate detection
6. ⏳ Wire semantic caching into MCP servers

Ready to start Phase 1 migration?