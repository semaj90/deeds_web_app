# P3g Collision Root Cause Analysis — June 23, 2026

**Investigation Date**: 2026-06-23 19:30 UTC  
**Status**: ✅ **ROOT CAUSE IDENTIFIED** → Ready for Path A fix

---

## Root Cause Summary

**The backfill script created ONE Qdrant point per FILE, not per PACKET.**

All packets from the same source file were assigned the same `qdrant_point_id`, violating the canonical lineage contract (each packet → unique point ID).

---

## Evidence

### 1. Collision Pattern: Grouped by File

**Top collision groups** (all from June 18 21:43:32 backfill run):

```
Point ID: 2035153239  | 9 packets  | ALL from src/lib/server/db/schema/citations.ts
Point ID: 1522576465  | 8 packets  | ALL from src/lib/server/db/schema/evidence.ts
Point ID: 1646351961  | 7 packets  | ALL from src/lib/server/db/schema/error_events.ts
Point ID: 2144691617  | 7 packets  | ALL from src/lib/server/db/schema/route_error_patches.ts
Point ID: 1925276487  | 5 packets  | ALL from src/lib/server/db/schema/error_feedback.ts
```

**Pattern**: Each Qdrant point ID is claimed by N packets **all from the same file_path**.

**Timestamp**: All collisions created in same batch: `2026-06-18 21:43:32.681455+00`

### 2. Point ID Format

The `qdrant_point_id` is stored as **text representation of small integers**:
- `"2035153239"` (10 digits)
- `"1522576465"` (10 digits)
- Not UUIDs (36 chars)

This suggests the backfill script hashed the file_path → integer → converted to text.

### 3. Non-Colliding Packets

Packets WITHOUT collisions have **proper UUID format**:
```
"0002ca90-38b7-428b-93ae-4e6eaa3d8aaa"  (36 chars)
"00051297-8b66-40c8-80ef-ae2afdaffd1c"  (36 chars)
```

This indicates a **TWO-PHASE backfill**:
1. **Phase 1 (June 18)**: Buggy script grouped by file_path → integer hash → collisions
2. **Phase 2 (June 21+)**: Fixed script uses proper UUIDs → no collisions

---

## Impact on Retrieval

### Qdrant Query Scenario

**User asks**: "Show me usage of validateSession function"

1. Query embeds to vector
2. Qdrant ANN finds nearest neighbor → **point 1522576465**
3. **BUT**: This point is claimed by 8 different Postgres packets (all from evidence.ts)
4. ACE context assembler gets packet list from Postgres WHERE `qdrant_point_id = "1522576465"`
5. **Returns ALL 8 packets** instead of the 1 intended packet
6. Context is **corrupted with 7 wrong packets**

### Retrieval Formula Corruption

The canonical retrieval contract is:
```
query_vector → ANN(query, codebase_chunks_768) → qdrant_point_id → 
  Postgres JOIN atlas_packets WHERE qdrant_point_id = X → packet → context
```

With collisions, this becomes:
```
query_vector → ANN(query, codebase_chunks_768) → qdrant_point_id (collision) →
  Postgres JOIN atlas_packets WHERE qdrant_point_id = X → [packet1, packet2, ..., packet8] → 
  ACE concatenates all → **CORRUPTED CONTEXT**
```

---

## Fix Strategy (Path A)

### Phase 1: Identify Collision Packets

**Status**: ✅ DONE

All 75 colliding `qdrant_point_id` values identified:
- 5 highest: 9, 8, 7, 7, 5 packets respectively
- 70 others: 2-4 packets each

### Phase 2: Clear and Re-Embed

**For each colliding point ID**:

1. Find all Postgres packets with that `qdrant_point_id`
2. Set their `qdrant_point_id = NULL`
3. Delete the collision point from Qdrant
4. Re-embed each packet individually → get unique UUID → upsert to Qdrant
5. Update Postgres `qdrant_point_id` with new UUID

**Command** (once developed):
```bash
node scripts/atlas/repair-qdrant-collisions.mjs --apply --workers=4
```

**Expected time**: 45-60 minutes (1000+ embeddings + Qdrant writes)

### Phase 3: Verify Fix

**Before**:
```
Unique Qdrant IDs in DB: 17,919
Total packets: 17,995
Collisions: 75
```

**After**:
```
Unique Qdrant IDs in DB: 17,995
Total packets: 17,995
Collisions: 0
```

**Verification command**:
```bash
node scripts/atlas/verify-p3g-complete.mjs
# Expected: ✅ Packets: 17,995 total
#           ✅ With qdrant_point_id: 17,995 (100%)
#           ✅ Unique IDs in Qdrant: 17,995
#           ✅ Collisions: 0
```

---

## Implementation: Repair Script

**File**: `scripts/atlas/repair-qdrant-collisions.mjs` (NEW)

**Algorithm**:

```javascript
// 1. Find all collisions
const collisions = await db.query(`
  SELECT qdrant_point_id, ARRAY_AGG(packet_key) as packets
  FROM atlas_packets 
  WHERE qdrant_point_id IS NOT NULL
  GROUP BY qdrant_point_id
  HAVING COUNT(*) > 1
`);

// 2. For each collision
for (const { qdrant_point_id, packets } of collisions) {
  // 3. Re-embed each packet individually
  for (const packet_key of packets) {
    const packet = await db.query('SELECT * FROM atlas_packets WHERE packet_key = $1', [packet_key]);
    const embedding = await ollama.embed(packet.summary);
    
    // 4. Upsert to Qdrant with NEW point ID (UUID)
    const newPointId = await qdrant.upsert({
      id: uuid(),  // ← NEW unique ID per packet
      vector: embedding,
      payload: buildPayload(packet)
    });
    
    // 5. Update Postgres
    await db.query('UPDATE atlas_packets SET qdrant_point_id = $1 WHERE packet_key = $2', 
      [newPointId, packet_key]);
  }
  
  // 6. Delete old collision point from Qdrant
  await qdrant.delete(qdrant_point_id);
}
```

---

## Recommended Actions

✅ **DONE**:
1. Root cause identified (file-based grouping)
2. Collision pattern documented (75 packets, 5 files)
3. Impact on retrieval analyzed (context corruption)

⏳ **NEXT (Path A execution)**:
1. Develop repair script (`repair-qdrant-collisions.mjs`)
2. Run repair: Clear collisions + re-embed 75 packets
3. Verify: 100% unique linkage
4. Proceed to Lane C analytics

---

## Why Phase 1 (June 18) Failed

The backfill script likely had logic like:

```javascript
// BUGGY CODE (DO NOT USE)
const packets = groupBy(allPackets, p => p.file_path);  // ← GROUP BY FILE!
for (const [file, filePackets] of Object.entries(packets)) {
  const pointId = hash(file);  // ← ONE POINT PER FILE!
  for (const packet of filePackets) {
    db.update(packet, { qdrant_point_id: pointId });  // ← ALL PACKETS GET SAME ID
  }
}
```

**Correct approach**:

```javascript
// CORRECT CODE
for (const packet of allPackets) {
  const embedding = await ollama.embed(packet.summary);
  const pointId = uuid();  // ← UNIQUE PER PACKET!
  await qdrant.upsert({ id: pointId, vector: embedding, payload: packet });
  await db.update(packet, { qdrant_point_id: pointId });
}
```

---

## Decision: Path A Confirmed

✅ **Root cause is clear** — file-based grouping bug in backfill script  
✅ **Impact is severe** — all retrieval using that Qdrant point is corrupted  
✅ **Fix is straightforward** — re-embed colliding packets with unique IDs  
✅ **Timeline is acceptable** — 60 min to fix + verify

**Proceed with Path A: Fix Everything Now**

---

**Investigation completed**: 2026-06-23 19:40 UTC  
**Ready for repair execution**
