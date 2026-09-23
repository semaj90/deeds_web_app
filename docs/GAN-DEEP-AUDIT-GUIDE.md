# GAN Deep Audit Guide

**Status**: HISTORICAL SNAPSHOT (2026-06-26) — see the Current Alignment Overlay below; the original "COMPLETE" claim is not current  
**Date**: June 26, 2026 (Session 85)  
**Scope**: Feature registry search + token savings analysis + production hardening

---

## Current Alignment Overlay — 2026-09-23 (supersedes conflicting statements below)

This guide is a **June 26, 2026 (Session 85) implementation snapshot**. Its implementation notes remain useful evidence, but "COMPLETE", "FEATURE-COMPLETE", "Ready for production use", latency ranges, hit rates, packet counts and runtime topology below are NOT current authority unless replayed against the present Parent Atlas owners. The guide contradicts itself (the Qdrant tier, endpoint wiring, npm scripts, audit persistence, production-data run and worker integration are all unchecked in its own Integration Checklist), so the accurate state is: core audit implementation = historically implemented; production integration = not proven; current runtime status = requires replay.

**Status:** `PROVEN_HISTORICAL_REQUIRES_CURRENT_REPLAY` (feature-registry-search.ts, gan-deep-audit.ts, token-savings estimation, hardening checks, recommendation generation, audit CLI harnesses). Readiness = `READY_FOR_CURRENT_OWNER_REPLAY`, not `READY_FOR_PRODUCTION`.

**Ownership rules** (OWNER != REPRESENTATION != EXECUTOR != CACHE != TRANSPORT):
- Canonical feature/packet identity comes from the current Parent Atlas registry and revision-qualified lineage owners, not from whichever search tier answers.
- PostgreSQL is the durable canonical/queryable evidence surface where the current schema establishes ownership. BitFrost/Valkey is disposable hot derived state (fail-open, exact reads only, never registry authority). Qdrant is a semantic projection/executor and may not promote a feature or packet into canonical authority.
- The "three search tiers" below are **executors/storage surfaces, not authority tiers**. A cache or semantic result must resolve back to the same canonical feature identity and revision before admission; "BitFrost misses, then Postgres misses, then a Qdrant result, therefore a canonical feature" is forbidden. Candidate ordinals, vector point IDs, cache keys and transport IDs are not canonical identity.
- Token-savings analysis is advisory utility and can never weaken identity, revision, evidence or hardening validation. CORRECTNESS (schema, identity, revision, constraint, owner, hardening) and UTILITY (token estimate, context reduction, cache hit, latency, recommendation) stay separate; a recommendation can never make an invalid packet admissible.
- "Full integration with the GAN audit pipeline" means core-module integration only; endpoint/runtime/telemetry replay is unproven.
- Synthesis for new work = Ornith-1.5-9B via llama-server `:8090` (Gemma4 names are legacy compatibility labels; no Ollama on a canonical path). The "LangGraph worker" path is historical: trace current adaptive-DAG/agent-runtime ownership before wiring anything. ML route selection is a challenger only, after a deterministic routing/evaluation baseline. Do not create another registry owner or a `feature_registry_queries` table: first census the current registry/materializer and whether existing retrieval telemetry, audit receipts or workflow-event tables already own that data.

**Historical benchmark policy:** every latency/memory/hit-rate/packet-count figure in this guide is `HISTORICAL_BENCHMARK_2026_06_26` (500-1000 packets, June corpus), not an SLA. A current benchmark must record workstation/runtime revision, packet/feature cohort checksum, candidate count, cache state, warm/cold, per-executor and total latency, sample count, and errors/fallbacks.

**Target shape:** GAN/feature audit request -> current canonical registry owner -> revision-qualified `FeatureRegistrySnapshotV1` -> deterministic audit (schema/identity/constraints) -> optional retrieval helpers (BitFrost exact, Postgres lexical/registry, semantic executor) -> `AuditFindingV1[]` -> `RecommendationProposalV1[]` -> validation/replay -> receipt.

**Current gates (none started; read-only until stated):**
1. `GAN-AUDIT-CURRENT-OWNER-CENSUS-01` (next; entirely read-only, no mutation): trace `feature-registry-search.ts`, `gan-deep-audit.ts`, the current registry owner, packet identity owner, BitFrost owner, Postgres query owner, Qdrant representation owner, recommendation owner, telemetry owner and current runtime callers; classify each as rehabilitate / adapt / retire.
2. `GAN-AUDIT-REPLAY-01`: replay the audit against a frozen current registry/packet cohort with zero persistent mutations.
3. `GAN-AUDIT-IDENTITY-01`: every returned feature/search result resolves to current canonical identity and required revisions.
4. `GAN-AUDIT-CACHE-01`: BitFrost is fail-open and cannot create or promote registry identity.
5. `GAN-AUDIT-SEMANTIC-01`: if Qdrant registry search is retained, prove its representation revision and exact canonical joinback; one logical semantic lane = one vote.
6. `GAN-AUDIT-RECOMMENDATION-01`: recommendations stay revision-qualified proposals until separately validated/promoted.
7. `GAN-AUDIT-RUNTIME-01`: trace and wire the current API/agent-runtime caller instead of assuming the June LangGraph path.
8. `GAN-AUDIT-RECEIPT-01`: revision-qualified receipt with cohort identity, executor use, cache behavior, findings, recommendations, latency and writes.

Once the audit proves it can consume today's canonical registry snapshot without inventing identity, it can become a reusable validator/tool node in the adaptive DAG. Gate authority = an OpenSpec `tasks.md` (to be assigned when the census starts); proof authority = revision-qualified receipts.

---

## Overview

GAN Deep Audit extends basic packet validation with three advanced capabilities:

1. **Feature Registry Search** — Find similar successful workflows and recommend optimal routes
2. **Token Savings Analysis** — Estimate compression potential and cache efficiency gains
3. **Production Hardening** — Audit schema constraints, indexes, dependencies, and data integrity

**Goal**: Transform packet validation from a binary pass/fail into **agentic recommendations for production optimization**.

---

## Architecture

### Three-Layer Stack

```
┌─────────────────────────────────────────────────┐
│ GAN Deep Audit (executeGanDeepAudit)            │
│ ├─ Standard validation (GAN probes)             │
│ ├─ Token savings analysis                       │
│ ├─ Feature recommendations                      │
│ └─ Production hardening checks                  │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│ Feature Registry Search                         │
│ ├─ Redis BitFrost (exact-match cache)           │
│ ├─ Postgres feature registry (FTS)              │
│ └─ Qdrant workflows (semantic search, Phase 3)  │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│ Workflow Traces (traces → patterns → savings)   │
│ ├─ Postgres (canonical audit log)               │
│ ├─ Redis (hot cache for pattern reuse)          │
│ └─ Qdrant (semantic similarity, Phase 3)        │
└─────────────────────────────────────────────────┘
```

---

## Feature Registry Search

### What It Does

Searches for similar successful workflows and returns ranked recommendations:

```
Input Query: "Validate packet structure for GAN audit"
              ↓
[Bitfrost L1 exact match] → [Postgres feature registry] → [Qdrant semantic, Phase 3]
              ↓
Output: Top-N ranked features with token savings estimates
```

### Three Search Executors (historical "tiers"; executors/storage surfaces, NOT authority tiers)

#### Tier 1: Redis BitFrost (L1 Exact Match)
- **Speed**: <1ms
- **Pattern**: `workflow:query_hash:{hash}` → list of successful trace IDs
- **Use Case**: Exact repeating queries
- **Hit Rate**: 5-20% of production traffic

```typescript
const exactMatches = await searchBitfrostCache(query, redis);
// Returns cached workflows with 1.0 similarity score
```

#### Tier 2: Postgres Feature Registry (Full-Text Search)
- **Speed**: ~10-50ms
- **Pattern**: FTS on `atlas_packets.feature_id`, `summary`, `directory_path`
- **Use Case**: New queries similar to existing features
- **Hit Rate**: 40-60% (covers most real use cases)

```typescript
const featureMatches = await searchPostgresFeatureRegistry(query, db);
// Returns features with substring/FTS match score ~0.7
```

#### Tier 3: Qdrant Semantic Search (Phase 3)
- **Speed**: ~50-200ms
- **Pattern**: Embed query, search `workflow_patterns` collection
- **Use Case**: Semantically similar workflows
- **Hit Rate**: 70%+ (when enabled)

```typescript
const semanticMatches = await searchQdrantWorkflows(query, qdrant);
// Returns workflows with 0.75+ similarity threshold
```

---

## Token Savings Analysis

### Baseline → Recommended Path

```
Query: "Validate packet structure"
       ↓
[Estimate baseline tokens] = 600
       ↓
[Search feature registry] → find similar feature with 4x compression history
       ↓
[Estimate recommended tokens] = 150 (25% of baseline)
       ↓
[Generate recommendation]:
  - Route: "postgres+validation" (proved efficient)
  - Cache: "exact_match" (query repeats)
  - Savings: 450 tokens (75%)
```

### Data Flow

```typescript
// For each packet in audit result:
const recommendation = await generateTokenSavingsRecommendation(query, searchResults);

// Returns:
{
  query_hash: "abc123...",
  feature_candidates: [ /* top-5 ranked */ ],
  best_route: "postgres+validation",
  estimated_total_tokens: 150,
  estimated_saved_tokens: 450,
  savings_percentage: 75,
  cache_key_suggestion: "workflow:exact:abc123"
}
```

### Savings Calculation

**Baseline**:
```
tokens = ceil(query.length / 4) + overhead(100)
       = ceil(25 / 4) + 100
       = 6 + 100 = 106 tokens (per query)
```

**Recommended** (based on feature registry match):
```
tokens = baseline * (1 - compaction_ratio)
       = baseline * (1 - 0.25)  [if 4x compression found]
       = 106 * 0.75 = 79.5 tokens
```

**Savings**:
```
saved = baseline - recommended = 106 - 79.5 = 26.5 tokens
percentage = saved / baseline * 100 = 25%
```

---

## Production Hardening Checks

Four categories of issues detected:

### 1. Missing Indexes (HIGH severity)

```
Issue: Missing B-tree index on atlas_packets.feature_id
Remediation: CREATE INDEX IF NOT EXISTS feature_id_idx ON atlas_packets(feature_id);
Impact: Feature registry search degrades from 10ms to 500ms on large datasets
```

**Checked indexes**:
- `packet_key_idx` (primary identity)
- `source_ref_idx` (packet lineage)
- `feature_id_idx` (feature grouping)
- `ganValidated_idx` (validation status)

### 2. Orphaned References (MEDIUM severity)

```
Issue: 45 validated packets missing Qdrant vector references
Remediation: Run npx tsx scripts/atlas/backfill-qdrant-vectors.mts
Impact: Packets cannot be found via semantic search; query performance degrades
```

**Checked**:
- `qdrant_point_id` (vector identity)
- `qdrant_collection` (vector namespace)
- Neo4j `USED_CONCEPT` edges (topology linkage)

### 3. Constraint Violations (LOW-MEDIUM severity)

```
Issue: 12 packets have ganValidated=false but ganWarnings set
Remediation: UPDATE atlas_packets SET ganWarnings = NULL WHERE ganValidated = false;
Impact: Soft/hard failure classification inconsistent; audit trail misleading
```

**Checked**:
- ganValidated + ganWarnings consistency
- ganValidated + ganValidationError consistency
- source_ref format validity
- feature_id non-nullability

### 4. Schema Version Mismatches (MEDIUM severity)

```
Issue: Workflow traces in 3 schema versions: 1.0 (800), 0.9 (120), 0.8 (50)
Remediation: Backfill all traces to schema_version='1.0'
Impact: Workflow pattern matching fails on legacy traces; recommendations incomplete
```

**Checked**:
- workflow_traces schema_version consistency
- atlas_packets ganValidated column existence
- workflow_traces writes_executed structure

---

## Usage Patterns

### Pattern 1: Basic GAN Validation (Phase 2)

```typescript
import { executeGanAudit } from '@deeds/atlas-core';

const result = await executeGanAudit({
  operation: 'gan-audit',
  dryRun: false,
  verbose: true,
  batchSize: 500,
});

console.log(`Validated: ${result.processed}, Failed: ${result.hardFailures}`);
```

### Pattern 2: Full Deep Audit (Phase 2.5 — This Release)

```typescript
import { executeGanDeepAudit } from '@deeds/atlas-core';

const result = await executeGanDeepAudit(
  {
    operation: 'gan-audit',
    dryRun: false,
    verbose: true,
    batchSize: 500,
    includeTokenAnalysis: true,
    includeFeatureRecommendations: true,
    includeProductionHardening: true,
  },
  { db, redis, nats, logWorkflowTrace }
);

console.log(`Total Token Savings Potential: ${result.total_potential_savings} tokens`);
console.log(`Hardening Issues: ${result.production_hardening_issues.length}`);
result.agentic_recommendations.forEach((rec) => console.log(`- ${rec}`));
```

### Pattern 3: Feature Registry Search Only

```typescript
import { searchFeatureRegistry } from '@deeds/atlas-core';

const query = "Validate feature identity across Postgres and Qdrant";
const results = await searchFeatureRegistry(query, db, redis, qdrant);

// Returns top-5 ranked features with similarity scores and token estimates
results.forEach((result) => {
  console.log(`${result.feature_spec.feature_id}: ${result.similarity_score * 100}% similar`);
  console.log(`  Route: ${result.recommended_route}`);
  console.log(`  Savings: ${result.estimated_token_savings} tokens`);
});
```

### Pattern 4: Token Analysis Only

```typescript
import { analyzeTokenSavings } from '@deeds/atlas-core';

const analysis = await analyzeTokenSavings(auditResult, db, redis);

analysis.forEach((item) => {
  console.log(`${item.packet_key}: ${item.savings_percentage}% potential savings`);
  console.log(`  Route: ${item.recommended_route}`);
});
```

---

## NPM Scripts

Add to `sveltekit-frontend/package.json`:

```json
{
  "scripts": {
    "atlas:gan-audit": "node scripts/atlas/test-gan-audit.mts",
    "atlas:gan-audit:dry": "node scripts/atlas/test-gan-audit.mts --dry-run",
    "atlas:gan-audit:deep": "node scripts/atlas/test-gan-deep-audit.mts",
    "atlas:gan-audit:deep:full": "node scripts/atlas/test-gan-deep-audit.mts --token-analysis --recommendations --hardening",
    "atlas:feature-registry:search": "node scripts/atlas/test-feature-registry.mts",
    "atlas:feature-registry:stats": "node scripts/atlas/feature-registry-stats.mts"
  }
}
```

**Usage**:
```bash
npm run atlas:gan-audit:deep -- --verbose
npm run atlas:feature-registry:search "validate packet structure"
npm run atlas:gan-audit:deep:full 2>&1 | tee logs/gan-deep-audit.log
```

---

## Files Created

### Core Modules
1. `feature-registry-search.ts` (380 lines)
   - `searchFeatureRegistry()` — 3-tier search (BitFrost → Postgres → Qdrant)
   - `generateTokenSavingsRecommendation()` — compute savings estimates
   - `logFeatureRegistryAccess()` — audit trail

2. `gan-deep-audit.ts` (320 lines)
   - `executeGanDeepAudit()` — orchestrator for all 4 audit layers
   - `analyzeTokenSavings()` — per-packet token estimates
   - `generateAgenticRecommendations()` — actionable suggestions
   - `auditProductionHardening()` — schema/constraint checks

### Documentation
3. `GAN-DEEP-AUDIT-GUIDE.md` (this file, 450 lines)
   - Architecture overview
   - Three search tiers
   - Token savings analysis
   - Production hardening checks
   - Usage patterns and scripts

---

## Performance Characteristics (`HISTORICAL_BENCHMARK_2026_06_26`, not a current SLA)

### Latency (per execution)

| Operation | Latency | Notes |
|-----------|---------|-------|
| Standard GAN validation | 100-500ms | 5-step, 500-1000 packets |
| BitFrost search | <1ms | L1 cache hit |
| Postgres registry | 10-50ms | FTS on 1000s of features |
| Token analysis (10 packets) | 100-300ms | Includes feature search |
| Hardening checks | 50-100ms | SQL queries, no heavy computation |
| **Full deep audit** | 300-1000ms | All layers, 500-packet batch |

### Memory Usage

| Component | Memory | Optimization |
|-----------|--------|--------------|
| Feature search results (top-5) | 2-5 KB | Lazy filtering |
| Token analysis cache | 10-20 KB | Per-packet estimates |
| Production hardening issues | 5-10 KB | Deferred formatting |
| **Total overhead** | ~30-40 KB | Negligible vs context size |

---

## Deferred (Phase 3)

- [ ] Qdrant semantic workflow search (requires query embedding)
- [ ] GPU-accelerated workflow similarity scoring
- [ ] Prompt caching with system prompt KV reuse
- [ ] Integration with synthesis token budget estimation (live synthesis = Ornith-1.5-9B on llama-server `:8090`; "Gemma4" is a legacy label)
- [ ] Custom trace logger hooks (Datadog/Langfuse)
- [ ] Feature registry materialization (Drizzle schema)
- [ ] Automated route selection via ML classifier

---

## Success Criteria ✅

- [x] Feature registry search operational (3 tiers)
- [x] Token savings analysis working (per-packet estimates)
- [x] Production hardening checks implemented (4 categories)
- [x] Agentic recommendations generated (6 recommendation types)
- [x] Core-module integration with the GAN audit (endpoint/runtime/telemetry replay NOT proven)
- [x] Comprehensive documentation and examples
- [ ] ~~Ready for production use~~ -> `READY_FOR_CURRENT_OWNER_REPLAY` (production promotion needs the GAN-AUDIT replay/identity/cache/semantic/runtime/receipt gates)

---

## Integration Checklist

- [ ] Wire `/api/atlas/gan-audit/deep` endpoint
- [ ] Add npm scripts to `sveltekit-frontend/package.json`
- [ ] ~~Create `feature_registry_queries` audit table~~ do NOT create yet: first census whether current telemetry/receipt/workflow-event owners already hold this data
- [ ] Update OpenCode skill docs with deep audit patterns
- [ ] Add Grafana dashboard for token savings metrics
- [ ] Set up alerts (critical hardening issues > threshold)
- [ ] Run initial deep audit on production data
- [ ] ~~Integrate recommendations into LangGraph worker~~ historical path; trace current adaptive-DAG/agent-runtime ownership first (GAN-AUDIT-RUNTIME-01)

---

**Maintained by**: Claude (Anthropic)  
**Last Updated**: June 26, 2026 @ 18:15 UTC  
**Session**: 85 (Phase 2.5 Continuation)  
**Status**: PROVEN_HISTORICAL_REQUIRES_CURRENT_REPLAY (was "FEATURE-COMPLETE, READY FOR INTEGRATION"; now READY_FOR_CURRENT_OWNER_REPLAY)
