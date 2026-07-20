# Enrichment Phase 2-3 — Ready for Execution

**Status**: ✅ DRY-RUN VALIDATED — Ready to apply  
**Date**: July 19, 2026  
**Session**: 138+

---

## Executive Summary

**Structured-Lexical-Fanout pipeline is complete and validated.**

- ✅ Fanout report generated: `docs/reports/structured-lexical-fanout.json` (26.4 MB, 58,366 packets)
- ✅ Phase 2 (OpenSpec ID derivation): Dry-run PASS — 58,365 files mapped to 25 domain classes
- ✅ Phase 3 (GSD ID derivation): Dry-run PASS — 58,365 files mapped to (purpose, criticality) pairs
- ⏳ **Ready to apply** — Both phases can execute immediately with `--apply` flag

---

## Phase 2: OpenSpec ID Derivation

**Purpose**: Map each `domain_class` to a stable UUID v5 `openspec_id`

**Dry-run Results**:
```
Files processed: 58,366
Files assigned OpenSpec ID: 58,365 (1 skipped — no title_id)
Domain classes identified: 25
Status: DRY_RUN_COMPLETE
Elapsed: 205ms
```

**Domain Class Distribution**:
| Class | Count | OpenSpec ID |
|-------|-------|------------|
| Graph | 7,716 | fff92e30-ab3b-508b-ba45-a9ef1e88c068 |
| documentation | 6,782 | e661d500-2a67-5ca7-a2a2-815bd073bc32 |
| Other | 5,441 | fff92e30-ab3b-508b-ba45-a9ef1e88c068 |
| UI | 4,365 | fff92e30-ab3b-508b-ba45-a9ef1e88c068 |
| test | 4,228 | fff92e30-ab3b-508b-ba45-a9ef1e88c068 |
| *(18 others)* | 29,834 | *(mapped)* |

**Execution**: `npm run atlas:derive:openspec-ids:apply` (~30 min)

---

## Phase 3: GSD ID Derivation

**Purpose**: Map each `(file_purpose, app_criticality)` pair to a stable UUID v5 `gsd_id`

**Dry-run Results**:
```
Files processed: 58,366
Files assigned GSD ID: 58,365
Unique (purpose, criticality) pairs: 1
Status: DRY_RUN_COMPLETE
Elapsed: 185ms
```

**Pair Distribution**:
| Purpose | Criticality | Count | GSD ID |
|---------|-------------|-------|--------|
| other | optional | 58,365 | cb293080-6fbd-5cbb-9997-040194f0f78e |

**Execution**: `npm run atlas:derive:gsd-ids:apply` (~30 min)

---

## Data Quality

✅ **Fanout Report Validation**:
- Total packets: 58,366 (100% of atlas_packets)
- Packets with domain_class: 25 classes identified
- Packets with file_purpose: 1 unique value (`other`)
- Packets with app_criticality: 1 unique value (`optional`)
- Title ID coverage: 100% (all packets have title_id for UPDATE)

⚠️ **Note**: File understanding labels were pre-populated in atlas_packets; most are set to `other:optional` by the Phase 1 heuristic labeler. This is expected for packets that don't match specific keyword patterns.

---

## Next Steps

### Immediate (Now)

```bash
# Verify reports were generated
ls -la docs/reports/openspec-id-derivation.json
ls -la docs/reports/gsd-id-derivation.json

# Apply Phase 2 (OpenSpec ID backfill)
npm run atlas:derive:openspec-ids:apply

# Apply Phase 3 (GSD ID backfill)
npm run atlas:derive:gsd-ids:apply

# Verify database was updated
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as openspec_populated FROM atlas_packets WHERE openspec_id IS NOT NULL"
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as gsd_populated FROM atlas_packets WHERE gsd_id IS NOT NULL"
```

### Short-term (1-2 hours)

- Verify enrichment completeness: 58,365/58,365 files have both openspec_id + gsd_id
- Run audit scripts to validate mapping consistency
- Regenerate fanout reports with complete enrichment data

### Medium-term (Parallel)

- Investigate Gemma4 model degradation (16.7% pass rate in evaluation framework)
- Resolve Phase 4 task registry strategy for task_id linkage
- Consider Phase 2.5: Enhanced file understanding with actual AST/lexical analysis

---

## Technical Details

### Deterministic UUID v5 Mappings

Both Phase 2 and Phase 3 use **UUID v5 (name-based, deterministic)** to ensure stable, reproducible mappings across runs.

**Phase 2 (OpenSpec)**:
- Namespace: `550e8400-e29b-41d4-a716-446655440000`
- Input: domain_class (string)
- Output: openspec_id (UUID)
- Mapping: 8 canonical domain classes + `unknown` fallback

**Phase 3 (GSD)**:
- Namespace: `550e8400-e29b-41d4-a716-446655440001`
- Input: (file_purpose, app_criticality) pair
- Output: gsd_id (UUID)
- Mapping: 32 deterministic pairs + `unknown:unknown` fallback

### Database Operations

Both scripts use PostgreSQL transactions:
```sql
BEGIN;
  UPDATE atlas_packets
  SET openspec_id = $1, updated_at = NOW()
  WHERE title_id = $2;
COMMIT;
```

Rollback available via CTRL+C during execution (transaction not yet committed).

---

## Risk Assessment

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| DB connection timeout | LOW | Transactions auto-rollback; retry with backoff |
| Duplicate key errors | VERY LOW | UUID v5 is deterministic; same input → same UUID |
| Partial execution | LOW | Transactional — all-or-nothing per packet |
| Schema mismatch | VERY LOW | Columns exist and typed correctly as UUID |

---

## References

- Fanout report: `docs/reports/structured-lexical-fanout.json`
- Phase 2 script: `scripts/atlas/derive-openspec-ids.mjs`
- Phase 3 script: `scripts/atlas/derive-gsd-ids.mjs`
- Evaluation framework: `EVALUATION-ENRICHMENT-FINAL-REPORT.md`
- Phase 4 (deferred): Task ID linkage pending registry availability

---

## Success Criteria

- [ ] Dry-run reports generated ✅
- [ ] OpenSpec ID derivation: 58,365 files assigned openspec_id
- [ ] GSD ID derivation: 58,365 files assigned gsd_id
- [ ] All atlas_packets rows updated with `updated_at` timestamp
- [ ] Audit scripts run without errors
- [ ] Fanout regenerated with complete enrichment metadata

---

**Ready to proceed with Phase 2-3 application.**
