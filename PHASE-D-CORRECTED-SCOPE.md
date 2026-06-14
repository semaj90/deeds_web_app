# Phase D: Corrected Scope

**Status**: Infrastructure complete. Retrieval intelligence incomplete.  
**Date**: June 14, 2026 (Major Correction)  
**Blocker**: Qdrant/Postgres identity agreement = 0/50 (not missing models)

---

## What I Got Wrong

I thought Phase D was about:
- ❌ Embedding (embed-parent-atlas-to-qdrant.py)
- ❌ Tree nodes (atlas_tree_nodes)
- ❌ Glyphs (atlas_glyph_records)
- ❌ Autoencoder (768→64)
- ❌ SOM (20×20)

**Actually**: Phase D is about **identity consistency verification**.

---

## The Real State

### Infrastructure ✅ Complete

Five parallel ledgers (not a unified lake):

| Layer | Status |
|-------|--------|
| Postgres (atlas_packets) | ✅ Canonical identity |
| Qdrant (codebase_chunks_768) | ✅ Semantic serving |
| Redis/Valkey (gpu:karpathy:scores) | ✅ Hot cache + Karpathy |
| Neo4j (USED_CONCEPT, USED_PACKET) | ✅ Topology/context |
| NES/CHROM (nes_chrom_packets) | ✅ Episodic memory |

### Retrieval Intelligence ❌ Incomplete

**The blocker**: Qdrant and Postgres are disagreeing.

```
Qdrant point: source_ref="src/lib/server/auth.ts", packet_key="ace:001", feature_id="auth"
Postgres row: source_ref="src/lib/server/auth.ts", packet_key="ace:002", feature_id="auth.sessions"
Result: MISMATCH
```

When you have mismatches, you can't safely:
- Train autoencoder (learns drift as signal)
- Build SOM (corrupted neighborhoods)
- Enrich Neo4j (wrong graph edges)
- Compute Karpathy blend (ranks wrong packets)
- Call Gemma4 (garbage input)

**Every enrichment amplifies drift.**

---

## The Next Script

**File**: `scripts/atlas/debug-qdrant-postgres-mismatch.mjs` (434 lines, ready now)

**What it does**:
```
For each of 50 random Qdrant points:
  1. Extract source_ref
  2. Lookup in Postgres atlas_packets
  3. Compare packet_key, source_ref, feature_id, feature_label
  4. Report agreement (yes/no)
Report: N matches out of 50
Gate: matches >= 47 (95%) → PASS → proceed with enrichment
```

**Usage**:
```bash
npm run atlas:debug:qdrant-postgres              # Run (50 samples)
npm run atlas:debug:qdrant-postgres:verbose      # Detailed
SAMPLE_SIZE=200 npm run atlas:debug:qdrant-postgres  # Larger sample
```

**Output**:
- `docs/reports/qdrant-postgres-mismatch-debug.json` (machine)
- `docs/reports/qdrant-postgres-mismatch-debug.md` (human)

**Exit code**:
- `0` = PASS (agreement >95%) → proceed
- `1` = FAIL (agreement <95%) → investigate

---

## The Real Phase D Gate

**NOT**: "Run 7 TurboVec gates"

**ACTUALLY**: "Verify identity consistency"

```
npm run atlas:debug:qdrant-postgres
  ↓
If sampled_agreement > 95%:
  ✅ GATE PASS — Proceed with enrichment
     → Neo4j higher-hop edges
     → Autoencoder 768→64
     → SOM 20×20
     → Karpathy reindex
     → Gemma4 topology-aware planning

If sampled_agreement < 95%:
  ❌ GATE FAIL — STOP and investigate
     ❌ DO NOT train autoencoder (will learn drift)
     ❌ DO NOT build SOM (will inherit corruption)
     ❌ DO NOT enrich Neo4j (will amplify mismatches)
     ❌ DO NOT compute Karpathy (will rank wrong packets)
```

---

## Why This Matters

Parent Atlas has **five independent ledgers**, each responsible for one thing:

| Ledger | Responsibility |
|--------|-----------------|
| Postgres | Own identity (source of truth) |
| Qdrant | Serve vectors (semantic) |
| Redis | Cache hot results + Karpathy blend |
| Neo4j | Expand context (3-hop bounded) |
| NES/CHROM | Record agent experience |

They **converge at retrieval time**, not storage time.

If identity is inconsistent across Postgres ↔ Qdrant, every layer downstream inherits the corruption:
- Neo4j USED_CONCEPT edges wrong
- Karpathy blend ranks wrong packets
- Gemma4 reasons about wrong context
- Agent policy makes wrong decisions

**This is why identity consistency is the real blocker, not missing models.**

---

## What Each Layer Actually Does

**Gemma4**: Reasons (given curated context)

**Karpathy**: Ranks (blend = 0.4×pagerank + 0.3×attention + 0.3×authority)

**Neo4j**: Expands (USED_CONCEPT edges, 3-hop bounded)

**TurboVec**: Filters (ANN prefilter)

**Qdrant**: Serves (vectors)

**Postgres**: Owns identity (source of truth)

This **separation of responsibilities** is what keeps Parent Atlas deterministic.

---

## The Remaining Path (Post-Identity-Fix)

Once `debug-qdrant-postgres-mismatch` passes:

```
1. Identity consistency verified (>95%)
   ↓
2. Neo4j higher-hop enrichment
   ↓
3. Autoencoder 768→64 (clean vectors → clean latent)
   ↓
4. SOM 20×20 (topological clustering)
   ↓
5. Karpathy reindex (blend with SOM coordinates)
   ↓
6. Gemma4 topology-aware planning
   ↓
7. OpenCode mutation gate
   ↓
8. ACE/KAG/DAG orchestration
   ↓
TOPOLOGY-AWARE AGENT OPERATING SYSTEM ✅
```

This is the path from "large RAG system" to deterministic, topology-aware reasoning.

---

## Reference Documents

- **[docs/PARENT-ATLAS-IDENTITY-RECONCILIATION.md](docs/PARENT-ATLAS-IDENTITY-RECONCILIATION.md)** — Full explanation (Karpathy details, retrieval path, why this matters)
- **[scripts/atlas/debug-qdrant-postgres-mismatch.mjs](scripts/atlas/debug-qdrant-postgres-mismatch.mjs)** — The actual script (434 lines, ready to run)
- **[Memory: Parent Atlas Identity Is the Blocker](C:\Users\james\.claude\projects\c--Users-james-Videos-deeds-web-app\memory\PARENT-ATLAS-IDENTITY-IS-THE-BLOCKER.md)** — Project memory

---

## Next Action

```bash
npm run atlas:debug:qdrant-postgres

# Check exit code
echo $?  # 0 = PASS, 1 = FAIL

# If 0 (PASS): Proceed with enrichment
# If 1 (FAIL): Read the mismatch report
cat docs/reports/qdrant-postgres-mismatch-debug.md
```

**Phase D completion criterion**: `sampled_agreement > 95%`

Not embedding. Not tree-nodes. Not models.

**Identity consistency.**
