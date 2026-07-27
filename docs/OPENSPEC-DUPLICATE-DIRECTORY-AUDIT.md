# OpenSpec GSD Task: Duplicate Directory Structure Audit & Remediation

**Status**: DISCOVERY → AUDIT → DECISION → EXECUTION  
**Priority**: P0 (blocks svelte-check, prevents compilation verification)  
**Created**: 2026-07-27  
**Owner**: James Woodard  

---

## Problem Statement

`svelte-check --threshold error` fails with `FATAL ERROR: Reached heap limit` due to deeply nested duplicate directories created under `sveltekit-frontend/sveltekit-frontend/...` during PowerShell path handling in a prior session.

**Discovery**:
```
/c/Users/james/Videos/deeds-web-app/sveltekit-frontend
/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/.docker-build/sveltekit-frontend
/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/sveltekit-frontend                    ← DUPLICATE L1
/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/sveltekit-frontend/sveltekit-frontend  ← DUPLICATE L2
/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/sveltekit-frontend ← DUPLICATE L3
```

**Impact**:
- svelte-check traversal hits recursive directory loop
- .opencode config load on nested `svelte.config.js` spawns unbounded search
- Heap exhaustion → OOM kill
- Blocks TypeScript compilation verification
- Prevents merge readiness assessment

---

## Root Cause Analysis

**When**: Prior session (exact commit TBD, post-Session 145)  
**How**: PowerShell path concatenation or glob expansion without path normalization:
- `sveltekit-frontend/` directory reference concatenated instead of used directly
- Possible script: `for ($dir in @(...)) { Copy-Item $dir ... }` without `-Recurse` guard
- Or: glob expansion of `**/*` hitting symlinks / relative path resolution

**Why duplicates persist**:
- `.gitignore` permits nested arbitrary dirs (no specific `sveltekit-frontend/` exclusion)
- No CI gate to detect filesystem structure anomalies
- PowerShell native cmdlets don't validate path traversal depth

---

## Audit Scope

**What we need to verify before deletion**:

1. **Canonical directory integrity**
   - Root `sveltekit-frontend/` contains all required files (tsconfig, package.json, src/, drizzle/, etc.)
   - No data loss in root directory

2. **Duplicate directory contents**
   - Are duplicate L1/L2/L3 directories symbolic links (safe to rm) or real copies?
   - What files exist in `sveltekit-frontend/sveltekit-frontend/`? (Expect full project tree copy)
   - Size on disk: is this a significant storage leak?

3. **Reference integrity**
   - No running processes hold file handles into duplicate dirs
   - No git worktrees or `.git` submodules in duplicates
   - No Docker volumes mounted from duplicate paths

4. **Remediation safety**
   - Confirm no hardlinks cross duplicate boundaries
   - Verify no npm/node_modules symlinks to duplicate locations
   - Check VSCode workspace settings for embedded paths

---

## Audit Tasks

### Task A1: Structural Inspection
- **Objective**: Determine filesystem structure of duplicates
- **Steps**:
  1. `find /sveltekit-frontend -maxdepth 4 -type d -name sveltekit-frontend -exec ls -lhd {} \;`
  2. `du -sh /sveltekit-frontend/sveltekit-frontend{,/sveltekit-frontend{,/sveltekit-frontend}}`
  3. Check if any are symlinks: `ls -ld /sveltekit-frontend/sveltekit-frontend`
- **Output**: Dimensions, symlink status, tree depth

### Task A2: Content Inventory
- **Objective**: Verify duplicates are exact copies (or detect new data)
- **Steps**:
  1. `find /sveltekit-frontend/sveltekit-frontend -maxdepth 1 -type f | head -20`
  2. `ls -la /sveltekit-frontend/sveltekit-frontend/package.json` (should exist if copy)
  3. Compare with root: `diff <(ls -la /sveltekit-frontend/) <(ls -la /sveltekit-frontend/sveltekit-frontend/)`
- **Output**: File list, presence of package.json, diff report

### Task A3: Reference Check
- **Objective**: Ensure no active process depends on duplicates
- **Steps**:
  1. `lsof 2>/dev/null | grep sveltekit-frontend/sveltekit-frontend || echo "No open handles"`
  2. `git config --get core.worktreeConfig` — check for worktree refs
  3. `grep -r "sveltekit-frontend/sveltekit-frontend" /sveltekit-frontend/.git/ 2>/dev/null || echo "No git refs"`
- **Output**: Open file descriptors, git refs, confirmation of isolation

### Task A4: Docker/Runtime Check
- **Objective**: Verify no containers or services reference duplicates
- **Steps**:
  1. `docker ps --format "{{.Names}}" | xargs -I {} docker inspect {} | grep sveltekit-frontend/sveltekit-frontend || echo "No container refs"`
  2. `grep -r "sveltekit-frontend/sveltekit-frontend" ~/.vscode ~/.config/Code/ 2>/dev/null || echo "No VSCode workspace refs"`
- **Output**: Container bindings, VSCode workspace config

---

## Remediation Plan

### Decision Gate (requires audit completion)

**If A1-A4 all pass** (duplicates are isolated copies, no references):
```
DECISION: REMOVE duplicates + log structure
```

**If any check fails** (e.g., open handles, git refs, or symlinks):
```
DECISION: ARCHIVE duplicates to deeds_labs/ + document rationale
```

### Removal Steps (conditional on audit passing)

1. **Backup manifest**
   ```bash
   find /sveltekit-frontend/sveltekit-frontend -type f -exec sha256sum {} \; \
     > /tmp/duplicate-manifest.txt
   ```

2. **Remove L3 duplicate** (innermost)
   ```bash
   rm -rf /sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/sveltekit-frontend
   ```

3. **Remove L2 duplicate**
   ```bash
   rm -rf /sveltekit-frontend/sveltekit-frontend/sveltekit-frontend
   ```

4. **Remove L1 duplicate**
   ```bash
   rm -rf /sveltekit-frontend/sveltekit-frontend
   ```

5. **Verify root integrity**
   ```bash
   npm run check   # from /sveltekit-frontend
   npx svelte-check --threshold error
   ```

6. **Document**
   - Commit SHA of archival decision
   - Manifest file location (git history or archive)
   - Timeline of duplicate creation (git blame on parent dirs)

### Archive Steps (if audit finds dependencies)

1. Create manifest in `docs/archive-manifest.json`:
   ```json
   {
     "path": "sveltekit-frontend/sveltekit-frontend/...",
     "reason": "nested duplicate directories from PowerShell path handling bug in Session N",
     "archived": "2026-07-27T...",
     "sha256": "...",
     "size_mb": "###",
     "recovery": "git show <commit>:sveltekit-frontend/sveltekit-frontend"
   }
   ```

2. Move to `deeds_labs/archive/2026-07-27/`:
   ```bash
   mkdir -p deeds_labs/archive/2026-07-27
   mv sveltekit-frontend/sveltekit-frontend deeds_labs/archive/2026-07-27/sveltekit-frontend-dup.bak
   ```

---

## Success Criteria

- [ ] Audit A1-A4 complete, results documented
- [ ] Decision made: REMOVE or ARCHIVE
- [ ] If REMOVE: `npx svelte-check --threshold error` succeeds, heap usage <500MB
- [ ] If ARCHIVE: manifest written, git history clean, recovery path documented
- [ ] TypeScript compilation verification runs without OOM
- [ ] No files lost from canonical `/sveltekit-frontend/` tree

---

## Risk Mitigation

**Risk**: Accidental deletion of non-duplicate critical files  
**Mitigation**: Audit A2 confirms duplicates are exact copies before deletion; backup manifest saved

**Risk**: Symlinks create recursive deletion  
**Mitigation**: Audit A1 checks symlink status explicitly; use `rm -rf` only after confirming regular dirs

**Risk**: Git state corruption if .git exists in duplicate  
**Mitigation**: Audit A3 checks `git config --get core.worktreeConfig`; aborts if worktrees detected

---

## Next Steps

1. **Run Audit** (requires authorization)
   - Execute tasks A1-A4 in sequence
   - Document results in `docs/OPENSPEC-DUPLICATE-DIRECTORY-AUDIT-RESULTS.md`

2. **Decision Review** (async, user input)
   - User reviews audit results
   - Confirms REMOVE or ARCHIVE decision
   - Authorizes remediation

3. **Execute Remediation** (conditional)
   - Run removal or archival steps
   - Verify success criteria
   - Commit decision log

4. **Post-Remediation** (verification)
   - Re-run svelte-check to confirm OOM resolved
   - Add fs structure check to CI pipeline (prevent recurrence)
   - Document PowerShell path handling rules in CLAUDE.md

