# Phase 3: ATLAS-3A Symbol Map Foundation
**Date:** 2026-06-10  
**Status:** CRITICAL PATH (Blocks all subsequent Phase 3 work)  
**Previous Phases:** ATLAS-1.0 ✅ LOCKED, ATLAS-2.0 ✅ FROZEN  

---

## Executive Summary

**Phase 3 pivots from "storage + retrieval quality" to "agentic source intelligence binding."**

The 5% remaining work is not retrieval metrics—it's **connecting NES/CHR cartridge memories → source_ref → executable symbols (functions, routes, exports) → repair skills**.

### Current State
```
✅ Packets materialized: 14,515 (ATLAS-1.0 complete)
✅ Topology ready: Neo4j + communities (ATLAS-2.0 complete)
❌ Symbol map missing: Cannot route "username already taken" → function → repair skill
❌ Community coverage: 0% (Phase 2B didn't persist)
```

**The system can retrieve code, but cannot reliably execute repairs.**

---

## Phase 3 Structure (Reframed)

**ATLAS-3A: Symbol/Function/SourceRef Map** ← **START HERE**
- Extract source_ref → symbols (functions, routes, exports, components)
- Link to feature_id (atlas_feature_map) and packet_key (nes_chrom_packets)
- Enable agentic repair skill lookup by error type

**ATLAS-3B: Dynamic Repair Skill Registry**
- Depends on ATLAS-3A symbols being populated
- Map error patterns → repair skills → dry-run patches → validation

**ATLAS-3C: HyperRAG Authority Reranker + Benchmark**
- Depends on ATLAS-3A + 3B (retrieval now returns executable symbols)
- 100-query benchmark, authority score formula, >95% community coverage

**ATLAS-3D: Active Learning Candidate Capture**
- Depends on 3A/3B/3C (repair skill calls + outcomes = training data)
- Harvest 1,000+ real repair failures for LoRA

---

## ATLAS-3A: Symbol Map Foundation (IMMEDIATE)

### Artifacts Created
```
✅ drizzle/manual/atlas-3a-symbol-map.sql — Schema (2 tables, 9 indexes)
✅ scripts/atlas/extract-symbol-map.mjs — Extraction + upsert runner
```

### Database Schema

**Primary table: `atlas_symbol_map`**
```sql
CREATE TABLE atlas_symbol_map (
  id bigserial PRIMARY KEY,
  source_ref text NOT NULL,          -- src/routes/api/auth/register/+server.ts
  feature_id text,                   -- auth-register (from atlas_feature_map)
  packet_key text,                   -- pk:abc123 (from nes_chrom_packets)
  symbol_name text NOT NULL,         -- registerUser, POST, component, etc.
  symbol_kind text NOT NULL,         -- function, api_handler_POST, svelte_component, test_case, repair_skill, etc.
  export_kind text,                  -- named, default, handler
  route_id text,                     -- /auth/register (for SvelteKit routes)
  line_start integer,                -- Line number in source file
  line_end integer,
  payload jsonb,                     -- signature, dependencies, repair_skill_candidates, tests
  created_at, updated_at
);
```

**Bridge table: `atlas_source_to_file_path`**
- Temporary: maps nes_chrom_packets.source_ref → codebase_files.file_path → community_id
- Fixes Phase 2B gap (community_id = 0% in glyph_records)

### Symbol Classifications

Extracted kinds:
- `function` — standard functions
- `class`, `interface`, `type_alias`
- `api_handler_GET`, `api_handler_POST`, `api_handler_PUT`, `api_handler_DELETE` — SvelteKit +server.ts
- `svelte_component`, `svelte_load`, `svelte_action` — SvelteKit routes
- `server_action` — form actions
- `drizzle_table` — database schema
- `zod_schema` — validation
- `test_case` — unit tests
- `repair_skill` — agentic error fixes

### Execution
```bash
# Create schema
psql $DATABASE_URL -f drizzle/manual/atlas-3a-symbol-map.sql

# Extract symbols (analysis only)
npm run atlas:extract-symbols:dry

# Extract and persist
npm run atlas:extract-symbols

# Verify extraction
npm run atlas:audit-symbols
```

### Success Criteria

**Extraction must:**
- [ ] Extract >1,000 symbols across source tree
- [ ] Classify by kind with >90% accuracy (manual spot-check 20 samples)
- [ ] Link >80% of symbols to feature_id (from atlas_feature_map join)
- [ ] Link >70% of symbols to packet_key (from nes_chrom_packets join)
- [ ] Populate bridge table: source_ref → file_path → community_id

**Bridge table must:**
- [ ] Have 1:1 mapping from nes_chrom_packets.source_ref
- [ ] Enable: `UPDATE glyph_records SET community_id = (SELECT community_id FROM atlas_source_to_file_path WHERE ...)`

**Then Phase 2B persistence:**
```bash
npm run atlas:phase2b:community-backfill  # (new script)
# Populates glyph_records.community_id from bridge
# Targets: >95% coverage gate
```

---

## Phase 3A Usage: Query → Symbol → Skill

### Example: "username already taken"

**Current (before 3A):**
```
query embedding → Qdrant vector search → top-k packets → hydrate → ACE context → Gemma4
```

**After ATLAS-3A:**
```
query embedding
  → Qdrant vector search (top-k packets)
  → [per packet] atlas_symbol_map lookup by source_ref + symbol_kind = 'api_handler_POST'
  → Identify route action: registerUser in +server.ts
  → [if error] Look up repair_skill candidates in symbol_map.payload
  → Find skill: drizzle-unique-constraint-fix
  → Dry-run patch on source code
  → Validation test (smoke test for unique constraint)
  → Self-heal packet (update response in glyph_records)
```

This transforms retrieval from **informational** to **executable**.

---

## Why ATLAS-3A Must Come First

1. **3B (repair registry) depends on 3A symbols** — Can't map errors to skills without knowing which functions exist
2. **3C (benchmark) measures symbol accuracy** — "username already taken" → correct route action is success criterion
3. **3D (active learning) captures skill calls** — Repair execution traces depend on 3A linking error → source_ref → symbol
4. **Phase 4 CHR97** needs symbol references for cartridge compression — Can't export executables without symbol index

**Without ATLAS-3A, Phase 3B/3C/3D are architectural dead ends.**

---

## Community Coverage Fix (Prerequisite for 3C)

Current state: 0% (Phase 2B did not persist)

**Fix path:**
1. Run `extract-symbol-map.mjs` → populates bridge table (source_ref → file_path)
2. Run backfill script (new):
   ```sql
   UPDATE glyph_records SET community_id = (
     SELECT c.community_id
     FROM atlas_source_to_file_path a
     JOIN codebase_files c ON c.file_path = a.file_path
     WHERE a.source_ref = nes_chrom_packets.source_ref
   )
   WHERE community_id IS NULL;
   ```
3. Verify gate: `SELECT COUNT(community_id) / COUNT(*) FROM glyph_records` > 0.95
4. If gate fails, trigger: `npm run atlas:phase2b:coverage-closure` (fuzzy match + Rust k=30 + fallback)

---

## Timeline

| Week | Gate | Focus |
|------|------|-------|
| 1 | 3A | Symbol extraction + classification + bridge population |
| 2 | 3B | Repair skill registry + error pattern mapping |
| 3 | 3C | Community coverage >95% + authority reranker + benchmark |
| 4 | 3D | Active learning harvest + Phase 3 sign-off |

---

## Next Actions (Today)

1. ✅ Create migration: `atlas-3a-symbol-map.sql`
2. ✅ Create extractor: `extract-symbol-map.mjs`
3. 📋 Add npm scripts to package.json:
   ```json
   "atlas:extract-symbols": "node ../scripts/atlas/extract-symbol-map.mjs",
   "atlas:extract-symbols:dry": "node ../scripts/atlas/extract-symbol-map.mjs --dry-run",
   "atlas:extract-symbols:audit": "node ../scripts/atlas/extract-symbol-map.mjs --audit",
   "atlas:phase2b:community-backfill": "node ../scripts/atlas/backfill-community-ids.mjs"
   ```
4. 📋 Run: `npm run atlas:extract-symbols:dry` (verify extraction logic)
5. 📋 Run: `npm run atlas:extract-symbols` (populate atlas_symbol_map + bridge)
6. 📋 Verify: `npm run atlas:extract-symbols:audit`
7. 📋 Backfill: `npm run atlas:phase2b:community-backfill` (restore Phase 2B persistence)
8. 📋 Gate check: `SELECT 100 * COUNT(community_id) / COUNT(*) FROM glyph_records` must be >95

---

## Reference

- **ATLAS Freeze Decision**: `ATLAS-FREEZE-DECISION.md`
- **HyperRAG Runtime**: `docs/atlas/ATLAS-3.0-HYPERRAG-RUNTIME.md`
- **Phase 3 Gates (Original)**: `2026-06-10_PHASE-3-IMPLEMENTATION-GATES.md` (now ATLAS-3A focused)
- **Dynamic Import Analysis**: `docs/reports/dynamic-import-report.md` (complementary symbol source)

---

**Status:** ATLAS-3A ready for execution  
**Blocker:** None (migration + scripts created)  
**Next checkpoint:** 1 day (symbol extraction verification + community coverage restored)
