# Topology Server Integration Analysis — Session 98

**Date**: June 30, 2026  
**Status**: ✅ COMPLETE  
**Finding**: Port 8101 topology search has been superseded by TurboVec sidecar architecture

---

## Executive Summary

Port 8101 (legacy topology search server) is **no longer required** for Phase C Option B execution. The topology prefilter role has been replaced by a more efficient **TurboVec sidecar** that provides 4-bit quantized ANN prefiltering with graceful CPU fallback.

---

## Port 8101: Legacy Topology Search

### Status: **DECOMMISSIONED (but port repurposed)**

- **Port 8101** is now part of the dynamic port pool (`enhanced-rag` service range :8100–:8109)
- The dedicated topology search server is no longer running
- Topology prefiltering is now handled by **TurboVec sidecar** (:8792–:8793)

### Original Role (Pre-Phase C)

- L1 manifold 4D prefilter (reduce Qdrant searches from 40.5K points → 5-500 pre-filtered candidates)
- Saved ~33% latency on retrieval pipeline
- Offered spatial locality for GPU clustering

### Why Replaced?

1. **TurboVec is more flexible**: Supports both HTTP (:8793) and gRPC (:50062) transports
2. **Better quantization**: 4-bit ANN (TurboQuantIndex) vs fixed spatial grid
3. **Graceful CPU fallback**: If offline, system degrades to full-dimensional search (not hard failure)
4. **Integrated with Go Retrieval**: Part of the broader Go retrieval microservice ecosystem

---

## TurboVec Sidecar: New Architecture

### Service Endpoints

| Endpoint | Transport | Purpose | Port |
|----------|-----------|---------|------|
| `/prefilter` | HTTP POST | Returns top cluster IDs for Qdrant `must` filter | 8793 |
| `/search` | HTTP POST | Returns top-K ANN candidates with 4-bit quantization | 8793 |
| `/health` | HTTP GET | Service health check | 8793 |
| `turbovecGrpcSearch()` | gRPC | Fallback search via N-API gRPC bridge | 50062 |
| `:8792` | JSON-RPC | Alternative endpoint (env-configurable) | 8792 |

### Integration Points

**1. ace-prompt-preflight.ts** (line 13)
```typescript
import { turbovecPrefilter, turbovecSearch } from '$lib/server/retrieval/turbovec-prefilter.js';
```
- Calls `turbovecPrefilter()` with 250ms timeout
- Returns top cluster IDs for injecting into Qdrant `must` filter
- Gracefully degrades to empty result if offline

**2. agent-worker.ts**
```typescript
const [prefilter, search] = await Promise.all([
  turbovecPrefilter(queryEmbedding, { topClusters: 5, timeoutMs: 250 }),
  turbovecSearch(queryEmbedding, { topK: 200, timeoutMs: 300 })
]);
```
- Parallel `/prefilter` + `/search` calls
- Timeout: 250ms for prefilter, 300ms for search
- Graceful fallback on network/service failure

**3. turbovec-prefilter.ts** (implementation)
- HTTP client wrapping `/prefilter` and `/search` endpoints
- Configurable timeouts (prefilter: 250ms, search: 300ms)
- Optional gRPC fallback if `TURBOVEC_SIDECAR_GRPC_ENABLED=true`
- Empty result fallback: `{ clusterIds: [], backend: 'offline', durationMs: ... }`

### Configuration

```typescript
// env.server.ts
TURBOVEC_SIDECAR: 'http://127.0.0.1:8793'              // Primary HTTP endpoint
TURBOVEC_SIDECAR_GRPC_URL: '127.0.0.1:50062'           // gRPC fallback
TURBOVEC_SIDECAR_GRPC_ENABLED: false                    // gRPC disabled by default
```

### Technology Stack

- **Language**: Python 3.9+ (FastAPI + HTTP server)
- **Core Library**: `turbovec` (4-bit quantization library)
- **Dependencies**: numpy, turbovec wheel, FastAPI (optional)
- **Performance**: 
  - Prefilter: ~10-50ms (reduce 40.5K → 500 candidates)
  - Search: ~50-150ms (top-K ANN on 4-bit vectors)
  - **Fallback**: Full Qdrant ANN if offline (~100-300ms)

---

## Phase C Option B: Service Requirements Update

### Required Services (UPDATED)

| Service | Port | Required? | Fallback? | Status |
|---------|------|-----------|-----------|--------|
| Valkey/Redis | 6379 | **YES** | No | ❌ DOWN |
| Postgres | 5432 | **YES** | No | ✅ OPERATIONAL |
| Qdrant | 6333 | **YES** | No | ✅ OPERATIONAL |
| Ollama | 11434 | **YES** | No | ✅ OPERATIONAL |
| TurboQuant | 8090 | **YES** | No | ✅ OPERATIONAL |
| tensorrt_bridge | N-API | **YES** | CPU | ✅ OPERATIONAL |

### Optional Services (UPDATED)

| Service | Port | Purpose | Fallback? | Status |
|---------|------|---------|-----------|--------|
| TurboVec | 8793 | 4-bit ANN prefilter | Yes (full-dim ANN) | ⏳ OFFLINE |
| Langfuse | 3000 | External tracing | Yes (no traces) | ⏳ NOT NEEDED |
| ClickHouse | 9000 | Analytics DB | Yes (Postgres) | ⏳ NOT NEEDED |

### Pre-Execution Checklist: Updated Commands

```bash
# Step 1: Verify service status
echo "=== Service Status ===" && \
curl -s http://127.0.0.1:6333/health && echo "✅ Qdrant" || echo "❌ Qdrant" && \
redis-cli -p 6379 --pass redis ping && echo "✅ Valkey" || echo "❌ Valkey" && \
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db -c "SELECT 1" && echo "✅ Postgres" || echo "❌ Postgres" && \
curl -s http://127.0.0.1:11434/api/tags | jq .models > /dev/null && echo "✅ Ollama" || echo "⏳ Ollama" && \
curl -s http://127.0.0.1:8090/health | jq .model > /dev/null && echo "✅ TurboQuant" || echo "⏳ TurboQuant" && \
curl -s http://127.0.0.1:8793/health > /dev/null && echo "✅ TurboVec" || echo "⏳ TurboVec (optional)"

# Step 2: Start Valkey (if down)
docker-compose up legal-ai-valkey

# Step 3: Create telemetry tables
npm run db:migrate

# Step 4: Run validation tests
npx tsx scripts/tests/test-cuda-graph-rerank-integration.mts
npx tsx scripts/tests/test-e2e-latency.mts
npm run bench:cuda-graph-cache:quick

# Step 5: All green → Proceed to Phase C Option B
npm run phase-c:part1:provenance
```

---

## Retrieval Pipeline: TurboVec Integration

### Flow (With TurboVec Online)

```
User Query
  ↓
Embed query (Ollama, 768-dim, 20ms)
  ↓
TurboVec /prefilter (4-bit, 10ms) → top cluster IDs
  ↓
Qdrant ANN with cluster filter (50ms, 500 candidates instead of 40.5K)
  ↓
GPU rerank (1-10ms)
  ↓
Return results
```
**Total**: ~90ms (33% faster than full-dim ANN)

### Flow (TurboVec Offline — Graceful Fallback)

```
User Query
  ↓
Embed query (Ollama, 768-dim, 20ms)
  ↓
TurboVec /prefilter → timeout/offline → return { clusterIds: [], backend: 'offline' }
  ↓
Qdrant ANN (full 768-dim, 100-150ms, no cluster filter)
  ↓
GPU rerank (1-10ms)
  ↓
Return results (same correctness, ~30% slower)
```
**Total**: ~120-180ms (accurate but slower)

---

## Decision Matrix for Phase C Option B

### Go/No-Go: PROCEED WITHOUT TurboVec

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Valkey running | ❌ FAIL | Must start before Phase C |
| Postgres ready | ✅ PASS | Tables created, 58K packets |
| Qdrant ready | ✅ PASS | 40.5K embedded chunks |
| GPU bridge ready | ✅ PASS | tensorrt_bridge.node operational |
| TurboVec required? | ❌ NO | Optional; graceful fallback works |
| Topology search required? | ❌ NO | Replaced by TurboVec (optional) |

**Recommendation**: **Start Phase C Option B NOW**, but address Valkey startup as the first blocker.

---

## References

- `PHASE-C-OPTION-B-PRE-EXEC-CHECKLIST.md` — Updated pre-execution steps
- `SESSION-98-PHASE-C-OPTION-B-READINESS.md` — Updated service dependency checklist
- `src/lib/server/retrieval/turbovec-prefilter.ts` — TurboVec client implementation
- `scripts/turbovec-sidecar.py` — Python sidecar (in worktree)
- `src/lib/server/ai/ace-prompt-preflight.ts` — Integration point #1
- `src/lib/server/ai/agent-worker.ts` — Integration point #2

---

## Summary

**Port 8101 is decommissioned. Phase C Option B can proceed without it.**

The legacy topology search server has been replaced by TurboVec sidecar (:8793) for more flexible and efficient prefiltering. TurboVec is optional; if offline, the system degrades gracefully to full-dimensional Qdrant ANN search with ~30% latency penalty but no loss of correctness.

**Blocking Issue**: Valkey (:6379) MUST be started before Phase C execution. All other services are operational.

**Next Step**: Execute `docker-compose up legal-ai-valkey` and proceed with Phase C Option B.
