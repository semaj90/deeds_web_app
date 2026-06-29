# Quick Reference: Session 90 Root Cause

## TL;DR
**Commit a6b20f5b1b** (Session 89) deleted `graphify:authority` + `karpathy:gpu` npm aliases.  
**Session 90**: Restored with 3-line fix to sveltekit-frontend/package.json.  
**Status**: ✅ FIXED

---

## The Timeline
| Commit | What | When | Status |
|--------|------|------|--------|
| d131609a5b | Had aliases but **wrong paths** | Earlier | ❌ Broken |
| a6b20f5b1b | **Deleted both aliases** + 1,800 other scripts | Session 89, 11:02 UTC | ❌ Broken |
| Session 90 | **Restored with correct paths** | This session | ✅ Fixed |

---

## The 3-Line Fix
**File**: `sveltekit-frontend/package.json`

```json
+ "graphify:authority": "node ../scripts/atlas/run-authority-scores.mjs",
+ "karpathy:gpu": "node ../scripts/atlas/karpathy-gpu-enrich.mjs",
  "atlas:p4:pagerank:apply": "npm run graphify:authority",  // was: npm --prefix sveltekit-frontend run
```

---

## What Was Broken
```
npm run startup:ace:materialize
  ↓
npm run graphify:authority  (missing)
  ↓
❌ FAILED
```

## What's Fixed Now
```
npm run startup:ace:materialize
  ↓
npm run graphify:authority  (restored ✅)
  ↓
✅ SUCCESS (connects Neo4j + Qdrant)
```

---

## Why This Happened
Commit a6b20f5b1b did massive cleanup (2,311 → 484 lines) **without checking dependencies**.  
Deleted both aliases but left `atlas:p4:pagerank:apply` referencing them = broken chain.

---

## How to Prevent
Before deleting an npm alias:
```bash
rg "npm run graphify:authority" src/ scripts/ .vscode/
# If results found → update those files before deleting the alias
```

---

## Related Docs
- `/docs/ROOT-CAUSE-SESSION-90-MISSING-SCRIPTS.md` — Full timeline + prevention
- `/memory/session-90-root-cause-missing-scripts.md` — Memory reference
- `/SESSION-90-EXECUTIVE-SUMMARY.md` — Complete analysis

---

## Verification
```bash
npm run graphify:authority --limit=5
# ✅ Executes cleanly
# ✅ Connects to Neo4j + Qdrant
# ✅ Exit code 0
```

---

**Status**: ✅ FIXED | **Next**: Phase 85 Execution Roadmap (Option A or B)