# Phase 3E.1: Concept Telemetry Integration (Pure Data Pipeline)

**Status**: ACTIVE — Implementation lane ready (1–2 weeks)

**Objective**: Wire telemetry → concept memory updates, enabling behavioral lifecycle automation and causality preservation for future agent learning.

---

## Architecture: From Telemetry to Concept Memory

Retrieval Telemetry (L1) → concept_records UPDATE → Lifecycle Distribution & Archive Candidates

---

## Exit Criteria

- [ ] Trigger or batch job linking telemetry → concept updates is LIVE
- [ ] >500 concept_records with populated strategy_distribution
- [ ] strategy_distribution shows meaningful variance
- [ ] Temperature report generated successfully
- [ ] PASS 66 / WARN 0 / FAIL 0 maintained

---

## Task 1: Telemetry → Concept Bridge (DONE ✅)

**File**: src/lib/server/telemetry/retrieval-recorder.ts

**What it does**:
1. Extract featureIds and selectedPacketKey from telemetry signal
2. Find matching concepts by feature_id OR packet_key
3. Increment retrieval_count
4. Update last_retrieved_at = now()
5. Set retrieval_strategy
6. **Increment strategy_distribution[strategy]++** ← CRITICAL
7. Update concept_temperature

**Implementation Status**: ✅ COMPLETE
- Strategy_distribution increment wired (jsonb_set pattern)
- Non-blocking error handling
- Fire-and-forget pattern preserved

---

## Task 2: Temperature Recomputation (Batch Job)

**File**: scripts/atlas/recompute-concept-temperatures.mjs

**Formula**:
temperature = 0.50 · recent_retrievals + 0.30 · repair_success + 0.20 · fusion_rate

**Invocation**:
```bash
npm run phase3e:recompute-temperatures
```

---

## Task 3: Concept Temperature Report

**File**: scripts/atlas/generate-concept-temperature-report.mjs

**Output**: 
- docs/reports/concept-temperature-report.json
- docs/reports/concept-temperature-report.md

**Invocation**:
```bash
npm run phase3e:generate-report
npm run phase3e:update-and-report
```

---

## Task 4: Strategy Distribution Validation

>50% of top-100 concepts should have >1 strategy in distribution.
No strategy should have >90% of total retrievals.
Concepts discovered via fusion should have higher average temperature.

---

## What We're NOT Doing Yet

- Agent Traces (Phase 3F) — Wait for >500 records
- Neo4j DISCOVERED_BY edges (Phase 3G)
- QLoRA Training (Phase 4A)

---

## Success Metrics (EOW June 18)

- [ ] Bridge is live and non-blocking
- [ ] >500 concept_records with retrieval_count > 0
- [ ] >80% of hot concepts have >1 strategy in distribution
- [ ] Report runs successfully
- [ ] Clear strategy patterns exist
- [ ] PASS 66 / WARN 0 / FAIL 0

---

**Status**: Foundation laid. Phase 3E.1 data pipeline ready for testing.
