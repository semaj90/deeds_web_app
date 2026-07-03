# ACE Quick Reference — Canonical Packet Contract

**TL;DR**: ACE is the **single source of truth** for packet shape. All layers (BitFrost, RRF, Qdrant, Neo4j, ACE merger, workers) call the same builder function on the same Postgres row. Shape is deterministic by construction.

---

## The Contract (13 Core Fields)

```typescript
type CanonicalAcePacketEnvelope = {
  // Immutable identity (from Postgres)
  packet_id: string | null;           // "ace:packet:auth:001"
  packet_ulid: string | null;         // "01ARZ3NDEKTSV4RRFFQ69G5FAV"
  packet_key: string;                 // "ace:packet:auth:001"
  title_id: string | null;            // "abc-123"
  source_ref: string;                 // "src/lib/server/auth.ts"
  canonical_source_ref: string;       // Same as source_ref
  feature_id: string | null;          // "auth.sessions"
  
  // Query context (set per-lane)
  language: string | null;            // From BitFrost query
  kind: string | null;                // From BitFrost query
  som_cell: string | null;            // From Neo4j topology
  page_rank_score: number;            // Ranking score per lane
  
  // Metadata (optional)
  prompt_template_id?: string | null;
  summary?: string | null;
};
```

---

## Who Uses ACE & How

### 1. BitFrost (Stage A0 Cache)
```typescript
// Load packet keys from Redis SET
const hotBucketHits = await redis.smembers('bitfrost:hot:language:typescript');
// ["src/lib/auth.ts", "src/lib/db/client.ts", ...]

// Convert to envelopes
for (const key of hotBucketHits) {
  const row = loadFromPostgres(key);  // Load packet_id, title_id, etc.
  const envelope = buildCanonicalAcePacketEnvelope(row, context);
  // envelope.packet_id = "ace:packet:auth:001"
  // envelope.title_id = "abc-123"
}
```

**Why**: BitFrost returns **packet keys** (strings). ACE converts them to **envelopes** (full identity).

---

### 2. RRF Lane (Priority 4A)
```typescript
// Extract source_refs from RRF results
const sourceRefs = results.map(r => r.source_ref);

// Load Postgres rows
const rows = await db.select()
  .from(atlasPackets)
  .where(inArray(atlasPackets.source_ref, sourceRefs));

// Build envelopes using ACE
return rows.map(row => 
  buildCanonicalAcePacketEnvelope(row, {
    language: potentialLanguage,
    kind: potentialKind,
    page_rank_score: result.rrf_combined_score,  // ← RRF score
  })
);
```

**Why**: RRF produces seed shapes. ACE converts them to **canonical envelopes** matching Stage A0.

---

### 3. Qdrant Lane (Priority 4B)
```typescript
// Search Qdrant
const points = await qdrant.search({ /* ... */ });

// Extract source_refs from payload
const sourceRefs = points.map(p => p.payload.source_ref);

// Load Postgres rows
const rows = await db.select()
  .from(atlasPackets)
  .where(inArray(atlasPackets.source_ref, sourceRefs));

// Build envelopes using ACE
return rows.map(row => 
  buildCanonicalAcePacketEnvelope(row, {
    language: potentialLanguage,
    kind: potentialKind,
    page_rank_score: point.score * 0.5,  // ← Normalize Qdrant cosine
  })
);
```

**Why**: Qdrant returns points. ACE converts them to **canonical envelopes**.

---

### 4. Neo4j Lane (Priority 4C)
```typescript
// Query graph for neighbors
const neighbors = await cypher(`
  MATCH (n)-[r]->(neighbor)
  RETURN neighbor.id, r.topology, neighbor.pagerank_score
`);

// Extract source_refs
const sourceRefs = neighbors.map(n => extractSourceRef(n.id));

// Load Postgres rows
const rows = await db.select()
  .from(atlasPackets)
  .where(inArray(atlasPackets.source_ref, sourceRefs));

// Build envelopes using ACE
return rows.map(row => 
  buildCanonicalAcePacketEnvelope(row, {
    language: potentialLanguage,
    kind: potentialKind,
    som_cell: neighbor.topology?.som_cell,  // ← Topology hint
    page_rank_score: neighbor.pagerank_score,  // ← Neo4j PageRank
  })
);
```

**Why**: Neo4j returns graph nodes. ACE converts them to **canonical envelopes** with topology metadata.

---

### 5. ACE Merger (Deterministic Ranking)
```typescript
// All lanes return CanonicalAcePacketEnvelope[]
const stageA0Envelopes = await checkBitFrostCache();
const rrfEnvelopes = await rrfLane();
const qdrantEnvelopes = await qdrantLane();
const neoEnvelopes = await neoLane();

// Merge: all envelopes have identical shape
const allEnvelopes = [...stageA0Envelopes, ...rrfEnvelopes, ...qdrantEnvelopes, ...neoEnvelopes];

// Deterministic dedup (by packet_id, not packet_key)
const deduped = dedupeByPacketId(allEnvelopes);

// Deterministic rank
const ranked = rankByFusionFormula(deduped);

// Return candidates
return ranked;
```

**Why**: ACE guarantees all envelopes have **identical 13 fields**. Merger doesn't need shape checks.

---

### 6. Workers (Summary Generation)
```typescript
// Worker receives ACE envelope
const job = parseMessage(mqMsg);
const envelope = job.envelope as CanonicalAcePacketEnvelope;

// Safe packet identity
const prompt = `
Summarize packet_id=${envelope.packet_id}
  (title_id=${envelope.title_id})
  from ${envelope.source_ref}
  language=${envelope.language}
  feature=${envelope.feature_id}
`;

// Call Gemma4 (--cache-prompt enabled per-worker)
const summary = await gemma4(prompt);

// Write back with ACE linkage
await db.update(atlasPackets).set({
  summary: summary,
  updated_at: new Date(),
}).where(eq(atlasPackets.packet_id, envelope.packet_id));  // ← Guaranteed non-null
```

**Why**: ACE provides **packet_id** as the source-of-truth join key. Workers don't guess identity.

---

## Key Benefits

| Layer | Before ACE | After ACE |
|-------|-----------|-----------|
| **BitFrost** | Returns packet keys (strings) | Returns envelopes (full identity) ✅ |
| **RRF** | Returns seed shape | Returns canonical envelope ✅ |
| **Qdrant** | Returns points with payloads | Returns canonical envelope ✅ |
| **Neo4j** | Returns graph nodes | Returns canonical envelope ✅ |
| **Merger** | Lossy merge (packet_id lost) | Deterministic merge (packet_id preserved) ✅ |
| **Workers** | Guess packet_id from context | Receive packet_id in envelope ✅ |

---

## Why This Matters for Your Stack

### Without ACE
```
Query → BitFrost → stage A0 returns {key, metadata}
                     ↓ (no packet_id)
             RRF returns {seed_shape}
                     ↓ (packet_id diverges)
            Qdrant returns {point_payload}
                     ↓ (shape mismatch)
            Neo4j returns {node_shape}
                     ↓ (3 different shapes)
            Merger tries to dedupe → FAILS (no common key)
                     ↓ (duplicates leak through)
            Workers receive ambiguous packet → FAILS (can't write linkage)
```

### With ACE
```
Query → BitFrost → buildACE() → {packet_id, title_id, ...}
                     ↓
             RRF → buildACE() → {packet_id, title_id, ...} (SAME SHAPE)
                     ↓
            Qdrant → buildACE() → {packet_id, title_id, ...} (SAME SHAPE)
                     ↓
            Neo4j → buildACE() → {packet_id, title_id, ...} (SAME SHAPE)
                     ↓
            Merger dedupes by packet_id → CLEAN (one shape, one key)
                     ↓
            Workers receive packet_id → SUCCESS (write linkage guaranteed)
```

---

## Implementation Checklist

### Phase 4A (RRF): Use ACE
- [ ] Modify `packetSeedCandidatesFromRrf()` to return `CanonicalAcePacketEnvelope[]`
- [ ] Load Postgres rows from source_refs
- [ ] Call `buildCanonicalAcePacketEnvelope(row, context)` per result
- [ ] Thread `page_rank_score` from RRF fusion score

### Phase 4B (Qdrant): Use ACE
- [ ] Modify `searchCodeLexicalBounded()` to return `CanonicalAcePacketEnvelope[]`
- [ ] Extract source_ref from Qdrant payload
- [ ] Load Postgres rows
- [ ] Call `buildCanonicalAcePacketEnvelope(row, context)` per point
- [ ] Thread `page_rank_score` from normalized cosine similarity

### Phase 4C (Neo4j): Use ACE
- [ ] Modify `expandNeighbours()` to return `CanonicalAcePacketEnvelope[]`
- [ ] Extract source_refs from graph neighbors
- [ ] Load Postgres rows
- [ ] Call `buildCanonicalAcePacketEnvelope(row, context)` per neighbor
- [ ] Thread `page_rank_score` from PageRank + `som_cell` from topology

### Integration: ACE Merger
- [ ] All lanes now return identical shape ✅
- [ ] Merger dedupes by `packet_id` (not `packet_key`) ✅
- [ ] Ranking formula works on canonical fields ✅
- [ ] Workers receive `packet_id` guaranteed non-null ✅

---

## Code Location

**Builder function**: `src/lib/server/ace/canonical-packet-envelope.ts` (lines 82–120)

```typescript
export function buildCanonicalAcePacketEnvelope(
  row: CanonicalAcePacketEnvelopeRow,
  context: CanonicalAcePacketEnvelopeContext = {}
): CanonicalAcePacketEnvelope {
  // Takes Postgres row + context
  // Returns deterministic envelope
}
```

**Type definitions**: Lines 1–57 of same file

**Usage examples**:
- Stage A0: `hyperrag-packet-rpc.ts`, lines 1035–1054
- RRF target: Priority 4A
- Qdrant target: Priority 4B
- Neo4j target: Priority 4C

---

**Status**: ✅ **ACE WIRED IN STAGE A0, READY FOR PRIORITY 4 LANES**
