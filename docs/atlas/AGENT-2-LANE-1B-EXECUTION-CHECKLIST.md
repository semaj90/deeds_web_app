# Agent 2 — Lane 1B Execution Checklist

**Agent**: 2  
**Lane**: 1B — Higher-Hop Enrichment  
**Objective**: Measure supernode pressure + seed bounded USED_CONCEPT edges (30% → 100%)  
**Timeline**: 2–3 hours  
**Status**: ✅ Scripts Ready for Execution  

---

## Pre-Flight Checks (5 min)

Before starting, verify:

- [ ] **Neo4j Running**: `docker ps | grep neo4j`
  - Expected: `legal-ai-neo4j` container running
  - If missing: `docker-compose up legal-ai-neo4j`

- [ ] **Postgres Running**: `docker ps | grep postgres`
  - Expected: `legal-ai-postgres` container running
  - If missing: `docker-compose up legal-ai-postgres`

- [ ] **Concepts Exist**: 
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT COUNT(*) FROM concepts"
  ```
  - Expected: 10 concepts
  - If 0: Populate concepts table (contact workstation)

- [ ] **Traces Exist**:
  ```bash
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
    -c "SELECT COUNT(*) FROM agent_traces WHERE selected_concepts IS NOT NULL"
  ```
  - Expected: ~1,134 traces
  - If 0: Traces not indexed (pre-requisite from Lane 3)

- [ ] **NPM Scripts Available**:
  ```bash
  npm run | grep "atlas:supernode:pressure:audit"
  ```
  - Expected: Script listed
  - If missing: Run `npm install` and retry

---

## Task 1: Measure Supernode Pressure (10–30 sec)

### Execute

```bash
npm run atlas:supernode:pressure:audit
```

### Expected Output

```
═══ Audit Higher-Hop Enrichment (Lane 1B) ═══

✓ Loaded 10 concepts from Postgres
✓ Concept Pressure Analysis
  Safe concepts:     8/10
  Deferred concepts: 2/10
  Total edges in graph: 2268
  Avg edges/concept: 226

✓ Trace Inventory
  Total traces:      1134
  Unique concepts:   9
  Avg concepts/trace: 1.24

✓ Report saved: docs/reports/higher-hop-enrichment-pressure-audit.json

✓ Audit complete. Safe to seed from 8 concepts.
```

### Gate: Concepts Classified

- [ ] Concepts file generated: `docs/reports/higher-hop-enrichment-pressure-audit.json`
- [ ] Report contains 10 concepts with pressure classification
- [ ] `gates.concepts_classified` = `PASS`
- [ ] `gates.safe_concepts_available` = `PASS`

**If FAIL**: Check Neo4j connection or concepts table population

---

## Task 2: Classify Safe/Deferred (< 1 sec)

### Execute

```bash
npm run atlas:classify-supernode-pressure
```

### Expected Output

```
═══ Classify Supernode Pressure (Lane 1B) ═══

✓ Classification Complete
  Safe concepts:     8
  Deferred concepts: 2

Safe Concept List:
  • api_endpoints (API Endpoints)
  • auth_login_register (Authentication)
  • cache_infrastructure (Caching)
  • database_orm (Database ORM)
  • error_analysis (Error Analysis)
  • gpu_compute (GPU Computing)
  • rag_retrieval (RAG Retrieval)
  • vector_database (Vector Database)

Deferred Concepts (will be seeded in a later phase):
  • gpu_cuda (GPU/CUDA) [750 edges]
  • legal_reasoning (Legal Reasoning) [620 edges]

✓ Safe-only mode: Using 8 safe concepts for seeding.

✓ Classification saved: docs/reports/higher-hop-enrichment-classified.json
```

### Gate: Safe Concepts Identified

- [ ] Classification file generated: `docs/reports/higher-hop-enrichment-classified.json`
- [ ] Safe concepts count ≥ 5 (goal: 8)
- [ ] Deferred concepts listed with edge counts
- [ ] `gates.safe_concepts_available` = `PASS`

**If FAIL**: Run pressure audit first, check for 0 safe concepts

---

## Task 3: Dry-Run Seed USED_CONCEPT (5–10 sec)

### Execute

```bash
npm run atlas:seed-neo4j-used-concept:safe-only:dry
```

### Expected Output

```
═══ Seed Neo4j USED_CONCEPT Edges (dry-run) (safe-only) ═══

Traces with selected_concepts: 1134
Processing: 1134

Filtering to safe concepts only: 8 concepts

Edges to create:  1347
Unique concepts:  8
Concepts:         api_endpoints, auth_login_register, cache_infrastructure, ...

Report: docs/reports/seed-neo4j-used-concept-edges.json

(dry-run — no Neo4j writes; run with --apply to commit)
```

### Gate: Edge Count Validation

- [ ] Report file generated: `docs/reports/seed-neo4j-used-concept-edges.json`
- [ ] `safe_only` flag = `true`
- [ ] `edges_planned` ≤ 1000 per concept (1347 total ÷ 8 concepts = ~168 avg)
- [ ] No Neo4j writes (dry-run only)

**If FAIL**: Check classification file exists and is readable

---

## Task 4: Apply Seed USED_CONCEPT (2–5 min)

### Execute

```bash
npm run atlas:seed-neo4j-used-concept:safe-only:apply
```

### Expected Output

```
═══ Seed Neo4j USED_CONCEPT Edges (APPLY) (safe-only) ═══

Traces with selected_concepts: 1134
Processing: 1134

Filtering to safe concepts only: 8 concepts

Edges to create:  1347
Unique concepts:  8
Concepts:         api_endpoints, auth_login_register, cache_infrastructure, ...

Neo4j connected: bolt://127.0.0.1:7687

  200/1134 traces written
  400/1134 traces written
  600/1134 traces written
  800/1134 traces written
  1000/1134 traces written
  1134/1134 traces written

══ Gate Evaluation ══════════════════════════════════
  Trace nodes in Neo4j:     1134
  Traces from Postgres:     1134
  Traces with USED_CONCEPT: 1134
  Total USED_CONCEPT edges: 1347
  Coverage ≥ 95%:           ✅ (1134/1134 = 100.0%)

  ✅ GATE PASS

══ Summary ══════════════════════════════════════════
  Applied: 1134 trace rows
  Errors:  0
  Report:  docs/reports/seed-neo4j-used-concept-edges.json
```

### Gate: Neo4j Transaction Committed

- [ ] Report file updated: `docs/reports/seed-neo4j-used-concept-edges.json`
- [ ] `mode` = `apply`
- [ ] `applied` ≥ 1100 traces
- [ ] `errors` = 0
- [ ] Gate result shows coverage ≥ 95%
- [ ] Neo4j transaction log confirms MERGE operations

**If FAIL**: Check Neo4j connection, transaction logs

---

## Task 5: Verify Graph Health (30–60 sec)

### Execute

```bash
npm run atlas:graph:density:check
npm run atlas:concept:reachability:check --safe-only
```

### Expected Output

```
✓ Graph density analysis complete
  Pre-seeding density:  0.0025 (0.25%)
  Post-seeding density: 0.0027 (0.27%)
  Change:              +0.02% (PASS — within 10% threshold)

✓ Reachability check (safe-only mode)
  Total reachable concepts: 8/8
  Reachable via USED_CONCEPT: 8/8
  Unreachable (deferred):    2/2
  Status: ✅ PASS
```

### Gate: Graph Health Verified

- [ ] Density check: `<10% change` (expected: ~0–2%)
- [ ] Reachability: `8/8 safe concepts reachable`
- [ ] No Neo4j errors in logs

**If FAIL**: Check Neo4j logs, verify edge creation in Task 4

---

## Summary Report (To Workstation)

After all 5 tasks complete, report:

```
LANE 1B COMPLETION SUMMARY
==========================

Status: ✅ COMPLETE

Tasks:
  [x] Task 1: Measure Supernode Pressure
      Output: higher-hop-enrichment-pressure-audit.json
      Gate: 10/10 concepts classified ✅

  [x] Task 2: Classify Safe/Deferred
      Output: higher-hop-enrichment-classified.json
      Gate: 8 safe concepts identified ✅

  [x] Task 3: Dry-Run Seed
      Output: seed-neo4j-used-concept-edges.json (dry-run)
      Gate: 1347 edges planned, ~168 avg per concept ✅

  [x] Task 4: Apply Seed
      Output: seed-neo4j-used-concept-edges.json (applied)
      Gate: 1134 traces with USED_CONCEPT edges, coverage=100% ✅

  [x] Task 5: Verify Graph Health
      Gate: Density change +0.02%, reachability 8/8 ✅

Reports:
  - docs/reports/higher-hop-enrichment-pressure-audit.json
  - docs/reports/higher-hop-enrichment-classified.json
  - docs/reports/seed-neo4j-used-concept-edges.json (x2: dry-run + applied)

Next: Await Phase B cross-lane verification
```

---

## Troubleshooting

### Symptom: Neo4j Connection Fails
```
⚠️  Neo4j unavailable (ConnectException: ...) — aborting apply
```

**Recovery**:
```bash
# Check if Neo4j is running
docker ps | grep neo4j

# Restart if needed
docker-compose restart legal-ai-neo4j

# Retry the apply task
npm run atlas:seed-neo4j-used-concept:safe-only:apply
```

### Symptom: Pressure Audit Returns 0 Concepts
```
❌ No concepts found in Postgres. Aborting.
```

**Recovery**:
```bash
# Populate concepts table (contact workstation)
# Or verify concepts exist:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT * FROM concepts LIMIT 5"
```

### Symptom: Dry-Run Shows 0 Traces After Safe Filter
```
Filtering to safe concepts only: 8 concepts
Edges to create:  0
```

**Recovery**:
```bash
# Check if safe concepts exist in classification
jq '.classification.safe.concepts' docs/reports/higher-hop-enrichment-classified.json

# Check if traces have those concepts
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT COUNT(*) FROM agent_traces WHERE selected_concepts @> '[\"api_endpoints\"]'::jsonb"
```

### Symptom: Apply Fails with Transaction Error
```
Batch 0–50 failed: Transaction rolled back
```

**Recovery**:
```bash
# Check Neo4j transaction logs
docker logs legal-ai-neo4j | tail -50

# Verify database state
docker exec legal-ai-neo4j cypher-shell -u neo4j -p neo4j123 \
  "MATCH (c:Concept) RETURN count(c) AS concept_count"

# Retry
npm run atlas:seed-neo4j-used-concept:safe-only:apply
```

---

## Key References

- **Main Guide**: `docs/atlas/LANE-1B-HIGHER-HOP-ENRICHMENT.md`
- **Task Package**: `docs/atlas/AGENT-TASK-PACKAGES-2026-06-13.md#-agent-2-lane-1b`
- **Quick Reference**: `docs/atlas/LANE-QUICK-REFERENCE.md#lane-1b`
- **Schema**: `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts`

---

## Time Estimate

- Pre-flight: 5 min
- Task 1 (Audit): 1 min
- Task 2 (Classify): <1 min
- Task 3 (Dry-run): 1 min
- Task 4 (Apply): 5 min
- Task 5 (Verify): 2 min
- **Total**: ~15 min

(Actual time may vary based on Neo4j performance and system load)

---

## Sign-Off

When complete, mark all checkboxes and report to workstation:

**Agent 2 Lane 1B Status**: ✅ COMPLETE  
**All Gates**: ✅ PASS  
**Ready for Phase B**: YES  

Proceed to Phase B cross-lane verification.
