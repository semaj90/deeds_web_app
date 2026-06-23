---
name: Proof of Truth Skill Tests
description: Modular skill tests for Parent Atlas verification (replay, cache, live app, cubic). story_id wired through ACP→Graphify→Karpathy→Parent Atlas. Executable via npm + startup tasks.
type: skill
---

## Modular Skill Tests: Proof of Truth Verification

Every skill test is **modular**, **reusable**, and **wired to story_id** for proof tracking.

---

## Skill 1: Replay Proof Test

**Purpose**: Verify packet identity survival across 50 golden queries.

**Inputs**:
- `story_id` (e.g., `ATLAS-REPLAY-001`)
- `golden_queries` (50 diverse queries from known buckets)
- `expected_coverage` (95% for packet_key, feature_id, source_ref)

**Execution**:
```bash
npm run skill:replay-proof -- \
  --story-id=ATLAS-REPLAY-001 \
  --queries=golden_50 \
  --dry-run
```

**Outputs**:
```json
{
  "story_id": "ATLAS-REPLAY-001",
  "test_type": "replay_proof",
  "query_count": 50,
  "verdicts": {
    "packet_key_coverage": 0.97,
    "feature_id_coverage": 0.97,
    "source_ref_coverage": 0.97,
    "qdrant_hit_coverage": 0.85,
    "avg_latency_ms": 1247,
    "verdict": "PASS"
  },
  "timestamp": "2026-06-22T..."
}
```

**Script**: `scripts/skills/replay-proof-test.mjs`

---

## Skill 2: Cache Proof Test (CRITICAL)

**Purpose**: Measure cache effectiveness (cold → warm → compare).

**Inputs**:
- `story_id` (e.g., `ATLAS-CACHE-001`)
- `golden_queries` (50 queries)
- `cache_tiers` (redis_exact, bifrost_semantic, live_fusion)

**Execution**:
```bash
npm run skill:cache-proof -- \
  --story-id=ATLAS-CACHE-001 \
  --queries=golden_50 \
  --flush-cache \
  --dry-run
```

**Process**:
1. Flush Redis + Bifrost
2. Run 50 queries (cold baseline)
3. Cache automatically warms
4. Run same 50 queries again (warm)
5. Compare latency + cache hit rate

**Outputs**:
```json
{
  "story_id": "ATLAS-CACHE-001",
  "test_type": "cache_proof",
  "cold_avg_latency_ms": 2500,
  "warm_avg_latency_ms": 625,
  "cache_hit_ratio": 0.72,
  "L1_hit_ratio": 0.25,
  "L2_hit_ratio": 0.47,
  "latency_improvement_x": 4.0,
  "cache_namespaces": ["packet:qdrant", "bifrost:semantic"],
  "verdict": "PASS"
}
```

**Script**: `scripts/skills/cache-proof-test.mjs`

---

## Skill 3: Live App Proof Test

**Purpose**: Verify identity survival end-to-end (OpenCode → ACE → Gemma4).

**Inputs**:
- `story_id` (e.g., `ATLAS-LIVE-APP-001`)
- `test_queries` (5 representative queries)
- `verify_stages` (opencode, acp, trace_mcp, router, hyperrag, ace, gemma4)

**Execution**:
```bash
npm run skill:live-app-proof -- \
  --story-id=ATLAS-LIVE-APP-001 \
  --queries=auth_handler,db_schema,api_routes,state_mgmt,error_handling \
  --verify-all \
  --dry-run
```

**Process**:
1. Send query through ACP → TRACE MCP
2. Router selects lanes
3. HyperRAG retrieves packets
4. ACE assembles context
5. Gemma4 synthesizes answer
6. Verify identity fields survive at each stage

**Outputs**:
```json
{
  "story_id": "ATLAS-LIVE-APP-001",
  "test_type": "live_app_proof",
  "queries": [
    {
      "query": "what is the auth handler?",
      "acp_time_ms": 50,
      "trace_mcp_time_ms": 100,
      "router_time_ms": 25,
      "hyperrag_time_ms": 1200,
      "ace_time_ms": 300,
      "gemma4_time_ms": 2000,
      "total_time_ms": 3675,
      "packet_key_count": 7,
      "source_ref_count": 7,
      "feature_id_count": 7,
      "citation_valid": true,
      "response_json_valid": true,
      "verdict": "PASS"
    }
  ],
  "verdict": "PASS"
}
```

**Script**: `scripts/skills/live-app-proof-test.mjs`

---

## Skill 4: Cubic Adversarial Test

**Purpose**: Red-team across 4 axes (boundary, repeated execution, dependencies, identity corruption).

**Inputs**:
- `story_id` (e.g., `ATLAS-CUBIC-001`)
- `axes` (x, y, z, w)
- `test_suites` (32 total: 8 per axis)

**Execution**:
```bash
npm run skill:cubic-test -- \
  --story-id=ATLAS-CUBIC-001 \
  --axes=all \
  --verbose \
  --dry-run
```

### X Axis: Boundary Conditions
```bash
npm run skill:cubic-test -- \
  --story-id=ATLAS-CUBIC-001 \
  --axis=x \
  --tests=empty_query,max_query,invalid_json,wrong_embedding_dims,missing_packet,nonexistent_packet,malformed_sourceref,null_feature_id
```

**Test cases**:
- Empty query "" → graceful rejection
- Max query (10K chars) → handled
- Invalid JSON → Zod validation rejects
- Wrong embedding dims (not 768) → error + fallback
- Missing packet_key → rejected
- Nonexistent packet_key → 404 logged
- Malformed source_ref → normalized or rejected
- Null feature_id → error with context

### Y Axis: Repeated Execution
```bash
npm run skill:cubic-test -- \
  --story-id=ATLAS-CUBIC-001 \
  --axis=y \
  --tests=run_10x,restart_server,restart_redis,deterministic_results
```

**Test cases**:
- Run same query 10×, verify cache improves each time
- Restart llama-server mid-batch, verify recovery
- Restart Redis mid-batch, verify fallback to Bifrost
- Two full replays of 50 queries, verify same packet_key order

### Z Axis: Dependency Failures
```bash
npm run skill:cubic-test -- \
  --story-id=ATLAS-CUBIC-001 \
  --axis=z \
  --tests=redis_offline,bifrost_offline,qdrant_offline,neo4j_offline,docker_restart
```

**Test cases**:
- Redis offline → L2 Bifrost activates, latency increases
- Bifrost offline → L3 live fusion activates
- Qdrant offline → Neo4j + BM25 fallback
- Neo4j offline → BM25 + Qdrant still work
- Docker restart → system recovers within 30s

### W Axis: Identity Corruption (CRITICAL)
```bash
npm run skill:cubic-test -- \
  --story-id=ATLAS-CUBIC-001 \
  --axis=w \
  --tests=missing_packet_key,duplicate_sourceref,stale_feature_id,wrong_qdrant_point,generated_sourceref,broken_canonical,orphan_packet,lane_mismatch
```

**Test cases**:
- Missing packet_key in result → reject + log
- Duplicate source_ref (two packets) → ambiguity detected
- Stale feature_id → lineage check fails
- Wrong qdrant_point_id → join integrity fails
- Generated sourceRef (synthetic) → flag non-canonical
- Broken canonical_source_ref → regex validation fails
- Orphan packet (missing source_ref) → rejection
- identity_lane mismatch (qdrant_chunk but NULL point_id) → detected

**Outputs**:
```json
{
  "story_id": "ATLAS-CUBIC-001",
  "test_type": "cubic_adversarial",
  "axes": {
    "x": {
      "name": "boundary_conditions",
      "test_count": 8,
      "pass_count": 8,
      "verdict": "PASS"
    },
    "y": {
      "name": "repeated_execution",
      "test_count": 4,
      "pass_count": 4,
      "verdict": "PASS"
    },
    "z": {
      "name": "dependency_failures",
      "test_count": 5,
      "pass_count": 5,
      "graceful_degradation": true,
      "fallback_recorded": true,
      "verdict": "PASS"
    },
    "w": {
      "name": "identity_corruption",
      "test_count": 8,
      "pass_count": 8,
      "corruption_detected": 8,
      "verdict": "PASS"
    }
  },
  "overall_cubic_verdict": "PASS"
}
```

**Script**: `scripts/skills/cubic-adversarial-test.mjs`

---

## Integration: Wire story_id Through the Stack

### 1. ACP Entry Point
```typescript
// src/routes/api/acp/execute/+server.ts
export async function POST({ request }) {
  const { query, story_id, task_id, worker_id } = await request.json();
  
  const trace_id = crypto.randomUUID();
  const context = {
    story_id,      // ← propagate
    task_id,       // ← propagate
    worker_id,     // ← propagate
    trace_id,      // ← generate
    query,
    timestamp: Date.now()
  };
  
  // Pass context to TRACE MCP
  const mcp_request = {
    jsonrpc: '2.0',
    method: 'atlas.search',
    params: context,
    id: trace_id
  };
  
  // ... call TRACE MCP :8788
}
```

### 2. TRACE MCP (Graphify)
```typescript
// src/mcp/handlers/atlas-search.ts
export async function atlasSearch(params) {
  const { story_id, task_id, worker_id, trace_id, query } = params;
  
  // Record story context
  await recordStoryProof({
    story_id,
    task_id,
    worker_id,
    trace_id,
    stage: 'trace_mcp',
    action: 'atlas.search'
  });
  
  // Graphify lookup
  const graphify_result = await graphify.search(query, {
    story_id,
    trace_id
  });
  
  return {
    story_id,
    trace_id,
    packets: graphify_result,
    proof_source: 'trace_mcp'
  };
}
```

### 3. Adaptive Router (Karpathy)
```typescript
// src/lib/server/ace/adaptive-router.ts
export async function selectLanes(context) {
  const { story_id, task_id, trace_id, query } = context;
  
  // Karpathy blend reads from Redis
  const karpathy_scores = await redis.hgetall(`gpu:karpathy:scores`);
  
  // Router logs decision with story_id
  const decision = {
    story_id,
    trace_id,
    lane_weights: {
      bm25: 0.35,
      qdrant: 0.35,
      neo4j: 0.25,
      redis: 0.05
    },
    retrieval_strategy: 'hyperrag_fusion'
  };
  
  await recordStoryProof({
    story_id,
    task_id,
    trace_id,
    stage: 'adaptive_router',
    decision
  });
  
  return decision;
}
```

### 4. Parent Atlas Packet RPC
```typescript
// sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts
export async function POST({ request }) {
  const { story_id, task_id, trace_id, query } = await request.json();
  
  const results = await hyperrag.search(query, {
    story_id,
    trace_id
  });
  
  // Bind story_id to provenance
  for (const packet of results.packets) {
    packet.story_id = story_id;
    packet.task_id = task_id;
    packet.trace_id = trace_id;
  }
  
  // Write provenance with story binding
  await db.insert(retrieval_eval_times).values({
    trace_id,
    story_id,
    task_id,
    worker_id: 'sveltekit-frontend',
    packet_key: packet.packet_key,
    feature_id: packet.feature_id,
    source_ref: packet.source_ref,
    cache_namespace: packet.cache_namespace,
    cache_hit_source: results.cache_source,
    retrieval_path: results.retrieval_lanes,
    retrieved_at: new Date(),
    retrieval_confidence: packet.confidence
  });
  
  return json({
    story_id,
    trace_id,
    packets: results.packets,
    contributors: results.contributors,
    proof_status: 'PASS'
  });
}
```

---

## Startup Task Integration

Wire skill tests into startup tasks. Add to `sveltekit-frontend/package.json`:

```json
{
  "scripts": {
    "skill:replay-proof": "node scripts/skills/replay-proof-test.mjs",
    "skill:cache-proof": "node scripts/skills/cache-proof-test.mjs",
    "skill:live-app-proof": "node scripts/skills/live-app-proof-test.mjs",
    "skill:cubic-test": "node scripts/skills/cubic-adversarial-test.mjs",
    "skill:all-proofs": "npm run skill:replay-proof && npm run skill:cache-proof && npm run skill:live-app-proof && npm run skill:cubic-test",
    "startup:proof-of-truth": "node scripts/startup/proof-of-truth-startup.mjs"
  }
}
```

**Startup task** (`scripts/startup/proof-of-truth-startup.mjs`):
```javascript
#!/usr/bin/env node

import { execSync } from 'child_process';

const STORY_ID = `ATLAS-STARTUP-${Date.now()}`;

console.log(`🧪 Proof of Truth Verification Suite`);
console.log(`   Story ID: ${STORY_ID}\n`);

try {
  console.log(`Lane 1: Replay Proof...`);
  execSync(`npm run skill:replay-proof -- --story-id=${STORY_ID}-REPLAY --queries=golden_50`);
  
  console.log(`\nLane 2: Cache Proof...`);
  execSync(`npm run skill:cache-proof -- --story-id=${STORY_ID}-CACHE --queries=golden_50`);
  
  console.log(`\nLane 3: Live App Proof...`);
  execSync(`npm run skill:live-app-proof -- --story-id=${STORY_ID}-LIVE --queries=5`);
  
  console.log(`\nLane 4: Cubic Adversarial Test...`);
  execSync(`npm run skill:cubic-test -- --story-id=${STORY_ID}-CUBIC --axes=all`);
  
  console.log(`\n✅ All proof lanes completed. Story ID: ${STORY_ID}`);
} catch (error) {
  console.error(`❌ Proof verification failed:`, error.message);
  process.exit(1);
}
```

---

## Usage Examples

**Run all proofs for a feature**:
```bash
npm run skill:all-proofs -- --story-id=ATLAS-P1-FEATURE-ENVELOPE
```

**Run single proof (dry-run)**:
```bash
npm run skill:replay-proof -- \
  --story-id=ATLAS-REPLAY-001 \
  --queries=golden_50 \
  --dry-run
```

**Run cubic test on specific axis**:
```bash
npm run skill:cubic-test -- \
  --story-id=ATLAS-CUBIC-001 \
  --axis=w \
  --verbose
```

**Run from startup**:
```bash
npm run startup:proof-of-truth
```

---

## story_id Tracking in Postgres

Create proof recording table:

```sql
CREATE TABLE atlas_story_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id TEXT NOT NULL REFERENCES atlas_feature_story(story_id),
  task_id TEXT,
  trace_id TEXT NOT NULL,
  stage TEXT NOT NULL, -- 'acp', 'trace_mcp', 'router', 'hyperrag', 'ace', 'gemma4'
  action TEXT,
  proof_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_atlas_story_proofs_story_id ON atlas_story_proofs(story_id);
CREATE INDEX idx_atlas_story_proofs_trace_id ON atlas_story_proofs(trace_id);
CREATE INDEX idx_atlas_story_proofs_stage ON atlas_story_proofs(stage);
```

Every skill test writes to this table, creating a complete audit trail of the proof journey.

---

**Status**: Skill test framework designed, ready for implementation.
**Next**: Create `scripts/skills/` directory with 4 modular test scripts.
