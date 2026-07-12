# Evidence: 2F1-1A1 FeatureEnvelope Contract Discovery

**Task**: Locate and validate FeatureEnvelope contract
**Status**: validated
**Date**: 2026-07-12
**Discovery**: Feature-envelope.ts exists and is complete

## Discovery Facts

File exists at: `src/lib/server/retrieval/feature-envelope.ts`
Lines of code: 502
Export count: 11 primary exports

## Verified Exports

### Signal Schemas (Zod)
- `DenseSignalSchema` — name: 'dense', score [0,1], qdrant_point_id, metric, confidence
- `LexicalSignalSchema` — name: 'lexical', score [0,1], matched_terms[], query_coverage, confidence
- `ASTSignalSchema` — name: 'ast', score [0,1], kind, symbol, line_start/end, confidence
- `MetadataSignalSchema` — name: 'metadata', score [0,1], matched_tags[], language, domain, confidence
- `AuthoritySignalSchema` — name: 'authority', score [0,1], page_rank, community_id, is_central, confidence
- `RecencySignalSchema` — name: 'recency', score [0,1], last_modified, days_since_update, confidence

### Master Container
- `FeatureEnvelopeSchema` — Zod schema
  - Identity: chunk_id, query_id
  - Signals: dense?, lexical?, ast?, metadata?, authority?, recency? (all optional)
  - Computed blends: rrf_score?, weighted_score?, learned_score? (derived)
  - Metadata: source_ref, relative_path, summary, created_at, evaluated_at
  - Ablation tracking: ablation_config_id enum

### Ablation Configurations
- `ABLATION_CONFIGS` — Record<string, AblationConfig>
  - `dense_only`: dense=true, lexical=false, others=false, blend=weighted_sum
  - `lexical_only`: dense=false, lexical=true, others=false, blend=weighted_sum
  - `rrf_50_50`: dense=true, lexical=true, others=false, blend=rrf, weights 0.5/0.5
  - `dense_heavy`: dense=true, lexical=true, others=false, blend=weighted_sum, weights 0.7/0.3
  - `lexical_heavy`: dense=true, lexical=true, others=false, blend=weighted_sum, weights 0.3/0.7
  - `all_signals`: all true, blend=rrf, equal weights 1.0 each

### Blending Functions
- `computeRRFScore(envelope, config)` — Reciprocal Rank Fusion
  - Formula: sum(1 / (k + rank)) where k=60
  - Converts [0,1] scores to rank estimates
  - Normalizes output to [0,1]
  
- `computeWeightedScore(envelope, config)` — Weighted sum blend
  - Multiplies each enabled signal by its weight
  - Handles missing signals gracefully
  
- `applyAblationConfig(envelope, config)` — Apply configuration
  - Selects blend strategy (rrf vs weighted_sum)
  - Populates rrf_score or weighted_score field
  - Sets ablation_config_id

### Type Guards
- `isValidFeatureEnvelope(data)` — Returns boolean
- `parseFeatureEnvelope(data)` — Returns FeatureEnvelope | null

## Decision

**Do not recreate feature-envelope.ts**

The existing implementation covers:
- All 6 required signal types ✅
- RRF formula with k=60 ✅
- 6 ablation configurations ✅
- TypeScript type safety ✅
- Zod validation ✅

**Next action**: Correct the evaluation-runner import path from:
```typescript
import { ... } from '../../src/lib/server/retrieval/feature-envelope.js'
```
to:
```typescript
import { ... } from '$lib/server/retrieval/feature-envelope.js'
```

## Implications for Later Tasks

Task 3 (FeatureEnvelope TypeScript types) is NOT NEEDED — these types already exist.
The runner's only issue is the import path.

## Validation

- [x] File exists
- [x] All exports present
- [x] Zod schemas valid TypeScript
- [x] Ablation configs enum-like access
- [x] RRF formula implemented (k=60)
- [x] Imports resolvable from evaluation-runner location

**Conclusion**: Task 2F1-1A1 VALIDATED. Ready for task 2F1-1A2.
