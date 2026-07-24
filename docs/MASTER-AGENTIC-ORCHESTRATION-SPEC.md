# Master Agentic Orchestration Specification
## Codebase Semantic Intelligence + Multi-Turn Error Fixing + Tool Calling

**Date**: July 23, 2026  
**Scope**: Daily graphify indexing → directory topology → semantic clustering → LLM synthesis with tool-aware agentic error fixing  
**Authority**: Unified architecture spec (ACP + A2A + AHP + MCP + LangGraph)

---

## PART I: TOPOLOGY & CLUSTERING ARCHITECTURE

### What is Topology?

**Definition**: Directed acyclic graph (DAG) of file/function dependencies extracted from codebase.

**Levels**:
```
Level 1: File Graph
  ├─ Nodes: source files (27.7K in deeds-web-app)
  ├─ Edges: IMPORTS (file A imports file B)
  └─ Authority: PageRank on import graph

Level 2: Function/Symbol Graph
  ├─ Nodes: structural facts (65.5K symbols)
  ├─ Edges: CALLS (func A calls func B), USES (func A uses class B)
  └─ Authority: PageRank on call graph

Level 3: Semantic Clustering
  ├─ Nodes: 768-dim embeddings of symbols
  ├─ Edges: SIMILAR (cosine similarity > 0.7)
  ├─ Clusters: K-means (20 clusters) or SOM (20×20 grid)
  └─ Authority: Cluster density, internal connectivity

Level 4: Semantic-Topological Fusion
  ├─ Nodes: clusters + PageRank authority + embedding centroids
  ├─ Edges: MEMBER_OF (symbol ∈ cluster), SIMILAR_TOPOLOGY (cluster neighbor)
  └─ Authority: Fused score (0.4·PageRank + 0.3·cosine_density + 0.3·cluster_size)
```

**Neo4j Schema** (current):
```cypher
(:FileNode { path, sha256, language })
  -[:IMPORTS]-> (:FileNode)
  -[:CONTAINS]-> (:SymbolNode { name, type, lineStart, lineEnd })
  -[:CALLS|EXTENDS|USES]-> (:SymbolNode)

(:SemanticCluster { clusterId, centroidVector, memberCount })
  -[:MEMBER_OF]-> (:SymbolNode)
  -[:SIMILAR_TOPOLOGY]-> (:SemanticCluster)

(:PageRankScore { symbol, score, rank, timestamp })
  -[:SCORE_OF]-> (:SymbolNode)
```

### Current State: Topology Extraction (Stages 1-5)

| Stage | Input | Process | Output | Status |
|-------|-------|---------|--------|--------|
| 1 | Repo root | ripgrep file enum | 27.7K files | ✅ DONE |
| 2 | File inventory | Regex structural facts | 65.5K symbols | ✅ DONE |
| 3 | Symbols | Mock embeddings (768-dim) | 65.5K vectors | ✅ DONE (mock) |
| 4 | Symbols + files | Extract USES/IMPORTS edges | 149.8K edges | ⚠️ INCOMPLETE (tmp file) |
| 4b | Topology edges | Validate orphan endpoints | Gate pass/fail | ⏳ BLOCKED on 4 |
| 5 | Edges | Power iteration PageRank | Authority scores | ⏳ BLOCKED on 4b |

### Missing: K-Means & SOM Clustering (Stages 6-8)

**Stage 6: K-Means (20 clusters)**
```
Input:  65.5K symbols with 768-dim embeddings
Process: K-means++ initialization → 20 clusters
Output:  cluster_id per symbol + centroid_768 per cluster
Time:    ~30 seconds (GPU optional)
Storage: atlas_packets.kmeans_cluster_id (INT)
         atlas_kmeans_centroids.centroid_768 (VECTOR(768))
```

**Stage 7: SOM (20×20 grid)**
```
Input:  65.5K symbols with 768-dim embeddings
Process: Self-Organizing Map training (200 iterations)
Output:  (som_x INT, som_y INT) per symbol + grid_centroids[20][20]
Time:    ~2-3 minutes (CPU-intensive; GPU accelerated with pytorch)
Storage: atlas_packets.som_x, atlas_packets.som_y
         atlas_som_grid.grid_centroids (VECTOR(768)[400])
```

**Stage 8: Neo4j Topology Materialization**
```
Input:  PageRank scores + K-means clusters + SOM grid
Process: Create SIMILAR_TOPOLOGY edges (SOM grid neighbors)
         Create MEMBER_OF edges (symbol → cluster)
         Materialize centroids as (:SemanticCluster) nodes
Output:  Neo4j edges + cluster nodes
Time:    ~5-10 minutes (Cypher traversal + writes)
```

---

## PART II: DAILY GRAPHIFY ORCHESTRATION

### Directory Indexer Architecture

**Goal**: Scan directory once per day; identify changed/new/deleted files; index only deltas.

**Current State**: 5 daily graphify scripts exist; no unified scheduler.

**Missing Pieces**:
1. Unified orchestrator (daily-graphify-orchestrator.mjs)
2. Scheduler (cron or background job)
3. Delta detection (file hashing + snapshot comparison)
4. Partial reindex (only changed files → Stage 4)
5. Gate status reporting (JSON output for dashboard)
6. Error recovery (retry with backoff + witness trees)

### Daily Graphify Flow (Proposed)

```
1. STARTUP (09:00)
   ├─ Load prior snapshot (docs/stage1/prior_snapshot.json)
   ├─ ripgrep enumerate current files
   ├─ SHA-256 hash all files
   └─ Classify as: new, changed, unchanged, deleted
   
2. STAGE 2 DELTA (changed files only)
   ├─ Extract structural facts for changed files
   ├─ Append to stage2/structural_facts.ndjson (append-only log)
   └─ Recompute embedding for changed symbols
   
3. STAGE 3 EMBEDDINGS
   ├─ Call embeddinggemma for new symbols
   ├─ Update Qdrant collection
   └─ Write to codebase_chunk_index (Postgres)
   
4. STAGE 4 TOPOLOGY (changed files + dependencies)
   ├─ Re-extract USES/IMPORTS for changed files
   ├─ Identify impacted symbols (reverse dependency closure)
   └─ Update topology edges in Neo4j
   
5. STAGE 5 PAGERANK (recompute from scratch)
   ├─ Load all edges from Neo4j
   ├─ Run PageRank power iteration
   └─ Write scores to atlas_packets.pagerank_authority
   
6. STAGE 6-8 CLUSTERING (if schedule allows)
   ├─ K-means on updated embedding set
   ├─ SOM training (optional, expensive)
   └─ Update Neo4j SIMILAR_TOPOLOGY edges
   
7. REPORTING & ALERTING
   ├─ Write execution log to docs/graphify-execution-log.md
   ├─ Emit metrics to Redis (hit rates, timing, errors)
   ├─ Notify Slack/email on gate failures
   └─ Update admin dashboard in real-time (WebSocket)
```

### Helper Decorators for ACP/A2A Wiring

**Current State**: Decorators exist (agentic-tracking-loop-architecture.md); not fully wired.

**Missing Implementations**:

```typescript
// Helper: DeltaIndexer (efficient reindexing)
export class DeltaIndexer {
  async indexChangedFiles(
    priorSnapshot: Map<string, string>,  // path → sha256
    currentFiles: FileInfo[],            // current directory
    stageDir: string                     // docs/stage4
  ): Promise<{
    new: FileInfo[];
    changed: FileInfo[];
    deleted: string[];
    impacted: SymbolInfo[];              // transitive dependencies
  }> {
    // Implementation: delta detection + reverse dependency closure
  }
}

// Helper: ContextWindowCalculator (token budgeting)
export class ContextWindowCalculator {
  calculateTokenBudget(
    queryTokens: number,
    systemPromptTokens: number,
    contextWindowSize: number = 65536  // gemma4-legal typical
  ): {
    availableForContext: number;
    recommendedTopK: number;            // chunks to retrieve
    recommendedMaxSummary: number;      // tokens for summary
  } {
    // Reserve tokens: query + system + response + buffer
    const reserved = queryTokens + systemPromptTokens + 2000;  // 2K buffer
    const available = contextWindowSize - reserved;
    
    // For RAG: typically 10 chunks × 200 tokens/chunk = 2000 tokens
    const recommendedTopK = Math.floor(available / 200);
    const recommendedMaxSummary = Math.min(512, available / 2);
    
    return { availableForContext: available, recommendedTopK, recommendedMaxSummary };
  }
}

// Helper: VectorCentroidCache (Redis L1 + Valkey)
export class VectorCentroidCache {
  async getOrComputeCentroid(
    clusterId: string,
    vectorIds: string[],
    dimension: number = 768
  ): Promise<Float32Array> {
    // 1. Check Redis: centroid:{clusterId}:{model_version}
    // 2. If miss: fetch vectors from Postgres, compute mean
    // 3. Write back to Redis + Valkey (with expiry)
    // 4. Return Float32Array
  }
  
  // Multi-vector semantic summarization
  async computeClusterSummary(
    vectorIds: string[],
    topK: number = 5          // top-K from cluster
  ): Promise<{
    summary: Float32Array;     // averaged embedding
    selectedIndices: number[]; // which vectors contributed
    confidence: number;         // coherence score (0-1)
  }> {
    // Use AE (autoencoder) to compress N vectors → 1 semantic summary
    // Store in Redis: cluster_summary:{clusterId}:{timestamp}
    // Used for efficient cluster-level search
  }
}

// Helper: TokenRemappingStrategy (Gemma4 dimension adaptation)
export class TokenRemappingStrategy {
  // Problem: user may request longer output than context allows
  // Solution: remap token budget dynamically
  
  async adaptContextForGemma4(
    originalTokenCount: number,
    requestedCompletionTokens: number,
    contextWindowSize: number = 65536
  ): Promise<{
    remappedInputTokens: number;        // reduced input if needed
    remappedCompletionTokens: number;   // adjusted output budget
    compressionRatio: number;            // how much we reduced
    strategy: 'truncate' | 'summarize' | 'full';
  }> {
    const totalNeeded = originalTokenCount + requestedCompletionTokens;
    
    if (totalNeeded <= contextWindowSize) {
      return {
        remappedInputTokens: originalTokenCount,
        remappedCompletionTokens: requestedCompletionTokens,
        compressionRatio: 1.0,
        strategy: 'full'
      };
    }
    
    // Aggressive truncation strategy
    const maxInput = Math.floor(contextWindowSize * 0.75);  // 75% for input
    const maxCompletion = contextWindowSize - maxInput;     // 25% for output
    
    return {
      remappedInputTokens: Math.min(originalTokenCount, maxInput),
      remappedCompletionTokens: Math.min(requestedCompletionTokens, maxCompletion),
      compressionRatio: maxInput / originalTokenCount,
      strategy: 'truncate'
    };
  }
}

// Helper: SQLAlchemyToJsonRedis (SQLAlchemy model → JSON/Redis key)
export class SQLAlchemyToJsonRedis {
  async persistPacketToRedis(
    packet: atlas_packets,          // SQLAlchemy model
    redisClient: Redis,
    ttl: number = 3600              // 1 hour default
  ): Promise<void> {
    const key = `packet:${packet.packet_key}:${packet.model_version}`;
    const value = {
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      feature_id: packet.feature_id,
      summary: packet.summary,
      embedding_768: packet.embedding_768,  // Float32Array → base64
      kmeans_cluster: packet.kmeans_cluster_id,
      som_position: { x: packet.som_x, y: packet.som_y },
      pagerank_score: packet.pagerank_authority,
      timestamp: packet.updated_at.toISOString(),
      model_version: packet.model_version
    };
    
    await redisClient.set(key, JSON.stringify(value), 'EX', ttl);
  }
  
  // Semantic multi-vector summarization in Redis
  async storeClusterCentroid(
    clusterId: string,
    centroidVector: Float32Array,
    memberCount: number,
    redisClient: Redis
  ): Promise<void> {
    const key = `centroid:cluster:${clusterId}:768`;
    // Store as msgpack or base64-encoded float32
    const encoded = Buffer.from(centroidVector.buffer).toString('base64');
    
    await redisClient.hset(`cluster_meta:${clusterId}`, {
      'centroid_encoded': encoded,
      'centroid_dim': '768',
      'member_count': memberCount,
      'timestamp': Date.now()
    });
  }
}

// Helper: EditPatchInline (inline code editing + tool calls)
export class EditPatchInline {
  // Enable multi-turn agentic error fixing
  
  async applyInlinePatch(
    filePath: string,
    lineStart: number,
    lineEnd: number,
    replacement: string,
    toolCallId: string,           // trace tool call context
    witness: ErrorFixingWitness   // proof of authorization
  ): Promise<{
    success: boolean;
    newContent: string;
    lineCount: number;
    witness: ErrorFixingWitness;  // updated proof
  }> {
    // Constraints:
    // 1. Only edit files in codebase (not node_modules, .git, etc.)
    // 2. Require test pass before committing
    // 3. Record every edit in witness tree
    // 4. Allow human rollback within 5-minute window
    
    // Implementation:
    // - Read file from Postgres + filesystem
    // - Apply line-based patch
    // - Run relevant tests (jest, vitest, etc.)
    // - If tests pass: commit with witness tree
    // - If tests fail: suggest rollback + alternatives
  }
  
  // Tool-aware context (for Gemma4 tool calling)
  async getToolAwareContext(
    filePath: string,
    errorMessage: string,
    availableTools: MCP_Tool[]     // registered MCP tools
  ): Promise<{
    sourceContext: SourceContext;
    applicableTools: MCP_Tool[];   // filtered tools for this error
    suggestedToolSequence: string[]; // recommended order of tool calls
  }> {
    // Narrow tool set based on error type
    // E.g., type error → use type-checking tools
    //       runtime error → use execution/debugging tools
    //       lint error → use linting/formatting tools
  }
}
```

---

## PART III: MULTI-TURN AGENTIC ERROR FIXING WORKFLOWS

### Architecture: Agentic Error Fixing Loop

**Current State**: Partial (docs/AGENTIC-TRACKING-LOOP-ARCHITECTURE.md); gaps in orchestration.

**Flow**:
```
1. DETECT ERROR
   ├─ Run tests (npm run test)
   ├─ Parse error output (stacktrace, type, location)
   └─ Create issue record: errors.issue_claimed
   
2. CLASSIFY ERROR
   ├─ Error type: type, runtime, logic, perf, security
   ├─ Scope: single file, multi-file, external dependency
   ├─ Severity: critical, high, medium, low
   └─ Category: bug, tech-debt, enhancement, refactor
   
3. CONTEXT GATHERING (Doc Fetch + API Docs)
   ├─ Load affected file(s) from Postgres + filesystem
   ├─ Fetch related API docs from docs/ directory
   ├─ Query Neo4j for dependent symbols
   ├─ Retrieve embedding context (top-5 similar symbols)
   └─ Budget tokens (see TokenRemappingStrategy above)
   
4. AGENTIC PROPOSAL
   ├─ Call Gemma4 with error + context + available tools
   ├─ Gemma4 generates fix proposal (with tool calls)
   ├─ Register proposal: errors.issue_proposal
   └─ Constraint: max 5 tool calls per turn (prevent loops)
   
5. VALIDATION (Test-Driven)
   ├─ Apply patch (EditPatchInline.applyInlinePatch)
   ├─ Run tests (npm run test)
   ├─ If PASS: commit with witness tree + advance
   ├─ If FAIL: revert + ask Gemma4 for alternative approach
   └─ Max 3 retry attempts per error
   
6. CLOSURE & WITNESS
   ├─ Mark issue as resolved
   ├─ Store witness tree (proof of fix authority)
   ├─ Update docs if architectural change
   └─ Emit event: errors.issue_resolved
```

### Example Multi-Turn Workflow

**Error**: TypeScript compilation error in `src/lib/server/auth.ts:42`

```
TURN 1: Detect + Classify
  Error: "Property 'userId' does not exist on type 'Session'"
  Category: Type error
  Scope: src/lib/server/auth.ts
  
TURN 2: Gather Context
  - Load auth.ts (500 lines)
  - Fetch Session type definition (Neo4j + Postgres)
  - Load similar type-error fixes from doc archive
  - Budget tokens: 4000 available for prompt
  
TURN 3: Agentic Proposal
  Gemma4 proposes:
  - Tool 1: fetch Session type (atlas.packet.get)
  - Tool 2: search for userId field (atlas.search)
  - Tool 3: apply type fix inline (edit_patch_inline)
  
TURN 4: Validation
  - Apply patch: change `session.userId` → `session.user.id`
  - Run: npm run test src/lib/server/auth.test.ts
  - Result: PASS ✅
  
TURN 5: Closure
  - Commit with message: "fix(auth): correct Session type usage"
  - Record witness tree (tool calls + test results)
  - Close issue
```

---

## PART IV: MCP TOOL CALLING + OPENCODE INTEGRATION

### MCP Tools for Graphify + Agentic Workflows

**Current State**: 5 admin tools exist; graphify-specific tools missing.

**Required Tools** (to implement):

```typescript
// ===== GRAPHIFY TOOLS =====

// 1. listGraphifyStages
export const listGraphifyStages: MCPTool = {
  name: 'listGraphifyStages',
  description: 'List all graphify stages (0-14) with current status, gates, and metrics',
  inputSchema: {
    type: 'object',
    properties: {
      includeMetrics: { type: 'boolean', description: 'Include timing/gate details' }
    }
  },
  handler: async (input) => {
    // Fetch from admin DB: stages, gates, execution times
    // Return: [ { stageId, name, status, gatePass, timeMs, nextAction } ]
  }
};

// 2. executeGraphifyStage
export const executeGraphifyStage: MCPTool = {
  name: 'executeGraphifyStage',
  description: 'Execute a single graphify stage with optional dry-run',
  inputSchema: {
    type: 'object',
    properties: {
      stageId: { type: 'number', description: '1-5 or 6-14' },
      dryRun: { type: 'boolean', description: 'Dry-run mode (no writes)' },
      deltaOnly: { type: 'boolean', description: 'Only process changed files' }
    },
    required: ['stageId']
  },
  handler: async (input) => {
    // Spawn: node scripts/atlas/stageN-*.mjs
    // Capture stdout/stderr in real-time
    // Stream to WebSocket for dashboard updates
    // Return: { success, duration, gatePass, errorLog }
  }
};

// 3. getGraphifyMetrics
export const getGraphifyMetrics: MCPTool = {
  name: 'getGraphifyMetrics',
  description: 'Retrieve topology and clustering metrics',
  inputSchema: {
    type: 'object',
    properties: {
      metric: { type: 'string', enum: ['nodeCount', 'edgeCount', 'clusterCount', 'pageRankDistribution'] }
    }
  },
  handler: async (input) => {
    // Query Neo4j + Postgres for current state
    // Return: { nodes, edges, clusters, avgPageRank, topAuthority[] }
  }
};

// ===== ERROR FIXING TOOLS =====

// 4. claimIssue
export const claimIssue: MCPTool = {
  name: 'claimIssue',
  description: 'Claim an error/issue for fixing (exclusive lock until resolved)',
  inputSchema: {
    type: 'object',
    properties: {
      errorLocation: { type: 'string', description: 'file.ts:lineNumber' },
      errorType: { type: 'string', enum: ['type', 'runtime', 'logic', 'perf', 'security'] },
      maxRetries: { type: 'number', default: 3 }
    },
    required: ['errorLocation', 'errorType']
  },
  handler: async (input) => {
    // Create errors.issue_claimed row with agent_id lock
    // Prevent concurrent fixing of same issue
    // Return: { claimId, lockUntil, retryBudget }
  }
};

// 5. proposeErrorFix
export const proposeErrorFix: MCPTool = {
  name: 'proposeErrorFix',
  description: 'Propose a fix for an issue (via Gemma4 analysis)',
  inputSchema: {
    type: 'object',
    properties: {
      claimId: { type: 'string' },
      errorMessage: { type: 'string' },
      contextFiles: { type: 'array', items: { type: 'string' } },
      availableTools: { type: 'array', items: { type: 'string' } }
    },
    required: ['claimId', 'errorMessage']
  },
  handler: async (input) => {
    // Call Gemma4 with error + context + tool list
    // Gemma4 proposes fix + tool sequence
    // Store in errors.issue_proposal
    // Return: { proposalId, fixDescription, toolSequence }
  }
};

// 6. applyErrorFix
export const applyErrorFix: MCPTool = {
  name: 'applyErrorFix',
  description: 'Apply proposed fix and run validation tests',
  inputSchema: {
    type: 'object',
    properties: {
      proposalId: { type: 'string' },
      filePath: { type: 'string' },
      lineStart: { type: 'number' },
      lineEnd: { type: 'number' },
      replacement: { type: 'string' }
    },
    required: ['proposalId', 'filePath', 'replacement']
  },
  handler: async (input) => {
    // 1. Apply patch (EditPatchInline)
    // 2. Run tests
    // 3. If PASS: commit + witness
    // 4. If FAIL: return error for retry
    // Return: { success, testResults, newContent, witness }
  }
};

// ===== CONTEXT AWARENESS TOOLS =====

// 7. getEmbeddingContext
export const getEmbeddingContext: MCPTool = {
  name: 'getEmbeddingContext',
  description: 'Get semantic context (top-K similar symbols + cluster membership)',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'symbol_name to analyze' },
      topK: { type: 'number', default: 5 },
      includeClusters: { type: 'boolean', default: true }
    },
    required: ['symbol']
  },
  handler: async (input) => {
    // Query Qdrant for top-K similar embeddings
    // Query Neo4j for cluster membership + neighbors
    // Return: { symbol, similar[], clusters, centroidDistance }
  }
};

// 8. fetchDocumentation
export const fetchDocumentation: MCPTool = {
  name: 'fetchDocumentation',
  description: 'Fetch relevant API/reference docs from docs/ directory',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term or API name' },
      maxResults: { type: 'number', default: 3 }
    },
    required: ['query']
  },
  handler: async (input) => {
    // Search docs/ directory (BM25 or rg grep)
    // Return top-K markdown files
    // Truncate to token budget
    // Return: { docs: { filename, snippet, relevance }[] }
  }
};
```

### OpenCode Integration

**In `.opencode/opencode.jsonc`**:

```jsonc
{
  "mcp": {
    "graphify-orchestration": {
      "type": "local",
      "command": "node",
      "args": ["src/mcp/graphify-tools.ts"],
      "env": {
        "MCP_SERVER_PORT": "3050"
      }
    }
  },
  "tools": {
    "graphify.*": {
      "enable": true,
      "timeout_ms": 300000,
      "permissions": "operator"
    },
    "error_fixing.*": {
      "enable": true,
      "timeout_ms": 600000,
      "permissions": "operator"
    }
  }
}
```

---

## PART V: EMBEDDING TRUNCATION & TOKEN BUDGETING

### Dimension Strategy

**768-dim canonical**: Full semantic capacity (native embeddinggemma output)  
**384-dim retrieval**: Prefix truncation (retrieval only, not authority)  
**64-dim routing**: Latent space (AE-compressed, routing clusters only)  

### Token Remapping for Gemma4

**Context Window**: 65,536 tokens (gemma4-legal-iq4xs-direct.gguf)  
**Reserve**: 2000 tokens (buffer for completion)  

**Example Budget**:
```
Query: "how to validate session?" = 10 tokens
System prompt: 200 tokens
Retrieved context (10 chunks × 200 tokens/chunk): 2000 tokens
Total input: 2210 tokens
Available for completion: 65536 - 2210 - 2000 = 61,326 tokens

But we typically want shorter output:
- Set max_tokens=512 for concise summary
- Leaves 60,814 tokens unused (acceptable; provides safety margin)
```

### Multi-Vector Semantic Summarization

**Problem**: N vectors in cluster, need 1 summary vector.  
**Solution**: Average + store in Redis.

```typescript
async function computeClusterSummary(
  vectorIds: string[],
  redisClient: Redis,
  pgClient: PgPool
): Promise<Float32Array> {
  // 1. Fetch all vectors from Postgres
  const vectors = await pgClient.query(
    `SELECT content_embedding FROM codebase_chunk_index WHERE id = ANY($1)`,
    [vectorIds]
  );
  
  // 2. Compute element-wise mean
  const dim = 768;
  const summary = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (const vec of vectors.rows) {
      sum += vec.content_embedding[i];
    }
    summary[i] = sum / vectors.rows.length;
  }
  
  // 3. Store in Redis with expiry
  const key = `cluster_summary:${clusterId}:768`;
  const encoded = Buffer.from(summary.buffer).toString('base64');
  await redisClient.set(key, encoded, 'EX', 86400);  // 24 hours
  
  return summary;
}
```

### Prompt Engineering for Multi-Turn Workflows

**Goal**: Maximize context fidelity while staying within token budget.

**Strategy 1: Hierarchical Chunking**
```
System prompt (200 tokens)
├─ Top-level task description
├─ Tool list + constraints
└─ Example fix (if error fixing task)

Context (1000-2000 tokens)
├─ Error message + stack trace (200 tokens)
├─ Source code (500 tokens)
├─ Related tests (300 tokens)
└─ API docs (500 tokens)

Query (10-50 tokens)
└─ "Fix this error. Use tools: atlas.fetch, edit_patch_inline, test_runner"

Total: ~2000 tokens input, 512 tokens output = 2512 tokens used of 65536
```

**Strategy 2: Semantic Summarization**
```
Instead of full class definition, use cluster centroid:
  "SymbolNode type: represents code entities. Similar: UserSession, AuthToken, Account"
  (1 sentence vs. 20 lines of code)
```

**Strategy 3: Tool-Aware Filtering**
```
Only include API docs relevant to the error:
  Type error → fetch TypeScript docs
  Runtime error → fetch JS stdlib docs
  Test fail → fetch testing framework docs
```

---

## PART VI: DAILY GRAPHIFY DIRECTORY INDEXER

### Implementation Roadmap

**Phase 1: Delta Detection** (1-2 hours)
- Implement DeltaIndexer class
- SHA-256 file comparison + snapshot management
- Identify changed/new/deleted files
- Compute reverse dependency closure

**Phase 2: Partial Reindex** (2-3 hours)
- Stage 2: Extract structural facts for changed files only
- Stage 3: Embed only new symbols
- Stage 4: Update topology for changed symbols + impacted neighbors
- Stage 5: Recompute full PageRank (must be full-graph)

**Phase 3: Clustering on Schedule** (3-4 hours)
- Stage 6: K-means (daily, lightweight)
- Stage 7: SOM (weekly, expensive)
- Stage 8: Neo4j materialization

**Phase 4: Orchestration & Monitoring** (2-3 hours)
- daily-graphify-orchestrator.mjs (unified runner)
- Cron scheduling + error recovery
- Admin dashboard integration
- Slack/email alerting

### Key Files to Create

```
scripts/atlas/daily-graphify-orchestrator.mjs       (300 lines)
scripts/atlas/daily-graphify-config.json
scripts/atlas/helpers/DeltaIndexer.ts               (200 lines)
scripts/atlas/helpers/ContextWindowCalculator.ts   (100 lines)
scripts/atlas/helpers/VectorCentroidCache.ts       (150 lines)
scripts/atlas/helpers/TokenRemappingStrategy.ts    (120 lines)
scripts/atlas/helpers/SQLAlchemyToJsonRedis.ts     (180 lines)
scripts/atlas/helpers/EditPatchInline.ts           (250 lines)

sveltekit-frontend/src/mcp/tools/graphify/listStages.ts
sveltekit-frontend/src/mcp/tools/graphify/executeStage.ts
sveltekit-frontend/src/mcp/tools/graphify/getMetrics.ts
sveltekit-frontend/src/mcp/tools/error-fixing/claimIssue.ts
sveltekit-frontend/src/mcp/tools/error-fixing/proposeErrorFix.ts
sveltekit-frontend/src/mcp/tools/error-fixing/applyErrorFix.ts
sveltekit-frontend/src/mcp/tools/context/getEmbeddingContext.ts
sveltekit-frontend/src/mcp/tools/context/fetchDocumentation.ts

sveltekit-frontend/src/routes/(admin)/graphify/+page.svelte
sveltekit-frontend/src/routes/api/admin/graphify/status/+server.ts
sveltekit-frontend/src/routes/api/admin/graphify/execute/+server.ts
sveltekit-frontend/src/lib/components/graphify/StageStatusBoard.svelte
sveltekit-frontend/src/lib/components/graphify/TopologyViewer.svelte

docs/MASTER-AGENTIC-ORCHESTRATION-SPEC.md (this file)
docs/DAILY-GRAPHIFY-EXECUTION-LOG.md (runtime log, auto-generated)
```

---

## PART VII: EXECUTION CHECKLIST

### What We Have ✅
- Stages 1-3 complete (27.7K files, 65.5K symbols, 768-dim embeddings)
- Daily graphify scripts (5 variants)
- Admin dashboard + routes
- Admin tools in MCP
- Agentic error fixing concepts

### What We Need ❌
- **HIGH PRIORITY**:
  - [ ] Complete Stage 4 topology extraction (15 min runtime)
  - [ ] Implement daily orchestrator (45 min coding)
  - [ ] Create /admin/graphify dashboard (90 min)
  - [ ] Wire 8 MCP tools (60 min)
  - [ ] Implement helper classes (200 lines, 2-3 hours)

- **MEDIUM PRIORITY**:
  - [ ] Implement K-means clustering (Stage 6)
  - [ ] Implement SOM clustering (Stage 7)
  - [ ] Neo4j topology materialization (Stage 8)
  - [ ] Error fixing loop complete (multi-turn witness trees)

- **LOWER PRIORITY**:
  - [ ] AE (autoencoder) training for 64-dim latent
  - [ ] Production hardening (monitoring, alerting, rollback)
  - [ ] OKF export for Karpathy method

### Quick Win (Next 4 Hours)
```
1. Complete Stage 4 (15 min)
   → node scripts/atlas/stage4-topology-extraction-parallel.mjs
   
2. Run Stage 4b + 5 (10 min)
   → node scripts/atlas/stage4b-edge-endpoint-validation.mjs
   → node scripts/atlas/stage5-pagerank-authority-validated.mjs
   
3. Create orchestrator (45 min)
   → daily-graphify-orchestrator.mjs + config.json
   
4. Create /admin/graphify (90 min)
   → Dashboard page + API endpoints + status board
   
5. Wire MCP tools (60 min)
   → 8 tool implementations + MCP server registration

RESULT: Fully operational daily Graphify + agentic error fixing pipeline
```

---

**References**:
- Unified Retrieval: `docs/UNIFIED-RETRIEVAL-PIPELINE.md`
- Agentic Tracking: `docs/AGENTIC-TRACKING-LOOP-ARCHITECTURE.md`
- Atlas Architecture: `docs/ATLAS-ARCHITECTURE-DECISION-LANES-AND-CONTRACTS.md`
- Vector Governance: `docs/ARTIFACT-LIFECYCLE-GOVERNANCE.md`
