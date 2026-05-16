# ACE Startup & CUDA Bridge Infrastructure Guide

> **Status**: Verified Operational (2026-05-15)
> **Stack**: SvelteKit 2 + N-API (LibTorch + simdjson) + Port 8101 Topology Server

## Serialization Matrix (gRPC vs JSON vs N-API)

The system uses multiple high-performance transport and serialization paths. These must not be confused.

| Path | Transport | Serialization | Native Bridge Role |
| :--- | :--- | :--- | :--- |
| **gRPC** | HTTP/2 | Protobuf binary | None; handled by `@grpc/grpc-js` |
| **Ollama / TurboQuant** | HTTP/1.1 | JSON text | `simdjson` fast validation / parsing |
| **LibTorch Reranker** | N-API | TypedArrays / binary | Tensor scoring / attention reranking |

### Avoidance Rules
Do **NOT** use `fastJsonParse` on:
- gRPC streams
- Protobuf buffers
- TypedArray tensor payloads

**DO** use `fastJsonParse` for:
- Large Ollama / TurboQuant JSON synthesis responses (especially > 1 KB).
- This reduces V8 JSON parsing overhead and garbage collection pressure.

## Native Bridge Resolution (`.node`)

Both LibTorch and simdjson helpers are typically exposed through a single N-API addon.

- **Path**: `simd-bridge/cpp/build/Release/tensorrt_bridge.node`
- **Fallback**: If the file is missing, ACE must fall back to CPU logic. Diagnostics should clearly indicate that native acceleration is disabled.

## Startup Failure Prevention Checklist

### 1. Environment Initialization
`src/lib/server/env.server.ts` must call `dotenv` setup before reading service URLs. Standalone scripts (npx tsx, node) may not inherit SvelteKit's environment-loading behavior.

```typescript
import dotenv from 'dotenv';
dotenv.config();
```

### 2. Service Sequencing
Startup must validate in this order:
1. **L1**: Start Topology Search Server (`:8101`).
2. **L2**: Verify LibTorch bridge load.
3. **L3**: Confirm CouchDB inference log connectivity (`:5984`).
4. **L4**: Confirm Postgres proxy connectivity (`:5434`).
5. **L5**: Confirm optional TurboQuant / llama-server connectivity (`:8090`).

## Port Registry

| Port | Service | Required | Notes |
| :--- | :--- | :--- | :--- |
| **5434** | Postgres Proxy | **Yes** | Required for database-backed ACE / Atlas / Graphify |
| **8101** | Topology Search | **Yes** | Required for manifold-aware routing |
| **5984** | CouchDB | **Yes** | Required for inference logs |
| **8090** | TurboQuant | Optional | GPU boost / local model endpoint |
| **8788** | TRACE MCP | Context | Required for MCP tool calling |

## Verification Commands

- **LibTorch Bridge**: `npx tsx scratch/verify-libtorch.mjs`
- **Topology Search**: `node scripts/ensure-search-engine.mjs --spawn`
- **Hypergraph Routing**: `npm run smoke:hypergraph-routing`
- **Graphify Daily**: `npm run graphify:daily`

> [!IMPORTANT]
> `ECONNREFUSED 127.0.0.1:5434` is almost always a Postgres availability or Docker port-mapping issue, not a CUDA or MCP error.
