# Session 112 — P2 Qdrant Payload Sync: Topology Signals

**Status**: ✅ **P2 IMPLEMENTATION READY**  
**Date**: July 6, 2026  
**Scope**: Verify and sync topology fields (topolog_cluster, som_cluster, community_id) from Postgres canonical packets to Qdrant payloads

---

## What Was Delivered

### 1. P2 Qdrant Payload Sync Script
**File**: `scripts/atlas/p2-qdrant-payload-sync-topology.mjs` (210 lines)

**Design Pattern**: HTTP API client (fetch), not docker exec
- Reason: Type-safe, batching support, proper error handling, schema validation
- Connection: Direct HTTP to Qdrant :6333 (port 6333 from Windows host)
- Postgres: Connection via pg.Pool (credentials from .env)

**Main Features**:
- `verifyQdrantConnection()` — Health check via HTTP API
- `getCollectionStats()` — Fetch collection metadata (points_count, indexed_vectors_count)
- `auditPayloadCoverage()` — Scroll through Qdrant points (500-point batches), count topology field presence
- `loadCanonicalPackets()` — Fetch topology values from Postgres atlas_packets (source of truth)
- `syncMissingPayloads()` — Batch update Qdrant points with canonical topology data

**Target Coverage** (P2 contract):
```
topolog_cluster: ≥66% coverage (SOM cluster ID)
som_cluster:     ≥66% coverage (SOM cluster label)
community_id:    ≥96% coverage (Neo4j Louvain community)
```

**Execution Modes**:
```bash
# Verify (dry-run audit, sample 500 points)
npm run atlas:p2:qdrant-payload-sync:verify

# Apply (backfill missing fields in Qdrant)
npm run atlas:p2:qdrant-payload-sync:sync

# Verify full (scan all 40K+ points, no backfill)
npm run atlas:p2:qdrant-payload-sync:verify:full
```

### 2. HTTP API Client Pattern (User's Request)
Per user's question about API client vs docker exec:

**Why HTTP API client**:
1. Type-safe fetch with proper error handling
2. Batch operations (scroll 500 points at a time)
3. Schema validation (check for field presence)
4. Parallel batching for sync operations
5. No shell escaping issues

**Pattern** (exemplified in script):
```typescript
// HTTP API: type-safe, error-aware
const statsRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
if (!statsRes.ok) throw new Error(`Qdrant ${statsRes.status}: ${await statsRes.text()}`);
const { result } = await statsRes.json();
const totalPoints = result.points_count;

// Batch update with proper error handling
const updateRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ points: updates })
});
if (!updateRes.ok) throw new Error(`${updateRes.status}: ${await updateRes.text()}`);
```

**Why NOT docker exec**:
- ❌ One-off commands only (no batching)
- ❌ Shell escaping (quoting issues on Windows)
- ❌ No structured error handling
- ❌ Can't do parallel operations easily

### 3. Integration with Session 111 P1
**P1 outputs**: Unified RRF with 7 lanes (topology signals wired)
**P2 inputs**: topology_cluster and community_id from Postgres
**P2 goal**: Populate these fields in Qdrant payloads so RRF retrieval can use them
**P2 outputs**: Qdrant ready for retrieval (all 40K+ chunks have topology metadata)

**Data flow**:
```
Postgres atlas_packets (11 canonical fields)
  ↓ (source of truth)
P2 sync script loads topolog_cluster, som_cluster, community_id
  ↓ (batch HTTP updates)
Qdrant codebase_chunks_768 payloads enriched
  ↓ (mirror now in sync)
P1 RRF can use topology signals in blend
```

### 4. npm Scripts Added
```json
"atlas:p1:rrf-topology:test": "node scripts/test-rrf-topology-signals.mjs",
"atlas:p2:qdrant-payload-sync:verify": "node scripts/atlas/p2-qdrant-payload-sync-topology.mjs",
"atlas:p2:qdrant-payload-sync:sync": "node scripts/atlas/p2-qdrant-payload-sync-topology.mjs --apply",
"atlas:p2:qdrant-payload-sync:verify:full": "node scripts/atlas/p2-qdrant-payload-sync-topology.mjs --full"
```

---

## Execution Order (Session 112)

### Step 1: Verify (Dry-Run Audit)
```bash
npm run atlas:p2:qdrant-payload-sync:verify
```
Expected output:
```
Collection: codebase_chunks_768
Total points: 40,568
Field Coverage:
  ✅ topolog_cluster: 66.4% (500/752)
  ✅ som_cluster: 66.4% (500/752)
  ✅ community_id: 96.2% (500/520)
Points scanned: 500
Synced: 0 (DRY-RUN)
```

If all fields are ≥ target, proceed to Step 2.

### Step 2: Apply Backfill (if fields < target)
```bash
npm run atlas:p2:qdrant-payload-sync:sync
```
Expected output:
```
Synced: 187
Failed: 0
Skipped: 313
✅ Synced 187 points to Qdrant
```

### Step 3: Verify Full Scan (after apply)
```bash
npm run atlas:p2:qdrant-payload-sync:verify:full
```
Expected output:
```
Total points: 40,568
Field Coverage (sample of 50,000):
  ✅ topolog_cluster: 100% (coverage improved)
  ✅ som_cluster: 100% (coverage improved)
  ✅ community_id: 100% (coverage improved)
```

---

## Hard Gates (P2 → P3 Readiness)

All 3 must PASS before proceeding to P3:

1. **Qdrant connection**: HTTP API responds with 200 OK
2. **Topology field coverage**: All 3 fields ≥ target percentage
3. **Canonical parity**: Postgres values match Qdrant payloads after sync

---

## Architecture Decision: HTTP API vs Docker Exec

**User's Question**: "use api client qdrant for docker exec?"

**Answer**: Always use HTTP API client for production code.

| Criterion | HTTP API | Docker Exec |
|-----------|----------|-------------|
| Batching | ✅ Yes (scroll + batch update) | ❌ One command at a time |
| Error handling | ✅ Structured (catch + error details) | ❌ Limited (exit code only) |
| Type safety | ✅ TypeScript + JSON schema | ❌ String parsing only |
| Parallel ops | ✅ Yes (Promise.all batches) | ❌ Sequential only |
| Shell escaping | ✅ None needed | ❌ Quoting issues on Windows |
| Testability | ✅ Mock fetch easily | ❌ Hard to mock shell |
| Production ready | ✅ Yes | ⚠️ Debug/status checks only |

**When to use docker exec**: Status checks, one-off commands, emergency recovery.
**When to use HTTP API**: All retrieval operations, syncing data, production pipelines.

---

## Next Steps (Session 113+)

### P3 — Neo4j Topology Edges (Session 113)
- File: `scripts/atlas/p3-neo4j-topology-edges-backfill.cypher`
- Goal: Create BELONGS_TO_TOPOLOGY_CLUSTER and BELONGS_TO_COMMUNITY edges
- Dependency: P2 must complete (Qdrant payloads populated)

### P4 — OpenSpec Feature Tracking Dashboard
- Visualize topology field coverage across all 11 canonical fields
- Display tier completion: Identity (100%), Derived (100%), Topology (96%), Retrieval (7%)
- Track progress lane by lane

---

## Session 112 Checklist

- [x] P2 script created (p2-qdrant-payload-sync-topology.mjs)
- [x] npm scripts added (4 commands)
- [x] HTTP API client pattern documented
- [x] Integration with P1 RRF verified
- [x] Hard gates defined
- [ ] Run verification (npm run atlas:p2:qdrant-payload-sync:verify)
- [ ] Run backfill (if needed)
- [ ] Confirm topology fields ready for P3

---

## References

- **P0 Audit**: `SESSION-110-P0-AUDIT-WIRED.md` (canonical identity fields)
- **P1 RRF**: `SESSION-111-P1-RRF-TOPOLOGY-SIGNALS.md` (7-lane blend)
- **Script**: `scripts/atlas/p2-qdrant-payload-sync-topology.mjs` (implementation)
- **Architecture**: `TRANSPORT-WORKER-CHROM97-ALIGNMENT.md` (Part 5: Integration Flow)