# Phase 114: Graphify Daily Automation

**Date**: July 25, 2026 (planning phase)  
**Status**: 🚀 PHASE 111 COMPLETE | ⏳ PHASE 114 DESIGN READY  
**Timeline**: Days 3+ (continuous background automation)

---

## Objective

Implement daily automated graph recomputation with delta indexing, change detection, and Neo4j topology updates to maintain fresh codebase intelligence while minimizing redundant work.

---

## Current State (Phase 111)

**What's Static**:
- File inventory (27,704 files, SHA-256 hashed)
- Feature ontology (45,619 features → 37 domains)
- SOM topology (20×20 grid, 100 K-Means clusters)
- PageRank authority scores (computed once)

**What's Stale** (Without Phase 114):
- Neo4j topology edges (SOM adjacency)
- Qdrant payload enrichment (new file entries)
- Redis domain-class centroids (recalculated daily)
- Graphify metadata (last indexed timestamp)

---

## Phase 114 Architecture: 3-Layer Delta Indexing

### Layer 1: Incremental File Inventory

**Daily Job: Update file snapshot**

```
Step 1: Scan filesystem (ripgrep)
  Input: Current directory tree
  Output: New SHA-256 file inventory
  
Step 2: Diff against previous snapshot
  Input: Previous day's inventory
  Output: Changed files (added, modified, deleted)
  
Step 3: Classify changes
  Input: Changed files + type (code, doc, config, test)
  Output: Categorized delta:
    - New code: 5 files
    - Modified code: 12 files
    - Deleted code: 0 files
    - New docs: 2 files
    - etc.
```

**Delta Detection Logic**:
```typescript
// Pseudocode
async function detectFileDelta(): Promise<FileDelta> {
  const currentSnap = await scanFilesystem();
  const previousSnap = await loadSnapshot("2026-07-25");
  
  const added = currentSnap.filter(f => !previousSnap.has(f.sha256));
  const deleted = previousSnap.filter(f => !currentSnap.has(f.sha256));
  const modified = currentSnap.filter(f => {
    const prev = previousSnap.get(f.path);
    return prev && prev.sha256 !== f.sha256;
  });
  
  return { added, deleted, modified };
}
```

**Trigger Condition**: Run if delta size > 0 files  
**Expected Frequency**: Daily (assuming <5% daily change rate)  
**Expected Duration**: <5 minutes

---

### Layer 2: Incremental Structural Extraction

**Daily Job: Extract structure only for changed files**

```
Step 1: Filter changed files
  Input: File delta from Layer 1
  Output: Only .ts, .js, .tsx, .jsx files
  
Step 2: Extract AST structures (tree-sitter)
  Input: Changed code files
  Output: Functions, classes, imports, exports
  
Step 3: Diff structural facts
  Input: New structures + previous facts
  Output: Structural delta:
    - New functions: 3
    - Modified functions: 7
    - Deleted functions: 0
    - etc.
```

**Incremental Processing**:
```typescript
async function extractStructuralDelta(): Promise<StructuralDelta> {
  const fileDelta = await detectFileDelta();
  const changedCodeFiles = fileDelta.added
    .concat(fileDelta.modified)
    .filter(f => f.path.match(/\.(ts|tsx|js|jsx)$/));
  
  const newStructures = await extractAST(changedCodeFiles);
  const prevStructures = await loadStructures("2026-07-25");
  
  return diffStructures(newStructures, prevStructures);
}
```

**Trigger Condition**: Run if code delta > 0 files  
**Expected Frequency**: 3-5 times per week  
**Expected Duration**: <2 minutes (for typical <10 changed files)

---

### Layer 3: Incremental Semantic Indexing

**Daily Job: Re-index changed structures to Qdrant + Neo4j**

```
Step 1: Generate embeddings for new structures
  Input: Structural delta
  Output: 768-dim vectors for new/modified code
  
Step 2: Upsert to Qdrant
  Input: New embeddings + metadata
  Output: Updated collection (added/modified points)
  
Step 3: Update Neo4j topology
  Input: Structural + dependency graph changes
  Output: Updated edges (added/modified relationships)
  
Step 4: Recalculate affected PageRank
  Input: Modified topology
  Output: Updated authority scores (only affected nodes)
```

**Semantic Indexing Pipeline**:
```typescript
async function incrementalSemanticIndexing(): Promise<void> {
  const structDelta = await extractStructuralDelta();
  
  // Embed new structures
  const newEmbeds = await embedStructures(structDelta.added);
  const modEmbeds = await embedStructures(structDelta.modified);
  
  // Upsert to Qdrant
  await qdrantUpsert(newEmbeds, "add");
  await qdrantUpsert(modEmbeds, "update");
  
  // Update Neo4j graph
  await neo4jUpsertEdges(structDelta);
  
  // Recalculate affected PageRank
  await pageRankUpdate(structDelta.affected_nodes);
}
```

**Trigger Condition**: Run if structural delta > 0  
**Expected Frequency**: 3-5 times per week  
**Expected Duration**: <5 minutes

---

## Scheduled Execution (Cron)

### Daily Graphify Execution

```
┌────────────────────────────────────────────────────┐
│ Daily Graphify Automation (3:00 AM UTC)            │
├────────────────────────────────────────────────────┤
│                                                    │
│ 03:00 - Layer 1: File inventory delta              │ (5 min)
│         └─ detect added/modified/deleted files     │
│                                                    │
│ 03:05 - Layer 2: Structural extraction             │ (2 min)
│         └─ AST extraction for changed code         │
│                                                    │
│ 03:07 - Layer 3: Semantic indexing                 │ (5 min)
│         ├─ Embed new structures                    │
│         ├─ Upsert to Qdrant                        │
│         ├─ Update Neo4j topology                   │
│         └─ Recalculate PageRank                    │
│                                                    │
│ 03:12 - Verification & Reporting                   │ (1 min)
│         ├─ Validate Qdrant/Neo4j consistency       │
│         ├─ Log metrics (files changed, facts added)│
│         └─ Emit completion event                   │
│                                                    │
│ Total: ~13 minutes                                 │
└────────────────────────────────────────────────────┘
```

**Cron Configuration**:
```bash
# Run daily at 3:00 AM UTC (low-traffic time)
0 3 * * * /usr/local/bin/graphify-daily.sh

# Fallback: Run weekly on Sunday at 2:00 AM (if daily misses)
0 2 * * 0 /usr/local/bin/graphify-weekly.sh
```

---

## Change Detection & Freshness Policy

### File Change Detection Algorithm

```typescript
interface FileSnapshot {
  path: string;
  size: number;
  sha256: string;
  modified_at: Date;
  type: "code" | "doc" | "config" | "test";
}

async function detectChanges(current: FileSnapshot[], previous: FileSnapshot[]): Promise<{
  added: FileSnapshot[];
  deleted: FileSnapshot[];
  modified: FileSnapshot[];
}> {
  const prevMap = new Map(previous.map(f => [f.path, f]));
  
  const added = current.filter(f => !prevMap.has(f.path));
  const deleted = previous.filter(f => !new Map(current.map(c => [c.path, c])).has(f.path));
  const modified = current.filter(f => {
    const p = prevMap.get(f.path);
    return p && p.sha256 !== f.sha256;
  });
  
  return { added, deleted, modified };
}
```

### Freshness Guarantees

**Freshness SLA**:
- Code index: <24 hours old (daily run)
- Embeddings: <24 hours old
- Neo4j topology: <24 hours old
- PageRank: <7 days old (expensive, weekly)

**Staleness Handling**:
```
Age < 1 day:  Use index directly (100% confidence)
Age 1-3 days: Use index with freshness warning (95% confidence)
Age > 7 days: Trigger manual re-index (requires human approval)
```

---

## Rollback & Safety

### Atomic Updates

**All Layer 3 operations must be atomic**:

```typescript
async function atomicSemanticUpdate(delta: StructuralDelta): Promise<void> {
  // Begin transaction
  const txn = await neo4j.beginTxn();
  const qdrantSession = qdrant.startSession();
  
  try {
    // Upsert to Qdrant
    await qdrantSession.upsert(delta);
    
    // Update Neo4j
    await txn.run("MERGE ..."); // topology edges
    await txn.run("SET ..."); // PageRank updates
    
    // Commit both
    await qdrantSession.commit();
    await txn.commit();
  } catch (err) {
    // Rollback both
    await qdrantSession.rollback();
    await txn.rollback();
    throw err;
  }
}
```

### Snapshot & Restore

**Preserve previous state for rollback**:

```bash
# Before daily run, snapshot current state
qdrant snapshot create codebase_chunks_768
neo4j backup /backups/neo4j_2026-07-26.backup
redis BGSAVE

# If daily run fails, restore from snapshot
qdrant snapshot restore codebase_chunks_768 2026-07-25
neo4j restore /backups/neo4j_2026-07-25.backup
```

---

## Monitoring & Observability

### Daily Run Metrics

```
graphify_daily_run {
  timestamp: 2026-07-26T03:00:00Z,
  layer1_files_changed: 5,
  layer2_structures_changed: 12,
  layer3_embeddings_added: 3,
  layer3_edges_updated: 8,
  layer3_pagerank_affected: 25,
  total_duration_ms: 780,
  qdrant_consistency: "green",
  neo4j_consistency: "green",
  status: "success"
}
```

### Dashboard: `/dashboard/graphify-status`

```
┌────────────────────────────────────────────────┐
│ Graphify Daily Automation Status                │
├────────────────────────────────────────────────┤
│ Last successful run: 2026-07-25 03:12 UTC      │
│ Next scheduled run: 2026-07-26 03:00 UTC       │
│                                                │
│ Freshness:                                     │
│  ├─ File index: 0h 45m old (✅ fresh)          │
│  ├─ Code structures: 0h 45m old (✅ fresh)     │
│  ├─ Embeddings: 0h 45m old (✅ fresh)          │
│  ├─ Neo4j topology: 0h 45m old (✅ fresh)      │
│  └─ PageRank: 7d 3h old (⚠️  aging)            │
│                                                │
│ Latest Changes (Last 24h):                     │
│  ├─ Files added: 2                             │
│  ├─ Files modified: 7                          │
│  ├─ Files deleted: 0                           │
│  ├─ New functions: 3                           │
│  └─ Modified functions: 8                      │
│                                                │
│ System Health:                                 │
│  ├─ Qdrant consistency: ✅ green               │
│  ├─ Neo4j consistency: ✅ green                │
│  └─ Last error: None                           │
└────────────────────────────────────────────────┘
```

---

## Execution Plan

### Initial Setup (Days 3-5)

**Task**: Implement Layer 1-3 incremental pipelines  
**Deliverable**: Scripts + cron jobs + monitoring  
**Duration**: 8-12 hours

### Testing & Validation (Days 6-7)

**Task**: Run daily automation for 3-4 days  
**Deliverable**: Validation report + SLA metrics  
**Duration**: Continuous background

### Production Launch (Day 8+)

**Task**: Enable in production with monitoring  
**Deliverable**: Graphify status dashboard live  
**Duration**: Continuous (automation)

---

## Expected Impact

### Before Phase 114
- Codebase graph frozen after Phase 111 deployment
- No automatic updates to Qdrant/Neo4j
- Stale query results after code changes

### After Phase 114
- Daily automatic updates (within 24 hours of code change)
- Qdrant payloads stay fresh
- Neo4j topology reflects current code
- PageRank regularly recalculated
- Queries use latest intelligence

**Impact**: Knowledge freshness improves from "weeks" → "days"

---

## Failure Modes & Recovery

### Failure: File Scan Timeout
- **Cause**: Filesystem slow or locked
- **Detection**: Timeout after 10 minutes
- **Recovery**: Skip Layer 1, retry next day

### Failure: AST Extraction Error
- **Cause**: Malformed code in changed files
- **Detection**: Parser error on specific file
- **Recovery**: Log error, skip file, continue with others

### Failure: Qdrant Connection Lost
- **Cause**: Network or Qdrant service down
- **Detection**: Timeout after 30 seconds
- **Recovery**: Rollback transaction, retry tomorrow

### Failure: Neo4j Transaction Conflict
- **Cause**: Concurrent manual Neo4j writes
- **Detection**: Transaction conflict exception
- **Recovery**: Rollback, queue for next run

---

## Success Criteria

✅ **Automation**:
- [ ] Daily job runs without manual intervention
- [ ] All 3 layers execute and complete
- [ ] Freshness SLA met (<24 hours)

✅ **Reliability**:
- [ ] Success rate >95% (fail <5% of days)
- [ ] Failure recovery < 1 day
- [ ] No data corruption on rollback

✅ **Performance**:
- [ ] Layer 1 < 5 minutes
- [ ] Layer 2 < 2 minutes (for typical delta)
- [ ] Layer 3 < 5 minutes
- [ ] Total < 15 minutes

✅ **Observability**:
- [ ] Dashboard shows freshness status
- [ ] Metrics logged to observability backend
- [ ] Alerts on failures or SLA breaches

---

**Prepared by**: Claude Code (Session 142 Continuation)  
**Status**: ⏳ PHASE 114 DESIGN READY (Days 3+)  
**Execution Model**: Continuous daily automation (3:00 AM UTC)
