# @deeds/parent-atlas-core

Core identity contract and schema definitions for Parent Atlas GPU acceleration pipeline.

## Overview

Provides the canonical identity chain and type definitions that all other Parent Atlas packages depend on:

```
directory_path → source_ref → file_path → function_symbol → feature_id → feature_label → packet_key
```

## Installation

```bash
npm install @deeds/parent-atlas-core
```

## Usage

### Identity Contract

```typescript
import { IDENTITY_CONTRACT, verifyLineageContract } from '@deeds/parent-atlas-core';

// Access frozen identity chain definition
console.log(IDENTITY_CONTRACT.chain);
// ['directory_path', 'source_ref', 'file_path', 'function_symbol', 'feature_id', 'feature_label', 'packet_key']

// Verify a packet matches the contract
const packet = { /* ... */ };
const { passed, errors } = await verifyLineageContract(packet);
if (!passed) {
  console.error('Identity violations:', errors);
}
```

### Types

```typescript
import type { IdentityChain, ParentAtlasPacket, TurboVecMetadata } from '@deeds/parent-atlas-core';

// Use in function signatures
async function processPacket(packet: ParentAtlasPacket): Promise<void> {
  // Type-safe access to all identity fields
  const id = packet.packet_key;
  const source = packet.source_ref;
  // ...
}
```

## API Reference

### Constants

- **`IDENTITY_CONTRACT`** — Frozen identity chain definition with canonical store and mirrors

### Functions

- **`verifyLineageContract(packet: ParentAtlasPacket)`** — Validates packet against identity contract
  - Returns: `{ passed: boolean, errors: string[] }`
  - Checks: All 7 identity fields present, no duplicates

### Types

- **`IdentityChain`** — The 7-field lineage tuple
- **`ParentAtlasPacket`** — Full packet type with metadata
- **`TurboVecMetadata`** — Embedding metadata (model, dimension, quantizer, cluster ID)

## Storage Mirrors

The identity contract is replicated across:

| Store | Role | Authority |
|-------|------|-----------|
| Postgres | Identity + lifecycle | **Canonical** |
| Qdrant | Dense retrieval | Mirror (payload must match) |
| Redis | L1/L2 cache | Cache only (may be stale) |
| Neo4j | Topology + edges | Topology only (NOT identity) |
| CouchDB | Cold archive | Archive (immutable) |

## Hard Fail Conditions

Packets MUST fail validation if:

- `missing directory_path`, `missing source_ref`, `missing feature_id`, `missing feature_label`, `missing packet_key`
- `duplicate source_ref`, `duplicate packet_key`
- `orphaned qdrant payload`, `orphaned redis centroid`

## Testing

```bash
npm test
# Tests identity contract validation, type safety, mirror alignment
```

## See Also

- [@deeds/parent-atlas-retrieval](../parent-atlas-retrieval/README.md) — GPU acceleration pipeline
- [@deeds/parent-atlas-ingest](../parent-atlas-ingest/README.md) — Packet generation
- [docs/PARENT-ATLAS-PACKAGE-INTEGRATION.md](../../docs/PARENT-ATLAS-PACKAGE-INTEGRATION.md) — Full integration guide

## License

MIT
