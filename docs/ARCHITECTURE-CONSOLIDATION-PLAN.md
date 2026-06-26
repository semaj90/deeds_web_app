# Architecture Consolidation Plan (Post-Session 82)

**Status**: Design phase (ready for 9-pass implementation)  
**Scope**: Reduce duplicate implementations to canonical single source  
**Outcome**: atlas-core as authoritative contract layer + packet lifecycle enforcement

---

## Problem Statement

Currently the codebase has:
- **10+ packet identity representations** (packetKey, packet_key, packetId, id, etc.)
- **8+ validation implementations** (scattered through scripts)
- **Multiple write paths** (direct SQL, scripts, API routes — none canonical)
- **Duplicate RPC payloads** (searchDense, searchGraph, searchHybrid — no unified contract)
- **Mixed CPU/GPU concerns** (validation calls GPU, GPU calls validation, circular)
- **Synchronous mirror updates** (one failure blocks all others)

**Result**: Fragile, hard to maintain, difficult to extend to Rust/Go.

---

## Solution: Atlas-Core + 9-Pass Consolidation

### Phase 0: Create atlas-core Package Structure

```
packages/atlas-core/
├── src/
│   ├── packet/
│   │   ├── identity.ts           # ← ONE type: PacketIdentity
│   │   ├── schema.ts             # ← Zod schemas (canonical)
│   │   ├── validator.ts          # ← ONE validator per concern
│   │   └── lifecycle.ts          # ← Packet progression rules
│   ├── rpc/
│   │   ├── request.ts            # ← HyperRagRequest (unified)
│   │   ├── response.ts           # ← HyperRagResponse (unified)
│   │   ├── events.ts             # ← PacketUpdated, etc.
│   │   ├── errors.ts             # ← RPC error types
│   │   └── transport.ts          # ← gRPC/HTTP/Queue wiring
│   ├── registry/
│   │   ├── packet-registry.ts    # ← Identity → current state lookup
│   │   └── source-registry.ts    # ← source_ref → packets
│   ├── retrieval/
│   │   ├── search-contract.ts    # ← Unified search interface
│   │   └── rerank-contract.ts    # ← GPU rerank interface
│   ├── validation/
│   │   ├── identity.ts           # ← validatePacketIdentity()
│   │   ├── packet.ts             # ← validatePacket()
│   │   ├── summary.ts            # ← validateSummary()
│   │   ├── embedding.ts          # ← validateEmbedding()
│   │   ├── feature.ts            # ← validateFeature()
│   │   └── trace.ts              # ← validateTrace()
│   ├── telemetry/
│   │   ├── events.ts             # ← Event emission
│   │   ├── metrics.ts            # ← Metric recording
│   │   └── tracing.ts            # ← Distributed tracing
│   ├── types/
│   │   ├── index.ts              # ← All type exports
│   │   └── common.ts             # ← Shared types (Timestamp, UUID, etc.)
│   └── index.ts                  # ← Public API barrel
├── drizzle/                       # ← Shared migrations
├── package.json
└── README.md
```

### Pass 1: Canonical Packet Identity

**Goal**: One `PacketIdentity` type used everywhere

**File**: `packages/atlas-core/src/packet/identity.ts`

```typescript
import { z } from 'zod';

/**
 * Canonical packet identity (immutable spine)
 * Every operation validates against this shape
 */
export const PacketIdentitySchema = z.object({
  packet_key: z.string().min(1),           // ace:packet:auth:001
  source_ref: z.string().min(1),           // src/lib/server/auth.ts
  feature_id: z.string().min(1),           // auth.sessions
  directory_path: z.string().optional(),   // src/lib/server
});

export type PacketIdentity = z.infer<typeof PacketIdentitySchema>;

/**
 * Extract identity from packet (safe, validated)
 */
export function extractPacketIdentity(packet: any): PacketIdentity {
  return PacketIdentitySchema.parse({
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    feature_id: packet.feature_id,
    directory_path: packet.directory_path,
  });
}
```

**Enforcement**: Every module imports from here, never defines its own types.

**Migration**: Find and replace all packet type definitions.

### Pass 2: Unified RPC Contracts

**Goal**: One request/response shape for all retrieval operations

**File**: `packages/atlas-core/src/rpc/request.ts`

```typescript
import { z } from 'zod';
import { PacketIdentitySchema } from '../packet/identity';

/**
 * Unified HyperRAG retrieval request
 * Replaces: searchDense, searchGraph, searchHybrid, etc.
 */
export const HyperRagRequestSchema = z.object({
  trace_id: z.string(),                    // For telemetry chain
  strategy: z.enum(['dense', 'graph', 'hybrid', 'sparse']),
  packet_identity: PacketIdentitySchema,   // Context packet
  query: z.object({
    text: z.string(),
    embedding: z.array(z.number()).length(768).optional(),
  }),
  topK: z.number().int().positive().default(10),
  rerankK: z.number().int().positive().optional(),
  graphDepth: z.number().int().min(0).max(3).default(1),
  filters: z.record(z.string(), z.any()).optional(),
});

export type HyperRagRequest = z.infer<typeof HyperRagRequestSchema>;

export const HyperRagResponseSchema = z.object({
  trace_id: z.string(),
  packets: z.array(z.object({
    packet_key: z.string(),
    score: z.number(),
    source: z.enum(['qdrant', 'postgres', 'neo4j', 'cache']),
    content: z.string().optional(),
  })),
  telemetry: z.object({
    latency_ms: z.number(),
    cache_hit: z.boolean(),
    rerank_applied: z.boolean(),
  }),
});

export type HyperRagResponse = z.infer<typeof HyperRagResponseSchema>;
```

**Enforcement**: API routes, gRPC services, and scripts all marshal to this shape.

**Impact**: Eliminates 8+ ad-hoc request types.

### Pass 3-7: Single Implementation Per Concern

| Concern | Current | Canonical | Owner |
|---------|---------|-----------|-------|
| Redis invalidation | 3 places | `packages/atlas-core/redis/invalidate.ts` | atlas-core |
| Qdrant writes | 2 places | `packages/atlas-core/qdrant/writer.ts` | atlas-core |
| Neo4j updates | 2 places | `packages/atlas-core/neo4j/writer.ts` | atlas-core |
| Packet validation | 4 places | `packages/atlas-core/validation/` | atlas-core |
| Telemetry events | scattered | `packages/atlas-core/telemetry/events.ts` | atlas-core |

**Rule**: Every other module calls these, never reimplements.

### Pass 8: GPU/CPU Boundary Enforcement

**Goal**: GPU only does math, CPU does everything else

**File**: `packages/atlas-core/src/gpu/contract.ts`

```typescript
/**
 * GPU never:
 * - reads from database
 * - writes to cache
 * - validates identity
 * - emits events
 * - parses JSON
 */

export interface GpuRequest {
  vectors: Float32Array;           // Input: 768-dim vectors
  count: number;                   // Number of vectors
  operation: 'embed' | 'rerank' | 'ae' | 'som' | 'kmeans';
}

export interface GpuResponse {
  result: Float32Array;            // Output: math only
  metadata: {
    latency_ms: number;
    model_version: string;
  };
}

/**
 * CPU must:
 * - validate GpuRequest before sending
 * - validate GpuResponse after receiving
 * - handle database writes
 * - emit telemetry
 * - manage cache invalidation
 */
```

**Enforcement**: GPU modules import only from `gpu/contract.ts`, not from server modules.

### Pass 9: Packet Lifecycle Enforcement

**Goal**: Packets flow through stages in order, never skip

**File**: `packages/atlas-core/src/packet/lifecycle.ts`

```typescript
export type PacketStage = 
  | 'graphify'           // Created by directory map
  | 'registered'         // In atlas_packets registry
  | 'summarized'         // summary field populated
  | 'titled'             // title field populated
  | 'embedded'           // embedding vector computed
  | 'indexed_qdrant'     // In Qdrant dense vector DB
  | 'encoded_ae'         // Autoencoder 768→64
  | 'clustered_som'      // In SOM 20×20 grid
  | 'topologized'        // Neo4j SIMILAR_TOPOLOGY edges wired
  | 'cached_redis'       // In Redis BitFrost cache

export const PACKET_LIFECYCLE = [
  'graphify',
  'registered',
  'summarized',
  'titled',
  'embedded',
  'indexed_qdrant',
  'encoded_ae',
  'clustered_som',
  'topologized',
  'cached_redis',
] as const;

/**
 * Enforce: packet at stage N cannot skip to stage N+2
 */
export function validateLifecycleTransition(
  from: PacketStage,
  to: PacketStage,
): boolean {
  const fromIdx = PACKET_LIFECYCLE.indexOf(from);
  const toIdx = PACKET_LIFECYCLE.indexOf(to);
  return toIdx === fromIdx + 1; // Only consecutive transitions allowed
}
```

**Enforcement**: Every Postgres write checks this before updating stage.

---

## Migration Strategy (9 Passes)

### Pass 1: Extract identity types
- [ ] Create `packages/atlas-core/src/packet/identity.ts`
- [ ] Find all packet type definitions in codebase
- [ ] Replace with imports from atlas-core
- [ ] Update Zod schemas to match

**Time**: 1-2 hours  
**Risk**: Low (type-only changes)  
**Verification**: `tsc --noEmit` (zero new errors)

### Pass 2: Unified RPC contracts
- [ ] Create `packages/atlas-core/src/rpc/`
- [ ] Define HyperRagRequest/Response
- [ ] Replace searchDense/searchGraph/searchHybrid with unified marshaling
- [ ] Update gRPC stubs to use unified shapes

**Time**: 2-3 hours  
**Risk**: Medium (changes request/response shapes)  
**Verification**: All API routes compile, CLI tools produce same output

### Passes 3-7: Single implementations
- [ ] Extract Redis invalidation to one place
- [ ] Extract Qdrant writer to one place
- [ ] Extract Neo4j writer to one place
- [ ] Extract all validators to one place
- [ ] Extract telemetry to one place

**Time**: 2-4 hours per pass (10-20 hours total)  
**Risk**: Medium (consolidating duplicates)  
**Verification**: Grep shows zero duplicate implementations

### Pass 8: GPU/CPU boundary
- [ ] Create `packages/atlas-core/src/gpu/contract.ts`
- [ ] Audit GPU modules: remove database access
- [ ] Audit CPU modules: remove GPU math
- [ ] Add type guards at boundary

**Time**: 2-3 hours  
**Risk**: Medium (refactoring GPU bridge)  
**Verification**: GPU modules compile without server deps

### Pass 9: Packet lifecycle
- [ ] Create `packages/atlas-core/src/packet/lifecycle.ts`
- [ ] Add stage validation to atlas_packets updates
- [ ] Audit all write paths: enforce lifecycle checks
- [ ] Document valid transitions

**Time**: 1-2 hours  
**Risk**: Low (adds validation, doesn't change flow)  
**Verification**: All Postgres writes include lifecycle check

---

## Implementation Order

**STOP P4.2-P4.4 feature work.** Do consolidation first:

1. **Pass 1**: Packet identity (foundation for everything)
2. **Pass 2**: RPC contracts (enables go/rust to use same shapes)
3. **Passes 3-7**: Single implementations (cleanup)
4. **Pass 8**: GPU/CPU boundary (prepare for Rust bridge)
5. **Pass 9**: Packet lifecycle (enforce correctness)

**After consolidation, resume feature work** (P4.2 AE training now uses canonical validators, RPC contracts, etc.).

---

## Success Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Packet identity types | 10+ | 1 | ✅ |
| RPC request shapes | 8+ | 1 | ✅ |
| Validation implementations | 4+ | 1 per concern | ✅ |
| Redis invalidation paths | 3 | 1 | ✅ |
| Qdrant writer paths | 2 | 1 | ✅ |
| Neo4j writer paths | 2 | 1 | ✅ |
| GPU modules importing from server | 3+ | 0 | ✅ |
| Packet lifecycle enforced | 0% | 100% | ✅ |

---

## Long-term Benefits

### 1. Rust/Go Integration
Once atlas-core is canonical:
- Rust parser imports `packages/atlas-core/packet/identity.ts` (via TypeScript types → Rust codegen)
- Go retrieval service unmarshals HyperRagRequest (same shape as TS)
- Python embedder reads from canonical schema (same Zod validators)

### 2. Reduced Cognitive Load
- New dev: "Where do I write to Redis?" → "atlas-core/redis/invalidate.ts"
- Not: "Is it in the script, API route, or somewhere else?"

### 3. Easier to Audit
- Identity validation: one place to check
- RPC contracts: one source of truth
- Packet lifecycle: one ruleset for all 10 stages

### 4. Enables Future Refactors
- Swap Qdrant for Milvus? Change one file.
- Add caching layer? One Redis writer.
- Add observability? One telemetry module.

---

## Decision Point

**Before starting Pass 1:**

1. Agree on atlas-core scope (just packet/RPC/validation or include retrieval?)
2. Decide on Zod vs TypeScript for schema (currently mixed)
3. Plan Rust type generation from Zod (for parser integration)

**If approved**, the 9-pass consolidation takes ~30-40 hours and unblocks everything downstream (P4.2-P4.4, GPU bridge, Rust parser, Go services).

---

## Next Session Recommendation

**Session 83 Focus**: Architecture consolidation (Passes 1-3)

**Session 84 Focus**: Single implementations (Passes 4-7)

**Session 85 Focus**: GPU/CPU boundary + lifecycle (Passes 8-9)

**Session 86+**: Resume P4.2-P4.4 feature work with consolidated foundation

---

**Made**: June 26, 2026 (Session 82 conclusion)  
**Status**: Design phase (ready for approval)  
**Estimated Duration**: 30-40 hours (spread across 3-4 sessions)  
**Payoff**: Foundation for Rust/Go/Python integration + 10× easier to maintain
