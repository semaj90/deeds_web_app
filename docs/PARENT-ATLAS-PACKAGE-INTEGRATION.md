# Parent Atlas Package Integration Guide

## Overview

Parent Atlas currently spans 6 workspace package surfaces:

- `@deeds/atlas-core` — Canonical packet contracts, validation, RPC, GPU types
- `@deeds/parent-atlas` — CLI, audits, adapters, cache/mapreduce orchestration
- `@deeds/parent-atlas-core` — Identity / schema / adapter bridge layer
- `@deeds/parent-atlas-retrieval` — Bifrost, TurboVec, GPU/SIMD retrieval bridges
- `@deeds/parent-atlas-ingest` — Repository scanning, AST parsing, packet generation
- `@deeds/parent-atlas-opencode` — OpenCode CLI skills and commands

## Package Structure

### atlas-core

**Exports**: Canonical packet identity contract, validation gates, RPC contracts, GPU types

```typescript
import { PacketIdentitySchema, HyperRagRequestSchema } from '@deeds/atlas-core';
```

### parent-atlas-core

**Exports**: Identity bridge, schema adapters, lineages, canonical Postgres helpers

```typescript
import { IDENTITY_CONTRACT, verifyLineageContract } from '@deeds/parent-atlas-core';
```

### parent-atlas-retrieval

**Exports**: Bifrost semantic cache, TurboVec prefilter/reranking, GPU operations

```typescript
import {
  bifrostChat,          // L1/L2 semantic cache
  turbovecPrefilter,    // SOM-aware cluster routing
  turbovecRerank,       // 4-signal GPU blend
  batchCosineSimilarity, // LibTorch GPU similarity
  fastJsonParse,        // Rust SIMD JSON parsing
} from '@deeds/parent-atlas-retrieval';
```

### parent-atlas-opencode

**Exports**: OpenCode CLI skills and command implementations

Skills available in OpenCode:
- `@atlas search` — GPU-accelerated semantic search
- `@atlas analyze` — Deep packet analysis (lineage, mirrors, relationships)
- `@atlas gpu-stats` — Real-time GPU metrics

## Migration Steps

### 1. Update root package.json

Add workspaces:

```json
{
  "workspaces": [
    "packages/atlas-core",
    "packages/parent-atlas",
    "packages/parent-atlas-core",
    "packages/parent-atlas-retrieval",
    "packages/parent-atlas-ingest",
    "packages/parent-atlas-opencode"
  ]
}
```

### 2. Update SvelteKit imports

**Before** (scattered imports):
```typescript
import { bifrostChat } from '$lib/server/ai/bifrost-provider';
import { turbovecPrefilter } from '$lib/server/retrieval/turbovec-prefilter';
import { batchCosineSimilarity } from '$lib/server/gpu/libtorch-bridge';
import { TurboVecMetadata } from '$lib/server/vector/turbovec-contract';
```

**After** (unified imports):
```typescript
import {
  bifrostChat,
  turbovecPrefilter,
  batchCosineSimilarity,
  TurboVecMetadata,
} from '@deeds/parent-atlas-retrieval';
import { PacketIdentitySchema } from '@deeds/atlas-core';
import { IDENTITY_CONTRACT } from '@deeds/parent-atlas-core';
```

### 3. Update tsconfig paths (optional)

Add path aliases for convenience:

```json
{
  "compilerOptions": {
    "paths": {
      "@atlas/*": ["packages/atlas-core/dist/*"],
      "@atlas-retrieval/*": ["packages/parent-atlas-retrieval/dist/*"],
      "@atlas-core/*": ["packages/parent-atlas-core/dist/*"]
    }
  }
}
```

### 4. Build packages

```bash
npm install                    # Install workspace deps
npm run build --workspaces     # Build all packages
npm run build -w @deeds/parent-atlas-retrieval  # Single package
```

### 5. Wire API routes

Update SvelteKit route handlers to use package imports:

```typescript
// src/routes/api/atlas/search/+server.ts
import { bifrostChat, turbovecPrefilter, batchCosineSimilarity } from '@deeds/parent-atlas-retrieval';
import { IDENTITY_CONTRACT } from '@deeds/parent-atlas-core';

export async function POST({ request }) {
  const { query } = await request.json();
  
  // Bifrost L1/L2 + TurboVec prefilter + GPU reranking
  const results = await bifrostChat(query, {
    prefilter: turbovecPrefilter,
    rerank: batchCosineSimilarity,
  });
  
  return json(results);
}
```

## Performance Expectations

| Stage | Baseline | GPU | Speedup |
|-------|----------|-----|---------|
| L1 Redis exact | 5ms | 5ms | 1× |
| L2 Bifrost semantic | 2-5s | 2-5s | 1× (network-bound) |
| TurboVec prefilter | 250ms | 50ms | 5× |
| Reranking (1000 items) | 2.5s | 25ms | **100×** |
| JSON parsing (100KB) | 12ms | 2.4ms | 5× |

## API Contract

### Bifrost

```typescript
interface BifrostRequest {
  messages: { role: string; content: string }[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  cacheThreshold?: number;  // 0.8 default
}

interface BifrostResponse {
  content: string;
  cacheHit?: 'l1' | 'l2' | 'l3';
  latencyMs: number;
  trace?: BifrostTraceRecord;
}
```

### TurboVec Prefilter

```typescript
interface TurboVecPrefilterRequest {
  vector: Float32Array;
  topClusters: number;
  timeout?: number;  // 250ms default
}

interface TurboVecPrefilterResponse {
  clusterIds: number[];
  centroidScores: number[];
  reduction: number;  // % reduction from full candidate set
}
```

### GPU Similarity

```typescript
function batchCosineSimilarity(
  queryVector: Float32Array,
  candidateVectors: Float32Array[],
  options?: { batchSize?: number; async?: boolean }
): Promise<number[]>;
```

## Testing

```bash
# Test specific package
npm test -w @deeds/parent-atlas-retrieval

# Test all packages
npm test --workspaces

# Run Bifrost cache tests
npm test -- bifrost-semantic-cache.spec.ts
```

## OpenCode Integration

### Add to opencode.jsonc

```jsonc
{
  "instructions": [
    ".opencode/system.md"
  ],
  "skills": [
    "packages/parent-atlas-opencode/skills/atlas-search/SKILL.md",
    "packages/parent-atlas-opencode/skills/atlas-analyze/SKILL.md",
    "packages/parent-atlas-opencode/skills/atlas-gpu-stats/SKILL.md"
  ],
  "models": {
    "gemma4-legal-iq4xs-direct.gguf": {
      "tools": true,
      "reasoning": false,
      "limit": { "context": 65536, "output": 8192 }
    }
  }
}
```

### Use in OpenCode Chat

```
@atlas search "authentication validation"
@atlas analyze "ace:packet:auth:001"
@atlas gpu-stats
```

## Troubleshooting

### "Module not found: @deeds/parent-atlas-retrieval"

Ensure workspace is installed:
```bash
npm install
npm run build -w @deeds/parent-atlas-retrieval
```

### CUDA not available

Check tensorrt_bridge.node is present and N-API loads:
```bash
node -e "const addon = require('@deeds/parent-atlas-retrieval/native/tensorrt_bridge.node'); console.log(addon.isCudaAvailable());"
```

### Bifrost L3 fallback not working

Verify TurboQuant or Ollama is running:
```bash
curl http://127.0.0.1:8090/health  # TurboQuant
curl http://127.0.0.1:11434/api/tags  # Ollama
```

## Next Steps

1. ✅ Consolidation structure created (4 packages)
2. ⏳ Run `npm install && npm run build --workspaces`
3. ⏳ Update SvelteKit route imports (src/routes/api/atlas/*)
4. ⏳ Wire OpenCode skills to opencode.jsonc
5. ⏳ Test integration: `npm test --workspaces`
6. ⏳ Publish packages: `npm publish --workspace --registry=...` (internal or npm)

## See Also

- [docs/GPU-ACCELERATION-REVIEW-PARENT-ATLAS.md](GPU-ACCELERATION-REVIEW-PARENT-ATLAS.md) — Technical deep dive
- [docs/GPU-ACCELERATION-WIRING-CHECKLIST.md](GPU-ACCELERATION-WIRING-CHECKLIST.md) — 6 stages + 7 gates
- [docs/PARENT-ATLAS-CONSOLIDATION-INVENTORY.md](PARENT-ATLAS-CONSOLIDATION-INVENTORY.md) — File mapping
