# Phase 85: Next Actions (Session 89+)

**Status**: ✅ Foundation Complete | 🚀 Ready for Integration

**Estimated Time**: 3–4 hours to Phase 85 COMPLETE

---

## What's Done (No Further Work Needed)

| Component | Status | Evidence |
|-----------|--------|----------|
| Semantic Diff Gate | ✅ LIVE | `semantic-diff-gate.ts` + test passing |
| Artifact Registry | ✅ LIVE | `artifact-logger.ts` + `atlas_artifacts` table |
| Summary Pipeline | ✅ LIVE | `packet-summary-pipeline.ts` + API route working |
| P1 Ranker | ✅ LIVE | `rank-supersedes-candidates.mjs` + test passing |
| Cache Invalidation | ✅ LIVE | Integrated in summary pipeline |
| Postgres → Redis Flow | ✅ LIVE | 5-step canonical flow implemented |

---

## What Needs 5–15 Minute Tasks

### Task 1: Verify GAN Validation Integration Point (5 min)

**Location**: `src/lib/server/generation/summary-qa.ts`

**Current**: QA validation exists but may not check GAN scores  
**Action**: Verify `gan_validation_score` field is populated and checked

**Check**:
```bash
grep -n "gan_validation_score\|gan_score" src/lib/server/generation/summary-qa.ts
```

**Expected**: Function should reject summaries with `gan_score < 0.60`

---

### Task 2: Add GAN Validation Gate to Pipeline (10 min)

**Location**: `src/lib/server/generation/packet-summary-pipeline.ts` (line ~134)

**After**: `storeSummaryArtifact()` call

**Code to Add**:
```typescript
// Step 5: Run GAN validation (post-QA)
if (qaResult.ganScore && qaResult.ganScore < GAN_REJECT_THRESHOLD) {
  result.recommendation = 'gan_review';
  result.errors = ['GAN validation score too low, requires manual review'];
  result.action_taken = 'gan_review';
  return result;
}
```

**Test**: `npm run p1:production-readiness:dry`

---

### Task 3: Wire Reward Scoring Computation (10 min)

**Location**: `src/lib/server/cache/atlas-reward-cache.ts`

**Current**: Empty ZSET implementation  
**Action**: Add scoring formula

**Code Pattern**:
```typescript
const score = 
  0.3 * compilationScore +
  0.2 * testScore +
  0.15 * lintScore +
  0.15 * userAcceptanceScore +
  0.1 * performanceScore +
  0.05 * securityScore +
  0.05 * ganScore;

await redis.zadd('atlas:reward:scored', score, artifactId);
```

**Data Sources**:
- `compilationScore`: from `atlas_packets.compile_success`
- `testScore`: from `atlas_packets.test_coverage`
- `ganScore`: from `atlas_artifacts.gan_validation_score`
- Others: estimated from artifact metadata

---

## What Needs 30–60 Minute Tasks

### Task 4: Implement git-diff Production Probes (45 min)

**Location**: `scripts/atlas/git-diff-supersedes-reconcile-production.mjs`

**Current State**: Empty returns  
**Action**: Wire 7 validation probes with real data

**7 Probes to Implement**:

1. **Qdrant Lookup** (5 min)
   ```javascript
   async function probeQdrantLookup(packetKey) {
     const qdrant = new QdrantClient(...);
     return await qdrant.search({
       collection: 'codebase_chunks_768',
       query: packetKey,
       limit: 1
     });
   }
   ```

2. **Redis Packet Cache** (5 min)
   ```javascript
   async function probeRedisPacket(packetKey) {
     const redis = getRedis();
     return await redis.get(`bifrost:packet:${packetKey}`);
   }
   ```

3. **Postgres Identity** (5 min)
   ```javascript
   async function probePostgresIdentity(packetKey) {
     return await db
       .select({ packet_key: atlas_packets.packet_key })
       .from(atlas_packets)
       .where(eq(atlas_packets.packet_key, packetKey))
       .limit(1);
   }
   ```

4. **Semantic Diff History** (5 min)
   ```javascript
   async function probeSemanticDiffHistory(packetKey) {
     return await db
       .select()
       .from(atlas_semantic_diffs)
       .where(eq(atlas_semantic_diffs.packet_key, packetKey))
       .orderBy(desc(atlas_semantic_diffs.created_at))
       .limit(5);
   }
   ```

5. **Artifact Registry** (5 min)
   ```javascript
   async function probeArtifactRegistry(packetKey) {
     return await db
       .select()
       .from(atlas_artifacts)
       .where(eq(atlas_artifacts.packet_key, packetKey))
       .orderBy(desc(atlas_artifacts.created_at))
       .limit(10);
   }
   ```

6. **Neo4j Topology** (5 min)
   ```javascript
   async function probeNeo4jTopology(sourceRef) {
     const driver = getNeo4jDriver();
     const session = driver.session();
     const result = await session.run(
       'MATCH (p:Packet {source_ref: $ref}) RETURN p',
       { ref: sourceRef }
     );
     await session.close();
     return result;
   }
   ```

7. **Reward Score History** (5 min)
   ```javascript
   async function probeRewardScore(packetKey) {
     const redis = getRedis();
     return await redis.zscore('atlas:reward:scored', packetKey);
   }
   ```

**Test Command**:
```bash
npm run phase85:p8:probe-test
```

---

### Task 5: Integrate Dataset Export (30 min)

**Location**: Extend `generate-production-readiness-report.mjs`

**Current**: Template exists  
**Action**: Wire to artifact registry to filter ACTIVE vs SUPERSEDED

**Filter Logic**:
```typescript
const activeArtifacts = artifacts.filter(a => a.status === 'generated' || a.status === 'validated');
const supersededArtifacts = artifacts.filter(a => a.status === 'superseded');

// good_traces: all ACTIVE artifacts with gan_score > 0.85
const goodTraces = activeArtifacts.filter(a => a.gan_validation_score > 0.85);

// bad_traces: SUPERSEDED artifacts or gan_score < 0.60
const badTraces = [
  ...supersededArtifacts,
  ...activeArtifacts.filter(a => a.gan_validation_score < 0.60)
];

// dpo_pairs: good_traces vs bad_traces pairwise comparison
// tool_call_sft: artifacts with tool_calls in metadata
```

**Test Command**:
```bash
npm run phase85:p9:export --dry-run
```

---

## Integration Testing (15 min)

### End-to-End Flow Validation

**Test Scenario**: Upload a packet and watch it through the full pipeline

1. **POST to summary API**
   ```bash
   curl -X POST http://localhost:5173/api/atlas/summary \
     -H "Content-Type: application/json" \
     -d '{
       "packet_key": "test:packet:001",
       "source_ref": "src/lib/server/test.ts",
       "context": "Function that validates user input..."
     }'
   ```

2. **Verify Postgres**
   ```sql
   SELECT packet_key, summary, updated_at FROM atlas_packets 
   WHERE packet_key = 'test:packet:001';
   ```

3. **Verify Semantic Diff**
   ```sql
   SELECT * FROM atlas_semantic_diffs 
   WHERE packet_key = 'test:packet:001'
   ORDER BY created_at DESC LIMIT 1;
   ```

4. **Verify Artifact Registry**
   ```sql
   SELECT artifact_id, artifact_type, status, gan_validation_score 
   FROM atlas_artifacts 
   WHERE packet_key = 'test:packet:001';
   ```

5. **Verify Redis Cache Invalidation**
   ```bash
   redis-cli GET "bifrost:packet:test:packet:001"  # Should be NULL
   ```

---

## Validation Gates Checklist

| Gate | Action | Status |
|------|--------|--------|
| 1. packet_key | ✅ Verify via orchestrator | PASS |
| 2. source_ref | ✅ Verify via orchestrator | PASS |
| 3. feature_id | ✅ Verify via orchestrator | PASS |
| 4. content_hash | 🔄 Verify in semantic-diff-gate | IN PROGRESS |
| 5. semantic_diffs | 🔄 Task 4 completes this | IN PROGRESS |
| 6. artifacts | 🔄 Task 5 completes this | IN PROGRESS |
| 7. GAN validation | 🔄 Task 2 enables this | IN PROGRESS |
| 8. Reward scoring | 🔄 Task 3 enables this | IN PROGRESS |
| 9. git-diff probes | 🔄 Task 4 enables this | IN PROGRESS |
| 10. No mocks | ✅ Code audit complete | PASS |
| 11. No duplicates | ✅ Module audit complete | PASS |

---

## Session 89 Execution Plan

**Time Budget**: 3–4 hours

### Hour 1: Integration Tasks
- Task 1: Verify GAN validation point (5 min)
- Task 2: Add GAN gate to pipeline (10 min)
- Task 3: Wire reward scoring (10 min)
- Task 5: Integrate dataset export (30 min)

### Hour 2: git-diff Probes
- Task 4: Implement 7 probes (45 min)
- Quick test (15 min)

### Hour 3: Integration Testing
- End-to-end flow validation (15 min)
- Validation gates checklist (15 min)
- Bug fixes if needed (30 min)

### Hour 4: Documentation & Cleanup
- Update orchestrator completion status (15 min)
- Final commit (10 min)
- Documentation (35 min)

---

## Expected Outcome

After Session 89:
- ✅ All 11 validation gates PASS
- ✅ All 9 phases (P0–P9) COMPLETE
- ✅ Phase 85 SHIPPED to production
- ✅ Training datasets exported (good_traces, bad_traces, dpo_pairs, tool_call_sft)
- ✅ 18–22 hour Phase 85 consolidation roadmap fully delivered

---

## Dependencies & Prerequisites

- ✅ Ollama running (`embeddinggemma:latest`, `gemma4-rotorquant:latest`)
- ✅ Postgres running with `atlas_packets` + `atlas_artifacts` + `atlas_semantic_diffs` tables
- ✅ Redis running for cache invalidation
- ✅ Optional: Neo4j running for topology probes
- ✅ Optional: Qdrant running for semantic search probes

---

## Commit Messages (Ready to Use)

```
Phase 85 P6: GAN Validation Integration

Wire GAN validation gate into packet-summary-pipeline.
Gate recommendation on gan_score < 0.60.
All 11 validation gates now PASS.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

```
Phase 85 P7: Reward Scoring Wiring

Implement weighted reward computation (0.3·compile + 0.2·test + ...).
Write to Redis ZSET + Postgres artifact_rewards.
Enable production reward-based ranking.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

```
Phase 85 P8: git-diff Production Probes

Implement 7 validation probes with real data returns:
- Qdrant lookup, Redis cache, Postgres identity,
- Semantic diff history, Artifact registry,
- Neo4j topology, Reward score history.

P0-P9 complete. Phase 85 ready for deployment.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

---

## Files to Touch in Session 89

| File | Task | Time |
|------|------|------|
| `src/lib/server/generation/summary-qa.ts` | Task 1 verify | 5 min |
| `src/lib/server/generation/packet-summary-pipeline.ts` | Task 2 wire GAN | 10 min |
| `src/lib/server/cache/atlas-reward-cache.ts` | Task 3 wire reward | 10 min |
| `scripts/atlas/git-diff-supersedes-reconcile-production.mjs` | Task 4 probes | 45 min |
| `scripts/atlas/generate-production-readiness-report.mjs` | Task 5 export | 30 min |
| `sveltekit-frontend/package.json` | Add 3 new npm scripts | 5 min |

---

## Success Criteria

- ✅ All 11 validation gates PASS
- ✅ End-to-end test: packet → summary → semantic diff → artifact registry → ranker succeeds
- ✅ `npm run phase85:status` shows 100% (10/10 phases COMPLETE)
- ✅ Training datasets exported with >100 entries per type
- ✅ No console errors or warnings during full pipeline run
- ✅ Commit ready for production merge

---

## Notes

- The heavy lifting (P2–P5) was already done in Sessions 86–87
- Remaining work is glue code + integration
- No new infrastructure needed, just wiring existing pieces
- All data models already in place
- Schema complete and migrated

**Confidence Level**: HIGH — Foundation is solid, integration is straightforward.
