# Architecture Consolidation — Pass 1 Audit

**Date**: June 26, 2026  
**Status**: Audit complete, migration ready  
**Goal**: Extract canonical packet identity types into `packages/atlas-core`

---

## Overview

Pass 1 consolidates packet identity type definitions. Currently scattered across multiple files, creating maintenance burden and enabling accidental divergence.

**Canonical Home**: `packages/atlas-core/src/packet/index.ts`

---

## Current State Audit

### ✅ Canonical Created

**File**: `packages/atlas-core/src/packet/identity.ts` (115 lines)

**Exports**:
- `PacketIdentitySchema` — Zod schema (core 3 fields + optional enrichment)
- `type PacketIdentity` — inferred from Zod
- Branded types: `PacketKey`, `SourceRef`, `FeatureId`
- Helper functions:
  - `extractPacketIdentity()` — validate + parse
  - `validatePacketIdentity()` — soft check (logging)
  - `identitiesEqual()` — compare two identities
  - `mergePacketIdentities()` — combine with left preference
  - `createPacketKey()`, `createSourceRef()`, `createFeatureId()` — create branded types

**Core Fields** (immutable spine):
- `packet_key` — canonical packet ID (e.g., `ace:packet:auth:001`)
- `source_ref` — source file/location (e.g., `src/lib/server/auth.ts`)
- `feature_id` — feature lane (e.g., `auth.sessions`)

**Optional Enrichment Fields**:
- `directory_path` — directory context (e.g., `src/lib/server`)
- `file_path` — full file path
- `function_symbol` — exported function name
- `feature_label` — human-readable name

### ⚠️ Duplicates Found

**Audit Command**:
```bash
node scripts/atlas/pass1-audit-packet-identities.mjs
```

**Results**: 4 duplicates in 2 files

| File | Type | Count | Recommendation |
|------|------|-------|-----------------|
| `src/lib/server/db/schema/packet-metadata-v1.ts` | `type PacketIdentity` | 1 | **CONSOLIDATE**: Keep metadata builder pattern, import canonical type |
| `src/lib/server/semantic-loop/semantic-loop-types.ts` | Branded types (PacketKey, SourceRef, FeatureId) | 3 | **KEEP LOCAL**: These use unique symbols and are semantic-loop-specific; atlas-core versions are simpler |

---

## Migration Strategy

### File 1: packet-metadata-v1.ts

**Current**:
```typescript
export type PacketIdentity = {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
};
```

**After Pass 1**:
```typescript
// Import canonical type from atlas-core
import { type PacketIdentity } from '@deeds/atlas-core/packet';

// Keep the metadata builder pattern (it's valuable)
export type PacketMetadataV1 = PacketIdentity & Partial<...>;

// Builder and selectors unchanged
export class PacketMetadataBuilder { ... }
```

**Rationale**: The metadata builder pattern (separating identity from runtime/workspace/ranking/graph/memory metadata) is sound. Only consolidate the core `PacketIdentity` type; keep everything else.

### File 2: semantic-loop-types.ts

**Action**: No change required (for now)

**Rationale**: The semantic-loop types use unique symbol brands to prevent cross-domain type confusion at compile time:
```typescript
export type PacketKey = string & { readonly __packetKey: unique symbol };
```

This is stricter than atlas-core's simple brand. Merging would require all callers to change. Deferred to Pass 9 (unified RPC contracts) where we can make a holistic decision on branding strategy.

**Future Work**: Once Pass 2 (RPC contracts) is complete, we'll revisit whether to:
1. Unify branding (use unique symbols everywhere)
2. Keep semantic-loop as a stricter application layer
3. Add a "bridge" type converter between the two

---

## Safe Migration Path

### Step 1: Update packet-metadata-v1.ts

```bash
# Dry-run: see what changes
npm run atlas:pass1:consolidate:dry

# Apply: update imports
npm run atlas:pass1:consolidate:apply
```

### Step 2: Verify

```bash
# TypeScript check (should pass with zero new errors)
npm run type-check

# Search for remaining definitions
rg "type PacketIdentity = {" sveltekit-frontend/src

# Should return zero (only canonical location)
```

### Step 3: Update package.json

```json
{
  "@deeds/atlas-core": "workspace:*"
}
```

---

## Success Criteria

- [ ] `packages/atlas-core/src/packet/identity.ts` complete and exported
- [ ] `packet-metadata-v1.ts` imports `PacketIdentity` from atlas-core
- [ ] `tsc --noEmit` returns zero new errors
- [ ] `rg "type PacketIdentity = {" sveltekit-frontend/src` returns zero matches
- [ ] git diff shows only consolidation changes (no semantic changes)

---

## Open Questions (for Pass 2+)

1. **Branded Types**: Should we unify branding (unique symbol vs simple `&` brand)?
2. **RPC Contracts**: How do we export these types for Rust/Go integration?
3. **Zod Schemas**: Should Rust codegen from Zod, or maintain separate definitions?

---

## Timeline

| Pass | Component | Files Affected | Duration |
|------|-----------|-----------------|----------|
| **1** | Packet Identity | 2 files | **1-2 hours** ← **You are here** |
| 2 | RPC Contracts | 5-8 files | 2-3 hours |
| 3-7 | Single Implementations | 20+ files | 10-20 hours |
| 8 | GPU/CPU Boundary | 8-12 files | 2-3 hours |
| 9 | Packet Lifecycle | 6-10 files | 1-2 hours |

---

## Next Steps After Pass 1

Once consolidation is complete:

1. **Pass 2: Unified RPC Contracts** — HyperRagRequest/Response, gRPC clients
2. **Pass 3-7: Single Implementations** — Redis, Qdrant, Neo4j writers + validators
3. **Pass 8: GPU/CPU Boundary** — Enforce separation of concerns
4. **Pass 9: Packet Lifecycle** — Ordered progression through packet stages

Each pass builds on prior consolidation, reducing duplicate code and enabling Rust/Go integration.

---

**Made**: June 26, 2026 (Session 82 continuation)  
**Status**: Audit complete, ready for implementation  
**Estimated Pass 1 Duration**: 45 minutes (consolidation + verification)