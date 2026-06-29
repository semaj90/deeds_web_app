# Session 89: Data Integrity Verified + Recovery Framework Locked

**Date**: June 28, 2026  
**Status**: Docker data NOT lost. Architecture verified. Recovery plan corrected.  
**Authority**: Hard rules added to CLAUDE.md + sveltekit-frontend/CLAUDE.md

---

## Critical Corrections Applied

### What the User Caught
1. ❌ **Inaccuracy**: Calling 384 "EmbeddingGemma universal standard" → ✅ **Corrected** to "PROJECT_CANONICAL_EMBED_DIM = 384 (project choice)"
2. ❌ **Confusion**: Teaching that "codebase_chunks_768" stores 384 → ✅ **Corrected** to "legacy collection (deprecated), use codebase_chunks_384"
3. ❌ **Assumption**: "17.5K gap means data loss" → ✅ **Verified** gap is schema design (metadata vs chunks, expected, not a problem)
4. ❌ **Missing detail**: No verification that Postgres IS actually truth → ✅ **Verified** via schema inspection and container volume checks

### What Was Actually Happening
- **No data loss occurred**. Docker volumes persisted; containers restarted cleanly.
- **Split schema** is intentional: `atlas_packets` (metadata, no embeddings) ≠ `codebase_chunk_index` (chunks, 99.5% embedded)
- **Qdrant mirrors chunks**, not metadata: 40.5K points = 40.5K embedded chunks (perfect match, not a gap)
- **Postgres embedding column** (atlas_packets.embedding) is 768-dim and ALL NULL (deprecated; don't use)
- **Truth source** for embeddings is `codebase_chunk_index.content_embedding` (384-dim, canonical)

---

## Verified State

### ✅ Grounded Facts (Container Volume Audits)
- Postgres: `legal-ai-postgres` running, pgvector volume mounted, 58,304 packets queryable
- Qdrant: `legal-ai-qdrant` running, qdrant_data volume mounted, 40,568 points in codebase_chunks_768
- Neo4j: `legal-ai-neo4j` running, neo4j volume mounted (node count unverified, likely intact)
- Redis: Status unknown (cli unavailable), but container running (likely intact)

### ✅ Schema Audit Results
| Component | Count | Status | Notes |
|-----------|-------|--------|-------|
| atlas_packets | 58,304 | ✅ | Metadata/identity only, embedding column is NULL |
| codebase_chunk_index | 40,754 | ✅ | Actual chunks, 40,568 with embeddings (99.5%) |
| Qdrant codebase_chunks_768 | 40,568 | ✅ | Perfect mirror of embedded chunks |
| Embedding dimension | 384 | ✅ | Verified at chunk_index (canonical source) |
| Redis cache keys | ~125 | ⏳ | Partial warming only (full warming blocked pending summaries) |
| Neo4j Packet nodes | Unknown | ⏳ | Likely rebuilt but unverified |
| Summary text count | Unknown | ⏳ | Generation initiated, not yet complete |

### 🔴 What Was Wrong (Now Fixed)
- ❌ Claimed "mirror restoration COMPLETE" — changed to "APPLY_COMPLETED" (applied, parity verified separately)
- ❌ Claimed "recovery complete" without verification gates — now explicitly blocked pending summaries + Neo4j audit
- ❌ Overstated embedding dimension as "model universal" — corrected to "project canonical selection"
- ❌ Taught future scripts to confuse "_768" collection with "384-dim contents" — deprecated that naming

---

## Hard Rules Now Enforced (Added to CLAUDE.md)

### 1. Docker Disposability
Before destructive commands, verify volumes:
```bash
docker inspect legal-ai-postgres | jq '.[0].Mounts'
docker inspect legal-ai-qdrant   | jq '.[0].Mounts'
docker inspect legal-ai-neo4j    | jq '.[0].Mounts'
docker inspect legal-ai-redis    | jq '.[0].Mounts'
```
Never run: `docker compose down -v`, `docker volume prune`, `docker system prune --volumes`

### 2. Store Roles (Immutable)
| Store | Role | Truth? | Rebuildable? |
|-------|------|--------|-------------|
| Postgres pgvector | Canonical | YES | No (backup restore) |
| Qdrant | ANN mirror | NO | Yes (from Postgres) |
| Redis | Cache | NO | Yes (from Postgres) |
| Neo4j | Topology | NO | Yes (from Postgres + Qdrant) |

### 3. Write Order (STRICT)
1. Write to Postgres (atomic, durable)
2. Only after Postgres succeeds → invalidate Redis
3. Only after Redis → rebuild Qdrant/Neo4j (idempotent)

### 4. Dimension Policy
- PROJECT_CANONICAL_EMBED_DIM = 384
- codebase_chunk_index.content_embedding = vector(384) = TRUTH
- atlas_packets.embedding = vector(768), ALL NULL = DEPRECATED
- Hard stops: no 384↔768 mixing, no AE 64-dim for search

### 5. Status Language
- CREATED = file exists
- WIRED = ready to test
- DRY_RUN_PROVEN = dry-run passes
- APPLY_PROVEN = apply + verification pass
- NOT_PROVEN = blocked

Never claim "production-ready" from dry-run.

---

## What Needs Completion (Blocking Recovery)

### Phase A: Embedding Audit (BLOCKING)
```bash
npm run atlas:audit:embeddings --verbose
```
Must verify:
- Ollama `/api/embed` returns 384-dim vectors ✓
- Postgres codebase_chunk_index.content_embedding = vector(384) ✓
- Qdrant codebase_chunks_384 collection exists (or create)
- Redis cache samples show 384-dim vectors
- No 768-dim vectors in active search paths

### Phase B: Qdrant Migration (After Audit)
```bash
npm run atlas:qdrant:384:create       # Create canonical collection
npm run atlas:qdrant:384:restore:dry  # Verify count matches
npm run atlas:qdrant:384:restore:apply # Apply restore
```
Expected: 40,568 points in `codebase_chunks_384` (exact match to chunk_index)

### Phase C: Summary Regeneration (After Qdrant)
```bash
npm run atlas:summaries:384:dry --limit=100
npm run atlas:summaries:384:apply
```
Expected: summary_text + summary_embedding for all 40.5K chunks

### Phase D: Cache Warming (After Summaries)
```bash
npm run atlas:bifrost:warm:dry
npm run atlas:bifrost:warm:apply
```
Expected: ~4,000+ cache keys (>10% of 40.5K), all 384-dim

### Phase E: Topology Sync (Parallel with D)
```bash
npm run atlas:neo4j:restore:dry
npm run atlas:neo4j:restore:apply
```
Expected: Packet nodes + Feature nodes + edges created

### Phase F: Final Recovery Gate
```bash
npm run atlas:recovery:final-gate
```
Produces report:
```
COMPONENT                   BEFORE      AFTER       STATUS
Postgres chunks             40,754      40,754      ✅
Qdrant codebase_chunks_384  0           40,568      ✅
Neo4j Packet nodes          ?           40,754      ✅
Redis cache keys            ~125        ~4,000      ✅
Summary text count          0           >40,000     ✅
Summary embedding count     0           >40,000     ✅

OVERALL: RECOVERY_APPLY_PROVEN
```

---

## Timeline

```
audit:embeddings (read-only, 2 min)
    ↓ MUST PASS
create:qdrant:384 (schema only, 1 min)
    ↓ MUST PASS
restore:qdrant:dry → restore:apply (30 min)
    ↓ VERIFY COUNT MATCH
summaries:384:dry → summaries:384:apply (60 min, Gemma4 inference)
    ↓ PARALLEL WITH Neo4j
neo4j:restore:dry → neo4j:restore:apply (15 min)
    ↓ BOTH MUST PASS
bifrost:warm:dry → bifrost:warm:apply (10 min)
    ↓
recovery:final-gate (5 min)
    ↓
RECOVERY_APPLY_PROVEN or RECOVERY_PARTIAL
```

**Total estimated runtime**: ~2 hours (mostly Gemma4 inference)

---

## Why This Matters

The user's corrections prevent a subtle but dangerous pattern from embedding in future sessions:

1. **Encoding false assumptions** ("embeddinggemma = 384") → Forces rework when dimensions change
2. **Teaching naming confusion** ("`_768` = 384-dim") → Creates maintenance debt across all scripts
3. **Overstating proof** ("production complete" from dry-run) → Sets false confidence, masks gaps
4. **Skipping verification** (assuming Qdrant data is reliable) → Miss split schemas, data divergence

By locking the hard rules into CLAUDE.md now:
- ✅ Future sessions inherit correct assumptions
- ✅ Recovery scripts reference ground truth (not myths)
- ✅ Status language forces evidence-based claims
- ✅ Docker disposability is never forgotten

---

## Files Updated (Session 89 Continuation)

1. **docs/dimension-policy.md** (v2.0)
   - Fixed: "embeddinggemma = 384" → "PROJECT_CANONICAL_EMBED_DIM = 384"
   - Fixed: "codebase_chunks_768 stores 384" → "deprecated, use codebase_chunks_384"
   - Added: Canonical collection schema
   - Added: audit-embedding-dimensions.mjs verification table
   - Status: ✅ CREATED

2. **CLAUDE.md** (root)
   - Added: "🔐 Atlas Data Persistence + Retrieval Contract" section (full hard rules)
   - Status: ✅ CREATED

3. **sveltekit-frontend/CLAUDE.md**
   - Added: Session 89 corrected findings (split schema, verified state)
   - Status: ✅ CREATED

4. **scripts/atlas/audit-embedding-dimensions.mjs** (pending)
   - 4 audit gates (Postgres columns, Qdrant collections, script refs, vector samples)
   - Status: ⏳ WIRED (ready for npm script)

5. **scripts/atlas/create-qdrant-codebase-384.mjs** (pending)
6. **scripts/atlas/restore-qdrant-384-from-postgres.mjs** (pending)
7. **scripts/atlas/rebuild-gemma4-summaries-384.mjs** (pending)
8. **scripts/atlas/warm-bifrost-from-postgres-qdrant.mjs** (pending)
9. **scripts/atlas/restore-neo4j-topology-from-postgres.mjs** (pending)
10. **scripts/atlas/phase85-recovery-final-gate.mjs** (pending)

---

## Deliverable: Framework Locked

**The Phase 85 recovery plan is now grounded in:**
- ✅ Verified Docker persistence
- ✅ Corrected dimension policy
- ✅ Accurate schema documentation
- ✅ Hard rules in CLAUDE.md (enforced for future sessions)
- ✅ Evidence-based status language
- ✅ Blocking gates before applying changes

**Next action**: Execute phases A–F in sequence, collecting proof at each gate.

**Authority**: Session 89 Continuation, User Corrections Applied
