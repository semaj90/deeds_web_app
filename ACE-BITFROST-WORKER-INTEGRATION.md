# How ACE (Canonical Ace Packet Envelope) Helps BitFrost → Retrieval → Workers

**Date**: July 2, 2026 23:55 UTC  
**Core Principle**: ACE is the **deterministic contract** that ties together hot bucket caching, retrieval lanes, and worker processing without shape divergence.

---

## The Problem ACE Solves

### Before ACE (Divergent Shapes)

```
Stage A0 Cache Hit (BitFrost)
  └─ returns: { stable_key, source_refs, packet_key, metadata, kind: 'a0' }

RRF Lane
  └─ returns: { stable_key, source_refs, packet_key, metadata, kind: 'rrf' }

Qdrant Lane
  └─ returns: { point_id, payload: { feature_id, source_ref } }

Neo4j Lane
  └─ returns: { node_id, edges, ..., feature_id: extracted }

ACE Assembler
  └─ receives 4 DIFFERENT shapes → lossy merge → packet_id lost ❌
```

**Problem**: Each lane rebuilds packet identity independently. ACE assembler doesn't know which lane's identity is canonical. Result: **packet_id divergence** across the pipeline.

---

### After ACE (Unified Shape)

```
Stage A0 Cache Hit (BitFrost)
  └─ ACE.buildCanonicalAcePacketEnvelope(postgres_row, context)
     └─ returns: {
       packet_id: "ace:packet:auth:001",
       packet_ulid: "01ARZ3NDEKTSV4...",
       packet_key: "ace:packet:auth:001",
       title_id: "abc-123",
       feature_id: "auth.sessions",
       source_ref: "src/lib/server/auth.ts",
       som_cell: "20x20:15:8",
       language: "typescript",
       kind: "function",
       page_rank_score: 1.0
     }

RRF Lane
  └─ ACE.buildCanonicalAcePacketEnvelope(postgres_row, context)
     └─ returns: IDENTICAL shape (same 10 fields)

Qdrant Lane
  └─ ACE.buildCanonicalAcePacketEnvelope(postgres_row, context)
     └─ returns: IDENTICAL shape (same 10 fields)

Neo4j Lane
  └─ ACE.buildCanonicalAcePacketEnvelope(postgres_row, context)
     └─ returns: IDENTICAL shape (same 10 fields)

ACE Assembler
  └─ receives SAME shape from ALL lanes → deterministic merge ✅
     └─ packet_id preserved end-to-end ✅
```

**Solution**: All lanes call the **same builder function** on the **same Postgres row**. Shape is deterministic by construction.

---

## The ACE Contract (Type Definition)

### Core Fields (Immutable Identity)

```typescript
export type CanonicalAcePacketEnvelope = {
  // Packet identity (immutable)
  packet_id: string | null;              // ace:packet:auth:001
  packet_ulid: string | null;            // 01ARZ3NDEKTSV4RRFFQ69G5FAV
  packet_key: string;                    // ace:packet:auth:001
  title_id: string | null;               // abc-123
  
  // Code location (immutable)
  source_ref: string;                    // src/lib/server/auth.ts
  canonical_source_ref: string;          // src/lib/server/auth.ts (same as source_ref)
  feature_id: string | null;             // auth.sessions
  
  // Query context (set by each lane)
  language: string | null;               // typescript (from BitFrost query)
  kind: string | null;                   // function (from BitFrost query)
  som_cell: string | null;               // 20x20:15:8 (from Neo4j topology)
  page_rank_score: number;               // 0.95 (from RRF/Neo4j/Qdrant)
  
  // Metadata (optional)
  prompt_template_id: string | null;
  summary?: string | null;
  domain?: string | null;
  feature_label?: string | null;
};
```

### Context (Set Per-Lane)

```typescript
export type CanonicalAcePacketEnvelopeContext = {
  feature_id?: string | null;            // Override from query
  som_cell?: string | null;              // Override from topology
  language?: string | null;              // Query intent signal
  kind?: string | null;                  // Query intent signal
  page_rank_score?: number;              // Ranking score (0.0–1.0)
};
```

---

## How BitFrost Uses ACE

### Step 1: Hot Bucket Fetch (Stage A0)

```typescript
// hyperrag-packet-rpc.ts, lines 909–965
const languageKey = `bitfrost:hot:language:${normalizeKey(potentialLanguage)}`;
const hotBucketHits = await redis.smembers(languageKey);
// Result: ["src/lib/auth.ts", "src/lib/db/client.ts", ...]
```

**BitFrost Returns**: List of packet **keys** (strings), not envelopes.

---

### Step 2: Envelope Assembly (Stage A0)

```typescript
// hyperrag-packet-rpc.ts, lines 1035–1054
if (hotBucketHits.length > 0 && stageA0CacheHitSource) {
  const context = {
    feature_id: null,
    som_cell: null,
    language: potentialLanguage ?? null,        // ← Query intent
    kind: potentialKind ?? null,                // ← Query intent
    page_rank_score: 0,                         // ← Cache = perfect hit
  };

  for (const key of hotBucketHits) {
    const row = canonicalPackets.get(key);     // ← Load Postgres row
    if (row) {
      const envelope = buildCanonicalAcePacketEnvelope(row, context);
      stageA0CacheEnvelopes.set(key, envelope);
    }
  }
}
```

**What ACE Does Here**:
1. Takes Postgres row (packet_id, packet_ulid, title_id, source_ref, feature_id, etc.)
2. Merges with context (language, kind from query)
3. Returns **deterministic envelope** with all 13 fields populated

---

### Step 3: Deterministic Emission

```typescript
// hyperrag-packet-rpc.ts, lines 1075–1124
for (const [key, envelope] of stageA0CacheEnvelopes) {
  if (packets.length >= limit) break;
  const packet: HyperRagPacketRpcPacket = {
    packet_id: envelope.packet_id,          // ← From ACE
    packet_ulid: envelope.packet_ulid,      // ← From ACE
    packet_key: envelope.packet_key,        // ← From ACE
    title_id: envelope.title_id,            // ← From ACE
    source_ref: envelope.source_ref,        // ← From ACE
    feature_id: envelope.feature_id,        // ← From ACE
    language: envelope.language,            // ← From context
    kind: envelope.kind,                    // ← From context
    som_cell: envelope.som_cell,            // ← From context
    fusion_score: 1.0,                      // ← Perfect cache hit
    traces: [{
      stage: 'A0',
      source: stageA0CacheHitSource,
      timing: `${bitfrostMs.toFixed(1)}ms`,
      confidence: 0.99,
    }],
  };
  packets.push(packet);
}
```

**Key Win**: `packet_id`, `packet_ulid`, `title_id` are **guaranteed non-null** because they came from the same Postgres row via ACE builder.

---

## How RRF Lane Uses ACE (Priority 4A)

### Before ACE (Current State)

```typescript
async function packetSeedCandidatesFromRrf(results: RrfResult[]): Promise<SeedShape[]> {
  return results.map(r => ({
    stable_key: r.rrf_key,
    source_refs: r.source_refs,
    packet_key: r.packet_key,
    metadata: r.metadata,
    kind: 'rrf',
    // ❌ packet_id NOT included — shape diverges from Stage A0
    // ❌ title_id NOT included — shape diverges from Stage A0
  }));
}
```

**Problem**: RRF returns `SeedShape`, ACE returns `CanonicalAcePacketEnvelope`. Merger has to guess identity.

### After ACE (Priority 4A Target)

```typescript
async function packetSeedCandidatesFromRrf(
  results: RrfResult[]
): Promise<CanonicalAcePacketEnvelope[]> {
  // 1. Extract source refs from RRF results
  const sourceRefs = results.map(r => r.source_ref);
  
  // 2. Load Postgres rows by source_ref
  const rows = await db
    .select()
    .from(atlasPackets)
    .where(inArray(atlasPackets.source_ref, sourceRefs));
  
  // 3. Build envelopes using ACE
  const context = {
    feature_id: null,
    som_cell: null,
    language: potentialLanguage ?? null,
    kind: potentialKind ?? null,
    page_rank_score: result.rrf_combined_score ?? 0,  // ← RRF score
  };
  
  return rows.map(row => 
    buildCanonicalAcePacketEnvelope(row, context)
  );
}
```

**Result**: RRF now returns identical shape to Stage A0. ACE merger can merge deterministically.

---

## How Qdrant Lane Uses ACE (Priority 4B)

### Before ACE

```typescript
async function searchCodeLexicalBounded(query: string): Promise<QdrantResult[]> {
  const points = await qdrant.search({ ... });
  return points.map(p => ({
    point_id: p.id,
    payload: p.payload,
    score: p.score,
    // ❌ payload extracted ad-hoc
    // ❌ packet_id/title_id not guaranteed
  }));
}
```

### After ACE (Priority 4B Target)

```typescript
async function searchCodeLexicalBounded(query: string): Promise<CanonicalAcePacketEnvelope[]> {
  const points = await qdrant.search({ ... });
  
  // Extract source_ref from Qdrant payload
  const sourceRefs = points.map(p => p.payload.source_ref);
  
  // Load Postgres rows
  const rows = await db
    .select()
    .from(atlasPackets)
    .where(inArray(atlasPackets.source_ref, sourceRefs));
  
  // Build envelopes
  const context = {
    feature_id: null,
    som_cell: null,
    language: potentialLanguage ?? null,
    kind: potentialKind ?? null,
    page_rank_score: point.score * 0.5,  // ← Normalize Qdrant cosine
  };
  
  return rows.map(row => 
    buildCanonicalAcePacketEnvelope(row, context)
  );
}
```

**Result**: Qdrant shape matches RRF which matches Stage A0.

---

## How Neo4j Lane Uses ACE (Priority 4C)

### Before ACE

```typescript
async function expandNeighbours(root: string): Promise<NeighborShape[]> {
  const neighbors = await cypher(`
    MATCH (n:Node {id: $id})-[]->(neighbor)
    RETURN neighbor.id, neighbor.metadata
  `);
  
  return neighbors.map(n => ({
    node_id: n.id,
    edges: n.edges,
    feature_id: extractFromMetadata(n.metadata),
    // ❌ packet_id/title_id missing
  }));
}
```

### After ACE (Priority 4C Target)

```typescript
async function expandNeighbours(root: string): Promise<CanonicalAcePacketEnvelope[]> {
  const neighbors = await cypher(`
    MATCH (n:Node {id: $id})-[r]->(neighbor)
    RETURN neighbor.id, neighbor.pagerank_score, r.topology
  `);
  
  // Extract source_refs
  const sourceRefs = neighbors.map(n => extractSourceRef(n.id));
  
  // Load Postgres rows
  const rows = await db
    .select()
    .from(atlasPackets)
    .where(inArray(atlasPackets.source_ref, sourceRefs));
  
  // Build envelopes WITH topology metadata
  const context = {
    feature_id: null,
    som_cell: neighbor.topology?.som_cell ?? null,  // ← Topology hint
    language: potentialLanguage ?? null,
    kind: potentialKind ?? null,
    page_rank_score: neighbor.pagerank_score ?? 0,  // ← Neo4j PageRank
  };
  
  return rows.map(row => 
    buildCanonicalAcePacketEnvelope(row, context)
  );
}
```

**Result**: Neo4j shape matches all other lanes. Topology metadata threaded through.

---

## How Workers Use ACE

### Worker Receives ACE Envelope

```typescript
// phase7-rabbitmq-batch-worker.mjs
const job = JSON.parse(msg.content.toString());
const envelope = job.envelope as CanonicalAcePacketEnvelope;

console.log(`[worker] Summarizing packet_id=${envelope.packet_id} title_id=${envelope.title_id}`);

// Can now safely access packet identity
const prompt = `
Summarize the following code packet:

Packet ID: ${envelope.packet_id}
Title ID: ${envelope.title_id}
File: ${envelope.source_ref}
Language: ${envelope.language}
Feature: ${envelope.feature_id}

Content: ...
`;

const summary = await ollama.generate({ prompt });

// Write back to Postgres with explicit packet linkage
await db.update(atlasPackets).set({
  summary: summary,
  updated_at: new Date(),
}).where(eq(atlasPackets.packet_id, envelope.packet_id));  // ← ACE linkage
```

**Worker Benefit**: No guessing packet identity. ACE provides `packet_id` which is the source-of-truth join key.

---

## The Full Data Flow (With ACE)

```
User Query
  ↓ language: typescript, kind: function
  ↓
Stage A0 (BitFrost)
  ├─ redis.smembers('bitfrost:hot:language:typescript')
  ├─ Load Postgres rows
  └─ buildCanonicalAcePacketEnvelope() ← ACE ✅
     ↓ returns envelope with packet_id, title_id
     ↓ fusion_score: 1.0 (cache hit)
     ↓ timing: 12.5ms
     └─ EMIT packets + stage: "A0" ✅

(If no cache hit, fall through to Layer 2)

RRF Lane
  ├─ Extract source_refs from RRF
  ├─ Load Postgres rows
  └─ buildCanonicalAcePacketEnvelope() ← ACE ✅
     ↓ returns envelope with packet_id, title_id
     ↓ page_rank_score: RRF fusion score
     └─ EMIT packets

Qdrant Lane
  ├─ Search Qdrant by embedding
  ├─ Extract source_ref from payload
  ├─ Load Postgres rows
  └─ buildCanonicalAcePacketEnvelope() ← ACE ✅
     ↓ returns envelope with packet_id, title_id
     ↓ page_rank_score: normalized cosine similarity
     └─ EMIT packets

Neo4j Lane
  ├─ Query graph for neighbors
  ├─ Extract source_refs
  ├─ Load Postgres rows
  └─ buildCanonicalAcePacketEnvelope() ← ACE ✅
     ↓ returns envelope with packet_id, title_id
     ↓ page_rank_score: PageRank + som_cell: topology
     └─ EMIT packets

ACE Merger
  └─ All envelopes have IDENTICAL shape
     ├─ Deterministic rank (0.30·qdrant + 0.20·turbovec + ...)
     ├─ Deterministic dedupe (by packet_id, not packet_key)
     └─ EMIT ranked candidates

Workers (4 parallel)
  ├─ Receive ACE envelope
  ├─ Safe packet_id reference
  ├─ Call Gemma4 RotorQuant (--cache-prompt enabled)
  ├─ KV cache: system prompt (per worker, not shared)
  └─ Write summary to Postgres with ACE packet_id linkage
```

---

## Why ACE Is Critical Here

| Problem | ACE Solution | Impact |
|---------|--------------|--------|
| **Shape divergence** | All lanes call same builder function | Deterministic merge ✅ |
| **packet_id loss** | ACE extracts from Postgres row | packet_id preserved end-to-end ✅ |
| **Cache + Retrieval mismatch** | Stage A0 and RRF/Qdrant/Neo4j all use ACE | Cache hits + retrieval misses compatible ✅ |
| **Worker identity** | ACE provides packet_id as join key | Worker writes back with correct linkage ✅ |
| **Query context threading** | Context object (language, kind) merged into envelope | Query signals propagate through all stages ✅ |
| **Ranking merge** | All lanes return same schema | Rank function doesn't need shape checks ✅ |

---

## Summary

**ACE is the contract that makes the entire pipeline work together**:

1. **BitFrost caches packet keys** → ACE builds envelopes
2. **RRF/Qdrant/Neo4j fetch packets** → ACE normalizes shape
3. **ACE merger ranks candidates** → All have identical fields
4. **Workers receive envelopes** → packet_id guaranteed non-null
5. **Workers write summaries** → Use packet_id from ACE

**Without ACE**: Each layer reinvents the wheel, shapes diverge, packet_id gets lost, merging is lossy.  
**With ACE**: One builder, one contract, one source of truth, deterministic merge.

ACE is how BitFrost stays **in sync** with retrieval lanes and workers.
