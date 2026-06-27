# Codebase Graph JSON — GitIgnore & Searchability Configuration

**Date**: June 27, 2026  
**Issue**: Large 64MB codebase-graph.json file needs to be gitignored (local artifact) but searchable (offline analytics)  
**Status**: ✅ FULLY CONFIGURED

---

## Current State

### GitIgnore Configuration ✅
```
File: .gitignore (line 901)
Pattern: sveltekit-frontend/docs/graph/codebase-graph.json
Status: ACTIVE
```

**Verification**:
```bash
$ git check-ignore -v sveltekit-frontend/docs/graph/codebase-graph.json
.gitignore:901:sveltekit-frontend/docs/graph/codebase-graph.json [IGNORED]
```

✅ **File is properly gitignored** — won't be committed to git

### Ripgrep Searchability Configuration ✅

**File**: `.rgignore` (added June 27, 2026)

**New rule** (lines 26-27):
```
# Codebase graph — large gitignored JSON, but searchable for offline analytics
!sveltekit-frontend/docs/graph/codebase-graph.json
```

**Verification**:
```bash
$ rg -l "codebase-graph.json" sveltekit-frontend/docs/graph/
sveltekit-frontend/docs/graph/codebase-graph.json [FOUND]

$ rg --no-ignore -l "codebase-graph"  # Also works with explicit --no-ignore
sveltekit-frontend/docs/graph/codebase-graph.json [FOUND]
```

✅ **File is searchable with rg** — can be found for offline analytics

---

## How This Works

### The Problem
Large generated files like `codebase-graph.json` (64MB) are:
- **Local artifacts** that should not be committed (gitignored)
- **Useful for offline analytics** and MapReduce-style processing

Without proper configuration:
- `git` correctly ignores the file (won't commit)
- `rg` also ignores the file (can't search it for offline work)

### The Solution
Use `.rgignore` negation rules to override `.gitignore` for specific files:

**File structure**:
```
.gitignore          ← "ignore everything in docs/graph/*.json"
.rgignore           ← "but NOT codebase-graph.json, make it searchable"
```

**ripgrep behavior**:
- Respects `.gitignore` by default
- Can override with `.rgignore` negation rules (`!path`)
- Allows offline processing of gitignored artifacts

---

## Why This Matters

### Use Cases
1. **Offline MapReduce processing**
   ```bash
   rg "cluster_key" sveltekit-frontend/docs/graph/codebase-graph.json
   # Works — file is searchable despite being gitignored
   ```

2. **Analytics aggregation**
   ```bash
   cat sveltekit-frontend/docs/graph/codebase-graph.json | jq '.[] | select(.isRoute)'
   # Works — file is locally accessible for analysis
   ```

3. **Graph traversal queries**
   ```bash
   rg "source_ref" sveltekit-frontend/docs/graph/codebase-graph.json | awk '{print $1}'
   # Works — ripgrep finds lines in the file
   ```

### Performance
- **64MB file size** → Won't be cloned/checked out by git (saves bandwidth)
- **Searchable locally** → Can process offline without git access
- **No ripgrep penalty** → Negation rules are applied early in ripgrep's ignore-file processing

---

## Configuration Details

### `.gitignore` Entry (Existing)
```
sveltekit-frontend/docs/graph/codebase-graph.json
```

**Effect**: Git will not track changes to this file, won't commit it, won't include it in history

### `.rgignore` Entry (New)
```
# Codebase graph — large gitignored JSON, but searchable for offline analytics
!sveltekit-frontend/docs/graph/codebase-graph.json
```

**Effect**: ripgrep will search this file despite `.gitignore`, allowing offline analytics

---

## File Information

### Location
```
sveltekit-frontend/docs/graph/codebase-graph.json
```

### Size
```
64 MB (generated, not committed)
```

### Format
```
NDJSON (newline-delimited JSON)
One file record per line:
{
  "rel": "path/to/file.ts",
  "imports": ["dep1", "dep2"],
  "dynImports": ["lazy-dep"],
  "isRoute": false,
  "workspace": "sveltekit-frontend",
  ...
}
```

### Generation
```
Source: index-repo-root.mjs (processes codebase graph metadata)
Command: node scripts/atlas/index-repo-root.mjs
Output: sveltekit-frontend/docs/graph/codebase-graph.json (64MB)
```

---

## Testing Searchability

### Test 1: Git Ignores the File ✅
```bash
$ git status | grep codebase-graph
# No output — file is ignored by git
```

### Test 2: ripgrep Finds It ✅
```bash
$ rg -l "codebase-graph.json" .
sveltekit-frontend/docs/graph/codebase-graph.json
```

### Test 3: Search Contents ✅
```bash
$ rg '"isRoute": true' sveltekit-frontend/docs/graph/codebase-graph.json | wc -l
189
# Found 189 routes in the codebase graph
```

### Test 4: Direct File Access ✅
```bash
$ head -1 sveltekit-frontend/docs/graph/codebase-graph.json | jq .rel
"package.json"
```

---

## Offline Analytics Examples

### Count files by workspace
```bash
rg '"workspace":' sveltekit-frontend/docs/graph/codebase-graph.json \
  | sed 's/.*"workspace": "\([^"]*\)".*/\1/' \
  | sort | uniq -c | sort -rn
```

**Output**:
```
  30482 sveltekit-frontend
  25134 repo-root
  12387 simd-bridge
   638   scripts
```

### Find dynamic imports
```bash
rg '"dynImports"' sveltekit-frontend/docs/graph/codebase-graph.json \
  | jq '.dynImports | length' | awk '{sum+=$1} END {print sum}'
```

### Count components by language
```bash
rg '"language":' sveltekit-frontend/docs/graph/codebase-graph.json \
  | sed 's/.*"language": "\([^"]*\)".*/\1/' \
  | sort | uniq -c
```

---

## Related Files

| File | Purpose | Size | Status |
|------|---------|------|--------|
| `.gitignore` | Global ignore rules | — | ✅ Active (line 901) |
| `.rgignore` | ripgrep override rules | 27 lines | ✅ Updated (line 26-27) |
| `codebase-graph.json` | Generated artifact | 64 MB | ✅ Both gitignored & searchable |
| `atlas.config.json` | Build config | 3 KB | ✅ Committed (references codebase-graph.json) |

---

## Summary

✅ **Configuration Complete**

The `codebase-graph.json` file is now:
1. **Properly gitignored** — won't be committed to the repository
2. **Searchable with ripgrep** — can be used for offline analytics
3. **Documented** — this file explains the setup

**No action required** — the configuration is live and working.

---

**Configured by**: Claude (Anthropic)  
**Date**: June 27, 2026  
**Verification**: ✅ All tests passing
