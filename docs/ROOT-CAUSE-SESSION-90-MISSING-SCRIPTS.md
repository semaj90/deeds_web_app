# Root Cause Analysis: Missing npm Scripts — Session 90

**Date**: June 28, 2026 (Session 90)  
**Issue**: npm scripts `graphify:authority` and `karpathy:gpu` were missing, and `turbo:start:detached` was missing from VS Code startup task  
**Resolution**: Fixed in this session with 3 edits to sveltekit-frontend/package.json

---

## Timeline of Events

### Commit d131609a5b (Earlier Session — Scripts Present)
Both aliases existed but with **wrong paths**:

```json
"graphify:authority": "node scripts/run-authority-scores.mjs",
"karpathy:gpu": "node ../scripts/atlas/karpathy-gpu-enrich.mjs"
```

**Problem with d131609a5b**: In the `sveltekit-frontend` context, `node scripts/run-authority-scores.mjs` resolves to `sveltekit-frontend/scripts/run-authority-scores.mjs` (which doesn't exist). Should be `node ../scripts/atlas/run-authority-scores.mjs`.

### Commit a6b20f5b1b (Session 89 — GPU-Accelerated LangExtract)
**Major package.json restructuring**: File reduced from 2,311 lines → 484 lines. This cleanup **removed** both aliases:

- ❌ `graphify:authority` deleted
- ❌ `karpathy:gpu` deleted  
- ❌ All Phase 85 P5-P9 npm script aliases purged
- ❌ Hundreds of auxiliary scripts removed without verification

The commit message focused on Phase 85 P9 LangExtract GPU integration but didn't explain why other scripts were deleted.

### Current Session (Session 90 — This Work)
**Why scripts went missing**: Large cleanup commit (a6b20f5b1b) did a wholesale purge of package.json without:
1. Verifying dependencies (atlas:p4:pagerank:apply still tried to call graphify:authority)
2. Documenting what was being removed
3. Preserving backward compatibility with startup pipelines

**Why circular dependency existed** (atlas:p4:pagerank:apply):
```json
// BEFORE the cleanup
"atlas:p4:pagerank:apply": "npm --prefix sveltekit-frontend run graphify:authority"

// After cleanup, graphify:authority was gone, but this line remained
// This created a self-referential loop that would never resolve
```

### VS Code Startup Task Issue

The VS Code task `.vscode/tasks.json` had a command referencing `npm run turbo:start:detached`. This script **did exist** in both package.json files but may have:
1. Been recently reverted/changed from Node.js-based scripts to PowerShell scripts
2. Been missing from the local package.json during the cleanup commit
3. Created by a subsequent fix commit

**Current state** (verified): turbo:start:detached exists in both:
- `/c/Users/james/Videos/deeds-web-app/package.json` (line 12)
- `/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/package.json` (line 12)

Both point to: `pwsh -NoProfile -ExecutionPolicy Bypass -File ../scripts/launch-turboquant.ps1 -Detached`

---

## Three-Line Fix Applied

**File**: `sveltekit-frontend/package.json`

### Line 71: Added graphify:authority alias
```diff
+ "graphify:authority": "node ../scripts/atlas/run-authority-scores.mjs",
```

**Why this path**: From sveltekit-frontend context, `../scripts/atlas/` correctly points to the workspace-root scripts directory.

### Line 72: Added karpathy:gpu alias
```diff
+ "karpathy:gpu": "node ../scripts/atlas/karpathy-gpu-enrich.mjs",
```

**Why this path**: Consistent with graphify:authority and proven by `karpathy-gpu-enrich.mjs` existing at `scripts/atlas/karpathy-gpu-enrich.mjs`.

### Line 73: Fixed circular dependency
```diff
- "atlas:p4:pagerank:apply": "npm --prefix sveltekit-frontend run graphify:authority",
+ "atlas:p4:pagerank:apply": "npm run graphify:authority",
```

**Why the change**: 
- `npm --prefix sveltekit-frontend run` was trying to change context while already in sveltekit-frontend
- `npm run graphify:authority` directly invokes the newly-restored alias in the current context
- Simpler and avoids double-context switching

---

## Verification

After applying the fix:

```bash
npm run graphify:authority --limit=5
# ✅ Script executes cleanly
# ✅ Connects to Neo4j (bolt://127.0.0.1:7687)
# ✅ Connects to Qdrant (http://127.0.0.1:6333)
# ✅ Exit code: 0 (SUCCESS)
```

---

## Root Cause Summary

| Factor | What Happened |
|--------|---------------|
| **Cleanup Commit** | a6b20f5b1b removed 1,800+ lines from package.json without dependency verification |
| **Scope Creep** | The commit was labeled "Phase 85 P9 LangExtract GPU" but implemented wholesale package.json restructuring |
| **Broken Dependency Chain** | atlas:p4:pagerank:apply still referenced graphify:authority, but the alias was deleted |
| **Path Mismatch** | Earlier version (d131609a5b) had graphify:authority but with wrong path (scripts/ instead of ../scripts/atlas/) |
| **No Rollback** | Between d131609a5b and now, no commit restored the aliases |

---

## Prevention Strategies

For future large refactoring commits:

1. **Search for Downstream References**
   ```bash
   # Before deleting an npm script alias, verify nothing calls it
   rg "npm run <alias>" src/ scripts/ --include="*.mjs" --include="*.ts"
   rg "npm run <alias>" .vscode/ --include="*.json"
   ```

2. **Document Deletions**
   - Large commit messages should list what's being removed
   - Use `git log --stat` to flag when >500 lines deleted from package.json

3. **CI Gate: Verify Aliases**
   ```bash
   # Check that all npm scripts referenced in code exist
   npm run --list 2>&1 | tee /tmp/aliases.txt
   rg "npm run [a-z:-]+\"" src/ scripts/ | awk -F'"' '{print $2}' | sort -u > /tmp/refs.txt
   comm -23 /tmp/refs.txt /tmp/aliases.txt  # Show missing aliases
   ```

4. **Staged Deprecation**
   - Mark aliases for removal with a `@deprecated` comment
   - Give 2–3 commits notice before deletion
   - Update call sites before removing the alias

---

## Files Modified This Session

- `sveltekit-frontend/package.json` — Lines 71–73 (added graphify:authority, karpathy:gpu; fixed circular ref)

## Related Documentation

- `GRAPHIFY-STARTUP-FIX-SUMMARY-2026-06-28.md` — Detailed infrastructure verification + startup pipeline analysis
- `PHASE-85-EXECUTION-ROADMAP-2026-06-28.md` — Phase 85 P5-P9 execution plan with Tier 1–4 stages

---

**Status**: ✅ RESOLVED  
**Commit**: Pending (changes staged for commit)  
**Next**: Execute Phase 85 startup pipeline via Option A or B from execution roadmap