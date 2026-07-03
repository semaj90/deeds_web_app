# Canonical Packet Builder — Deterministic Envelope Contract

**Date**: July 2, 2026 23:45 UTC  
**Status**: ✅ **CANONICAL PACKET BUILDER WIRED + EXPORT TYPE DEFINED**

---

## What's New

### 1. Canonical Packet Envelope Type
**File**: `src/lib/server/retrieval/hyperrag-packet-rpc.ts` (lines 354–366)

**Export**:
```typescript
export type CanonicalAcePacketEnvelope = {
  packet_id: string | null;
  packet_ulid: string | null;
  packet_key: string;
  title_id: string | null;
  feature_id: string | null;
  source_ref: string;
  som_cell: string | null;
  language: string | null;
  kind: string | null;
  page_rank_score: number;
  prompt_template_id: string | null;
};
```

**Locked Fields**:
- `packet_id`, `packet_ulid` — Postgres identity (canonical)
- `packet_key` — Duplicate/content guard
- `title_id` — Document/chunk reference
- `feature_id`, `source_ref` — Semantic grouping
- `som_cell`, `language`, `kind` — Retrieval hints
- `page_rank_score`, `prompt_template_id` — Ranking context

### 2. Builder Function
**Location**: Lines 368–389

**Signature**:
```typescript
function buildCanonicalAcePacketEnvelope(
  row: Partial<AtlasPacketRow | FTSResult | any>,
  context?: {
    feature_id?: string | null;
    som_cell?: string | null;
    language?: string | null;
    kind?: string | null;
    page_rank_score?: number;
  }
): CanonicalAcePacketEnvelope
```

**Strategy**:
- Extracts fields from row (Postgres, FTSResult, or any source)
- Fills gaps from context (query-derived signals)
- Normalizes all values via `cleanText()` and type coercion
- Returns **deterministic shape** (nulls vs empty strings consistent)

**Field Extraction Order** (priority fallback):
- `packet_id`: `row.packet_id ?? row.id`
- `packet_ulid`: `row.packet_ulid ?? row.ulid`
- `packet_key`: `row.packet_key ?? row.key ?? row.id`
- `feature_id`: `canonicalFeatureId(row.feature_id, ctx.feature_id)`
- `source_ref`: `row.source_ref ?? row.file_path ?? row.path`
- `som_cell`: `row.som_cell ?? row.som_cluster ?? ctx.som_cell`
- `language`: `row.language ?? ctx.language`
- `kind`: `row.kind ?? ctx.kind`
- `page_rank_score`: `Number(...)`
- `prompt_template_id`: `row.prompt_template_id ?? row.promptTemplateId`

### 3. Helper Function for Context Extraction
**Location**: Lines 391–403

**Function**:
```typescript
function envelopeAsContextFields(
  envelope: CanonicalAcePacketEnvelope
): { feature_id?, som_cell?, language?, kind?, page_rank_score? }
```

**Purpose**: Convert built envelope back to context object for downstream stages  
**Use case**: Stage A0 → Neo4j → RRF, each stage passes envelope context to the next

### 4. Stage A0 Integration
**Location**: Lines 1000–1010

**Update**:
- Stage A0 cache hits now log cache source (`ace` vs `bitfrost`)
- Placeholder for canonical envelope building from loaded Postgres rows
- Ensures downstream layers receive **stable shape** from cache

---

## Architecture: Canonical Envelope Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Query Intent Extraction (Stage A0)                          │
│  - extract feature_id, language, kind from query           │
│  - build context { feature_id, language, kind, som_cell }  │
└─────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────┐
│ BitFrost Cache Check                                        │
│  - if hit: envelopes built from cached row                 │
│  - context passed from query inference                      │
└─────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────┐
│ Canonical Packet Builder (THIS PATCH)                      │
│  buildCanonicalAcePacketEnvelope(row, context)             │
│  ↓ deterministic envelope                                  │
│  { packet_id, packet_key, title_id, feature_id, ... }     │
└─────────────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────────────┐
│ Downstream Stages (Neo4j/RRF/Qdrant/ACE)                   │
│  - all receive same envelope shape                         │
│  - packet_id lineage explicit                              │
│  - grouping keys preserved                                 │
│  - no shape divergence per lane                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Matters

### Before Canonical Builder
- Neo4j returns shape A: `{ packet_key, source_ref, features: [] }`
- RRF returns shape B: `{ id, metadata: { packet_id, source_ref } }`
- Qdrant returns shape C: `{ point_id, payload: { feature_id } }`
- ACE assembler rebuilds D: `{ packet_id, title_id, feature_id }`
- **4 divergent shapes → ACE packet assembly becomes lossy**

### After Canonical Builder
- Stage A0 → `CanonicalAcePacketEnvelope`
- Neo4j → `CanonicalAcePacketEnvelope`
- RRF → `CanonicalAcePacketEnvelope`
- Qdrant → `CanonicalAcePacketEnvelope`
- ACE → **uses same shape throughout**
- **Single source of truth for packet identity**

---

## Current Implementation Status

| Stage | Status | Usage |
|-------|--------|-------|
| **Type Definition** | ✅ EXPORTED | Available for import |
| **Builder Function** | ✅ WIRED | Ready to call |
| **Context Helper** | ✅ WIRED | Supports chaining |
| **Stage A0 Integration** | ⏳ PARTIAL | Logged, not yet applied |
| **Neo4j Enrichment** | ⏳ TODO | Next patch |
| **RRF Adaptation** | ⏳ TODO | Follow-up |
| **Qdrant Wrapping** | ⏳ TODO | Follow-up |
| **ACE Assembly** | ⏳ TODO | Final stage |

---

## Next Immediate Patch (After Hot Buckets Warm)

**Goal**: Apply canonical builder to Stage A0 cache hits

**Location**: After Postgres row loading for Stage A0 cache packets

**Code**:
```typescript
if (hotBucketHits.length > 0 && stageA0CacheHitSource) {
  const relevantPackets = await loadAtlasPacketsByIdentity(hotBucketHits);
  for (const [key, row] of relevantPackets.entries()) {
    const context = envelopeAsContextFields({
      language: potentialLanguage ?? null,
      kind: potentialKind ?? null,
      feature_id: null,
      som_cell: null,
      page_rank_score: 0,
    });
    const envelope = buildCanonicalAcePacketEnvelope(row, context);
    stageA0CacheEnvelopes.set(key, envelope);
  }
}
```

**Effect**:
- Stage A0 cache hits return deterministic envelopes
- All downstream stages operate on the same shape
- packet_id lineage preserved through hot-bucket path

---

## Full Integration Order (3 Patches)

### Patch 1: Canonical Builder ✅ (This Session)
- Define `CanonicalAcePacketEnvelope` type
- Implement `buildCanonicalAcePacketEnvelope()` function
- Add context extraction helper
- Wire Stage A0 logger
- **Effect**: Foundation ready; all downstream stages can now import the type

### Patch 2: Stage A0 Envelope Assembly (Next, After Hot Bucket Warm)
- Load Postgres rows for Stage A0 cache hits
- Build canonical envelopes via builder
- Pass to dedup/dedupe loop with preserved identity
- **Effect**: Stage A0 cache → deterministic envelope

### Patch 3: RRF/Neo4j/Qdrant Adaptation (Follow-up)
- Update `packetSeedCandidatesFromRrf()` to return canonical envelopes
- Update Neo4j expansion to consume + return canonical envelopes
- Update Qdrant payload extraction to wrap in canonical builder
- **Effect**: All lanes emit same shape

---

## Testing Checklist

- ✅ Type definition exports cleanly (no TS2307 on import)
- ✅ Builder function accepts Postgres rows
- ✅ Builder function accepts FTS results
- ✅ Builder function accepts arbitrary objects with fallbacks
- ✅ Context helper round-trips (envelope → context → builder)
- ✅ Nulls and empty strings consistent
- ✅ Module loads without syntax errors
- ⏳ Stage A0 builds envelopes for cache hits (after hot bucket warm)
- ⏳ Downstream stages preserve envelope through dedup
- ⏳ ACE assembler receives canonical shape

---

## Quick Reference Commands

```bash
# Verify canonical builder type is exported
grep -n "export type CanonicalAcePacketEnvelope" \
  src/lib/server/retrieval/hyperrag-packet-rpc.ts

# Verify builder function is defined
grep -n "function buildCanonicalAcePacketEnvelope" \
  src/lib/server/retrieval/hyperrag-packet-rpc.ts

# Verify Stage A0 integration logging
grep -n "stageA0CacheEnvelopes" \
  src/lib/server/retrieval/hyperrag-packet-rpc.ts

# Import test (after hot bucket warm, integrate into retrieval flow)
# const { buildCanonicalAcePacketEnvelope } = await import(
#   '$lib/server/retrieval/hyperrag-packet-rpc.js'
# );
```

---

## Files Changed This Session

| File | Status | Key Changes |
|------|--------|------------|
| `hyperrag-packet-rpc.ts` | ✅ PATCHED | Added CanonicalAcePacketEnvelope type + buildCanonicalAcePacketEnvelope() + envelopeAsContextFields() + Stage A0 integration logging |
| `SESSION-102-CANONICAL-PACKET-BUILDER.md` | ✅ CREATED | This document |

---

## Architecture Decision Captured

**No raw token-memory mutation**: GPU KV tensors stay private to llama-server process.  
**Shared memory for CPU envelopes**: ACE packet bytes, embeddings, summaries flow through shared memory.  
**Deterministic builder once**: All downstream layers reason on the same envelope shape (no shape divergence).

---

**Generated**: Session 102+ Continuation IV (July 2, 2026 23:45 UTC)  
**Status**: ✅ CANONICAL PACKET BUILDER COMPLETE  
**Next Checkpoint**: Hot buckets warmed → Stage A0 envelope assembly → verify unified shape through all lanes  
**Long-term Goal**: One envelope contract, explicit grouping keys, deterministic ACE packet assembly
