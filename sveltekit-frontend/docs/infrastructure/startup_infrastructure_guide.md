# ACE Startup Infrastructure & CUDA Bridge Wiring

> **Status**: Verified Operational (2026-05-15)
> **Stack**: SvelteKit 2 + N-API (LibTorch + simdjson) + Port 8101 Topology Server

## 🛠 LibTorch CUDA Bridge: The Path Regression Trap

The LibTorch reranker uses a native N-API bridge (`tensorrt_bridge.node`) for sub-millisecond GPU attention scoring. Due to the deep nesting of server-side AI services, pathing to this binary is a frequent point of failure.

### The Regression (Fixed)
- **Problem**: `src/lib/server/ai/libtorch-reranker.ts` was using `../../../../` to resolve the project root.
- **Root Cause**: From `src/lib/server/ai/`, 4 levels only reaches `sveltekit-frontend/`. The native bridge lives in `simd-bridge/` at the monorepo root.
- **Fix**: Upgraded to 5 levels: `../../../../../simd-bridge/...`

### Recommendations for Future Wiring
1. **Prefer `process.cwd()` for Absolute Resolution**:
   - For scripts or services that run from the `sveltekit-frontend` directory, use `path.resolve(process.cwd(), '../simd-bridge/...')`.
   - This is more robust than relative `require()` paths which depend on the source file's location.
2. **Implement Silent Fallbacks with Warnings**:
   - Always wrap native `require` in `try/catch`.
   - Log a `console.warn` (not `error`) if the bridge is missing, allowing the system to "fail-open" to CPU logic instead of crashing the process.
3. **Add Diagnostic Metadata**:
   - Use `logInference` or `ollama-diag` to surface whether a "native" or "fallback" path was taken.

---

## 🛰 gRPC vs. JSON (simdjson)

The system utilizes two distinct high-performance paths in the native bridge. It is critical not to confuse their serialization formats:

| Protocol | Transport | Serialization | native Bridge Role |
| :--- | :--- | :--- | :--- |
| **gRPC** | HTTP/2 | Protobuf (Binary) | None (Handled by `@grpc/grpc-js`) |
| **Ollama** | HTTP/1.1 | JSON (Text) | **simdjson** (Fast validation/parsing) |
| **LibTorch** | N-API | TypedArrays (Binary) | **TensorRT/Attention** (Reranking) |

### Avoidance Strategies
- **Do NOT** use `fastJsonParse` on gRPC streams or Protobuf buffers. gRPC handles its own binary deserialization.
- **DO** use `fastJsonParse` for Ollama's large synthesis responses (>1 KB) to reduce V8 GC pressure.
- **Native Memory**: Both LibTorch and simdjson share the same `.node addon`. If one fails to load, both are lost. Ensure the build artifact exists in `simd-bridge/cpp/build/Release/`.

---

## 📊 Vector Storage & Parity Audits

The system uses a **Hybrid Vector Triad**:
- **Qdrant**: Primary high-speed ANN search (Port 6333).
- **Postgres (pgvector)**: Ground truth for metadata enrichment and relational joins (Port 5434).
- **Redis**: Low-latency cache for "warm" topological context.

### Parity Maintenance
To ensure the manifold reasoning loop is grounded in consistent data, PostgreSQL must be a bit-perfect mirror of Qdrant payloads (especially `gpu_cluster` and `som_cluster` IDs).

- **Audit**: `node scripts/audit-parity.mjs` (Sampled check).
- **Repair**: `scripts/mirror-qdrant-to-postgres.ts` (Batch worker).

**Warning**: If the audit detects >5% GPU cluster mismatch, the hypergraph seeder may produce drift in legal reasoning clusters. Run the mirror worker to re-sync.

---

## 🚀 Startup Failure Prevention Checklist

To ensure the ACE manifold stays operational, follow these wiring priorities:

1. **Environment Initialization**:
   - `src/lib/server/env.server.ts` MUST call `dotenv.config()` first.
   - Without this, standalone scripts (`npx tsx`) fail to find DB passwords and service URLs.
2. **Service Sequencing**:
   - **L1**: Start `topology-search-server.mjs` (Port 8101).
   - **L2**: Verify `LibTorch` bridge load.
   - **L3**: Confirm `CouchDB` (Inference Log) connectivity.

### Port Checklist
- `:5434` -> Postgres Proxy (Required)
- `:8101` -> Topology Search (Required for Routing)
- `:5984` -> CouchDB (Required for Logs)
- `:8090` -> TurboQuant (Optional GPU Boost)

---

## 🧪 Verification Commands
```powershell
# Verify LibTorch Bridge
npx tsx scratch/verify-libtorch.mjs

# Verify Topology Search
node scripts/ensure-search-engine.mjs --spawn

# Verify Hypergraph Routing
npm run smoke:hypergraph-routing
```
