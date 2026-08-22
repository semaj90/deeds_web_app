# @deeds/parent-atlas-opencode

OpenCode CLI plugin for Parent Atlas GPU acceleration pipeline. Provides skills and commands for GPU-accelerated semantic search, packet analysis, and real-time GPU metrics.

The plugin is launcher-backed: the chat lane uses the local `llama-server.exe` configured by `scripts/launch-turboquant.ps1`, and the live model id is the basename of `ROTORQUANT_MODEL_PATH` / `TURBO_MODEL_PATH` (currently `gemma4-legal-iq4xs-direct.gguf`).

## Overview

Integrates Parent Atlas retrieval and identity contract into OpenCode/Claude Code, enabling:

- **@atlas search** — GPU-accelerated semantic search with Bifrost caching
- **@atlas analyze** — Deep packet lineage analysis (canonical truth + mirrors)
- **@atlas gpu-stats** — Real-time GPU metrics and cache statistics

## Installation

```bash
npm install @deeds/parent-atlas-opencode
```

## Setup

### 1. Add to opencode.jsonc

```jsonc
{
  "skills": [
    "packages/parent-atlas-opencode/skills/atlas-search/SKILL.md",
    "packages/parent-atlas-opencode/skills/atlas-analyze/SKILL.md",
    "packages/parent-atlas-opencode/skills/atlas-gpu-stats/SKILL.md"
  ]
}
```

### 2. Start OpenCode

```bash
claude code --opencode parent-atlas
```

If you are testing the agentic lanes locally, make sure `scripts/launch-turboquant.ps1` has started `llama-server` on `:8090` first.

## Skills

### @atlas search

GPU-accelerated semantic search with Bifrost L1/L2 caching and TurboVec prefiltering.

```
@atlas search "authentication validation" --top-k 10 --confidence 0.8
```

**Parameters:**
- `query` (required): Search text
- `--top-k`: Results to return (default: 5)
- `--confidence`: Minimum confidence threshold (default: 0.6)
- `--gpu`: Use GPU acceleration (default: true)
- `--prefilter`: Enable TurboVec prefiltering (default: true)

**Response includes:**
- Relevance scores (0.0-1.0)
- Embedding dimensions
- Source file + function symbol
- Cache hit status (L1/L2/L3)
- Latency breakdown

### @atlas analyze

Deep packet analysis with full lineage chain verification.

```
@atlas analyze "ace:packet:auth:001"
@atlas analyze "src/lib/server/ai/bifrost-provider.ts"
```

**Returns:**
- Identity chain (directory_path → packet_key)
- Postgres canonical row (all 23 columns)
- Qdrant payload (vector + metadata)
- Neo4j USED_CONCEPT edges
- Redis cache status (L1/L2/L3)
- Cold-storage manifest (if applicable)
- Lineage contract verification (errors if orphaned)

### @atlas gpu-stats

Real-time GPU and cache metrics.

```
@atlas gpu-stats
```

**Output:**
- CUDA availability (device name, compute capability)
- VRAM usage and pressure (OOM warning if >90%)
- Bifrost cache statistics (L1 hits, L2 hits, L3 cold)
- TurboVec prefilter stats (clusters visited, reduction %)
- LibTorch operation counts (similarity, clustering, attention)
- Simdjson parse speedups (vs V8 JSON.parse)
- Temperature and throttling status

## Configuration

### Environment Variables

```bash
# GPU acceleration
CUDA_VISIBLE_DEVICES=0                    # GPU device index

# Cache services
BIFROST_OPENAI_BASE_URL=http://127.0.0.1:3040/v1
TURBOVEC_SIDECAR=http://127.0.0.1:8792
QDRANT_URL=http://127.0.0.1:6333
```

### Required Services

- Redis :6379 (Bifrost L1)
- Bifrost :3040 (L2 semantic cache)
- TurboVec :8792 (prefilter)
- Qdrant :6333 (vector store)
- Neo4j :7687 (topology)
- TurboQuant :8090 or Ollama :11434 (L3 fallback)

## Architecture

```
OpenCode Chat
  ↓
atlas-search skill
  ├─ bifrostChat() → L1 Redis + L2 Qdrant
  ├─ turbovecPrefilter() → SOM cluster routing
  ├─ turbovecRerank() → 4-signal GPU blend
  └─ batchCosineSimilarity() → LibTorch GPU

atlas-analyze skill
  ├─ Postgres SELECT (canonical truth)
  ├─ Qdrant GET (payload + vector)
  ├─ Neo4j MATCH USED_CONCEPT (edges)
  ├─ Redis GET (cache status)
  └─ verifyLineageContract() (validation)

atlas-gpu-stats skill
  └─ Queries tensorrt_bridge.node + Redis + services
```

## Performance

| Operation | Latency | Speedup |
|-----------|---------|---------|
| L1 search | 5ms | 6,542× |
| L2 search | 2-5s | 5-10× |
| Prefilter | 50ms | 5× |
| Rerank (1000) | 25ms | 100× |
| Analyze | <100ms | — |

## Troubleshooting

### Skill not available in OpenCode

1. Verify opencode.jsonc includes skill paths
2. Check skill files exist: `ls packages/parent-atlas-opencode/skills/*/SKILL.md`
3. Restart OpenCode: `claude code --opencode parent-atlas`

### GPU acceleration disabled

1. Check CUDA: `@atlas gpu-stats` → look for "CUDA available: NO"
2. Verify tensorrt_bridge.node exists: `ls packages/parent-atlas-retrieval/native/`
3. Check env: `echo $CUDA_VISIBLE_DEVICES`

### Search returns empty results

1. Verify Qdrant is running: `curl http://127.0.0.1:6333`
2. Check codebase indexed: `@atlas gpu-stats` → Qdrant points count
3. Try simpler query: `@atlas search "function"`

## Development

```bash
# Build the plugin
npm run build -w @deeds/parent-atlas-opencode

# Add new skill:
# 1. Create packages/parent-atlas-opencode/skills/new-skill/SKILL.md
# 2. Add to opencode.jsonc skills array
# 3. Implement handler in packages/parent-atlas-opencode/src/commands/
```

## See Also

- [@deeds/parent-atlas-retrieval](../parent-atlas-retrieval/README.md) — GPU pipeline API
- [@deeds/parent-atlas-core](../parent-atlas-core/README.md) — Identity contract
- [docs/PARENT-ATLAS-PACKAGE-INTEGRATION.md](../../docs/PARENT-ATLAS-PACKAGE-INTEGRATION.md) — Integration guide

## License

MIT
