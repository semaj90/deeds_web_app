# Dispatcher → RRF Integration Usage Guide (Session 117)

## Quick Start: Using Dispatcher Signals in Retrieval

### Pattern 1: Basic Usage (No Dispatcher Result)

```typescript
// Existing behavior — no change needed
const result = await multiLaneRetrievalWithRRF(query, pool, {
  topK: 20,
  weights: { /* custom weights */ }
});
```

### Pattern 2: With Dispatcher Result (Session 117)

```typescript
import { executeDispatcherOrchestration } from '$lib/server/dispatcher';
import { multiLaneRetrievalWithRRF } from '$lib/server/retrieval/rrf-integration';

// 1. Get dispatcher result from earlier stage
const dispatcherResult = await executeDispatcherOrchestration(state, ctx);

// 2. Pass to RRF integration
const result = await multiLaneRetrievalWithRRF(query, pool, {
  topK: 20,
  dispatcherResult, // ← Session 117: Add dispatcher signals to blend
});

// 3. Results now include dispatcher signal contribution
console.log(result.breakdown.dispatcherSignalCount); // Number of dispatcher hits
console.log(result.timings.dispatcher_signal_ms); // Extraction time
```

### Pattern 3: Custom Dispatcher Signal Weight

```typescript
// Increase dispatcher signal influence (default 0.6)
const result = await multiLaneRetrievalWithRRF(query, pool, {
  topK: 20,
  dispatcherResult,
  weights: {
    dispatcher_signal: 1.2, // Higher weight = more influence
  },
});
```

---

## Signal Extraction Details

### Understanding Dispatcher Signals

```typescript
import { extractDispatcherSignals, computeDispatcherSignalScores } from '$lib/server/dispatcher';

const signals = extractDispatcherSignals(dispatcherResult);
// Returns:
// {
//   dispatch_decision: 'synthesize',
//   decision_confidence: 0.8,
//   mirror_sync_count: 3,
//   mirror_success_rate: 1.0,
//   synthesis_path_length: 5,
//   total_latency_ms: 1200,
//   error_count: 0
// }

const scores = computeDispatcherSignalScores(signals);
// Returns:
// {
//   dispatch_decision_weight: 0.8,        // Direct from confidence
//   execution_efficiency: 0.95,           // Latency + reliability
//   synthesis_scope: 0.8,                 // Path length normalized
//   reliability_score: 1.0                // Mirror success - errors
// }

// Combined RRF weight:
// 0.8 * 0.35 + 0.95 * 0.35 + 0.8 * 0.15 + 1.0 * 0.15 = 0.88
```

### Decision Types and Weights

```typescript
// Dispatcher decisions → semantic signal strength

synthesize:  1.0   // High confidence, full synthesis path
sync_qdrant: 0.9   // Mirror sync succeeded
sync_neo4j:  0.85  // Topology sync succeeded
rerank:      0.8   // Reranking decision
validate:    0.75  // Validation-focused
sync_redis:  0.7   // Cache sync
recover:     0.6   // Recovery attempt
escalate:    0.4   // Low confidence, operator escalation
quarantine:  0.2   // Very low confidence, data quarantine
```

---

## Topology Service Functions

### Check Signal Breakdown

```typescript
import { getDispatcherSignalBreakdown } from '$lib/server/dispatcher';

const breakdown = getDispatcherSignalBreakdown(dispatcherResult);
// Returns:
// {
//   signals: { /* as above */ },
//   scores: { /* as above */ },
//   combined_weight: 0.88  // Final RRF lane weight
// }
```

### Apply Boost to Specific Packet

```typescript
import { applyDispatcherTopologyBoost } from '$lib/server/dispatcher';

const boostedScore = applyDispatcherTopologyBoost(
  packetId,           // Target packet
  dispatcherResult,
  baseScore: 0.5      // Original RRF score
);
// → Boosted score up to +20% (confidence) + +15% (efficiency) + +10% (reliability)
```

### Check if Dispatcher Should Override Normal Retrieval

```typescript
import { shouldUseDispatcherGuidedRetrieval } from '$lib/server/dispatcher';

if (shouldUseDispatcherGuidedRetrieval(dispatcherResult)) {
  // Dispatcher escalated or quarantined
  // Maybe skip normal ANN and use dispatcher-guided path only
  return dispatcherGuidedResults;
}
```

---

## API Responses

### Including Dispatcher Signals in Retrieval API

```typescript
// Route: GET /api/retrieval/multi-lane?q=...&include-dispatcher=true

export const GET: RequestHandler = async ({ url, locals }) => {
  const query = url.searchParams.get('q');
  const includeDispatcher = url.searchParams.get('include-dispatcher') === 'true';

  let dispatcherResult: DispatcherOrchestrationResult | undefined;

  if (includeDispatcher && locals.user) {
    // Get dispatcher result (from earlier stage or fresh run)
    dispatcherResult = await executeDispatcherOrchestration(state, ctx);
  }

  const result = await multiLaneRetrievalWithRRF(query, db.pool, {
    topK: 20,
    dispatcherResult, // ← Include if available
  });

  return json({
    results: result.results,
    breakdown: result.breakdown,
    timings: result.timings,
    // New in Session 117:
    dispatcherSignal: dispatcherResult ? {
      decision: dispatcherResult.dispatch_decision,
      confidence: dispatcherResult.dispatch_confidence,
      laneWeight: getDispatcherSignalLaneWeight(dispatcherResult),
    } : null,
  });
};
```

---

## Monitoring and Observability

### Signal Contribution to Rankings

```typescript
// After RRF combine, inspect breakdown per result
for (const result of rrfResults.slice(0, 5)) {
  console.log(`Rank #${results.indexOf(result) + 1}`);
  console.log(`  Combined Score: ${result.combinedScore.toFixed(4)}`);
  
  for (const score of result.breakdown) {
    if (score.laneName === 'dispatcher_signal') {
      console.log(`  🎯 Dispatcher contribution: +${score.rrfComponent.toFixed(4)}`);
    }
  }
}
```

### Dashboard Metrics

```typescript
// Track over time for effectiveness analysis
const metrics = {
  dispatcher_signals_generated: result.breakdown.dispatcherSignalCount,
  dispatcher_signal_extraction_ms: result.timings.dispatcher_signal_ms || 0,
  dispatcher_weight_in_blend: finalWeights.dispatcher_signal,
  top_5_dispatcher_influence: rrfResults
    .slice(0, 5)
    .map(r => r.breakdown.find(s => s.laneName === 'dispatcher_signal')?.rrfComponent || 0)
    .reduce((a, b) => a + b, 0) / 5,
};
```

---

## Future Enhancements (Session 118+)

### SOM Cluster Migration

```typescript
// Session 118: Once SOM clustering is live
// Dispatcher topology signals will use real SOM cluster IDs
// instead of directory path proxies

// Current (Session 117):
som_cluster: packet.directory_path  // Proxy

// Future (Session 118):
som_cluster: packet.som_cluster_id  // Real SOM assignment
```

### Operator Manual Override API

```typescript
// Session 118: Allow operators to override dispatcher decisions

// Create override
POST /api/dispatcher/override
{
  "packet_id": "ace:packet:auth:001",
  "override_decision": "synthesize",
  "reason": "Manual operator decision",
  "expires_at": "2026-07-07T06:00:00Z"
}

// This would modify dispatcher signal weighting for that packet
```

---

## Troubleshooting

### Issue: Dispatcher signals not affecting results

**Check**:
1. Is `dispatcherResult` being passed to `multiLaneRetrievalWithRRF()`?
2. Is the dispatcher result successful (`success: true`)?
3. Is `dispatcher_signal` weight > 0 in finalWeights?
4. Check breakdown: `result.breakdown.dispatcherSignalCount > 0`?

**Fix**:
```typescript
// Verify dispatcher result is valid
if (!dispatcherResult?.success) {
  console.warn('Dispatcher result invalid, skipping signals');
  dispatcherResult = undefined; // Let retrieval continue without signals
}

// Pass to RRF
const result = await multiLaneRetrievalWithRRF(query, pool, {
  dispatcherResult,
  weights: { dispatcher_signal: 0.6 }, // Explicit weight
});

// Verify extraction happened
console.log(`Dispatcher signals: ${result.breakdown.dispatcherSignalCount} hits`);
console.log(`Extraction time: ${result.timings.dispatcher_signal_ms}ms`);
```

### Issue: Dispatcher signals causing regressions

**Mitigation**:
1. Reduce weight: `dispatcher_signal: 0.3` (vs default 0.6)
2. Disable for specific decision types:
   ```typescript
   if (['escalate', 'quarantine'].includes(dispatcherResult.dispatch_decision)) {
     dispatcherResult = undefined; // Skip signals for uncertain decisions
   }
   ```
3. A/B test with subset of users before full rollout

---

## Architecture Diagram

```
User Query
    ↓
[Dispatcher Orchestrator] → decision, mirror_syncs, latency, errors
    ↓
[Signal Extractor]
    ├─ Extract: confidence, sync count, path length, latency
    └─ Normalize: 4 scores (decision, efficiency, scope, reliability)
    ↓
[Generate Dispatcher Hits] → synthetic RRF lane
    ↓
[RRF Combiner] (8-lane blend)
    ├─ postgres_trigram (1.0)
    ├─ concept_overlap (1.2)
    ├─ qdrant_vector (1.0)
    ├─ turbovec_ann (0.9)
    ├─ neo4j_graph (0.8)
    ├─ som_topology (0.5)
    ├─ neo4j_community (0.3)
    └─ dispatcher_signal (0.6) ← Session 117
    ↓
[Ranked Results] with dispatcher signal contribution
```

---

## References

- `SESSION-117-TOPOLOGY-SIGNAL-INTEGRATION-COMPLETE.md` — Full Session 117 architecture
- `dispatcher-signal-extractor.ts` — Signal extraction implementation
- `dispatcher-topology-service.ts` — Topology service functions
- `rrf-integration.ts` — RRF blend integration code
