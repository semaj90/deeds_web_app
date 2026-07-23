# Lane 1B: Higher-Hop Enrichment — Implementation Guide

**Status**: ✅ Scripts Created  
**Agent**: 2  
**Objective**: Measure supernode pressure + seed bounded USED_CONCEPT edges (30% → 100%)  
**Timeline**: 2–3 hours  

---

## Overview

Lane 1B bridges the gap between unbound graph growth and safe enrichment of the Neo4j graph. It prevents overwhelming the database with edges by:

1. **Auditing** current pressure (edges per concept node)
2. **Classifying** concepts as safe (<500 edges) or deferred (≥500)
3. **Seeding** USED_CONCEPT edges from traces, but only via safe concepts
4. **Verifying** graph health post-seeding

---

## Script Architecture

### 1. `audit-higher-hop-enrichment.mjs` (Producer)

**Purpose**: Measure supernode pressure by querying Neo4j for existing USED_CONCEPT edges per concept.

**Input**:
- Neo4j instance (`:7687`)
- Postgres concept registry

**Output**:
- `docs/reports/higher-hop-enrichment-pressure-audit.json`

**Report Structure**:
```json
{
  "generated_at": "2026-06-13T...",
  "pressure_threshold_safe": 500,
  "pressure_threshold_deferred": 500,
  "concept_inventory": {
    "total_concepts": 10,
    "safe_concepts": 8,
    "deferred_concepts": 2
  },
  "current_graph_state": {
    "total_edges_in_graph": 2268,
    "avg_edges_per_concept": 226
  },
  "trace_inventory": {
    "total_traces": 1134,
    "unique_concepts_in_traces": 9,
    "avg_concepts_per_trace": 1.24
  },
  "concepts": [
    {
      "concept_id": "database_orm",
      "concept_name": "Database ORM",
      "edge_count": 234,
      "pressure": "safe",
      "safe_to_seed": true
    },
    {
      "concept_id": "gpu_cuda",
      "concept_name": "GPU/CUDA",
      "edge_count": 750,
      "pressure": "deferred",
      "safe_to_seed": false
    }
  ],
  "gates": {
    "concepts_classified": "PASS",
    "safe_concepts_available": "PASS",
    "trace_inventory_available": "PASS"
  }
}
```

**Usage**:
```bash
npm run atlas:supernode:pressure:audit
# or verbose:
node scripts/atlas/audit-higher-hop-enrichment.mjs --verbose --save
```

---

### 2. `classify-supernode-pressure.mjs` (Classifier)

**Purpose**: Read the pressure audit and build a safe/deferred classification for the seeding strategy.

**Input**:
- `docs/reports/higher-hop-enrichment-pressure-audit.json`

**Output**:
- `docs/reports/higher-hop-enrichment-classified.json`

**Report Structure**:
```json
{
  "generated_at": "2026-06-13T...",
  "audit_report_source": "docs/reports/higher-hop-enrichment-pressure-audit.json",
  "pressure_thresholds": {
    "safe": 500,
    "deferred": 500
  },
  "classification": {
    "safe": {
      "count": 8,
      "concepts": [
        { "concept_id": "api_endpoints", "concept_name": "API Endpoints" },
        { "concept_id": "database_orm", "concept_name": "Database ORM" },
        ...
      ]
    },
    "deferred": {
      "count": 2,
      "concepts": [
        { "concept_id": "gpu_cuda", "concept_name": "GPU/CUDA" },
        ...
      ]
    }
  },
  "seeding_strategy": {
    "recommended_approach": "Seed USED_CONCEPT edges from safe concepts only (8)",
    "edge_cap_per_concept": 1000,
    "safe_only_mode": true
  },
  "gates": {
    "safe_concepts_available": "PASS",
    "classification_complete": "PASS"
  }
}
```

**Usage**:
```bash
npm run atlas:classify-supernode-pressure
# Safe-only mode is set by the classifier for use by the seeding script
node scripts/atlas/classify-supernode-pressure.mjs --safe-only --save
```

---

### 3. `seed-neo4j-used-concept-edges.mjs` (Consumer — Modified)

**Purpose**: Seed USED_CONCEPT edges from agent traces, optionally filtered to safe concepts.

**Extensions for Lane 1B**:
- Added `--safe-only` flag
- Loads safe concept list from classifier output
- Filters trace concepts before seeding

**Input**:
- Postgres agent_traces (selected_concepts field)
- (Optional) `docs/reports/higher-hop-enrichment-classified.json`

**Output**:
- `docs/reports/seed-neo4j-used-concept-edges.json`
- Neo4j USED_CONCEPT edges (if `--apply`)

**Usage**:
```bash
# Dry-run (safe-only, from classifier)
npm run atlas:seed-neo4j-used-concept:safe-only:dry

# Apply safe-only seeding
npm run atlas:seed-neo4j-used-concept:safe-only:apply

# Original behavior (all concepts)
npm run atlas:seed-neo4j-used-concept

# Direct invocation with options
node scripts/atlas/seed-neo4j-used-concept-edges.mjs --safe-only --verbose --dry-run
```

**New Report Fields**:
```json
{
  "safe_only": true,
  "traces_after_safe_filter": 1102,
  "edges_planned": 1347,
  "unique_concepts": [
    "api_endpoints",
    "database_orm",
    ...
  ]
}
```

---

## Execution Sequence (Lane 1B)

### Step 1: Measure Pressure
```bash
npm run atlas:supernode:pressure:audit
# Expected output: docs/reports/higher-hop-enrichment-pressure-audit.json
# Gate: concepts classified safe/deferred ✓
```

### Step 2: Classify Safe/Deferred
```bash
npm run atlas:classify-supernode-pressure
# Expected output: docs/reports/higher-hop-enrichment-classified.json
# Gate: safe concepts identified ✓
```

### Step 3: Dry-run Seed (Safe-Only)
```bash
npm run atlas:seed-neo4j-used-concept:safe-only:dry
# Expected output: docs/reports/seed-neo4j-used-concept-edges.json
# Gate: edge count per concept ≤ 1000 ✓
```

### Step 4: Apply Seed
```bash
npm run atlas:seed-neo4j-used-concept:safe-only:apply
# Expected output: Neo4j transaction log
# Gate: 0 errors, edges committed ✓
```

### Step 5: Verify Graph Health
```bash
npm run atlas:graph:density:check
npm run atlas:concept:reachability:check --safe-only
# Expected: density change <10%, all safe concepts reachable ✓
```

---

## Success Criteria

- [ ] **Pressure Audit**: All 10 concepts classified (safe/deferred)
- [ ] **Classified**: Safe concept list generated, deferred backlog documented
- [ ] **Seed Dry-Run**: Edge count ≤ 1000 per safe concept
- [ ] **Seed Apply**: Neo4j transaction commits, 0 errors
- [ ] **Verification**: Graph density stable (<10% change), reachability ✓

---

## Key Concepts

### Supernode Pressure
The number of USED_CONCEPT edges pointing to a concept node. High pressure indicates:
- Concept is widely used in traces
- Adding more edges could impact query performance
- Should defer to later seeding phase if ≥500 edges

### Safe Concepts
Concepts with <500 existing USED_CONCEPT edges. Safe to seed because:
- Won't overwhelm the graph
- Unlikely to degrade performance
- Can be seeded in parallel with other lanes

### Deferred Concepts
Concepts with ≥500 existing USED_CONCEPT edges. Defer because:
- Already have significant edge traffic
- Additional edges could degrade Neo4j performance
- Can be seeded in a later, separate phase with monitoring

### Edge Cap Per Concept
Set to 1000 edges max during seeding. Prevents:
- Single concept node becoming a query bottleneck
- Uncontrolled graph growth
- Neo4j HNSW/query planner exhaustion

---

## Architecture Diagram

```
audit-higher-hop-enrichment.mjs
  ↓
  [Query Neo4j for edge counts per concept]
  ↓
  docs/reports/higher-hop-enrichment-pressure-audit.json
  ↓
  classify-supernode-pressure.mjs
  ↓
  [Classify concepts as safe/deferred]
  ↓
  docs/reports/higher-hop-enrichment-classified.json
  ↓
  seed-neo4j-used-concept-edges.mjs --safe-only --dry-run
  ↓
  [Load safe concept list, filter traces]
  ↓
  docs/reports/seed-neo4j-used-concept-edges.json (dry-run)
  ↓
  seed-neo4j-used-concept-edges.mjs --safe-only --apply
  ↓
  [MERGE Trace + USED_CONCEPT edges in Neo4j]
  ↓
  docs/reports/seed-neo4j-used-concept-edges.json (applied)
  ↓
  Graph density check + concept reachability verification
```

---

## Error Handling & Recovery

### Pressure Audit Fails
**Symptom**: Neo4j unreachable or no concepts in Postgres  
**Recovery**:
```bash
# Verify Neo4j is running
docker ps | grep neo4j

# Verify concepts table populated
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM concepts"

# Restart and retry
npm run atlas:supernode:pressure:audit
```

### Classification Fails
**Symptom**: Audit report not found  
**Recovery**:
```bash
# Run the pressure audit first
npm run atlas:supernode:pressure:audit

# Then classify
npm run atlas:classify-supernode-pressure
```

### Seed Dry-Run Shows 0 Traces
**Symptom**: Safe-only filter removed all traces  
**Recovery**:
```bash
# Check if safe concepts exist
jq '.classification.safe.count' docs/reports/higher-hop-enrichment-classified.json

# Check if traces have those concepts
npm run atlas:seed-neo4j-used-concept:safe-only:dry | grep "unique_concepts"

# If needed, reduce pressure threshold or seed from all concepts
npm run atlas:seed-neo4j-used-concept --dry-run
```

### Seed Apply Fails
**Symptom**: Neo4j transaction errors  
**Recovery**:
```bash
# Check Neo4j logs
docker logs -f legal-ai-neo4j

# Verify transaction isolation level
docker exec legal-ai-neo4j cypher-shell -u neo4j -p neo4j123 "CALL dbms.showCurrentUser()"

# Retry the apply
npm run atlas:seed-neo4j-used-concept:safe-only:apply
```

---

## Performance Notes

### Audit Phase
- **Time**: ~10–30 seconds
- **Neo4j queries**: 1 per concept (10 total) + 1 count query
- **I/O**: 1 report file write

### Classification Phase
- **Time**: <1 second
- **I/O**: 1 file read, 1 report write

### Seed Dry-Run Phase
- **Time**: ~5–10 seconds
- **I/O**: Postgres query, report write
- **Neo4j**: No writes

### Seed Apply Phase
- **Time**: ~2–5 minutes (depends on trace count + Neo4j performance)
- **I/O**: Batch writes to Neo4j (50 traces per batch)
- **Neo4j**: 1134 MERGE operations (1 per trace)

### Verification Phase
- **Time**: ~30–60 seconds
- **Queries**: Density check + reachability check (Cypher)

---

## Integration with Other Lanes

### Lane 1 (Concept Evidence Spine)
- Independent: no shared dependencies
- Both operate on concept nodes in Neo4j
- No conflicts: evidence spine ≠ topology edges

### Lane 2 (Recommendation Merge)
- Independent: recomm engines don't use USED_CONCEPT
- Can run in parallel

### Lane 4 (GPU Karpathy)
- Independent: GPU enrichment doesn't depend on Neo4j
- Can run in parallel

### Lane 5 (TurboVec + Cache Sync)
- Independent: cache keys don't depend on USED_CONCEPT edges
- Can run in parallel

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `scripts/atlas/audit-higher-hop-enrichment.mjs` | Producer | ✅ Created |
| `scripts/atlas/classify-supernode-pressure.mjs` | Classifier | ✅ Created |
| `scripts/atlas/seed-neo4j-used-concept-edges.mjs` | Consumer (modified) | ✅ Updated |
| `docs/reports/higher-hop-enrichment-pressure-audit.json` | Audit output | (generated) |
| `docs/reports/higher-hop-enrichment-classified.json` | Classification output | (generated) |
| `docs/reports/seed-neo4j-used-concept-edges.json` | Seed report | (generated) |

---

## Next Steps

After Lane 1B completes:

1. **Phase B (Cross-Lane Verification)**: Verify lineage + coverage
2. **Phase C (Final Gate)**: Comprehensive validation
3. **Deferred Concepts**: Create a separate phase for high-pressure concepts (≥500 edges)

---

## References

- `docs/atlas/AGENT-TASK-PACKAGES-2026-06-13.md#-agent-2-lane-1b`
- `docs/atlas/LANE-QUICK-REFERENCE.md#lane-1b`
- `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts`
- Neo4j USED_CONCEPT edge structure (from Memory)
