# Session 84 Step 5a: Production Readiness Roadmap

**Status**: Framework complete, migration path clear  
**Priority**: Sequential patches from P0 (highest impact) to P6 (quality gates)

---

## Current State (PoC)

**File**: `scripts/atlas/git-diff-supersedes-reconcile.mjs` (425 lines)
- ✅ Correct architecture
- ✅ Correct output format
- ❌ Mock data (no live reads)
- ❌ No hard-fail probes
- ❌ No --apply transaction

**File**: `scripts/atlas/git-diff-supersedes-reconcile-production.mjs` (NEW, 780 lines)
- ✅ Real Postgres lookup (P0 — TODO)
- ✅ Real doc scanner via rg (P1 — TODO)
- ✅ Real Qdrant lookup (P2 — TODO)
- ✅ Real Redis scan (P3 — TODO)
- ✅ 7 hard-fail probes (P4-P6 — TODO)
- ✅ Action queueing framework
- ❌ Postgres transaction (P4 — TODO)
- ❌ GAN contradiction report (P5 — TODO)
- ❌ Duplicate-doc guard (P6 — TODO)

---

## Patch Priority (Sequential)

### P0: Replace Mock `findPacketsBySourceRef()` — CRITICAL

**Current** (mock):
```javascript
function findPacketsBySourceRef(sourceRef) {
  const mockPackets = [{
    packet_key: 'ace:packet:auth:001',
    feature_id: 'auth.sessions',
    source_ref: 'src/lib/server/auth.ts',
    // ...
  }];
  return mockPackets.filter(p => p.source_ref === sourceRef);
}
```

**Target** (production):
```javascript
async function findPacketsBySourceRef(sourceRef, filePath) {
  // Use Drizzle ORM via db client
  const packets = await db
    .select()
    .from(atlasPackets)
    .where(
      or(
        eq(atlasPackets.sourceRef, sourceRef),
        like(atlasPackets.filePath, filePath)
      )
    )
    .limit(100);
  
  return packets;
}
```

**Impact**: Opens the gate to all downstream lookups  
**Effort**: 15 minutes  
**Test**: Verify returns actual packet_key values from Postgres  
**Blocker**: DATABASE_URL must be set in environment

---

### P1: Replace Mock `findStaleDocs()` — HIGH

**Current** (mock):
```javascript
function findStaleDocs(filePath, sourceRef) {
  const staleDocs = [{
    file: 'docs/architecture/auth-flow.md',
    references: ['src/lib/server/auth.ts', 'validateSession'],
  }];
  return staleDocs.filter(doc => 
    doc.references.some(ref => ref.includes(filePath))
  );
}
```

**Target** (production):
```javascript
async function findStaleDocs(filePath, sourceRef, featureId) {
  const docsDir = path.join(ROOT, 'docs');
  const patterns = [
    sourceRef.replace(/\\/g, '\\\\'),
    featureId,
    path.basename(filePath, path.extname(filePath)),
  ];
  
  const staleDocs = [];
  for (const pattern of patterns) {
    const result = spawnSync('rg', [
      '--files-with-matches',
      pattern,
      docsDir
    ]);
    
    if (result.status === 0) {
      staleDocs.push(...result.stdout.trim().split('\n'));
    }
  }
  
  return staleDocs;
}
```

**Impact**: Detects all stale docs that need review/updates  
**Effort**: 20 minutes  
**Test**: Change `src/lib/server/auth.ts`, verify docs/ scan finds auth-related files  
**Prerequisite**: rg installed (`npm install -g ripgrep` or available in PATH)

---

### P2: Replace Mock `findQdrantPayloads()` — MEDIUM

**Current** (mock):
```javascript
function findQdrantPayloads(sourceRef, featureId) {
  const payloads = [{
    point_id: 1001,
    collection: 'codebase_chunks_768',
    payload: {
      source_ref: sourceRef,
      feature_id: featureId,
      packet_key: 'ace:packet:auth:001',
    },
  }];
  return payloads.filter(p => p.payload.source_ref === sourceRef);
}
```

**Target** (production):
```javascript
async function findQdrantPayloads(sourceRef, featureId, packetKey) {
  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  const collection = 'codebase_chunks_768';
  
  const res = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: {
        must: [{
          key: 'source_ref',
          match: { value: sourceRef }
        }]
      },
      limit: 100
    })
  });
  
  const data = await res.json();
  return data.result?.points || [];
}
```

**Impact**: Verifies Qdrant payload consistency with Postgres (P4 gate)  
**Effort**: 25 minutes  
**Test**: Verify Qdrant returns matching payloads for known packets  
**Prerequisite**: Qdrant service running (http://localhost:6333)

---

### P3: Replace Mock `findRedisKeys()` — MEDIUM

**Current** (mock):
```javascript
function findRedisKeys(sourceRef, featureId, packetKey) {
  const keys = [
    `bitfrost:packet:${packetKey}`,
    `bitfrost:source:${sourceRef}`,
    `bitfrost:feature:${featureId}`,
  ];
  return keys;
}
```

**Target** (production):
```javascript
async function findRedisKeys(sourceRef, featureId, packetKey) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || '6379',
    password: process.env.REDIS_PASSWORD,
  });
  
  const patterns = [
    `bitfrost:packet:${packetKey}`,
    `bitfrost:source:*${sourceRef.split('/').pop()}*`,
    `bitfrost:feature:${featureId}`,
    `centroid:feature:${featureId}`,
  ];
  
  const foundKeys = [];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    foundKeys.push(...keys);
  }
  
  await redis.quit();
  return [...new Set(foundKeys)];
}
```

**Impact**: Identifies all cache keys to invalidate (P5 gate)  
**Effort**: 20 minutes  
**Test**: Create a cache entry, verify it's found by this function  
**Prerequisite**: Redis/Valkey service running on configured host:port

---

### P4: Add Postgres Transaction (`--apply` flag) — CRITICAL

**Current**: No database modifications (dry-run only)

**Target**: Transactional SUPERSEDED marking
```javascript
async function applySupersedes(reconciliations) {
  // Must be transactional: all-or-nothing
  const transaction = db.transaction(async () => {
    for (const recon of reconciliations) {
      for (const packet of recon.affected_packets) {
        await db
          .update(atlasPackets)
          .set({
            evidenceStatus: 'SUPERSEDED',
            supersededAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              ...packet.metadata,
              superseded_by_git_commit: getCurrentGitCommit(),
              superseded_at_timestamp: Date.now(),
            },
          })
          .where(eq(atlasPackets.packetKey, packet.packet_key));
      }
    }
  });
  
  await transaction;
  console.log(`✓ Marked ${reconciliations.length} packets SUPERSEDED`);
}
```

**Impact**: Makes changes durable + atomic  
**Effort**: 30 minutes  
**Test**: Verify Postgres shows evidence_status='SUPERSEDED' after apply  
**Blocker**: P0 must be complete (need real packet_key values)  
**Safety**: Wrap in try/catch; rollback on error

---

### P5: Add GAN Contradiction Report — HIGH

**Current**: Probes collect failures but don't generate report

**Target**: Per-packet contradiction summary
```javascript
async function generateContradictionReport(reconciliations) {
  const contradictions = [];
  
  for (const recon of reconciliations) {
    for (const packet of recon.affected_packets) {
      const contradictory = [];
      
      // P4: Check Qdrant vs Postgres
      for (const qp of recon.qdrant_payloads) {
        if (qp.payload?.source_ref !== packet.source_ref) {
          contradictory.push({
            gate: 'P4',
            issue: 'Qdrant payload source_ref mismatch',
            postgres: packet.source_ref,
            qdrant: qp.payload?.source_ref,
            severity: 'error',
          });
        }
      }
      
      // P5: Check Redis cache status
      for (const key of recon.redis_keys) {
        if (key.includes(packet.packet_key)) {
          contradictory.push({
            gate: 'P5',
            issue: 'Superseded packet still in Redis cache',
            key,
            action: 'Will be deleted on apply',
            severity: 'warn',
          });
        }
      }
      
      if (contradictory.length > 0) {
        contradictions.push({
          packet_key: packet.packet_key,
          issues: contradictory,
        });
      }
    }
  }
  
  return contradictions;
}
```

**Impact**: Exposes cache/DB desync issues before marking SUPERSEDED  
**Effort**: 25 minutes  
**Test**: Create a stale Qdrant payload, verify contradiction report catches it  
**Blocker**: P2 + P3 must be complete

---

### P6: Add No-Duplicate-Doc Guard — MEDIUM

**Current**: No check for duplicate docs

**Target**: Enforce SUPERSEDES link, not duplication
```javascript
async function validateNoDuplicate(reconciliations) {
  const errors = [];
  
  for (const recon of reconciliations) {
    for (const doc of recon.stale_docs) {
      // Ensure no duplicate doc created
      // Check: if stale doc exists AND affected packet exists,
      // packet must have superseded_by or doc must have SUPERSEDES link
      
      const hasSupersedesLink = doc.file.includes('SUPERSEDES:') || 
        doc.file.includes('supersedes_packet_key');
        
      if (!hasSupersedesLink && recon.affected_packets.length > 0) {
        errors.push({
          doc: doc.file,
          issue: 'Stale doc lacks SUPERSEDES link to affected packet',
          action: 'Add link before marking stale',
          severity: 'error',
        });
      }
    }
  }
  
  return errors;
}
```

**Impact**: Prevents accidental duplication (mark stale, don't duplicate)  
**Effort**: 15 minutes  
**Test**: Verify doc has SUPERSEDES link before and after apply  
**Blocker**: P1 + P4 must be complete

---

## Integration Testing

### Test Case 1: Happy Path (All Gates Pass)

```bash
# 1. Prepare: Create test file + make change
echo "// test" > sveltekit-frontend/src/test-auth-change.ts
git add .
git commit -m "test: change auth"

# 2. Run dry-run
node scripts/atlas/git-diff-supersedes-reconcile-production.mjs --dry-run --verbose

# 3. Verify output
cat .tmp/git-diff-supersedes-production.json | jq '.gate_summary'
# Should show: total_failures: 0

# 4. Apply
node scripts/atlas/git-diff-supersedes-reconcile-production.mjs --apply --report-gates

# 5. Verify Postgres
psql -c "SELECT count(*) FROM atlas_packets WHERE evidence_status='SUPERSEDED'"
# Should show: 1
```

### Test Case 2: Contradiction Detection

```bash
# 1. Manually create stale Qdrant payload
# Point to old source_ref, but Postgres says new source_ref

# 2. Run with --report-gates
node scripts/atlas/git-diff-supersedes-reconcile-production.mjs --dry-run --report-gates

# 3. Check gate report
cat .tmp/git-diff-supersedes-gate-probes.json | jq '.probes.P4'
# Should show: error count > 0
```

### Test Case 3: No Duplicate Docs

```bash
# 1. Modify docs/ to add duplicate (intentionally bad)
cp docs/auth-flow.md docs/auth-flow-v2.md

# 2. Run with stale doc detection
node scripts/atlas/git-diff-supersedes-reconcile-production.mjs --dry-run --verbose

# 3. Verify report flags duplicate
cat .tmp/git-diff-supersedes-production.json | jq '.reconciliations[0].stale_docs'
# Should include both files, marked for review
```

---

## Deployment Checklist

### Pre-Production (All Patches P0-P6)

- [ ] P0: Postgres lookup working + tested with real data
- [ ] P1: rg scan finds docs + tested on real docs/
- [ ] P2: Qdrant lookup returns real payloads + tested
- [ ] P3: Redis scan finds real keys + tested
- [ ] P4: --apply writes Postgres transactions + tested
- [ ] P5: Contradiction report catches at least 1 real issue
- [ ] P6: No-duplicate guard validates SUPERSEDES links
- [ ] All gate probes return sensible output
- [ ] Error handling + graceful fallbacks tested
- [ ] Observability wired (logging + metrics)
- [ ] Rollback procedure tested
- [ ] Documentation updated

### Go/No-Go Decision

✅ **Go**: All patches complete, 100% gate success rate on test data  
❌ **No-Go**: Any patch incomplete or gate failure rate > 5%

---

## Success Metrics

| Metric | Target | Pass Criteria |
|--------|--------|---------------|
| Postgres lookup latency | < 500ms | Test suite avg < 500ms |
| Doc scan latency | < 2s | rg completes for docs/ |
| Qdrant lookup latency | < 1s | HTTP request + parse |
| Redis scan latency | < 500ms | redis-cli KEYS response |
| Contradiction detection | > 95% | Manual spot-check finds issues |
| Idempotency | 100% | Re-run same diff = same result |
| Transaction success | 100% | --apply always atomic |
| No duplicates | 100% | Every stale doc has SUPERSEDES link |

---

## Post-Deployment (Step 5b)

Once production patches are complete:

1. Integrate into Step 5b (LangExtract enrichment)
2. Feed affected packets to Gemma4
3. Regenerate summaries with feature labels
4. Run GAN validation gates
5. Measure: token reduction, cache metrics, accuracy

---

## Files Reference

- **PoC**: `scripts/atlas/git-diff-supersedes-reconcile.mjs` (425 lines, mock data)
- **Production scaffold**: `scripts/atlas/git-diff-supersedes-reconcile-production.mjs` (780 lines, ready for patches)
- **This roadmap**: `docs/reports/SESSION-84-STEP-5A-PRODUCTION-ROADMAP.md`
- **PoC documentation**: `docs/reports/SESSION-84-STEP-5A-GIT-DIFF-SUPERSEDES.md`

---

**Status**: Ready to patch (all functions stubbed, all gates defined)  
**Next**: Execute P0 → P1 → P2 → P3 → P4 → P5 → P6 sequentially  
**Timeline**: 3-4 hours for full production readiness
