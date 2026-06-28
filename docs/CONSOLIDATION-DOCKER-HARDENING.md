# Consolidation + Docker Hardening Rules
**Date**: June 28, 2026  
**Status**: ✅ PRODUCTION SAFETY  
**Purpose**: Prevent accidental deletion of Docker containers during file consolidation

---

## 🔐 Critical: Docker Files Are NOT Consolidation Targets

### Protected Paths (NEVER DELETE)
```
docker/
docker-compose.yml
docker-compose.override.yml
docker-compose.prod.yml
docker-compose.full.yml
docker-compose.seaweedfs.yml
Dockerfile
.dockerignore
.docker/
.containers/
```

### Protected Globs
```
**/docker/**
**/.docker/**
**/Dockerfile*
**/*docker-compose*.yml
**/container-definitions/**
```

## 🛡️ Hardening Rules for consolidate-audit.mjs

**Add to script BEFORE scanning**:

```javascript
// CRITICAL: Docker files are infrastructure, NOT code duplicates
const PROTECTED_PATHS = [
  'docker/',
  'docker-compose',
  '.docker/',
  '.containers/',
  'Dockerfile',
  '.dockerignore',
  'container-definitions/'
];

const PROTECTED_EXTENSIONS = [
  '.dockerfile',
  '.dockerfile.prod',
  '.yml', // docker-compose files
];

function isProtectedPath(filePath) {
  const rel = path.relative(ROOT, filePath);
  
  // Check protected path prefixes
  if (PROTECTED_PATHS.some(p => rel.startsWith(p))) {
    return true;
  }
  
  // Check protected filenames
  if (PROTECTED_PATHS.some(p => rel.includes(p))) {
    return true;
  }
  
  // Check protected extensions
  if (PROTECTED_EXTENSIONS.some(ext => rel.endsWith(ext))) {
    return true;
  }
  
  return false;
}

// BEFORE similarity scan:
const relevantFiles = allFiles.filter(f => {
  if (isProtectedPath(f)) {
    vlog(`[PROTECTED] Skipping Docker file: ${path.relative(ROOT, f)}`);
    return false;
  }
  return true;
});
```

**Output in audit report**:
```json
{
  "protectedFilesSkipped": 247,
  "protectedPaths": [
    "docker/",
    "docker-compose.yml",
    ".docker/",
    // ...
  ],
  "summary": "Docker infrastructure protected. 247 files excluded from consolidation."
}
```

## 📋 Docker Container Preservation Policy

### Phase 1: Audit
- ✅ Scan codebase (skip docker/ folder)
- ✅ Output: consolidation-candidates.json
- ⚠️ **Rule**: Never flag docker-compose.yml or Dockerfile as duplicates
- ⚠️ **Rule**: Never suggest merging container definitions

### Phase 2: Gemma4 Summaries
- ✅ Send candidate file pairs to Gemma4
- ⚠️ **Rule**: If Gemma4 flags a docker file, log warning and SKIP
- ⚠️ **Rule**: Never send docker-compose or container configs to LLM

### Phase 3: Dry-run
- ✅ Preview file deletions
- ⚠️ **Rule**: Verify NO docker files in deletion list
- ⚠️ **Rule**: Fail with error if any docker file is targeted for deletion

### Phase 4: Apply
- ✅ Execute merges and deletions
- ⚠️ **Rule**: Final safety check: verify docker files untouched
- ⚠️ **Rule**: Log all protected files in consolidation-applied.json

### Phase 5: Verify
- ✅ Check TypeScript + imports
- ⚠️ **Rule**: Verify `docker-compose up -d` still works
- ⚠️ **Rule**: Verify no docker-compose.yml imports were modified

---

## 🚀 Docker Container Hardening Checklist

**Before Consolidation**:
- [ ] Backup docker-compose files: `docker-compose*.yml`
- [ ] List running containers: `docker-compose ps`
- [ ] List volumes: `docker volume ls`
- [ ] List networks: `docker network ls`

**During Consolidation**:
- [ ] Audit explicitly skips `docker/` directory
- [ ] consolidation-candidates.json contains 0 docker files
- [ ] consolidation-dry-run.json contains 0 docker files

**After Consolidation**:
- [ ] docker-compose.yml unchanged: `git diff docker-compose.yml`
- [ ] Run: `docker-compose up -d` (verify no errors)
- [ ] Verify containers still running: `docker-compose ps`
- [ ] Check volumes still attached: `docker volume ls`

---

## 📊 Expected Docker Files Protected

### Count by Type
| Type | Files | Protected |
|------|-------|-----------|
| Docker config | 6 | ✅ docker-compose*.yml, Dockerfile* |
| Docker network | 0 | ✅ (defined in docker-compose.yml) |
| Docker volume | 0 | ✅ (defined in docker-compose.yml) |
| Container scripts | 12 | ✅ docker/scripts/* |
| Container configs | 8 | ✅ docker/configs/* |
| Docker env files | 3 | ✅ .env*, .docker/ |
| **TOTAL** | **29** | **✅ ALL PROTECTED** |

---

## 🔄 Git Safety (No Accidental Commits)

**Before consolidation:**
```bash
# Verify docker-compose.yml in git
git status docker-compose.yml
# Expected: not modified

# Add docker files to .gitignore (if not already)
echo "docker-compose.override.local.yml" >> .gitignore
```

**During consolidation:**
```bash
# Consolidation should NOT touch docker files
git diff docker-compose.yml
# Expected: empty (no changes)
```

**After consolidation:**
```bash
# Final verification
git diff | grep -i docker
# Expected: no output (no docker changes)
```

---

## 🚨 Failure Modes & Recovery

### Failure Mode 1: Docker File in Deletion List
**Cause**: consolidate-apply.mjs didn't check PROTECTED_PATHS  
**Detection**: consolidation-dry-run.json shows docker file deletion  
**Recovery**:
```bash
# STOP! Do not run consolidate:apply
git status  # Should be clean
npm run consolidate:audit  # Re-check
# Look for bug in PROTECTED_PATHS logic
```

### Failure Mode 2: docker-compose.yml Modified
**Cause**: consolidation modified imports in docker-compose.yml  
**Detection**: `git diff docker-compose.yml` shows changes  
**Recovery**:
```bash
git checkout docker-compose.yml
docker-compose up -d  # Verify still works
```

### Failure Mode 3: Docker Volumes Lost
**Cause**: Accidental `docker-compose down -v` before consolidation  
**Detection**: `docker volume ls` shows missing volumes  
**Recovery**:
```bash
# Restore from backup (if available)
# OR recreate volumes: docker-compose up -d
```

---

## 📝 Updated consolidate-audit.mjs Header

```javascript
/**
 * consolidate-audit.mjs
 * 
 * CRITICAL: This script identifies duplicate files for consolidation.
 * 
 * PROTECTED FILES (NEVER CONSOLIDATED):
 * - docker/  (all container definitions)
 * - docker-compose*.yml (container orchestration)
 * - Dockerfile* (container images)
 * - .docker/ (docker configuration)
 * 
 * If you see a docker file in consolidation-candidates.json, STOP.
 * That indicates a bug in the PROTECTED_PATHS logic.
 * 
 * Usage:
 *   node scripts/consolidate/consolidate-audit.mjs [--verbose]
 * 
 * Output:
 *   .tmp/consolidation-candidates.json (NO docker files)
 *   .tmp/consolidation-audit.json (with protectedFilesSkipped count)
 */
```

---

## 🔗 Integration with Parent Atlas TOC

**Canonical envelope location** (per codebase ingestion mapping):

```
sveltekit-frontend/docs/
├── graph/
│   ├── codebase-map.md                  ← Current canonical map
│   ├── multihop-codebase-map.json       ← Semantic connections
│   └── multihop-codebase-map.enriched.md ← Enriched metadata
│
├── CONSOLIDATION/                       ← NEW: Consolidation TOC
│   ├── index.md                         ← Entry point
│   ├── docker-hardening.md              ← ✅ This document
│   ├── canonical-envelopes.md           ← Canonical file mappings
│   ├── duplicate-groups.md              ← All 47 groups with lineage
│   ├── migration-checklist.md           ← Step-by-step apply guide
│   └── rollback-procedures.md           ← Recovery procedures
│
└── parent-atlas/                        ← CANONICAL envelope container
    ├── README.md                        ← Parent Atlas identity
    ├── packet-contract.md               ← Packet identity spine
    ├── lineage-verification.md          ← Verification gates
    ├── consolidation/                   ← Consolidation sub-directory
    │   ├── canonical-files.md           ← Which files are canonical
    │   ├── duplicate-groups.md          ← Which files are duplicates
    │   └── merge-order.md               ← Apply order (dependencies)
    └── ingestion/                       ← Directory → codebase mapping
        ├── src-lib-server.md            ← src/lib/server files
        ├── packages.md                  ← packages/* layout
        ├── scripts.md                   ← scripts/* organization
        └── docker.md                    ← Docker infrastructure (PROTECTED)
```

---

## 📍 TOC Subdirectory Mapping

**Codebase Ingestion → TOC Mapping**:

| Codebase Path | TOC Location | Status |
|---------------|--------------|--------|
| `src/lib/server/db/client.ts` | `parent-atlas/ingestion/src-lib-server.md` | Canonical |
| `packages/parent-atlas/src/db/client.ts` | `parent-atlas/ingestion/packages.md` | Duplicate → DELETE |
| `scripts/atlas/db-client.ts` | `parent-atlas/ingestion/scripts.md` | Duplicate → DELETE |
| `docker/` | `parent-atlas/ingestion/docker.md` | **PROTECTED** ✅ |
| `docker-compose.yml` | `parent-atlas/ingestion/docker.md` | **PROTECTED** ✅ |

**Rule**: Every consolidation candidate has a mapping in `parent-atlas/ingestion/`.

---

## ✅ Pre-Consolidation Safety Checklist

- [ ] `consolidate-audit.mjs` includes PROTECTED_PATHS logic
- [ ] PROTECTED_PATHS explicitly lists docker/ and docker-compose*.yml
- [ ] consolidation-candidates.json contains 0 docker files
- [ ] docker-compose*.yml files NOT in .tmp/ deletion lists
- [ ] `parent-atlas/ingestion/docker.md` marks docker as PROTECTED
- [ ] README.md updated: "Docker infrastructure excluded from consolidation"
- [ ] Git status clean: no uncommitted changes to docker files
- [ ] Backup created: `docker-compose*.yml` copied to backup/

---

## 🚀 Execute Consolidation (With Docker Safety)

```bash
cd sveltekit-frontend

# Step 1: Audit (skips docker/ automatically)
npm run consolidate:audit
echo "✅ Verify: consolidation-candidates.json contains 0 docker files"
grep -i docker .tmp/consolidation-candidates.json && echo "❌ FAIL: Docker file in candidates!" || echo "✅ PASS: No docker files"

# Step 2: Preview
npm run consolidate:dry --confidence 0.90
echo "✅ Verify: consolidation-dry-run.json contains 0 docker files"
grep -i "docker\|compose" .tmp/consolidation-dry-run.json && echo "❌ FAIL: Docker file in dry-run!" || echo "✅ PASS"

# Step 3: Apply (will skip docker files due to PROTECTED_PATHS)
npm run consolidate:apply --confidence 0.90 --preserve-tests

# Step 4: Verify docker still works
echo "✅ Verify: docker-compose.yml unchanged"
git diff docker-compose.yml | wc -l  # Should be 0
docker-compose up -d --dry-run 2>&1 | head -5  # Should succeed

# Step 5: Final commit
npm run consolidate:report
```

---

## 📞 Questions?

**Q: Why protect docker files?**  
A: Docker containers are infrastructure, not code duplicates. Consolidation is for TypeScript/JavaScript modules, not deployment configs.

**Q: What if docker-compose.yml has duplicated logic?**  
A: Manual refactor (outside of consolidation). Keep the YAML as-is.

**Q: Can I consolidate docker/ scripts?**  
A: No. docker/ is protected at the directory level. All files inside are PROTECTED.

**Q: What about docker/.env files?**  
A: Protected. Add to .gitignore if local overrides; never consolidate.

---

**Status**: ✅ Docker hardening rules defined  
**Version**: 1.0  
**Date**: June 28, 2026  