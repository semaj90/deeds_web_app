# Preflight Audit Report — June 23, 2026

**Status**: 🔴 **BLOCKING ISSUES FOUND — DO NOT PROCEED TO P3G BACKFILL**

---

## Critical Issues

### 1. Duplicate Audit Scripts (DIFFERENT implementations!)

**Root cause**: Two versions of `audit-acp-packet-transport.mjs` exist in different locations:

#### Root: `scripts/atlas/audit-acp-packet-transport.mjs`
- **Status**: ❌ BROKEN — Node.js syntax error
- **Issue**: Line 130 has duplicate export: `export { auditAcpPacketTransport }`
- **Error**: `SyntaxError: Duplicate export of 'auditAcpPacketTransport'` (line 20 already exports it)
- **Severity**: 🔴 BLOCKS execution — script cannot run
- **Functions**: ALL return `true` unconditionally (4 stubbed checks, non-functional)
- **Fixed in edit**: Line 125 newline escape (was `"\\n"`, now `"\n"`)

#### SvelteKit: `sveltekit-frontend/scripts/atlas/audit-acp-packet-transport.mjs`
- **Status**: ✅ REAL IMPLEMENTATION
- **Functions**: Actual hex key validation, JSON-RPC checks, canonical fields, injection risk
- **Issue**: This is the real one, but is in wrong location (shouldn't be duplicated)

**Action required**:
1. Delete the stub at `scripts/atlas/audit-acp-packet-transport.mjs`
2. Keep only the real one at `sveltekit-frontend/scripts/atlas/audit-acp-packet-transport.mjs`
3. Update npm scripts in `package.json` to point to correct location

---

### 2. File Size Audit — Large Untracked Files

| Path | Size | Status | Action |
|------|------|--------|--------|
| `models/embeddinggemma_300m/` | 2.4 GB | ⚠️ Submodule | Already in .gitignore ✓ |
| `granite-docling-258M/` | 1.0 GB | ⚠️ Untracked | Already in .gitignore ✓ |
| `turbovec/` | 492 MB | ⚠️ Submodule | Already in .gitignore ✓ |

**Status**: ✅ All properly .gitignored — safe to commit

---

### 3. Git Status Analysis

**Tracked changes** (safe to commit):
- `docs/reports/p3g-data-layer-audit-2026-06-23.md` (NEW — audit findings)
- `docs/P3G-BLOCKING-ISSUES-DECISION.md` (NEW — decision framework)
- `scripts/atlas/audit-acp-packet-transport.mjs` (EDITED — fixed line 125)
- Various config files (package.json, settings.local.json)

**Submodules requiring separate handling** (git submodule update):
- `.claude/worktrees/agent-*` (4 items)
- `models/embeddinggemma_300m`
- `turbovec`
- `claude-mem`

**Untracked new files**:
- `.claude/scheduled_tasks.lock` (trivial lock file)
- New reports (NEW, added by this session)

---

## Schema Verification Status

### Required Checks (Pre-Migration)

**1. Package.json module type**
```bash
$ grep '"type"' sveltekit-frontend/package.json
"type": "module",
```
✅ PASS — ES modules enabled

**2. Node.js version check**
```bash
$ node --version
v22.17.1
```
✅ PASS — v22.x supports N-API v9, async/await, ES modules

**3. Drizzle schema verification**
```bash
$ npm run drizzle:generate --dry
```
⏳ TODO — Must run before migration

**4. Migration script check**
```bash
$ npm run migrate --dry-run
```
⏳ TODO — Check for schema conflicts

---

## P3g Verification Status (from earlier audit)

| Metric | Current | Required | Status |
|--------|---------|----------|--------|
| Postgres coverage | 17,994/17,995 (99.99%) | 100% | ⏳ 1 missing |
| Unique Qdrant IDs | 17,919 | 17,995 | ❌ Collision |
| Qdrant points | 52,606 | ~17,995 | ❌ 34,687 orphaned |
| Audit script | BROKEN | WORKING | ❌ Duplicate |

**Conclusion**: P3g is **NOT verified complete**. Mirror integrity failed.

---

## Recommended Action Sequence

**✅ COMPLETED**:
1. Fixed audit script line 125 (escape sequence)
2. Identified 75 collision packets
3. Created detailed audit reports

**⏳ TODO (in order)**:

```bash
# Step 1: Remove duplicate stub audit script
rm scripts/atlas/audit-acp-packet-transport.mjs

# Step 2: Stage changes
git add -A
git status --short  # verify only expected files

# Step 3: Commit with summary
git commit -m "fix(audit): remove duplicate stub, fix escape sequence, add P3g audit reports

- Remove stub audit-acp-packet-transport.mjs from root (duplicate export error)
- Fix line 125 escape sequence in script (was \\\\n, now \n)
- Add P3g data layer audit report (75 collisions, 34k orphans found)
- Add decision framework for collision resolution
- P3g NOT verified complete — mirror integrity issues blocking P3g → Lane C"

# Step 4: Verify no large files included
git ls-files --size | awk '{if($2>10485760) print "BLOCKER: " $0}'  # >10MB check

# Step 5: Push to main
git push origin main

# Step 6: Run migration + tests (safe mode)
npm run migrate --dry-run
npm run test -- agent-memory-schema-matching
node scripts/atlas/verify-p3g-complete.mjs

# Step 7: Decide on P3g path (A/C/D)
# See docs/P3G-BLOCKING-ISSUES-DECISION.md
```

---

## Decision Required: P3g Collision Resolution

**Three options** (see `docs/P3G-BLOCKING-ISSUES-DECISION.md`):

**A) Fix Everything Now** (90 min)
- Rebuild 75 collision packets
- Fix 1 missing packet
- Clean Qdrant orphans
- Full verification
- **Pro**: P3g becomes trustworthy, retrieval safe
- **Con**: Delays next phase ~1.5h

**C) Accept Partial State** (5 min)
- Disable Qdrant retrieval (temp)
- Proceed to Lane C analytics
- Fix collisions in parallel
- **Pro**: Fast forward
- **Con**: Retrieval corrupted until fixed

**D) Investigate First**
- Run detailed collision audit
- Understand root cause
- Decide after diagnosis
- **Pro**: Safe, informed decision
- **Con**: Unknown timeline

---

## Summary

| Item | Status | Blocker |
|------|--------|---------|
| Git commit ready | ✅ YES | ✓ Safe |
| Large files checked | ✅ YES | ✓ All gitignored |
| Audit script fixed | ✅ PARTIAL | ⚠️ Duplicate exists |
| P3g verified complete | ❌ NO | 🔴 **YES** |
| Schema ready | ⏳ TBD | ⚠️ Need dry-run |
| Tests ready | ⏳ TBD | ⚠️ Need run |
| P3g backfill ready | ❌ NO | 🔴 **YES** |

---

## Next: Immediate Actions

**Your decision required on two questions**:

1. **Duplicate audit script**: Should I delete `scripts/atlas/audit-acp-packet-transport.mjs` (stub)? (Answer: YES)

2. **P3g collision resolution**: Pick **A**, **C**, or **D** for P3g fix path.

**Once you confirm**, I'll:
```bash
# 1. Clean up audit script duplicate
# 2. Commit all changes with summary
# 3. Verify migration + tests safe
# 4. Execute your chosen P3g path
```

---

**Do not run P3g backfill until this audit passes.**

Last updated: 2026-06-23 18:45 UTC
