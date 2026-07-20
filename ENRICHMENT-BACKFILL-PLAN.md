# Enrichment Backfill Plan — July 19, 2026

## Current State

**Tree Node Backfill**: ✅ COMPLETE (100% coverage, 58,365 packets linked)

**Fanout Output** (from structured-lexical-fanout lane):
- ✅ 804 files scanned, 804 labels emitted
- ✅ Fields populated: title_id, file_purpose, thoroughness, app_criticality, domain_class
- ⚠️ Fields missing: openspec_id (0/804), gsd_id (0/804), task_id (0/804)
- ⚠️ Tree nodes: 803/804 missing (expected — 1 Python sidecar without tree facts)

**Downstream Infrastructure**: ❌ BLOCKED
- audit-summary-quality.mjs has import error (pg.createPool not exported)
- audit-higher-hop-enrichment.mjs requires "concepts" table (doesn't exist)
- Enrichment pipeline blocked on missing schema

---

## Enrichment Backfill Phases

### Phase 1: Schema Setup (Prerequisites)
**Blocked Tasks**:
- [ ] Create `concepts` table (required for enrichment audit)
- [ ] Create `openspec_id` mapping table (for openspec-id linkage)
- [ ] Create `gsd_id` mapping table (for GSD task linkage)
- [ ] Create `task_id` mapping table (for task-id linkage)
- [ ] Fix pg.createPool import in audit-summary-quality.mjs

**Action**: These are schema-level prerequisites. Until these tables exist, enrichment pipelines cannot run.

### Phase 2: Domain Class Derivation (Leverages Existing Data)
**Status**: Ready to execute
- Input: 804 fanout labels with `domain_class` already populated
- Logic: Domain class → openspec_id lookup (deterministic mapping)
- Output: 804 rows with openspec_id backfilled
- Effort: ~30 min (no schema changes, just UUID mapping)

**Script Candidate**: `scripts/atlas/derive-openspec-ids.mjs` (needs creation)

### Phase 3: GSD Derivation (Leverages Existing Data)
**Status**: Ready to execute
- Input: 804 fanout labels with `file_purpose` + `app_criticality`
- Logic: Purpose + criticality → gsd_id lookup (deterministic mapping)
- Output: 804 rows with gsd_id backfilled
- Effort: ~30 min (no schema changes, just UUID mapping)

**Script Candidate**: `scripts/atlas/derive-gsd-ids.mjs` (needs creation)

### Phase 4: Task ID Linkage (Depends on Phase 1)
**Status**: Blocked on schema
- Input: 804 fanout labels with `title_id` + `domain_class`
- Logic: Query external task registry (if exists) or manual assignment
- Output: 804 rows with task_id backfilled
- Effort: TBD (depends on task registry availability)

**Script Candidate**: `scripts/atlas/derive-task-ids.mjs` (needs creation)

---

## Recommended Next Step

**Start with Phase 2 + Phase 3** (no schema changes required):
1. Create `derive-openspec-ids.mjs` — map domain_class → openspec_id UUID
2. Create `derive-gsd-ids.mjs` — map (file_purpose, app_criticality) → gsd_id UUID
3. Run both in dry-run mode to validate mappings
4. Apply and verify 804 files now have openspec_id + gsd_id

**Parallel (Phase 1)**: Identify which enrichment tables actually need to be created. If they already exist as part of the larger schema, the audit scripts will work.

---

## Gap Analysis

| Field | Status | Source | Derivation |
|-------|--------|--------|-----------|
| title_id | ✅ 804/804 | fanout | Direct emit |
| domain_class | ✅ 804/804 | fanout | Direct emit |
| file_purpose | ✅ 804/804 | fanout | Direct emit |
| app_criticality | ✅ 804/804 | fanout | Direct emit |
| thoroughness | ✅ 804/804 | fanout | Direct emit |
| tree_node_id | ✅ 803/804 | postgres | Backfilled (1 expected miss) |
| **openspec_id** | ❌ 0/804 | — | domain_class → UUID map |
| **gsd_id** | ❌ 0/804 | — | (purpose, criticality) → UUID map |
| **task_id** | ❌ 0/804 | — | external registry or manual |

---

## Files to Create

### `scripts/atlas/derive-openspec-ids.mjs`
```javascript
/**
 * Derive OpenSpec IDs from domain_class
 * Maps: domain_class → stable openspec_id UUID
 *
 * Input: 804 fanout labels with domain_class
 * Output: 804 rows with derived openspec_id
 * Modes: --dry-run (default), --apply
 */
```

### `scripts/atlas/derive-gsd-ids.mjs`
```javascript
/**
 * Derive GSD IDs from (file_purpose, app_criticality)
 * Maps: (purpose, criticality) pair → stable gsd_id UUID
 *
 * Input: 804 fanout labels with file_purpose + app_criticality
 * Output: 804 rows with derived gsd_id
 * Modes: --dry-run (default), --apply
 */
```

### `scripts/atlas/derive-task-ids.mjs`
```javascript
/**
 * Derive Task IDs from fanout + external registry
 * Maps: title_id + domain_class → task_id (if registry exists)
 *
 * Input: 804 fanout labels with title_id + domain_class
 * Output: 804 rows with derived task_id
 * Modes: --dry-run (default), --apply
 * Status: Blocked pending task registry availability
 */
```

---

## Success Criteria

- [ ] Phase 2: 804/804 files have openspec_id (non-null UUID)
- [ ] Phase 3: 804/804 files have gsd_id (non-null UUID)
- [ ] Phase 4: 804/804 files have task_id (if registry available)
- [ ] All 804 files have complete enrichment (0 nulls)
- [ ] Enrichment audit scripts run without errors
- [ ] JSON/Markdown reports regenerated with full enrichment

---

## Effort Estimate

| Phase | Work | Time | Blocker |
|-------|------|------|---------|
| 1 | Schema setup | 1-2h | None (optional) |
| 2 | OpenSpec derivation | 30min | None |
| 3 | GSD derivation | 30min | None |
| 4 | Task ID linkage | TBD | Registry availability |
| **Total** | **Full enrichment** | **~2-3h** | **None (P1-3 ready now)** |

---

## Recommendation

**Execute Phase 2 + 3 immediately** (no blockers, ~1 hour total):
1. Create derive-openspec-ids.mjs
2. Create derive-gsd-ids.mjs
3. Run dry-run, verify, apply
4. Regenerate fanout reports with complete enrichment

**Defer Phase 4** until task registry is available or manual assignment strategy is decided.

**Defer Phase 1** until enrichment audit scripts actually fail on missing tables.

---

**Status**: Ready to proceed with Phase 2 + 3  
**Next Action**: Create derive-openspec-ids.mjs script  
**Owner**: Atlas Enrichment Pipeline  
**Date**: July 19, 2026
