# Semantic Index Loop Integration Guide

**Status**: ✅ Complete — 13-checkpoint end-to-end smoke test
**Last Updated**: June 26, 2026

## Overview

The semantic index loop validates the complete retrieval → ACE → synthesis → cache → materializer pipeline. This document describes the type system, integration points, and smoke test infrastructure.

## Architecture

```
User Query
  ↓
[1] Query Cache Miss → trace_id
  ↓
[2] Go Retrieval → candidates (sourceRef, similarity)
  ↓
[3] Candidates Join atlas_packets (Postgres)
  ↓
[4] ACE Reader → loads canonical packet
  ↓
[5] ACE Validator → rejects prompt injection
  ↓
[6] Context Assembler → builds bounded Gemma4 context
  ↓
[7] Gemma4 Synthesis → response + packet_keys_used
  ↓
[8] ACE Writer → persists to Postgres
  ↓
[9] ACE Cache → writes Valkey hot key (18ms)
  ↓
[10] Cache Hit → second query hits cache (7ms)
  ↓
[11] Materializer → mirrors to Qdrant/TurboVec
  ↓
[12] NES Chrom97 → topology updates
  ↓
[13] Report → JSON audit trail
```

## Type System

### Core Types

All types are defined in `src/lib/server/semantic-loop/semantic-loop-types.ts`:

#### Branded Types (Type-Safe IDs)

```typescript
export type TraceId = string & { readonly __traceId: unique symbol };
export type PacketKey = string & { readonly __packetKey: unique symbol };
export type FeatureId = string & { readonly __featureId: unique symbol };
export type SourceRef = string & { readonly __sourceRef: unique symbol };
export type QdrantPointId = string & { readonly __qdrantPointId: unique symbol };
```

Helpers to create branded types:

```typescript
import { createTraceId, createPacketKey, createFeatureId, createSourceRef } from '$lib/server/semantic-loop/semantic-loop-types';

const traceId = createTraceId(randomUUID());
const packetKey = createPacketKey('ace:packet:auth:001');
```

#### Checkpoint Types

**Checkpoint 1: Query Cache Miss**
```typescript
interface QueryCacheMissTrace {
  traceId: TraceId;
  timestamp: Date;
  userQuery: string;
  queryHash: string;
  cacheCheckMs: number;
  missed: boolean;
}
```

**Checkpoint 2: Go Retrieval**
```typescript
interface GoRetrievalResponse {
  traceId: TraceId;
  query: string;
  candidates: RetrievalCandidate[];
  executionMs: number;
  hitCount: number;
}
```

**Checkpoint 3: Candidate Join**
```typescript
interface AtlasPacket {
  packetKey: PacketKey;
  sourceRef: SourceRef;
  filePath: string;
  featureId: FeatureId;
  featureLabel: string;
  communityId?: string;
  similarity: number;
  qdrantPointId?: QdrantPointId;
}
```

**Checkpoint 4: ACE Reader**
```typescript
interface AcePacketContent {
  packetKey: PacketKey;
  sourceRef: SourceRef;
  content: string;
  embeddingDim: number;
  qdrantPointId?: QdrantPointId;
  summary: string;
  tokens: number;
  contentHash: string;
}
```

**Checkpoint 5: ACE Validator**
```typescript
interface AceValidatorResult {
  traceId: TraceId;
  checks: PromptInjectionCheck[];
  validPackets: AcePacketContent[];
  rejectedPackets: AcePacketContent[];
  validationMs: number;
  passRate: number;
}
```

**Checkpoint 6: Context Assembler**
```typescript
interface AssembledContext {
  traceId: TraceId;
  systemPrompt: string;
  packets: AcePacketContent[];
  bound: ContextBound;
  assemblyMs: number;
  formatted: string;
}
```

**Checkpoint 7: Gemma4 Synthesis**
```typescript
interface Gemma4SynthesisContract {
  traceId: TraceId;
  response: string;
  packetKeysUsed: PacketKey[];
  featureIdsUsed: FeatureId[];
  uncertainty: number; // 0-1
  tokensUsed: number;
  model: string;
  synthesisMs: number;
}
```

**Checkpoint 8-13**: See `semantic-loop-types.ts` for full definitions.

## Smoke Test

### Commands

**JavaScript version (primary)**:
```bash
npm run atlas:smoke:semantic-loop           # Standard
npm run atlas:smoke:semantic-loop:verbose   # Detailed output
npm run atlas:smoke:semantic-loop:dry       # No writes
```

**TypeScript version** (for development):
```bash
npm run atlas:smoke:semantic-loop:ts        # Standard
npm run atlas:smoke:semantic-loop:ts:verbose
npm run atlas:smoke:semantic-loop:ts:dry
```

### Output

The test generates a JSON report at `.tmp/semantic-index-loop-smoke.json`:

```json
{
  "timestamp": "2026-06-26T01:04:06.630Z",
  "verbose": false,
  "dryRun": false,
  "checkpoints": {
    "query_cache_miss_trace": { "passed": true, "duration": 0 },
    "go_retrieval_candidates": { "passed": true, "duration": 0 },
    "candidates_join_packets": { "passed": true, "duration": 0 },
    // ... all 13 checkpoints
  },
  "errors": [],
  "summary": {
    "passed": 13,
    "total": 13,
    "passRate": "100.0%",
    "totalDuration": 53
  }
}
```

### Exit Codes

- **0**: Test passed (≥85% checkpoints)
- **1**: Test failed (<85% checkpoints)

## Integration Points

### 1. Query Cache Miss (Checkpoint 1)

Generate a unique `TraceId` for this query evaluation:

```typescript
import { createTraceId } from '$lib/server/semantic-loop/semantic-loop-types';
import { randomUUID } from 'crypto';

const traceId = createTraceId(randomUUID());
```

### 2. Go Retrieval (Checkpoint 2)

Call the gRPC retrieval service:

```typescript
import type { GoRetrievalResponse } from '$lib/server/semantic-loop/semantic-loop-types';

const response: GoRetrievalResponse = {
  traceId,
  query: userQuery,
  candidates: [...], // from gRPC :50053
  executionMs: 145,
  hitCount: 3,
};
```

### 3. Candidate Join (Checkpoint 3)

Join candidates to `atlas_packets` table:

```typescript
import { db } from '$lib/server/db/client';
import { atlasPackets } from '$lib/server/db/schema-postgres';
import { eq, inArray } from 'drizzle-orm';

const packets = await db.select().from(atlasPackets)
  .where(inArray(atlasPackets.sourceRef, candidateSourceRefs));
```

### 4. ACE Reader (Checkpoint 4)

Load canonical packet content:

```typescript
import type { AcePacketContent } from '$lib/server/semantic-loop/semantic-loop-types';

const packet: AcePacketContent = {
  packetKey: createPacketKey(row.packet_key),
  sourceRef: createSourceRef(row.source_ref),
  content: row.content,
  embeddingDim: 768,
  summary: row.summary,
  tokens: row.tokens,
  contentHash: row.content_hash,
};
```

### 5. ACE Validator (Checkpoint 5)

Check for prompt injection patterns:

```typescript
const INJECTION_PATTERNS = ['DROP TABLE', 'UNION SELECT', '<script>', '{{', '{%'];

const validPackets = packets.filter(p =>
  !INJECTION_PATTERNS.some(pat => p.content.includes(pat))
);
```

### 6. Context Assembler (Checkpoint 6)

Build bounded context for Gemma4:

```typescript
import type { AssembledContext } from '$lib/server/semantic-loop/semantic-loop-types';

const context: AssembledContext = {
  traceId,
  systemPrompt: 'You are a legal AI assistant...',
  packets: validPackets.slice(0, 3),
  bound: {
    maxTokens: 4096,
    estimatedTokens: 1200,
    hasRoom: true,
    packetsIncluded: 3,
    packetsExcluded: 0,
  },
  assemblyMs: Date.now() - start,
  formatted: validPackets.slice(0, 3).map(p => p.content).join('\n\n'),
};
```

### 7. Gemma4 Synthesis (Checkpoint 7)

Generate response with usage tracking:

```typescript
import { bifrostChat } from '$lib/server/ollama';
import type { Gemma4SynthesisContract } from '$lib/server/semantic-loop/semantic-loop-types';

const response = await bifrostChat([
  { role: 'system', content: context.systemPrompt },
  { role: 'user', content: userQuery },
], 'gemma4-rotorquant:latest', { temperature: 0.3, maxTokens: 1024 });

const synthesis: Gemma4SynthesisContract = {
  traceId,
  response: response.content,
  packetKeysUsed: context.packets.map(p => p.packetKey),
  featureIdsUsed: context.packets.map(() => createFeatureId('feature:id')),
  uncertainty: 0.15,
  tokensUsed: response.usage?.completion_tokens ?? 0,
  model: 'gemma4-rotorquant:latest',
  synthesisMs: Date.now() - start,
};
```

### 8. ACE Writer (Checkpoint 8)

Persist LLM output to Postgres:

```typescript
import { db } from '$lib/server/db/client';
import { aceOutputPackets } from '$lib/server/db/schema-postgres';

const result = await db.insert(aceOutputPackets).values({
  trace_id: traceId,
  llm_response: synthesis.response,
  packets_used: synthesis.packetKeysUsed,
  created_at: new Date(),
}).returning();
```

### 9. ACE Cache (Checkpoint 9)

Write to Valkey hot cache:

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
});

const cacheKey = `ace:context:${traceId}`;
await redis.hset(cacheKey, 'response', synthesis.response);
await redis.expire(cacheKey, 3600); // 1h TTL
```

### 10. Cache Hit (Checkpoint 10)

Verify cache works on second query:

```typescript
const cached = await redis.hget(cacheKey, 'response');
const hit = !!cached;
```

### 11. Materializer (Checkpoint 11)

Sync metadata to Qdrant/TurboVec:

```typescript
import { qdrantManager } from '$lib/server/vector/qdrant-manager';

await qdrantManager.updatePayloads('codebase_chunks_768', [
  {
    id: synthesis.packetKeysUsed[0],
    payload: {
      packet_key: synthesis.packetKeysUsed[0],
      trace_id: traceId,
      // ... other fields
    },
  },
]);
```

### 12. NES Chrom97 Topology (Checkpoint 12)

Update tile/topology cache:

```typescript
// Topology updates are handled automatically by the materializer
// Check cache invalidation via Redis:
await redis.del(`topology:tile:${packetKey}`);
```

### 13. Report (Checkpoint 13)

Report generation is automatic in the smoke test.

## Configuration

All configuration comes from `.env`:

```env
# Redis/Valkey
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis

# Gemma4 (LLM)
LLAMA_SERVER_URL=http://127.0.0.1:8090
LLAMA_SERVER_PATH=C:\Users\james\Desktop\llama-server-cuda\llama-server.exe
LLAMA_CACHE_TYPE_K=q8_0
LLAMA_CACHE_TYPE_V=q8_0
```

## Files

| File | Purpose |
|------|---------|
| `src/lib/server/semantic-loop/semantic-loop-types.ts` | Complete type definitions (670 lines) |
| `scripts/atlas/smoke-semantic-index-loop.mjs` | JavaScript smoke test (440 lines) |
| `scripts/atlas/smoke-semantic-index-loop.mts` | TypeScript smoke test with types (520 lines) |
| `.tmp/semantic-index-loop-smoke.json` | Generated report |

## Checklist for Implementation

When integrating each checkpoint, verify:

- [ ] Types are imported from `semantic-loop-types.ts`
- [ ] Branded types are created via helpers (`createTraceId`, etc.)
- [ ] Error handling captures checkpoint status
- [ ] Timing metrics are tracked (duration in ms)
- [ ] Smoke test passes at ≥85% checkpoint success

## Future Extensions

The type system supports:

1. **Audit Trail**: Full `SemanticLoopAuditTrail` aggregates all checkpoints
2. **Custom Handlers**: Each checkpoint can be hooked for observability
3. **Parallel Execution**: Checkpoints 11-12 can run in parallel
4. **Caching**: Checkpoint 9 uses Redis for repeated queries

## References

- [Semantic Loop Architecture](./SEMANTIC-LOOP-ARCHITECTURE.md) — design rationale
- [Redis Configuration](./REDIS-SETUP.md) — Valkey setup
- [Gemma4 Integration](./GEMMA4-FUNCTION-CALLING-INTEGRATION.md) — LLM calling
- [ACE Context Engine](./ACE-CONTEXT-ENGINE.md) — packet contract

## Support

For issues or questions:
- Run `npm run atlas:smoke:semantic-loop:verbose` for detailed output
- Check `.tmp/semantic-index-loop-smoke.json` for error details
- Review `semantic-loop-types.ts` for type contracts
