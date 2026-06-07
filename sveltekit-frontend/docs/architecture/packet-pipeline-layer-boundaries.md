# Packet Pipeline — Layer Boundaries

## Processing Order

```
EmbeddingGemma 384/768 float32
  ↓  (Ollama /api/embed or ONNX client)
Autoencoder compresses semantic vector
  ↓  768 → 384 → 128 → 64  (PyTorch ae:train)
SOM 20×20 assigns topology cell
  ↓  som_row, som_col, som_cluster, som_cell  (uint16 0–399)
TurboVec / RotorQuant compresses latent vector
  ↓  float32[64] → int8[64] → int4/int2 packed later
CUDA GEMM or distance kernel for batch scoring
  ↓  (RTX 3060 Ti via tensorrt_bridge.node)
Qdrant payload + Valkey hot cache
```

## dtype Rules

| Purpose | Type | Notes |
|---------|------|-------|
| IDs, hashes, sourceRefs | `u64` / `BigUint64Array` | XxHash64 seed 42 |
| Compressed vector math | `int8` | 64-dim latent only |
| Training, autoencoder, original embeddings | `float32` / `float16` | GPU training paths |
| SOM cell IDs | `uint16` | 0–399 (20×20 grid) |

**Never use u64 for vector math. Never use SOM for quantization.**

## Layer Responsibilities

### Rust N-API (`crates/turbovec-napi`)
- `hashSourceRefs()` → `BigUint64Array` (u64 IDs)
- `dedupeEdgesJson()` → deduplicated edge list
- `scoreSom20X20()` → `Float32Array` proximity scores
- `loadJsonlPackets()` → JSON string from JSONL file
- `packQdrantPayloads()` → MessagePack `Buffer`
- `turbovecSmoke()` → exercises `turbovec` quantization crate

**Hot packet math only. Never opens a network socket.**

### TypeScript bridge (`src/lib/server/packet-pipeline.ts`)
- Wraps N-API with lazy load + JS fallbacks
- All callers import from here, never from wrapper.js directly

### Valkey (`redis.ts`)
- Hot semantic cache: `ace:node:*`, `bifrost:semantic:*`
- Packet lookup by u64 hash key
- `gpu:karpathy:scores`, `ace:topo:{class}:{hash}`

### Qdrant (`qdrant-manager.ts`)
- ANN vector search, 768-dim
- Payload filters: `feature_ids`, `lane_ids`, `som_cluster`, `som_row`, `som_col`
- Receives MessagePack payloads from `packQdrantPayloads()`

### Neo4j
- Contextual trees: route → service → schema paths
- Louvain community detection
- `SIMILAR_TOPOLOGY`, `IMPORTS`, `CALLS` edge types
- SOM coords as `HAS_DIRECTORY_SUMMARY` edge properties

### PyTorch / Autoencoder
- `ae:train`: 768 → 384 → 128 → 64 latent compression
- SOM training on latent64
- Produces `latent_hash` (u64) per node
- Output stored in Qdrant payload + `gpu:karpathy:encoded` Redis hash

### LangGraph (`langgraph-client.ts`)
- Orchestration only — never writes to DB directly
- Calls Bifrost for inference, packet-pipeline for packet math

### BitFrost (`bifrost-provider.ts`)
- OpenAI-compatible gateway: `http://127.0.0.1:3040/v1`
- Routes to TurboQuant `:8090` via provider `openai`
- L1 exact-match + L2 semantic cache before inference
- **Do not use `provider: turboquant_backend`** — use `provider: openai` + `base_url`

### DuckDB / CouchDB
- Offline joins, MapReduce analytics over NDJSON/Parquet
- Append-only cold archive, audit packets, historical traces

## Core Packet Flow

```
sourceRef / AST node / route hit
  ↓
NES-Chrom JSON packet
  ↓
packet-pipeline.ts:
  hashSourceRefs()        → u64 Valkey key
  dedupeEdges()           → clean edge list for Neo4j
  scoreSom20X20()         → proximity boost for rerank
  packQdrantPayloads()    → MsgPack Buffer → Qdrant upsert
  ↓
Valkey hot cache (ace:node:{u64})
  ↓
Qdrant upsert / ANN search
  ↓
Neo4j edge sync (BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY)
  ↓
DuckDB / CouchDB offline archive
```

## Autoencoder + Clustering Flow

```
EmbeddingGemma vector (768-dim float32)
  ↓  PyTorch ae:train
latent64 (float32[64])
  ↓  SOM 20×20 fit
som_row, som_col, som_cluster (uint16)
  ↓  TurboVec quantize
int8[64] compressed representation
  ↓
Qdrant payload:
  sourceRef, feature_ids, lane_ids
  somRow, somCol, som_cluster
  latent_hash (u64)
```

## What NOT to put in Rust N-API

- Database connections (Qdrant, Neo4j, Valkey) — use their TypeScript clients
- CUDA GEMM — stays in `crates/omni-bridge` + `simd-bridge/cpp/`
- Autoencoder training — PyTorch process
- Graph traversal — Neo4j Cypher
- Orchestration logic — LangGraph / TypeScript

## Quantizer Selection

Primary: **TurboVec int8 latent64** (this crate)  
Future benchmark: RotorQuant  
**Pick one primary quantizer. Do not run TurboVec + RotorQuant + SOM as competing quantizers.**
