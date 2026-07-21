# Phase 107 Phase F — Materializer Audit & Bindings

**Status**: READY FOR EXECUTION  
**Date**: July 21, 2026  
**Scope**: Materializer audit, feature_packet_bindings creation, content_hash provenance validation, file-edge resolution  
**Blocking**: Only on Phase 107 F-specific work (NOT blocked by Phase 1 AST, Phase 8 readiness, or autoencoder)

---

## Summary

Phase 107 Phase F can proceed immediately with five bounded tasks:

1. **Audit current materializer** — understand existing precedence logic and field-level resolution gaps
2. **Verify content_hash provenance** — confirm hash determinism across Postgres/Qdrant/Redis
3. **Create feature_packet_bindings migration** — many-to-many binding table with proper indexes
4. **Classify six unresolved file edges** — determine root cause (orphaned, partial, schema mismatch)
5. **Rewrite materializer with field-level precedence** — graceful degradation for empty optional lanes

**Expected Duration**: 4–6 hours  
**Confidence**: HIGH (all prerequisites satisfied)

---

## Task 1: Audit Current Materializer

**Objective**: Understand existing precedence logic, identify gaps

**Deliverables**:
- [ ] Document: `phase-107-materializer-audit.md`
- [ ] Code locations identified (read-only pass)
- [ ] Field-level resolution patterns catalogued
- [ ] Dependencies mapped (feature tables → bindings → atlas_packets fallback)

**Candidates to inspect**:
- `hyperrag-packet-materializer.mjs` (existing materializer, 200+ lines)
- `phase107-operations-orchestrator.mjs` (orchestrator, may contain materializer logic)
- `phase-107-backfill-joins.mts` (may contain lane-precedence logic)
- `materializer-lib.mjs` / `envelope-builder.mjs` (shared utilities)

**Read-only actions**:
```bash
grep -r "feature_domain_facts\|feature_file_edges\|feature_packet_bindings" src --include="*.ts" -n
grep -r "atlasPackets.*fallback\|fallback.*domain" scripts/atlas --include="*.mjs" -n
```

**Output format** (markdown table):
```markdown
| File | Type | Pattern | Applies To | Notes |
|------|------|---------|-----------|-------|
| hyperrag-packet-materializer.mjs | Lane precedence | Hard failure on missing array | All lanes | Stops on any empty lane → should report instead |
| ...
```

---

## Task 2: Verify Content_Hash Provenance

**Objective**: Confirm hash determinism and consistency across all stores

**Deliverables**:
- [ ] SQL query results (sample 100 packets)
- [ ] Hash consistency audit report (JSON)
- [ ] Cross-store comparison (Postgres vs Qdrant vs Redis)

**Queries** (read-only):
```sql
-- Postgres content_hash consistency
SELECT packet_key, content_hash, COUNT(*)
FROM atlas_packets
WHERE packet_key IS NOT NULL AND content_hash IS NOT NULL
GROUP BY packet_key, content_hash
HAVING COUNT(*) > 1;

-- Qdrant payload hash check (via inspect)
SELECT COUNT(*) as total,
       COUNT(CASE WHEN payload->>'content_hash' IS NOT NULL THEN 1 END) as hash_present
FROM qdrant_points_sample;  -- Inspect sample via Qdrant HTTP API

-- Redis hash presence (sample 10 keys)
-- CLI: redis-cli KEYS "bifrost:packet:*" | xargs redis-cli HGETALL | grep content_hash
```

**Output**: `phase-107-hash-provenance-audit.json`

---

## Task 3: Create feature_packet_bindings Migration

**Objective**: Create many-to-many binding table schema and Drizzle definition

**Deliverables**:
- [ ] SQL migration file: `drizzle/0NNN_feature_packet_bindings.sql`
- [ ] Drizzle schema: `schema-postgres.ts` additions
- [ ] Index strategy document

**Schema design** (preliminary):
```sql
CREATE TABLE IF NOT EXISTS feature_packet_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT NOT NULL,  -- FK to feature concept
  packet_key TEXT NOT NULL,  -- FK to atlas_packets.packet_key
  source_ref TEXT NOT NULL,
  binding_type TEXT NOT NULL DEFAULT 'extracted',  -- 'extracted', 'inferred', 'promoted'
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(feature_id, packet_key, source_ref),
  INDEX ON (feature_id, confidence DESC),
  INDEX ON (packet_key),
  INDEX ON (binding_type, confidence DESC)
);
```

**Drizzle TypeScript**:
```typescript
export const featurePacketBindings = pgTable('feature_packet_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  featureId: text('feature_id').notNull(),
  packetKey: text('packet_key').notNull(),
  sourceRef: text('source_ref').notNull(),
  bindingType: text('binding_type').notNull().default('extracted'),
  confidence: real('confidence').notNull().default(0.5),
  evidenceIds: text('evidence_ids').array().default(sql`'{}'`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqueBinding: unique().on(t.featureId, t.packetKey, t.sourceRef),
  idxFeatureConfidence: index().on(t.featureId, t.confidence.desc()),
  idxPacketKey: index().on(t.packetKey),
  idxBindingTypeConfidence: index().on(t.bindingType, t.confidence.desc()),
}));
```

---

## Task 4: Classify Six Unresolved File Edges

**Objective**: Inspect the 6 rows in feature_file_edges with NULL references

**Deliverables**:
- [ ] SQL audit query results
- [ ] Classification report (per-row root cause)
- [ ] Resolution strategy (per category)

**Audit query**:
```sql
SELECT id, feature_id, file_path, source_ref, packet_key,
       COUNT(*) as edge_count
FROM feature_file_edges
WHERE source_ref IS NULL OR packet_key IS NULL
GROUP BY id, feature_id, file_path, source_ref, packet_key
ORDER BY edge_count DESC;
```

**Classification categories**:
- **Orphaned**: file_path references nonexistent source (likely deleted code)
- **Partial**: file_path exists but never indexed (gap in Phase 1 AST or identity layer)
- **Schema mismatch**: column naming or type incompatibility
- **Identity gap**: packet not yet assigned to atlas_packets

**Output format** (JSON):
```json
{
  "unresolved_edges": [
    {
      "id": "...",
      "feature_id": "...",
      "file_path": "...",
      "classification": "orphaned|partial|schema_mismatch|identity_gap",
      "resolution": "delete|backfill_identity|create_binding|manual_review"
    }
  ],
  "total_edges": 6,
  "by_category": { "orphaned": 2, "partial": 3, ... }
}
```

---

## Task 5: Rewrite Materializer with Field-Level Precedence

**Objective**: Implement graceful degradation for empty optional lanes

**Deliverables**:
- [ ] New materializer module: `materializer-phase-107-f.mts`
- [ ] Field-level resolution functions (domain, structural facts, ontology tuples)
- [ ] Empty-lane reporting (audit JSON)
- [ ] 100-packet dry-run validation

**Pseudocode** (per-field resolution):
```typescript
function resolveDomain(
  normalizedFact: DomainFact | null,
  packetFallback: AtlasPacket
): FieldResolution {
  if (normalizedFact?.domainClass) {
    return {
      value: normalizedFact.domainClass,
      source: 'feature_domain_facts',
      fallbackUsed: false,
      confidence: 0.95
    };
  }
  if (packetFallback.domainClass) {
    return {
      value: packetFallback.domainClass,
      source: 'atlas_packets',
      fallbackUsed: true,
      confidence: 0.6
    };
  }
  return {
    value: null,
    source: null,
    fallbackUsed: false,
    unresolvedReason: 'DOMAIN_NOT_AVAILABLE'
  };
}

function resolveStructuralFacts(
  facts: StructuralFact[]
): FieldResolution {
  if (facts.length > 0) {
    return {
      values: facts,
      source: 'feature_structural_facts',
      fallbackUsed: false,
      count: facts.length
    };
  }
  return {
    values: [],
    source: null,
    fallbackUsed: false,
    unresolvedReason: 'STRUCTURAL_LANE_NOT_MATERIALIZED'
  };
}
```

**Empty-lane audit output** (JSON):
```json
{
  "total_packets": 100,
  "by_field": {
    "domain_class": {
      "resolved_from_feature": 87,
      "resolved_from_fallback": 11,
      "unresolved": 2,
      "coverage_pct": 98.0
    },
    "structural_facts": {
      "present": 34,
      "empty": 66,
      "coverage_pct": 34.0,
      "note": "STRUCTURAL_LANE_NOT_MATERIALIZED — expected before Phase 1 AST at 95%"
    },
    "ontology_tuples": {
      "present": 0,
      "empty": 100,
      "coverage_pct": 0.0,
      "note": "OPTIONAL_LANE_NOT_MATERIALIZED — will populate post-Phase 8"
    }
  }
}
```

**Dry-run validation** (100 packets):
- [ ] 0 crashes (graceful degradation, no hard failures)
- [ ] All domain_class fields resolved (via feature OR fallback)
- [ ] Structural/ontology emptiness reported explicitly (not treated as failure)
- [ ] feature_packet_bindings row created for each packet with confidence scores

---

## Execution Order

**Session breakdown** (4–6 hours total):

| Task | Duration | Status |
|------|----------|--------|
| Task 1: Audit materializer | 1h | TODO |
| Task 2: Hash provenance | 1h | TODO |
| Task 3: Bindings migration | 1.5h | TODO |
| Task 4: File edges audit | 45m | TODO |
| Task 5: Materializer rewrite + 100-packet dry-run | 2h | TODO |

---

## Separation from Independent Lanes

**These tasks are INDEPENDENT and do NOT block Phase 107 F**:

- Phase 1 AST (0 packets selected) → separate lane, separate audit, separate commit
- Phase 8 readiness (74.7% < 90%) → separate lane, separate enforcement, separate commit
- Autoencoder checkpoint (weights validity unknown) → separate lane, separate validation, separate commit

**Phase 107 F can proceed to apply immediately after dry-run validation.**

---

## Commits (Separate)

When complete, create five separate commits:

```bash
git commit -m "audit(phase-107-f): materializer field-level precedence audit

Reviewed existing materializer logic in hyperrag-packet-materializer.mjs
and related lane-precedence code. Identified hard-failure behavior on
missing arrays; designed field-level graceful degradation for Phase 107 F.

See: next_steps/active/phase-107-materializer-audit.md"

git commit -m "feat(phase-107-f): verify content_hash provenance across stores

Audited content_hash determinism in Postgres, Qdrant payload, Redis keys.
Confirmed hash consistency and cross-store alignment.

See: phase-107-hash-provenance-audit.json"

git commit -m "feat(phase-107-f): add feature_packet_bindings migration

Create many-to-many binding table with proper indexes for feature_id
and packet_key. Drizzle schema aligned with Postgres live schema.

Migration: drizzle/0NNN_feature_packet_bindings.sql
Schema: src/lib/server/db/schema-postgres.ts"

git commit -m "audit(phase-107-f): classify unresolved file edges

Inspected 6 rows in feature_file_edges with NULL references.
Classified root causes: orphaned, partial, schema mismatch, identity gap.

See: phase-107-file-edges-audit.json"

git commit -m "feat(phase-107-f): materializer rewrite with field-level precedence

Replaced lane-level hard failures with per-field graceful degradation.
Empty optional lanes (structural, ontology) reported explicitly, not fatal.
Domain class resolves via feature facts OR atlas_packets fallback.

100-packet dry-run validates 0 crashes, all domain fields resolved.
feature_packet_bindings populated with confidence scores.

See: materializer-phase-107-f.mts"
```

---

## Success Criteria

✅ Materializer audit complete (understand current precedence)  
✅ Hash provenance verified (consistent across stores)  
✅ feature_packet_bindings migration created (Drizzle + SQL)  
✅ Six file edges classified (root causes documented)  
✅ Materializer rewritten (field-level precedence, graceful degradation)  
✅ 100-packet dry-run passes (0 crashes, all domain resolved, empty lanes reported)  
✅ Five separate commits (no mixing of concerns)  

---

## Next Steps (After Phase F Complete)

1. **Phase 107 E audit** — understand why it's "NOT SAFE" (separate task)
2. **Phase 1 AST diagnostic** — count exclusion reasons (separate lane)
3. **Phase 8 gate enforcement** — add hard block on readiness (separate lane)
4. **Autoencoder checkpoint validation** — inspect weight loading (separate lane)

**Phase 107 F does NOT depend on any of these.**
