# SemanticPacketV1 Integration Guide

## Quick Start

The `semantic-packet-v1.ts` file provides the canonical packet contract. All packet operations should route through it.

### 1. Import the Contract

```typescript
import {
  semanticPacketV1Schema,
  type SemanticPacketV1,
  validateSemanticPacket,
  validatePacketKeyImmutability,
  fromHyperRagPacketRpcPacket,
  fromTaskSemanticPacket,
  type ContractValidationResult
} from '$lib/server/atlas/contracts/semantic-packet-v1.js';
```

### 2. Validate Before Persistence

**Before writing to Postgres, Qdrant, or Redis:**

```typescript
// Validate packet shape
const validation = validateSemanticPacket(packet);
if (!validation.is_valid) {
  throw new Error(`Invalid packet: ${validation.validation_errors.join(', ')}`);
}

// Then persist
await db.insert(atlasPackets).values(packet);
```

### 3. Convert Cross-Layer

**When converting from HyperRAG RPC response:**

```typescript
const rpcPacket = await hyperRagPacketRpc.search('query');

// Convert to canonical form
const canonical = fromHyperRagPacketRpcPacket(rpcPacket);

// Now it has full SemanticPacketV1 shape
console.log(canonical.packet_key);      // Immutable identity
console.log(canonical.feature_id);      // Knowledge layer
console.log(canonical.som_cluster);     // Routing (NOT identity)
```

**When converting from Task packet:**

```typescript
const taskPacket = await db.query.taskSemanticPackets.findFirst(...);

// Convert to canonical form
const canonical = fromTaskSemanticPacket({
  packetId: taskPacket.id,
  taskId: taskPacket.task_id,
  sourceRef: taskPacket.source_ref,
  featureId: taskPacket.feature_id,
  summary: taskPacket.summary
});
```

### 4. Prove Identity Immutability

**After retrieval from any layer, verify packet_key is unchanged:**

```typescript
// Stored in Postgres
const stored = await db.query.atlasPackets.findFirst(
  where(eq(atlasPackets.packet_key, 'abc123'))
);

// Retrieved from Qdrant
const retrieved = await qdrant.retrieve(storedId);

// Verify immutability
const gate = validatePacketKeyImmutability(stored, retrieved);
if (!gate.is_valid) {
  throw new Error(`packet_key mutation detected: ${gate.validation_errors.join(', ')}`);
}
```

---

## Identity Model (Canonical Lineage)

```
source_ref (file path)
  + tree_node_id (AST structural identity)
  + title_id (semantic grouping key)
    ↓ SHA256
  packet_key (deterministic canonical identity)
```

**CRITICAL**: packet_key MUST be identical across ALL storage layers:
- Postgres: `atlas_packets.packet_key`
- Qdrant: `codebase_chunks_768.payload.packet_key`
- Redis: `bifrost:packet:{packet_key}` (the key itself IS packet_key)
- HyperRAG RPC: `response.packets[].packet_key`
- ACE Context: `context.packet.packet_key`

---

## Routing vs Identity (Critical Distinction)

### Identity Fields (IMMUTABLE)
- `packet_key` — canonical deterministic identity
- `tree_node_id` — structural AST identity
- `source_ref` — source file path
- `title_id` — semantic grouping key
- `content_hash` — integrity verification

**Use for**: Joining, deduplication, cross-layer matching

### Routing Fields (DERIVED, NOT identity)
- `som_cluster` — Self-Organizing Map cell assignment
- `kmeans_cluster` — K-Means cluster ID
- `cluster_key` — Derived cluster key
- `directory_path` — Parent directory
- `neo4j_neighbors` — Topology neighbors

**Use for**: Selecting retrieval lane, clustering, neighborhood expansion

**DO NOT use for**: Joining, deduplication, or identity verification

---

## Validation Gates

### Gate 1: Shape Validation
```typescript
const result = validateSemanticPacket(input);
// Checks all fields conform to SemanticPacketV1Schema
// Returns: { is_valid: boolean, validation_errors: string[] }
```

### Gate 2: Immutability Proof
```typescript
const result = validatePacketKeyImmutability(stored, retrieved);
// Verifies packet_key is identical between layers
// HARD FAIL if mismatch (no silent fallback)
```

### Gate 3: Routing vs Identity Check
```typescript
// WRONG: Using routing field for identity join
const match = packets.find(p => p.som_cluster === targetCluster);

// CORRECT: Using identity field for join
const match = packets.find(p => p.packet_key === targetKey);
```

---

## Common Patterns

### Pattern 1: Packet Write (Postgres → Qdrant → Redis)

```typescript
// 1. Create canonical packet
const packet: SemanticPacketV1 = {
  packet_key: computePacketKey(sourceRef, treeNodeId, titleId),
  source_ref: sourceRef,
  tree_node_id: treeNodeId,
  title_id: titleId,
  content_hash: sha256(content),
  summary: generateSummary(content),
  feature_id: 'auth.sessions',
  // ... other fields
};

// 2. Validate
const validation = validateSemanticPacket(packet);
if (!validation.is_valid) throw new Error(...);

// 3. Write to Postgres (truth)
await db.insert(atlasPackets).values(packet);

// 4. Mirror to Qdrant (with packet_key in payload)
await qdrant.upsert({
  point_id: generatePointId(),
  vector: embedding,
  payload: {
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    feature_id: packet.feature_id,
    // ... other payload fields
  }
});

// 5. Cache in Redis
await redis.setex(
  `bifrost:packet:${packet.packet_key}`,
  3600,
  JSON.stringify(packet)
);
```

### Pattern 2: Packet Retrieval (Redis → Postgres → Qdrant → Agent)

```typescript
// 1. Try cache first
const cached = await redis.get(`bifrost:packet:${queryKey}`);
if (cached) {
  return validateSemanticPacket(JSON.parse(cached));
}

// 2. Fall back to Postgres (truth)
const packet = await db.query.atlasPackets.findFirst(
  where(eq(atlasPackets.packet_key, queryKey))
);

// 3. Verify identity immutability (if also in Qdrant)
const qdrantCopy = await qdrant.retrieve(packet.qdrant_point_id);
const gate = validatePacketKeyImmutability(packet, qdrantCopy);
if (!gate.is_valid) {
  throw new Error(`Identity mismatch: ${gate.validation_errors}`);
}

// 4. Pass to agent with packet_key unchanged
const context = buildAceContext({
  ...packet,
  packet_key: packet.packet_key // ← UNCHANGED
});

return context;
```

### Pattern 3: Cross-Layer Conversion

```typescript
// From HyperRAG RPC (5 fields)
const rpc = await hyperRag.search('query');
const canonical = fromHyperRagPacketRpcPacket(rpc);
// ← Now has full 7-section SemanticPacketV1 shape

// From Task packet (3 fields)
const task = await db.query.taskSemanticPackets.findFirst(...);
const canonical = fromTaskSemanticPacket({
  packetId: task.id,
  taskId: task.task_id,
  sourceRef: task.source_ref,
  featureId: task.feature_id,
  summary: task.summary
});
// ← Now has full 7-section SemanticPacketV1 shape
```

---

## Checklist: Before Wiring New Code

- [ ] Import from `semantic-packet-v1.ts` (not from scattered sources)
- [ ] Validate with `validateSemanticPacket()` before persistence
- [ ] Use identity fields (packet_key, source_ref) for joining, NOT routing fields (som_cluster)
- [ ] Prove packet_key immutability across layers with `validatePacketKeyImmutability()`
- [ ] Include `ContractValidationResult` in observability traces
- [ ] Document which fields your code populates (identity, content, knowledge, etc.)
- [ ] Test with proof-matrix (single packet through all 5 storage layers)

---

## Troubleshooting

### "packet_key mismatch in Postgres and Qdrant"
**Cause**: Packet was written with different packet_key values to each layer  
**Fix**: Recompute packet_key from (source_ref + tree_node_id + title_id) and backfill

### "Cannot find packet in Qdrant after Postgres write"
**Cause**: Qdrant payload missing packet_key, or Qdrant indexing stale  
**Fix**: Rebuild Qdrant collection from Postgres canonical truth

### "packet_key changes between retrieval and cache"
**Cause**: Redis key format mismatch (should use packet_key as the literal key)  
**Fix**: Use `bifrost:packet:{packet_key}` where packet_key is the identity, not a hash of it

### "Routing fields used for identity"
**Cause**: Code is using `som_cluster` or `kmeans_cluster` for joining packets  
**Fix**: Use `packet_key` for identity joins; use routing fields only for lane selection

---

## Files & References

- **Contract Schema**: `semantic-packet-v1.ts` (this directory)
- **Audit Report**: `reports/semantic-contracts/WIRING-INVENTORY.md`
- **Audit Script**: `scripts/atlas/reconcile-semantic-contracts.mjs`
- **Phase 18 Envelope** (reference): `src/lib/server/ml/phase18-envelope-schema.ts`
- **HyperRAG RPC** (reference): `src/lib/server/retrieval/hyperrag-packet-rpc.ts`
- **Task Packets** (reference): `src/lib/server/tasks/semantic-packets.ts`

---

## Next Steps (Phase 108)

1. **108A** (1d): Normalize naming (camelCase → snake_case in packet identity utilities)
2. **108B** (1d): Create identity builders (`packet-key-builder.ts`, `tree-node-id-extractor.ts`)
3. **108C** (2d): Wire OKF declarative source
4. **108D** (1d): Implement proof-matrix validation (single packet → all layers)
5. **108E** (3d): Formalize HypergraphFactV1
6. **108F** (2d): Add ContractValidationResult gates to all layers

---

**Last Updated**: July 26, 2026  
**Version**: 1.0.0  
**Schema Version**: 1.0.0
