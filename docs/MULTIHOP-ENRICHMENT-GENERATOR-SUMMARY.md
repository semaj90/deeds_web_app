# Multihop Enrichment Generator — Summary

**Created**: June 14, 2026  
**Status**: ✅ COMPLETE (read-only generator)

## Problem

The file `sveltekit-frontend/docs/graph/multihop-codebase-map.json` (dated May 13, 2026) is a **pre-Phase D/E artifact** that lacks the canonical packet identity schema. It contained:
- Old node structure (Qdrant-centric, pre-canonicalization)
- No packetKey/sourceRef/featureId fields
- No community provenance tracking
- No Redis/Karpathy enrichment
- Missing GIN-indexed JSONB metadata

The file needs **regeneration from Phase D/E canonical sources**, not manual patching.

## Solution

Created `scripts/atlas/regenerate-multihop-with-enrichment.mjs` — a **read-only generator** that hydrates a fresh multihop map from:

1. **PostgreSQL `atlas_packets`** (17,485 rows) — source of truth for packet identity
2. **Qdrant `codebase_chunks_768`** (optional) — vector enrichment + payload metadata
3. **Redis `gpu:karpathy:scores`** (optional) — authority blend scores (0.4·PR + 0.3·attn + 0.3·auth)
4. **Redis `gpu:karpathy:encoded`** (optional) — 64-dim latent encoding

## Output

**Three files generated** (do NOT overwrite legacy file):

| File | Size | Purpose |
|------|------|---------|
| `multihop-codebase-map.enriched.json` | 53MB | Full canonical nodes (17,485) with complete schema |
| `multihop-codebase-map.enriched.report.json` | 627B | Verification stats + coverage gates |
| `multihop-codebase-map.enriched.md` | 1KB | Human-readable summary |

## Canonical Node Schema

Each node now includes the full Phase D/E identity spine:

```
Packet Identity (from Postgres):
  packetKey, sourceRef, featureId, featureLabel, communityId, communitySource

Code Reference (from Postgres):
  filePath, fileUrl, summary, tags

Vector Enrichment (from Qdrant):
  qdrantPointId, qdrantCollection, qdrantTags, qdrantPayload

Semantic Enrichment (from Redis/GPU):
  encodedLatent (64-dim), somCell (20×20), karpathyBlend (unified score)

Cache Reference (canonical):
  redisKey, ginMetadata (GIN-indexed JSONB for fast lookups)

Clustering:
  clusterKey, manifold4

Ledger Tracking:
  lineageVersion: "packet-identity-v1"
  canonical: true/false
  ledgerType: "canonical_postgres" | "legacy_qdrant_only"
```

## Generation Report (June 14, 2026)

✅ **All gates PASS**:

| Gate | Value | Status |
|------|-------|--------|
| packetKey coverage | 100.0% (0 missing) | ✅ PASS |
| sourceRef coverage | 100.0% (0 missing) | ✅ PASS |
| featureId coverage | 100.0% (0 missing) | ✅ PASS |
| Qdrant match rate | 0.0% (awaiting payload sync) | — (optional) |
| Karpathy match rate | 0.0% (awaiting GPU compute) | — (optional) |
| Legacy Qdrant-only nodes | 0 (no orphans) | ✅ PASS |
| **Ready for higher-hop** | ✅ YES | ✅ PASS |

**Statistics**:
- Total nodes: 17,485
- Canonical (from Postgres): 17,485
- Sources matched: Postgres 100%, Qdrant pending, Redis pending

## Usage

### Generate (one-time or refresh)

```bash
cd sveltekit-frontend
npm run atlas:multihop:enriched:generate
```

**Duration**: ~1s (reads from local Postgres, Qdrant, Redis)

### Verify readiness

```bash
npm run atlas:multihop:enriched:verify
# Output: true (ready for higher-hop enrichment)
```

### Inspect results

```bash
cat docs/graph/multihop-codebase-map.enriched.report.json | jq '.gates'
cat docs/graph/multihop-codebase-map.enriched.md
```

## Enrichment Sequencing

The generator hydrates available sources **opportunistically**:

| Priority | Source | Status | Next Step |
|----------|--------|--------|-----------|
| 1 | Postgres atlas_packets | ✅ Done (100%) | Ready for higher-hop |
| 2 | Qdrant payloads | ⏳ Pending | Run `atlas:4b:qdrant-payload` |
| 3 | Redis Karpathy scores | ⏳ Pending | Run `npm run karpathy:gpu` |
| 4 | Redis encoded latents | ⏳ Pending | Train 768→64 autoencoder |

When those sources are populated, re-run the generator to update the enriched map:

```bash
npm run atlas:4b:qdrant-payload          # Sync Qdrant payloads
npm run karpathy:gpu                     # Compute Karpathy scores
npm run atlas:multihop:enriched:generate # Re-hydrate map
```

## Hard Rules

- ✅ **Read-only generation** — does not mutate Postgres/Qdrant/Redis
- ✅ **Preserves legacy file** — May 13 `multihop-codebase-map.json` untouched
- ✅ **Fail-safe enrichment** — missing sources result in `null` fields, never invented values
- ✅ **Tracks ledger type** — canonical vs legacy nodes clearly marked
- ✅ **Idempotent** — safe to re-run multiple times

## Architecture References

- **Canonical lineage contract**: `docs/CANONICAL-ARCHITECTURE-CONTRACT.md` (packet_key uniqueness, field agreement across stores)
- **Phase D+E completion**: `docs/PHASE-DE-COMPLETION-JUNE-14-2026.md` (identity reconciliation + enrichment strategy)
- **Parent Atlas OS**: `memory/PARENT-ATLAS-OPERATING-SYSTEM.md` (unified warehouse design)
- **Karpathy pipeline**: `memory/GPU-LANES-QUICK-REFERENCE.md` (authority blend scoring)

## Next Steps

1. ✅ **Phase 1 (DONE)**: Generate canonical multihop map from Postgres spine
2. **Phase 2 (READY)**: Enrich with Qdrant payloads → run `atlas:4b:qdrant-payload`
3. **Phase 3 (READY)**: Enrich with Karpathy scores → run `npm run karpathy:gpu`
4. **Phase 4 (PENDING)**: Train autoencoder 768→64 for latent compression
5. **Phase 5 (READY)**: Re-generate to include enrichments → run generator again

---

**Canonical Truth**: The regenerated `.enriched.json` file is the source of truth for the multihop graph structure. The legacy May-13 file is preserved for reference only.
