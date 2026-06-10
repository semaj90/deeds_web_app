# Phase 3: Corrected Priority Sequence
**Date:** 2026-06-10  
**Status:** Based on audit findings  
**Previous Completion:** ATLAS-1.0 ✅ LOCKED, ATLAS-2.0 ✅ PACKETS + GLYPH  

---

## Audit Finding: The Actual Blocker

Community detection **exists** but **propagation is broken**:

```
codebase_files.community_id          ✅ Populated (35% of nodes)
  ↓
  ↗ BROKEN: file_path ≠ source_ref
  ↓
nes_chrom_packets.community_id       ❌ 0% (never joined)
  ↓
glyph_records.community_id           ❌ 0% (never joined)
```

**This blocks everything downstream:**
- ATLAS-3A symbol extraction (needs topology context)
- ATLAS-3C authority reranker (needs community_id in payloads)
- Benchmark validation (topology signal missing)

---

## Priority 0: Topology Propagation (FIX THIS FIRST)

### What to Do

```bash
npm run atlas:backfill:community-id:analyze     # Report without changes
npm run atlas:backfill:community-id             # Apply backfill
npm run atlas:backfill:community-id:verify      # Check coverage
```

### What It Does

Chain: `codebase_files.community_id → nes_chrom_packets.payload.community_id → glyph_records.community_id`

**Step 1:** Join `nes_chrom_packets.source_ref = codebase_files.file_path`
- Populate `nes_chrom_packets.payload.community_id` (JSONB)
- Populate `nes_chrom_packets.payload.manifold4[3]` with community rank

**Step 2:** Update `glyph_records.community_id`
- Join via packet_key → nes_chrom_packets → codebase_files

**Target:** `glyph_records.community_id > 95%` (hard gate)

### Script Location
`scripts/atlas/backfill-community-id.mjs` ✅ (created)

### Blockers to Watch

If coverage stays <95% after backfill:

1. **source_ref ≠ file_path** — Need Levenshtein fuzzy matching
2. **Sparse community_id in codebase_files** — Some files never reached by Rust detection
3. **Packets with no matching file** — Missing entries in codebase_files

**Fallback:** Directory-based clustering for unreachable nodes (safety net)

---

## Priority 1: ATLAS-3A Symbol Map (AFTER topology propagation)

### Prerequisites Met
✅ Community_id backfilled to glyph_records  
✅ Topology context available in payloads  

### What to Do

```bash
psql $DATABASE_URL -f drizzle/manual/atlas-3a-symbol-map.sql   # Create schema
npm run atlas:extract-symbols:dry                               # Verify extraction
npm run atlas:extract-symbols                                   # Extract symbols
npm run atlas:extract-symbols:audit                             # Check quality
```

### Schema (Extended)

```sql
CREATE TABLE atlas_symbol_map (
  id bigserial PRIMARY KEY,

  -- Location binding
  source_ref text NOT NULL,
  feature_id text,
  packet_key text,

  -- Symbol identity
  symbol_name text NOT NULL,
  symbol_kind text NOT NULL,           -- function, api_handler_POST, test_case, repair_skill, etc.
  export_kind text,
  route_id text,

  -- Code location
  line_start integer,
  line_end integer,
  signature text,                       -- ← VALUABLE for repair loop + LoRA

  -- Enrichment
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Why Signature is Important

Signature (e.g., `async function registerUser(email: string, password: string): Promise<User>`) enables:
- Dynamic import registry (knows what params to pass)
- LoRA training candidates (ground truth for LLM)
- Repair validation (can infer fix from signature changes)

### Output

14,500+ symbols mapped:
```
src/routes/api/auth/register/+server.ts
  → symbol: POST (api_handler_POST)
  → signature: export async function POST(event: RequestEvent): Promise<Response>
  → feature_id: auth-register
  → packet_key: pk:abc123
  → line_start: 45, line_end: 67
```

---

## Priority 2: Dynamic Import Registry (LOCKS DOWN REPAIR EXECUTION)

### What to Create

```sql
CREATE TABLE repair_skills (
  skill_id text PRIMARY KEY,              -- drizzle-23505-fix
  skill_name text NOT NULL,               -- "Handle Drizzle unique constraint"
  source_ref text NOT NULL,               -- src/lib/server/repair/drizzle-23505-fix.ts
  entry_symbol text NOT NULL,             -- applyDrizzleUniqueConstraintFix
  risk_level text DEFAULT 'low',          -- low, medium, high
  enabled boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'             -- params, validation tests, etc.
);
```

### Agent Execution Flow

```
Error: "duplicate key value violates unique constraint"
  ↓
feature_id: auth-register
  ↓
symbol: POST handler
  ↓
lookup repair_skills WHERE feature_id matches
  ↓
found: drizzle-23505-fix
  ↓
dynamic import from repair_skills.source_ref
  ↓
call entry_symbol(context, error)
  ↓
execute with validation (no arbitrary code)
```

### No Arbitrary Imports

Before: LLM suggests random file paths  
After: Repair skills registry controls execution boundary

---

## Priority 3: Node Modules Surface Map (SAFE EXTERNAL CALLS)

### What to Create

```sql
CREATE TABLE atlas_package_map (
  package_id text PRIMARY KEY,            -- @tanstack/query
  export_name text NOT NULL,              -- useQuery
  symbol_kind text,                       -- function, class, hook
  signature text,
  source_location text,                   -- .d.ts or package.json exports field
  metadata jsonb DEFAULT '{}'
);
```

### Strategy: Only Surface, Not Internals

❌ **Don't:** Index all of node_modules (millions of lines, zero context)

✅ **Do:** Index only:
- `package.json` `exports` field
- `.d.ts` type definitions
- Public API signatures

### Usage

```
Stack trace: "useQuery is not defined"
  ↓
lookup: @tanstack/query useQuery
  ↓
signature: useQuery<TData, TError, ...>(options: UseQueryOptions<...>): UseQueryResult<...>
  ↓
Agent can infer params + return type
  ↓
Safe to suggest import
```

---

## Priority 4: Benchmark Validation (BEFORE CHR97)

### Four Comparison Runs

1. **Baseline:** Vector only (Qdrant ANN)
   - Metric: Recall@20, MRR

2. **With Topology:** Vector + community expansion + graph traversal
   - Metric: Does community context improve ranking?

3. **With Symbols:** Vector + topology + symbol accuracy check
   - Metric: Does retrieval find correct function?

4. **With Repair:** Vector + topology + symbol + repair skill invocation
   - Metric: **Repair Success %** (can skill be called without error?)

### Success Criteria

```
Vector only       → Recall@20: 0.75, MRR: 0.70
+ Topology        → Recall@20: 0.88, MRR: 0.82 (↑13%)
+ Symbols         → Recall@20: 0.92, MRR: 0.89 (↑5%)
+ Repair          → Recall@20: 0.92, Repair%: >90% (self-heal works)
```

**Don't ship CHR97 until Repair % > 90%.**

---

## Revised Completion Estimate

```
ATLAS-1.0 Identity               100%
ATLAS-2.0 Packets                100%
ATLAS-2.0 Glyph Layer            95%
ATLAS-2.0 Community Layer        35%  ← PRIORITY 0: Fix this
  ↓ (after P0 backfill: 95%)

ATLAS-3A Symbol Map               0%  ← PRIORITY 1
ATLAS-3B Repair Registry         15%  ← PRIORITY 2
ATLAS-3C Authority Rerank         0%  ← PRIORITY 3 (node_modules safe API)
ATLAS-3D Active Learning          5%  ← Depends on 3A/3B/3C

Phase 3 Benchmark                 0%  ← PRIORITY 4: Proof before CHR97

Overall Parent Atlas: ~96–97%
```

---

## Execution Order (Weekly)

### Week 1: Priority 0 + 1

**Monday–Tuesday:**
```bash
npm run atlas:backfill:community-id:analyze  # Check join status
npm run atlas:backfill:community-id          # Backfill
npm run atlas:backfill:community-id:verify   # Gate: >95%
```

**Wednesday–Friday:**
```bash
npm run atlas:extract-symbols:dry            # Verify extraction
npm run atlas:extract-symbols                # Extract
npm run atlas:extract-symbols:audit          # 14,500+ symbols, >80% linked
```

### Week 2: Priority 2

- Create `repair_skills` table
- Map 20+ error patterns → repair skills
- Wire error_detector → skill lookup
- Dry-run validation tests

### Week 3: Priority 3 + 4

- Index `@tanstack/query`, `drizzle-orm`, `zod` surface APIs
- Run 100-query benchmark (4 comparison runs)
- Validate: Symbol accuracy >90%, Repair success >90%

### Week 4: Sign-off

- All gates passed
- Phase 4 CHR97 design finalized
- Ready for cartridge compression

---

## Key Principle

**Do not proceed to the next priority until the current one shows >95% gate pass.**

- P0 not done? → Can't do P1 (no topology context)
- P1 not done? → Can't do P2 (don't know which functions exist)
- P2 not done? → Can't do P3 (can't validate repair safety)
- P3 not done? → Can't do P4 benchmark (can't run repairs)
- P4 not done? → Can't do CHR97 (no proof of execution)

---

## Reference

- **Backfill script:** `scripts/atlas/backfill-community-id.mjs` ✅
- **Symbol extractor:** `scripts/atlas/extract-symbol-map.mjs` ✅
- **Symbol schema:** `drizzle/manual/atlas-3a-symbol-map.sql` ✅
- **Original Phase 3:** `2026-06-10_PHASE-3-IMPLEMENTATION-GATES.md` (still valid, reordered)

---

**Status:** All Priority 0 infrastructure ready  
**Next action:** `npm run atlas:backfill:community-id:analyze` (start with analysis, no changes)  
**Hard gate:** glyph_records.community_id > 95% must pass before Priority 1 begins
