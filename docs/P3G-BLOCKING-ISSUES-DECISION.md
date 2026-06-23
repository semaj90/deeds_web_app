# P3g Blocking Issues — Decision Required

**Date**: 2026-06-23 18:30 UTC  
**Status**: 🔴 **READY-HOLD** — P3g audit found critical issues

---

## Issue Summary

During **Path B (verify data layer state)**, I discovered:

### ✅ Good News
- **Postgres coverage**: 99.99% (17,994/17,995 packets have `qdrant_point_id`)
- **1 missing packet** is trivial to fix (5 min)
- Backfill script completed successfully

### ❌ Critical Issues
- **75 packets have colliding Qdrant point IDs** — up to 8 packets share the same point ID
- **34,687 orphaned Qdrant points** — points exist in Qdrant but no Postgres row claims them
- **Audit script broken** — line 125 writes `"\\n"` (literal backslash-n, not newline) so JSONL is malformed
- **Mirror integrity failed** — Qdrant ≠ Postgres, can't trust retrieval

---

## Why This Matters

**Collision example**: Qdrant point `1522576465` is claimed by 8 different Postgres packets.

When ACE does a retrieval query:
1. Query embeds to vector
2. Qdrant finds nearest neighbor at point `1522576465`
3. ACE returns context from that point
4. **But which packet is it?** All 8 could be returned — corrupting the context

This breaks the **canonical lineage contract** (directory_path → source_ref → file_path → packet_key → qdrant_point_id). With collisions, that chain is broken.

---

## Three Decision Paths

### Path A: Fix Everything Now (90 min)
**Pros**:
- Get P3g to 100% verified complete
- Qdrant becomes a trustworthy mirror again
- Can proceed immediately to Lane C analytics

**Cons**:
- Delays next phase by ~1.5 hours
- Requires collision audit (which packets to keep/rebuild?)

**Commands**:
```bash
# 1. Fix audit script (DONE ✅)
# 2. Identify collision root cause (15 min)
# 3. Fix 1 missing packet (5 min)
# 4. Rebuild 75 collision packets (45 min)
# 5. Clean Qdrant orphans (20 min)
# 6. Verify 100% (5 min)
```

**Next**: Run detailed collision audit to decide which packets are canonical.

---

### Path C: Accept Partial State, Continue to Lane C (5 min)
**Pros**:
- Move to next phase immediately
- Collisions don't break Lane C analytics (they read Postgres, not Qdrant)
- Fix collisions in parallel (non-blocking)

**Cons**:
- Retrieval will be corrupted if ACE uses Qdrant during this window
- Need to disable Qdrant queries until mirror is fixed
- Risk: if someone runs a query-heavy task, they get wrong answers

**Action required**:
```bash
# Disable Qdrant in retrieval for now
# Set environment: QDRANT_ENABLED=false
# Or: add a feature flag to skip Qdrant in context-assembler.ts

# Create a parallel fix task for collisions
# (low priority, 90 min, can run after Lane C completes)
```

---

### Path D: Wait for Clarity (unknown timeline)
**Status**: Don't proceed until we understand if collisions are expected behavior or a bug.

**Questions**:
- Are Qdrant points supposed to be 1:1 with Postgres packets? (Yes — canonical lineage contract)
- Did the backfill script have a bug that over-assigned point IDs? (Likely)
- Are the orphaned points from old collections? (Need investigation)

**Action**: Run detailed audit first, then decide.

---

## My Recommendation: **Path A** (Fix Now)

**Reasoning**:
1. P3g backfill is already complete — backfill script is working
2. The only issue is post-backfill mirror sync — it's a data quality problem, not a backfill problem
3. Lane C analytics don't depend on Qdrant being perfect (they read Postgres)
4. But ACE retrieval WILL be corrupted if collisions aren't fixed — and ACE is used by many downstream tasks
5. **Better to fix now than debug retrieval corruption later**

**Time cost**: 90 min  
**Risk avoidance**: Prevents days of debugging why retrieval is returning wrong context

---

## Immediate Action (You Decide)

**Pick one**:

### A) Fix Everything Now
```bash
# I'll generate the full collision audit report
# You review which packets are canonical
# We rebuild the 75 collision packets
# P3g becomes verified complete in ~90 min
```

**Next steps**:
1. Confirm you want to proceed with Path A
2. I run: `npm run atlas:p3g:audit-collisions` (new script I'll create)
3. You review the collision groups (which packet should "own" each Qdrant point?)
4. Run rebuild with `--apply`

### C) Accept Partial State, Continue to Lane C
```bash
# Disable Qdrant in context-assembler.ts (temporary)
# Create a non-blocking fix task for after Lane C completes
# Proceed to npm run atlas:lanes:c-analytics
```

**Trade-off**: Retrieval skips Qdrant for now; analytics continue; fix later.

### D) Investigate First
```bash
# Run detailed audit to understand collision root cause
# Decide on fix strategy after investigation
# No backfill proceeds until we know what happened
```

---

## What I've Done So Far

✅ **Fixed the audit script** (line 125: `"\n"` not `"\\n"`)  
✅ **Created detailed audit report** (`docs/reports/p3g-data-layer-audit-2026-06-23.md`)  
✅ **Identified 75 collision packets** (worst case: 8 packets share point 1522576465)  
✅ **Identified 1 missing packet** (`796b9aa09212af28`)  
✅ **Identified 34,687 orphaned Qdrant points**

**Blocked at**: Waiting for your decision on Path A vs C vs D

---

## Command to Run (Path A Step 2)

Once you decide to proceed with Path A, run:

```bash
# Show collision groups with packet details
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c \
  "SELECT qdrant_point_id, COUNT(*) as count, ARRAY_AGG(packet_key ORDER BY packet_key) \
   FROM atlas_packets WHERE qdrant_point_id IS NOT NULL \
   GROUP BY qdrant_point_id HAVING COUNT(*) > 1 \
   ORDER BY count DESC LIMIT 20;"
```

This will show you which packets collide and which is canonical.

---

## Summary

| Status | Detail |
|--------|--------|
| **Audit script** | ✅ FIXED |
| **Coverage** | ✅ 99.99% (1 missing) |
| **Collisions** | ❌ 75 packets (critical) |
| **Orphans** | ❌ 34,687 points (blocker) |
| **P3g verified complete** | ❌ NO — blocked by mirror mismatch |
| **Ready for Lane C?** | ⏸️ CONDITIONAL (see Path C) |

**Your move**: Reply with **A**, **C**, or **D**.