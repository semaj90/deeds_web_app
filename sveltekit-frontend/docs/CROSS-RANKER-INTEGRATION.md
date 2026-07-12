# Cross-Ranker Integration Guide

**Estimated effort**: 1-2 hours | **Status**: Ready for Phase 3 integration

## Pre-Integration Checklist

- [ ] Read `CROSS-RANKER-API.md` (complete API contract)
- [ ] Tests passing: `npm run test:cross-ranker` (should show 44/44 passing)
- [ ] Files in place:
  - [ ] `src/lib/server/retrieval/cross-ranker.ts` (350 lines)
  - [ ] `src/lib/server/retrieval/__tests__/cross-ranker.test.ts` (350 lines)
  - [ ] `drizzle/0150_unified_cross_ranker.sql` (migration)

## Step 1: Database Migration

Apply schema migration to create output tables:

```bash
# Verify migration file exists
ls -la sveltekit-frontend/drizzle/0150_unified_cross_ranker.sql

# Apply to database
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < \
  sveltekit-frontend/drizzle/0150_unified_cross_ranker.sql

# Verify tables created
npm run db:verify:cross-ranker
# Expected output:
#  tablename | semantic_top_k
#  tablename | retrieval_decision_log
#  viewname  | v_packet_topology_scores
```

## Step 2: Inject Cross-Ranker into Retrieval Orchestrator

Edit `src/lib/server/retrieval/unified-orchestrator.ts`:

### 2a. Add import

```typescript
import { executeUnifiedCrossRanking } from './cross-ranker.js';
import type { CrossRankerInput, CrossRankerOutput } from './cross-ranker.js';
```

### 2b. Create wrapper function

Add this function to the orchestrator:

```typescript
/**
 * Execute unified retrieval with cross-ranking
 * Pipeline: Qdrant → Cross-Ranker → Persist → Return
 */
export async function executeUnifiedRetrievalWithCrossRanking(
  request: RetrievalRequest,
  config: RetrievalConfig = DEFAULT_CONFIG
): Promise<RetrievalResult & { cross_ranker_output?: CrossRankerOutput }> {
  const startTime = Date.now();
  const timing: Record<string, number> = {};

  try {
    // Stage 1: Embedding
    let stageStart = Date.now();
    const embedding = await generateEmbedding(request.query, config);
    timing.embedding = Date.now() - stageStart;

    // Stage 2: Qdrant Search
    stageStart = Date.now();
    const qdrantResults = await qdrantSearch(
      embedding,
      config,
      request.useRRF !== false,
      request.useLexical === true
    );
    timing.qdrant_search = Date.now() - stageStart;

    // Stage 3: Cross-Ranker (NEW)
    stageStart = Date.now();
    const crossRankerOutput = await executeUnifiedCrossRanking(
      {
        query: request.query,
        qdrant_top_k: qdrantResults.map(r => ({
          packet_key: r.id,
          qdrant_score: r.score,
          point_id: r.id,
          payload: r.payload
        })),
        limit: request.limit || 10,
        include_evidence: true
      },
      {
        db: getDb(), // Use existing db client
        neo4j_enabled: false,
        blend_weights: {
          semantic: 0.40,
          lexical: 0.30,
          topology: 0.20,
          naive_bayes: 0.10
        }
      }
    );
    timing.cross_ranker = Date.now() - stageStart;

    // Convert cross-ranker output back to RankedCandidate format
    const candidates: RankedCandidate[] = crossRankerOutput.ranked_results.map(r => ({
      id: r.packet_key,
      score: r.rerank_score,
      path: r.metadata.file_path || r.packet_key,
      symbol: r.metadata.source_ref || '',
      kind: 'chunk',
      ranks: {
        qdrant_dense: r.component_scores.semantic,
        rg_lexical: r.component_scores.lexical,
        ast_relation: r.component_scores.topology
      },
      rg_matches: 0
    }));

    const totalTime = Date.now() - startTime;

    return {
      candidates,
      timing: {
        ...timing,
        total: totalTime
      },
      stages_completed: [
        'embedding',
        'qdrant_search',
        'cross_ranker'
      ],
      fallback_used: false,
      cross_ranker_output: crossRankerOutput
    };
  } catch (err) {
    console.error('[Retrieval] Cross-ranker error:', err);
    throw err;
  }
}
```

### 2c. Update API route (optional)

Edit `src/routes/api/retrieval/unified/+server.ts` to add query parameter:

```typescript
const useRanker = url.searchParams.get('ranker') === 'cross' || request.body?.useRanker === true;

if (useRanker) {
  const result = await executeUnifiedRetrievalWithCrossRanking(request);
  return new Response(JSON.stringify(result), { status: 200 });
} else {
  const result = await executeUnifiedRetrieval(request);
  return new Response(JSON.stringify(result), { status: 200 });
}
```

## Step 3: Wire into Evaluation Runner

For Phase 3 evaluation, you'll measure ranking quality. Add cross-ranker to the evaluation pipeline:

```typescript
// scripts/phase3-evaluation-runner.mts
import { executeUnifiedCrossRanking } from '$lib/server/retrieval/cross-ranker';

const evaluationPhase3 = async (queries: string[], groundTruth: Map<string, string[]>) => {
  const results = [];

  for (const query of queries) {
    // 1. Get Qdrant baseline
    const qdrantCandidates = await getQdrantResults(query, 20);

    // 2. Run cross-ranker
    const rankerOutput = await executeUnifiedCrossRanking({
      query,
      qdrant_top_k: qdrantCandidates,
      include_evidence: true
    }, { db });

    // 3. Compute metrics
    const trueLabels = groundTruth.get(query) || [];
    const ndcg = computeNDCG(rankerOutput.ranked_results, trueLabels);
    const mrr = computeMRR(rankerOutput.ranked_results, trueLabels);
    const precision_at_k = computePrecisionAtK(rankerOutput.ranked_results, trueLabels, 5);

    results.push({
      query,
      ndcg,
      mrr,
      precision_at_k,
      duration_ms: rankerOutput.metrics.duration_ms,
      stage_timings: rankerOutput.metrics.stage_timings
    });
  }

  return results;
};
```

## Step 4: Verification

### 4a. Run unit tests

```bash
npm run test:cross-ranker
# Expected: 44 passing, 0 failing
```

### 4b. Check database

```bash
npm run db:inspect:semantic-top-k
# Expected output:
# total_records | unique_queries | avg_score
#            0 |              0 | null  (empty after first run)
```

### 4c. Test integration (requires dev server running)

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Test cross-ranker endpoint
npm run retrieval:cross-ranker:test
# Expected: JSON output with ranked_results array
```

### 4d. Watch metrics

```bash
npm run retrieval:cross-ranker:metrics:watch
# Shows live ranking metrics (refreshes every 5s)
```

## Step 5: Performance Baseline

Establish baseline metrics before making any changes:

```bash
# Run smoke test
npm run smoke:cross-ranker

# Capture baseline
npm run analytics:cross-ranker:score-distribution > baseline-score-distribution.txt
npm run analytics:cross-ranker:latencies > baseline-latencies.txt

# Archive for comparison
mkdir -p logs/baseline
cp baseline-*.txt logs/baseline/$(date +%Y%m%d-%H%M%S)/
```

## Step 6: Tuning (Optional)

### Adjust blend weights

If you want semantic to be more important:

```typescript
const deps = {
  db,
  blend_weights: {
    semantic: 0.50,    // ← increased from 0.40
    lexical: 0.25,     // ← decreased from 0.30
    topology: 0.15,    // ← decreased from 0.20
    naive_bayes: 0.10
  }
};
```

Re-run evaluation and compare metrics:

```bash
npm run analytics:cross-ranker:score-distribution > new-score-distribution.txt
diff -u baseline-score-distribution.txt new-score-distribution.txt
```

### Adjust Naive Bayes thresholds

For more confident scores:

```typescript
const deps = {
  db,
  naive_bayes_weights: {
    default_confidence: 0.6,   // ← increased from 0.5
    high_semantic: 0.9,        // ← increased from 0.8
    low_semantic: 0.2,
    sparse_bm25: 0.3
  }
};
```

## Step 7: Monitor in Production

### Daily health checks

```bash
# Run each morning
npm run smoke:cross-ranker:all

# Check error rate
npm run analytics:cross-ranker:top-queries
# If > 5% decision_type='error', investigate
```

### Weekly review

```bash
# Check score distribution
npm run analytics:cross-ranker:score-distribution

# Check latencies
npm run analytics:cross-ranker:latencies

# Archive metrics
npm run db:inspect:decision-log
```

### Monthly cleanup

```bash
# Remove old results (>7 days)
npm run db:clean:semantic-top-k

# Verify schema integrity
npm run db:verify:cross-ranker
```

## Troubleshooting

### Issue: Tests failing after integration

**Symptom**: `npm run test:cross-ranker` shows <44 passing

**Cause**: Database connection issue or schema not applied

**Fix**:
```bash
npm run db:verify:cross-ranker
npm run db:migrate:cross-ranker
npm run test:cross-ranker
```

### Issue: Cross-ranker endpoint 500 errors

**Symptom**: `npm run retrieval:cross-ranker:test` returns 500

**Cause**: Database, Qdrant, or Postgres down

**Fix**:
```bash
# Check database
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1"

# Check Qdrant
curl -s http://127.0.0.1:6333/health | jq '.'

# Check Postgres
curl -s http://localhost:5173/api/health | jq '.postgres'
```

### Issue: Slow ranking (>1 second)

**Symptom**: `metrics.duration_ms > 1000`

**Cause**: Large qdrant_top_k (100+ candidates) or Postgres slow query

**Fix**:
1. Reduce input size: `limit: 20` instead of `100`
2. Check Postgres indexes: `npm run db:inspect:semantic-top-k`
3. Check stage timings: `metrics.stage_timings.{bm25_fetch, topology_fetch, persistence}`

### Issue: Low avg_confidence (<0.4)

**Symptom**: `metrics.metrics.confidence < 0.4`

**Cause**: Weak Naive Bayes heuristic or poor Qdrant results

**Fix**:
1. Increase `high_semantic` threshold: `0.8 → 0.9`
2. Boost complete metadata: multiply confidence by 1.2 if both summary and source_ref exist
3. Collect ground truth and train supervised model (Phase 4+)

## Next Steps

After integration, you can:

1. **Collect ground truth** — Log user feedback on ranking quality
2. **Train supervised model** — Use LambdaMART or LightGBM on ground truth
3. **A/B test** — Compare rule-based (current) vs. learned ranking
4. **Personalize** — Add user history signals to ranking formula
5. **Multi-modal** — Add vision features (code screenshots, diagrams)

See `CROSS-RANKER-API.md` "Integration Roadmap" for details.

## Related Documentation

- `CROSS-RANKER-API.md` — Complete API reference
- `CROSS-RANKER-NPM-SCRIPTS.txt` — Available npm commands
- `docs/UNIFIED-RETRIEVAL-PIPELINE.md` — How it fits in the larger pipeline
- `memory/phase-3-evaluation-runner.md` — Evaluation framework

---

Questions? Check the API docs or run `npm run test:cross-ranker:watch` for interactive development.
