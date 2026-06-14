# Phase D: Parent Atlas Identity Reconciliation

**Status**: Ready to execute  
**Date**: June 14, 2026  
**Blocker**: Identity consistency (Qdrant ↔ Postgres agreement)  
**Single command**: `npm run atlas:debug:qdrant-postgres`

---

## What Phase D Actually Is

Not: Embedding, tree-nodes, glyphs, autoencoder, SOM

**Actually**: Identity consistency verification across five parallel ledgers

```
Postgres (canonical identity)
  ↔
Qdrant (semantic serving)
  ↔
Redis (hot cache + Karpathy)
  ↔
Neo4j (topology)
  ↔
NES/CHROM (episodic memory)
```

Each is independent. They converge at retrieval time.

**The question**: Are Qdrant and Postgres agreeing on packet identity (packet_key, source_ref, feature_id)?

---

## The Gate Script

**File**: `scripts/atlas/debug-qdrant-postgres-mismatch.mjs` (434 lines)

```bash
npm run atlas:debug:qdrant-postgres              # Default: 50 samples
npm run atlas:debug:qdrant-postgres:verbose      # Detailed output
SAMPLE_SIZE=200 npm run atlas:debug:qdrant-postgres  # Larger sample
```

**What it does**:
1. Fetch 50 random Qdrant points
2. Look up each in Postgres
3. Compare packet_key, source_ref, feature_id, feature_label
4. Report agreement %
5. Exit 0 (PASS >95%) or 1 (FAIL <95%)

**Output**:
- `docs/reports/qdrant-postgres-mismatch-debug.json`
- `docs/reports/qdrant-postgres-mismatch-debug.md`

---

## If Exit Code = 0 (PASS: Agreement >95%)

Identity is consistent. Phase D gates are safe.

**Execute**:
```bash
npm run atlas:scope:whole              # 1. Scope
npm run atlas:packets:whole:dry        # 2. Packets dry
npm run atlas:packets:whole:apply      # 3. Packets apply
npm run atlas:turbovec:export          # 4. TurboVec export
npm run atlas:turbovec:smoke           # 5. TurboVec smoke
npm run atlas:qdrant:whole-sync:dry    # 6. Qdrant sync dry
npm run atlas:retrieval:e2e            # 7. E2E retrieval
```

**Then Phase E enrichment**:
- Neo4j higher-hop edges
- Autoencoder 768→64
- SOM 20×20
- Karpathy reindex
- Gemma4 topology planning

---

## If Exit Code = 1 (FAIL: Agreement <95%)

Identity drift detected.

**DO NOT**:
- ❌ Train autoencoder (learns drift)
- ❌ Build SOM (inherits corruption)
- ❌ Enrich Neo4j (amplifies mismatches)
- ❌ Compute Karpathy (ranks wrong packets)

**Instead**:
1. Read the mismatch report
2. Identify drifting fields
3. Trace when drift occurred
4. Audit and fix upsert logic
5. Re-sync from Postgres
6. Re-run reconciliation

---

## The Principle

**Identity first. Enrichment second.**

Don't train models on corrupted data. Don't enrich with wrong neighbors. Don't rank on false authority.

Verify truth at the foundation. Build topology on solid ground.

---

## Documentation

| File | Purpose |
|------|---------|
| **[QUICKREF-PHASE-D.md](QUICKREF-PHASE-D.md)** | 1-page cheat sheet |
| **[PHASE-D-IMMEDIATE-ACTION.md](PHASE-D-IMMEDIATE-ACTION.md)** | Detailed next steps (PASS/FAIL) |
| **[PHASE-D-CORRECTED-SCOPE.md](PHASE-D-CORRECTED-SCOPE.md)** | Full explanation of the correction |
| **[docs/PARENT-ATLAS-IDENTITY-RECONCILIATION.md](docs/PARENT-ATLAS-IDENTITY-RECONCILIATION.md)** | Complete technical reference |
| **[Memory: Parent Atlas Identity Is the Blocker](C:\Users\james\.claude\projects\c--Users-james-Videos-deeds-web-app\memory\PARENT-ATLAS-IDENTITY-IS-THE-BLOCKER.md)** | Project memory (updated) |

---

## Right Now

```bash
npm run atlas:debug:qdrant-postgres
echo $?
```

Exit code 0 or 1. That tells you everything.

- **0**: Proceed with Phase D gates
- **1**: Investigate identity drift

That's the gate. That's the decision point. Everything else flows from the answer.

---

## After Phase D (If PASS)

```
Identity verified (>95%)
  ↓
Neo4j enrichment
  ↓
Autoencoder training
  ↓
SOM clustering
  ↓
Karpathy reindex
  ↓
Gemma4 planning
  ↓
ACE orchestration
  ↓
TOPOLOGY-AWARE AGENT OPERATING SYSTEM ✅
```

---

**Phase D is ready. The question is whether the foundation is solid. Run it now.**
