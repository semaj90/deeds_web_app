# P3g Data Layer Audit — June 23, 2026

**Date**: 2026-06-23  
**Status**: 🔴 **BLOCKING ISSUES FOUND** — P3g is NOT verified complete  
**Action**: Fix mirror mismatches before proceeding to Lane C analytics

---

## Executive Summary

| Metric | Result | Status |
|--------|--------|--------|
| Postgres coverage | 17,994/17,995 (99.99%) | ✅ Near complete |
| Unique Qdrant IDs | 17,919 | ❌ Collision detected |
| Orphaned Qdrant points | 34,687 | ❌ Major mirror drift |
| Collision packets | 75 total, 8 worst-case | 🔴 **BLOCKS RETRIEVAL** |

---

## Findings

### 1. Missing Packet (1)

**Packet key**: `796b9aa09212af28`  
**Status**: Has NO `qdrant_point_id`  
**Impact**: Will fail during retrieval, ACE will skip this packet  
**Fix**: Run bounded backfill for this single packet

### 2. Collision Groups (75 packets)

**Worst case**: Qdrant point `1522576465` claimed by **8 different Postgres packets**

| Point ID | Packet Count | Severity |
|----------|--------------|----------|
| 1522576465 | 8 | 🔴 CRITICAL |
| 1441641663 | 3 | 🟠 HIGH |
| 1616988690 | 3 | 🟠 HIGH |
| 1156499840 | 2 | 🟡 MEDIUM |
| 1331437413 | 2 | 🟡 MEDIUM |

**Root cause**: During backfill, multiple packets got assigned to the same Qdrant point ID via incorrect join logic.

**Impact**: 
- Retrieval returns wrong packet for query
- ACE context assembler gets corrupted context
- Cannot trust Qdrant as a mirror until fixed

### 3. Orphaned Qdrant Points (34,687)

**Qdrant total points**: 52,606  
**Postgres unique IDs**: 17,919  
**Orphaned**: 52,606 - 17,919 = **34,687 points**

**Status**: These points exist in Qdrant but have no matching Postgres row.

**Likely cause**: 
- Old Qdrant collections not purged
- Multiple backfill runs without dedup
- Stale collections from earlier phases

**Impact**: Wasted VRAM, false ANN candidates in search

---

## Required Fixes (Sequential)

### Step 1: Fix the Audit Script (10 min)

**File**: `scripts/atlas/audit-acp-packet-transport.mjs`  
**Issue**: Line 125 has broken escape: `"\\n"` should be `"\n"`  
**Impact**: JSONL logs are malformed, audit results can't be parsed

**Action**: 
```bash
# Line 125: change "\\n" to "\n"
npm run atlas:audit:acp-transport  # Verify it runs
```

### Step 2: Identify Collision Root Cause (15 min)

**Command**:
```bash
# Which backfill run created the collisions?
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c \
  "SELECT DISTINCT qdrant_point_id FROM atlas_packets WHERE qdrant_point_id IN (1522576465, 1441641663) \
   ORDER BY qdrant_point_id LIMIT 20;"
```

**Action**: Inspect `atlas_packets` table for `created_at` timestamps on collision packets.

### Step 3: Fix the 1 Missing Packet (5 min)

**Packet key**: `796b9aa09212af28`  
**Approach**: 
```bash
# Embed this single packet
node scripts/atlas/backfill-qdrant-embeddings.mjs --filter='packet_key = "796b9aa09212af28"' --dry
node scripts/atlas/backfill-qdrant-embeddings.mjs --filter='packet_key = "796b9aa09212af28"' --apply
```

### Step 4: Resolve Collisions (30–60 min)

**Option A: Rebuild colliding packets** (safest)
```bash
# Find all 75 collision packets
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c \
  "SELECT ARRAY_AGG(packet_key) FROM atlas_packets \
   WHERE qdrant_point_id IN (SELECT qdrant_point_id FROM atlas_packets \
   GROUP BY qdrant_point_id HAVING COUNT(*) > 1);"

# Clear their qdrant_point_id to NULL
UPDATE atlas_packets SET qdrant_point_id = NULL WHERE packet_key IN (list_above);

# Re-embed with bounded backfill
node scripts/atlas/backfill-qdrant-embeddings.mjs --filter='qdrant_point_id IS NULL' --batch=50
```

**Option B: Keep the mapping, fix the join** (requires audit)
- Identify which packet "owns" each Qdrant point
- Update all others to NULL
- Requires manual decision logic (which packet is canonical?)

### Step 5: Clean Orphaned Qdrant Points (20 min)

**Action**: Delete all Qdrant points that don't have a Postgres entry
```bash
# Export Postgres IDs
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c \
  "SELECT ARRAY_AGG(DISTINCT qdrant_point_id::text) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL;" \
  > /tmp/valid_ids.txt

# Delete orphans from Qdrant (requires custom script — NOT standard API)
# For now: accept orphans until we build a cleanup script
```

### Step 6: Verify P3g Complete (5 min)

**Verification gate**:
```bash
npm run atlas:p3g:verify

# Expected output:
# ✅ Packets: 17,995 total
# ✅ With qdrant_point_id: 17,995 (100%)
# ✅ Unique IDs in Qdrant: 17,995
# ✅ Collisions: 0
# ✅ Orphaned points: ~0
```

---

## Blocking Gates (Must Pass Before P3g → Lane C)

| Gate | Status | Blocker |
|------|--------|---------|
| 1. Audit script fixed | ❌ TODO | Lines 125 + skeleton checks |
| 2. 1 missing packet embedded | ❌ TODO | `796b9aa09212af28` |
| 3. 75 collisions resolved | ❌ TODO | Packet IDs 1522576465, etc. |
| 4. Qdrant unique count = Postgres count | ❌ TODO | Currently 17,919 vs 17,994 |
| 5. Final verification report | ❌ TODO | `npm run atlas:p3g:verify` |

---

## Recommended Action Path

**⏱️ Estimated time: 90 min total**

```
1. Fix audit script (10 min)
2. Identify collision root cause (15 min) — parallel with #1
3. Fix 1 missing packet (5 min)
4. Rebuild 75 collision packets (45 min) — parallel batch
5. Clean Qdrant orphans (20 min)
6. Final verification (5 min)
```

**Next: Run `npm run atlas:p3g:audit-detailed` to generate full collision report.**

---

## Commands to Execute Now (Path B)

```bash
# 1. Fix the audit script
# (see fixes below)

# 2. Run detailed collision audit
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c \
  "SELECT qdrant_point_id, COUNT(*) as count, ARRAY_AGG(packet_key ORDER BY packet_key) as packets \
   FROM atlas_packets WHERE qdrant_point_id IS NOT NULL \
   GROUP BY qdrant_point_id HAVING COUNT(*) > 1 \
   ORDER BY count DESC;"

# 3. Proceed with Step 3 (missing packet) once audit is confirmed
```

---

## Summary for User

**Path B is correct** — verify data layer state before P3g backfill.

**Current state**:
- ✅ Postgres coverage: 99.99% (1 missing)
- ❌ Mirror integrity: FAILED (75 collisions, 34k orphans)
- 🔴 **P3g is NOT verified complete** — audit script is broken, collisions exist

**Immediate action**:
1. Fix the audit script (line 125: `"\n"` not `"\\n"`)
2. Run collision report (SQL above)
3. Rebuild collision packets + missing packet
4. Verify 100% before proceeding to Lane C

**Do NOT run backfill until these are fixed** — silent collisions will corrupt retrieval.
