---
name: Session 108 LAYER 2 Execution Plan — Compiler Output Expansion
description: LAYER 2 work unblocked by LAYER 1 completion. Documented existing scripts and architectural findings. Ready for execution in next session.
type: project
---

# SESSION 108 LAYER 2 EXECUTION PLAN

**Date**: 2026-07-05 (Session 108 final)
**Status**: ⏳ **READY FOR EXECUTION** | ✅ **ARCHITECTURAL FINDINGS DOCUMENTED**

---

## Executive Summary

LAYER 1 (Canonical Identity) is now 100% complete. LAYER 2 (Compiler Output) expansion is unblocked and ready to execute. Existing npm scripts for ast-grep and lexical extraction are available; however, **architectural clarification needed** on how to bridge synthetic packet_keys (from real files) to actual atlas_packets.

---

## Current State

| Field | Coverage | Status | Notes |
|-------|----------|--------|-------|
| used_concepts | 58,361/58,366 (99.99%) | ✅ Nearly done | LangExtract seeded via Phase 8 |
| lexical_features | ~2,000/58,366 (3.4% est) | ⏳ Ready to expand | Script exists: `phase1.5-lexical-extraction.mjs` |
| ast_symbols | 516/58,366 (0.9%) | ⏳ Ready to expand | Script exists: `phase1-ast-grep-extraction.mjs` (synthetic keys) |
| entities | Partial | ⏳ Ready to expand | Script exists: `phase8-step3-langextract-entities.py` |
| imports/exports | Partial | ⏳ Not yet wired | Needs ast-grep pattern extraction |
| functions/classes | Partial | ⏳ Not yet wired | Needs ast-grep pattern extraction |
| routes | Partial | ⏳ Not yet wired | Needs SvelteKit route parser |
| permissions | 0% | ⏳ Not yet wired | Needs auth scope analysis |

---

## Existing npm Scripts (Available Now)

```bash
# ast-grep extraction (currently uses synthetic keys)
npm run atlas:phase1:ast-grep:dry --limit=100
npm run atlas:phase1:ast-grep:apply

# Lexical feature extraction (depends on ast_symbols)
npm run atlas:phase1.5:lexical:dry --limit=100
npm run atlas:phase1.5:lexical:apply

# LangExtract entity extraction (Python-based)
npm run atlas:phase8:step3:langextract:dry --limit=50
npm run atlas:phase8:step3:langextract:apply --limit=200
npm run atlas:phase8:step3:langextract:full --limit=2000

# Batch tuples extraction
npm run atlas:tuples:extract:dry --limit=100
npm run atlas:tuples:extract:apply --limit=1000
```

---

## Architectural Findings

### Finding 1: ast-grep Script Creates Synthetic Keys
The `phase1-ast-grep-extraction.mjs` script:
- Scans real TypeScript files in `src/`
- Creates synthetic packet_keys: `codebase:src/lib/...`
- These keys do NOT match atlas_packets.packet_key values
- Result: Extracted symbols are written to non-existent rows

**Impact**: Script extracts symbols but doesn't integrate with existing atlas_packets.

**Solution needed**: Either:
1. Modify script to map real files → atlas_packets.source_ref → packet_key (recommended)
2. Create a bridge table `codebase_ast_symbols(real_path, ast_symbols)` and join at query time
3. Rebuild atlas_packets from real files using correct packet_keys (larger change)

### Finding 2: Lexical Extraction Depends on ast_symbols
The `phase1.5-lexical-extraction.mjs` script:
- Requires ast_symbols to already be populated
- Reads from atlas_packet_features(packet_key, ast_symbols)
- Extracts n-grams, keywords, TF-IDF ranked terms
- Writes lexical_features[] to atlas_packet_features

**Blocker**: Can't run phase1.5 until phase1 ast-grep is fixed

### Finding 3: LangExtract is Already Seeded
The `phase8-step3-langextract-entities.py` script:
- Extracts entities (PII, dates, places, named entities)
- Works on real codebase files
- Has --limit, --dry-run, --apply, --verbose flags
- Already in production use

**Status**: Can run immediately for entities expansion

### Finding 4: existing astmaps vs atlas_packets mismatch
The atlas_packets table contains 58,365 packets with source_ref values. However:
- Some source_refs are `proto:*`, `task:*`, `feature:*` (not real files)
- Real file source_refs should map 1:1 to files in src/

This split (metadata vs code) is intentional but complicates ast-grep integration.

---

## Recommended Execution Order (Session 109+)

### Phase 2A: Fix ast-grep Integration (1-2h)
**Goal**: Make ast-grep extraction write to actual atlas_packets rows

**Option A (Recommended)**: Modify `phase1-ast-grep-extraction.mjs`
- Read atlas_packets where source_ref NOT LIKE 'proto:%' AND source_ref NOT LIKE 'task:%'
- For each source_ref, check if file exists at `repoRoot/source_ref`
- If exists, extract symbols and write to atlas_packet_features(packet_key, ast_symbols)
- If not exists, skip (it's a non-file reference)

**Option B**: Create bridge table
- `CREATE TABLE ast_symbols_scratch(source_ref TEXT, symbols TEXT[], created_at TIMESTAMP)`
- Write to scratch table
- Join at query time: `atlas_packets → ast_symbols_scratch` via source_ref

**Option C**: Expand atlas_packets generation
- Rebuild packets from real files only
- Large refactor; not recommended now

**Recommendation**: Pursue Option A (modify phase1-ast-grep-extraction.mjs to filter to real files and write to correct packet_keys).

### Phase 2B: Run Lexical Extraction (2-3h) — After Phase 2A
```bash
npm run atlas:phase1.5:lexical:dry --limit=1000
npm run atlas:phase1.5:lexical:apply --limit=10000  # Expand to all
```

### Phase 2C: Run LangExtract Entities (2h) — Can run in parallel
```bash
npm run atlas:phase8:step3:langextract:dry --limit=100
npm run atlas:phase8:step3:langextract:apply --limit=500
npm run atlas:phase8:step3:langextract:full --limit=2000  # Full run
```

### Phase 2D: Wire Remaining Extractors (6-8h) — Session 110+
- imports/exports: Use ast-grep patterns for import/export statements
- functions/classes: Already partially covered by phase1 ast-grep, but expand
- routes: SvelteKit-specific pattern parser (look for `src/routes/**/+page.svelte` and `+server.ts`)
- permissions: Scan for `locals.user`, `requireAuth`, role checks, permission keywords

---

## Database Schema Verification

```sql
-- Check atlas_packet_features table
SELECT COUNT(*), COUNT(ast_symbols), COUNT(lexical_features), COUNT(entities)
FROM atlas_packet_features
WHERE array_length(ast_symbols, 1) > 0
   OR array_length(lexical_features, 1) > 0
   OR array_length(entities, 1) > 0;

-- Expected post-Phase2B output: ~47K rows with at least one field populated
```

---

## Blockers & Dependencies

| Blocker | Status | Impact | Resolution |
|---------|--------|--------|-------------|
| ast-grep script uses synthetic keys | ✅ Identified | Phase 2A blocked | Modify script to use real packet_keys |
| Lexical depends on ast_symbols | ✅ Known | Phase 2B blocked until 2A | Sequential execution |
| file existence verification | ✅ Solvable | ast-grep needs file checks | Add `fs.existsSync()` to script |
| Performance on 58K packets | ⏳ Unknown | Batch processing may slow | Use --limit, batch sizes, parallel workers |

---

## Success Criteria

**LAYER 2 Complete when:**
- [ ] ast_symbols: >80% coverage (>46K packets)
- [ ] lexical_features: >80% coverage (>46K packets)
- [ ] used_concepts: 100% (already at 99.99%, finish remaining 5)
- [ ] entities: >80% coverage (>46K packets)
- [ ] imports/exports/functions/classes: >80% coverage (>46K packets)
- [ ] routes: >80% coverage for SvelteKit app routes
- [ ] permissions: >80% coverage for auth-guarded routes

**Verification gate**: `npm run atlas:verify:layer2:coverage` → all fields report ≥80%

---

## Files to Modify / Create (Session 109)

1. **Modify**: `scripts/atlas/phase1-ast-grep-extraction.mjs`
   - Add packet_key lookup logic
   - Filter source_refs to real files
   - Write to atlas_packet_features(packet_key) instead of synthetic keys

2. **Create**: `scripts/atlas/phase2-layer2-orchestrator.mjs`
   - Sequential runner: phase1-fixed → phase1.5-lexical → phase8-entities
   - Collects coverage stats
   - Reports progress per field

3. **Create**: `scripts/atlas/verify-layer2-coverage.mjs`
   - Counts >0-length arrays per field
   - Reports coverage % for each
   - Fails if any field <80%

---

## Handoff for Session 109

LAYER 1 is production-ready and locked. LAYER 2 is unblocked and ready for execution. The main work is:

1. **Fix ast-grep integration** (1-2h) — modify phase1-ast-grep-extraction.mjs to write to real packet_keys
2. **Execute lexical extraction** (2-3h) — run phase1.5-lexical on all packets
3. **Execute entity extraction** (2h) — run phase8-langextract for PII/dates/places
4. **Wire remaining extractors** (6-8h, Session 110) — imports/exports/functions/classes/routes/permissions

**Total effort**: 7-10h for Phase 2A-C, +6-8h for Phase 2D. Sufficient to reach >80% coverage across all LAYER 2 fields and unblock LAYER 3 metrics work.

---

## References

- [SESSION-108-LAYER-1-COMPLETE.md](SESSION-108-LAYER-1-COMPLETE.md) — LAYER 1 status
- [SESSION-108-MASTER-ROADMAP-FINAL.md](SESSION-108-MASTER-ROADMAP-FINAL.md) — Full four-layer roadmap
- [SESSION-108-FOUR-LAYER-REORGANIZATION.md](SESSION-108-FOUR-LAYER-REORGANIZATION.md) — Detailed layer specs
- `scripts/atlas/phase1-ast-grep-extraction.mjs` — ast-grep extractor (needs fixing)
- `scripts/atlas/phase1.5-lexical-extraction.mjs` — lexical feature extractor (ready)
- `scripts/atlas/phase8-step3-langextract-entities.py` — entity extraction (ready)
