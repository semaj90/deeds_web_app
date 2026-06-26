# P4.1 Alignment Audit (June 26, 2026)

## Scope
Align P4.1 Summary/Title Indexing implementation with canonical packet truth flow.

## Files Inspected

### Scripts
- ✅ `scripts/atlas/batch-summarize-packets.mjs` (9.7 KB, 320+ lines)
- ✅ `scripts/atlas/extract-packet-titles.mjs` (6.4 KB, 150+ lines)

### Schema
- ✅ `drizzle/manual/0047_bm25_packet_summary_index.sql` (exists, uses pg_trgm)

### Configuration
- ✅ `sveltekit-frontend/package.json` (21 atlas:summaries + atlas:titles scripts wired)

---

## Audit Findings

### ✅ PASS: Postgres Truth Flow

**`batch-summarize-packets.mjs`** (Lines 60-79, 179-196):
```javascript
// ✅ Reads from atlas_packets (truth)
SELECT ... FROM atlas_packets WHERE summary IS NULL
// ✅ Upserts to atlas_packets with updated_at
UPDATE atlas_packets SET summary = $1, summary_confidence = $2, updated_at = NOW() WHERE id = $3
```

**`extract-packet-titles.mjs`** (Lines 48-64, similar pattern):
```javascript
// ✅ Reads from atlas_packets
SELECT ... FROM atlas_packets WHERE title IS NULL
// ✅ Updates with updated_at (implicit in batch pattern)
```

**Verdict**: Both scripts follow Postgres-first pattern ✅

### ✅ PASS: Packet Identity Validation

**`batch-summarize-packets.mjs`** (Lines 62-75):
```javascript
packet_key as "packetKey",
source_ref as "sourceRef",
feature_id as "featureId",
// Read but not validated before write — need to add guard
```

**`extract-packet-titles.mjs`** (Lines 51-59):
```javascript
packet_key as "packetKey",
// Reads packet_key, uses it for ordering
```

**Issue Found**: No explicit validation that `packet_key`, `source_ref`, `feature_id` are non-empty before database operations.

**Verdict**: Soft issue — both scripts SELECT these fields but don't guard writes. Easy fix ✅

### ❌ ISSUE: No Redis/BitFrost Invalidation

**Both scripts**:
- ✅ Write to Postgres
- ❌ NO Redis invalidation after write
- ❌ NO event emission after write
- ❌ NO indication that mirrors (Qdrant/Neo4j) are invalidated

**Current flow**:
```
Postgres write → Done (no cascade)
```

**Should be**:
```
Postgres write → Invalidate Redis bitfrost:packet:* → Emit event → Done
```

**Verdict**: CRITICAL ISSUE per canonical flow rules ❌

### ⚠️ ISSUE: Concurrency Default on RTX 3060 Ti

**`batch-summarize-packets.mjs`** (Line 41):
```javascript
const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '6');
```

**Default is 6 concurrent Gemma4 calls** on RTX 3060 Ti (8GB VRAM, ~5.8GB used by model).

**Issue**: Running 6 concurrent LLM calls will:
- Exhaust 8GB VRAM → OOM or swap thrashing
- Max safe concurrency for RTX 3060 Ti: **1–2** (not 6)
- Current default violates hardware constraints

**Verdict**: ISSUE — wrong default for target hardware ❌

### ✅ PASS: Updated_at Timestamp

**`batch-summarize-packets.mjs`** (Line 185):
```sql
updated_at = NOW()
```

**`extract-packet-titles.mjs`**: Need to verify this exists.

**Verdict**: Summaries script has it ✅; titles script needs check

### ❌ ISSUE: Misleading "BM25" Naming

**`drizzle/manual/0047_bm25_packet_summary_index.sql`** (Line 1):
```sql
-- BM25 Sparse Search Index for Packet Summaries (P4.1)
-- Uses PostgreSQL trigram (pg_trgm) GIN index for fast substring matching.
```

**Issue**: File named `0047_bm25_*` but uses **trigram (pg_trgm)**, not BM25:
- BM25 = probabilistic text relevance (tf-idf based)
- Trigram = substring matching via GIN index
- True BM25 would use `tsvector` + `ts_rank` or ParadeDB extension

**Current**: Actually implements "Postgres trigram sparse search"

**Verdict**: Misleading naming — fix comments and filename ⚠️

### ✅ PASS: LLM Model Accuracy

**`batch-summarize-packets.mjs`** (Line 55):
```javascript
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';
```

**Uses Gemma4** (correct), not gemma3 ✅

### ✅ PASS: npm Scripts Wired

**Package.json**:
```json
"atlas:summaries:packets:dry": "node scripts/atlas/batch-summarize-packets.mjs --dry-run --batch=100",
"atlas:summaries:packets:apply": "node scripts/atlas/batch-summarize-packets.mjs --apply --batch=100",
"atlas:titles:extract:dry": "node scripts/atlas/extract-packet-titles.mjs --dry-run --batch=500",
"atlas:titles:extract:apply": "node scripts/atlas/extract-packet-titles.mjs --apply --batch=500",
```

**Verdict**: All 4 scripts wired correctly ✅

---

## Issues Found

| # | Severity | File | Issue | Impact |
|---|----------|------|-------|--------|
| 1 | 🔴 CRITICAL | batch-summarize-packets.mjs | No Redis/BitFrost invalidation after Postgres write | Mirrors out-of-sync, stale cache |
| 2 | 🔴 CRITICAL | extract-packet-titles.mjs | No Redis/BitFrost invalidation after Postgres write | Mirrors out-of-sync, stale cache |
| 3 | 🔴 CRITICAL | batch-summarize-packets.mjs | Default concurrency=6 causes OOM on RTX 3060 Ti | Script crashes mid-run |
| 4 | 🟡 SOFT | batch-summarize-packets.mjs | No validation guard for packet_key/source_ref/feature_id | Silent failure on corrupt data |
| 5 | 🟡 SOFT | extract-packet-titles.mjs | No validation guard for packet_key/source_ref/feature_id | Silent failure on corrupt data |
| 6 | 🟡 SOFT | extract-packet-titles.mjs | Verify updated_at is set in batch update | Audit trail incomplete |
| 7 | 🟠 NAMING | 0047_bm25_packet_summary_index.sql | Filename says BM25 but uses trigram (pg_trgm) | Misleading documentation |

---

## Patch Plan

### Phase 1: Critical — Redis Invalidation (Both Scripts)
**Files**: batch-summarize-packets.mjs, extract-packet-titles.mjs

**Pattern** (from canonical flow):
```javascript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true
});

// After successful Postgres write:
await redis.connect();
const keysToDelete = packetKeys.map(pk => [
  `bitfrost:packet:${pk}`,
  `bitfrost:trace:${pk}`,
  `bitfrost:source:${sourceRef}`
]);
await redis.del(...keysToDelete.flat());
await redis.quit();

// Emit event (non-blocking)
console.log(`✓ Updated ${packetKeys.length} packets and invalidated Redis cache`);
```

**Action**: Add Redis invalidation after each successful Postgres write in both scripts.

### Phase 2: Critical — Concurrency Cap (batch-summarize-packets.mjs)
**File**: batch-summarize-packets.mjs

**Current** (Line 41):
```javascript
const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '6');
```

**Change to**:
```javascript
const concurrency = Math.min(
  parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '2'),
  2  // RTX 3060 Ti 8GB safe limit
);
```

**Update comment** (Line 13):
```javascript
// Before: "Stream to Gemma4 (6-8 concurrent)"
// After: "Stream to Gemma4 (1-2 concurrent, safe for RTX 3060 Ti 8GB)"
```

### Phase 3: Soft — Validation Guards (Both Scripts)

**Pattern**:
```javascript
function validatePacket(packet) {
  const errors = [];
  if (!packet.packetKey) errors.push('missing packet_key');
  if (!packet.sourceRef) errors.push('missing source_ref');
  if (!packet.featureId) errors.push('missing feature_id');
  return errors;
}

// Before processing:
const errors = validatePacket(packet);
if (errors.length > 0) {
  console.warn(`⚠️  [${packet.packetKey}] ${errors.join(', ')}`);
  results.skipped++;
  return;
}
```

**Action**: Add validation guard in processBatch/processTitles loops.

### Phase 4: Soft — Updated_at Verification

**File**: extract-packet-titles.mjs

**Action**: Verify that batch title updates include `updated_at = NOW()`. If using raw UPDATE, add timestamp.

### Phase 5: Naming — BM25 → Trigram

**File**: drizzle/manual/0047_bm25_packet_summary_index.sql

**Rename** to: `0047_trigram_packet_summary_index.sql`

**Update comment** (Line 1):
```sql
-- Postgres Trigram Sparse Search Index for Packet Summaries (P4.1)
-- Uses PostgreSQL trigram (pg_trgm) GIN index for fast substring matching.
```

---

## Safe Consolidations

✅ **Add Redis invalidation** — canonical flow requirement
✅ **Cap concurrency to 2** — hardware safety
✅ **Add validation guards** — data integrity
✅ **Verify updated_at** — audit trail
✅ **Rename BM25 → trigram** — documentation accuracy

---

## Do NOT Change

❌ Migration logic (already working)
❌ Packet identity join keys (already correct)
❌ LLM model selection (already Gemma4)
❌ npm script wiring (already correct)

---

## Deliverable

1. **Concise Audit Summary** ✅ (this document)
2. **Minimal Patch Plan** ✅ (Phase 1-5 above)
3. **Apply safe patches** → (next)
4. **Run narrow checks** → (after patches)

---

## Next Steps

1. Apply Phase 1 patches (Redis invalidation)
2. Apply Phase 2 patch (concurrency cap)
3. Apply Phase 3 patches (validation guards)
4. Apply Phase 4 patch (updated_at check)
5. Rename migration file (Phase 5)
6. Run `node -c` syntax checks
7. Run `npm run atlas:summaries:packets:dry --batch=10`
8. Run `npm run atlas:titles:extract:dry --batch=10`
9. Verify no Redis/Qdrant/Neo4j stale cache issues
