# Phase 3: Audit Correction & Reframed Priorities
**Date:** 2026-06-10  
**Based On:** Community coverage baseline check  
**Outcome:** Complete reordering of Phase 3 work  

---

## What the Audit Revealed

```
Query:  SELECT 100 * COUNT(community_id) / COUNT(*) FROM glyph_records;
Result: 0.00
Expected: 34%+ (Phase 2B output) or >95% (backfilled)
```

**Phase 2B extracted community_id** (Rust detectCommunitiesRust ran successfully).

**But Phase 2B never persisted it** to:
- nes_chrom_packets.payload.community_id (0%)
- glyph_records.community_id (0%)

This broke the entire Phase 3 architecture:

```
Community detection (Rust)      ✅
  ↓
codebase_files.community_id     ✅ Populated
  ↓
[JOIN BROKEN: file_path ≠ source_ref]
  ↓
nes_chrom_packets.community_id  ❌ 0%
  ↓
glyph_records.community_id      ❌ 0%
  ↓
Authority reranker              ❌ Cannot use topology (no context)
```

---

## What This Means for Phase 3

**Original plan:** Build ATLAS-3A (symbol map) immediately

**Corrected plan:** Fix propagation first (Priority 0), then symbol map (Priority 1)

**Why:** Symbol extraction depends on having topology context available. If community_id is 0%, the reranker has no signal to work with, making ATLAS-3A symbols isolated artifacts instead of topology-aware bridges.

---

## Corrected Priority Sequence

### Priority 0: Topology Propagation (FIX THIS FIRST)

**What:** Backfill `glyph_records.community_id` from `codebase_files.community_id`

**How:**
1. Join `nes_chrom_packets.source_ref = codebase_files.file_path`
2. Populate `nes_chrom_packets.payload.community_id` (JSONB)
3. Update `glyph_records.community_id` from packet_key join

**Script:** `scripts/atlas/backfill-community-id.mjs` ✅ (created)

**Commands:**
```bash
npm run atlas:backfill:community-id:analyze     # Check join status
npm run atlas:backfill:community-id             # Apply backfill
npm run atlas:backfill:community-id:verify      # Gate: >95%
```

**Gate:** `glyph_records.community_id > 95%`

**If gate fails:**
- source_ref ≠ file_path (need fuzzy matching)
- Sparse community_id in codebase_files (need fallback)
- Solution: Levenshtein distance + directory-based clustering

---

### Priority 1: Symbol Map (AFTER P0)

**What:** Extract source_ref → symbols (functions, routes, exports)

**Dependencies:** ✅ Community context available in payloads

**Script:** `scripts/atlas/extract-symbol-map.mjs` ✅ (created)

**Commands:**
```bash
npm run atlas:extract-symbols:dry              # Verify
npm run atlas:extract-symbols                  # Extract
npm run atlas:extract-symbols:audit            # Verify >80% linked
```

**Schema:** Include `signature` field (critical for repair loop + LoRA)

---

### Priority 2: Repair Skill Registry (AFTER P1)

**What:** Map error patterns → repair skills → executable functions

**Dependencies:** ✅ Symbols mapped, know which functions can be called

**Table:** `repair_skills(skill_id, source_ref, entry_symbol, risk_level, ...)`

**Flow:**
```
Error: "duplicate key value"
  ↓
feature_id: auth-register
  ↓
symbol_map lookup: POST handler
  ↓
repair_skills lookup: drizzle-23505-fix
  ↓
dynamic import: applyDrizzleUniqueConstraintFix
  ↓
execute with validation (no arbitrary code)
```

---

### Priority 3: Node Modules API Surface (LOCKS EXTERNAL CALLS)

**What:** Index only `package.json` exports + `.d.ts` definitions, NOT full vendor source

**Dependencies:** ✅ Repair registry controls execution boundary

**Table:** `atlas_package_map(@tanstack/query, useQuery, signature, ...)`

**Prevents:** LLM suggesting arbitrary node_modules imports

---

### Priority 4: Benchmark Validation (PROOF BEFORE CHR97)

**What:** Four comparison runs to prove execution works

1. Vector only → Recall@20: 0.75
2. + Topology → Recall@20: 0.88 (+13%)
3. + Symbols → Recall@20: 0.92 (+5%)
4. + Repair → Repair success % > 90%

**Gate:** Cannot ship CHR97 without Repair % > 90%

---

## Timeline

| Week | Priorities | Gate |
|------|-----------|------|
| 1 | P0 (backfill) + P1 (extract symbols) | community_id > 95%, symbols > 80% linked |
| 2 | P2 (repair registry) | 20+ skills mapped, dry-run validation |
| 3 | P3 (node_modules API) + P4 (benchmark) | Symbol accuracy > 90%, Repair success > 90% |
| 4 | Final sign-off | All gates pass, Phase 4 ready |

---

## Completion Estimate (Corrected)

```
ATLAS-1.0 Identity                      100% (locked)
ATLAS-2.0 Packets                       100% (locked)
ATLAS-2.0 Glyph Layer                   95%
ATLAS-2.0 Community Layer               35%  → P0 backfill → 95%
  
ATLAS-3A Symbol Map                     0%   → P1 extract → 80%+
ATLAS-3B Repair Registry                15%  → P2 wire → 100%
ATLAS-3C Authority Rerank               0%   → P3/P4 validate → 100%
ATLAS-3D Active Learning                5%   → Depends on 3A/3B/3C

Overall Parent Atlas: 96–97%
(remaining 3–4% is benchmark proof + active learning harvest)
```

---

## Created Artifacts

✅ **scripts/atlas/backfill-community-id.mjs** — Priority 0 backfill runner
✅ **scripts/atlas/extract-symbol-map.mjs** — Priority 1 symbol extractor
✅ **drizzle/manual/atlas-3a-symbol-map.sql** — Priority 1 schema
✅ **2026-06-10_PHASE-3-PRIORITY-SEQUENCE.md** — Detailed roadmap
✅ **npm scripts** — All P0–P1 commands wired

---

## Next Action

**Right now:**
```bash
npm run atlas:backfill:community-id:analyze
```

This reports the join status without making changes. If the join looks good, proceed:

```bash
npm run atlas:backfill:community-id           # Apply backfill
npm run atlas:backfill:community-id:verify    # Check gate: > 95%
```

**Then proceed to Priority 1** (symbol extraction) once P0 gate passes.

---

## Key Insight

The audit didn't find a new blocker—it found an **incomplete blocker** from Phase 2B.

Phase 2B community detection worked. Phase 2B community persistence didn't.

Fixing this propagation is **blocking everything else**, which is why it must be Priority 0, not something to do "alongside" symbol extraction.

**Do not proceed to symbol extraction until `glyph_records.community_id > 95%`.**

Then everything downstream unblocks naturally.
