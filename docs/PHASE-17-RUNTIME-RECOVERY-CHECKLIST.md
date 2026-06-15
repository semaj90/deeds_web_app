# Phase 17 Runtime Recovery Checklist

**Status**: Runtime service wiring recovery in progress  
**Target**: June 15-18, 2026  
**Priority**: High (blocks GPU acceleration deployment)

## Current Status

| Service | Port | Status | Priority |
|---------|------|--------|----------|
| Bifrost | 3040 | ✓ Operational | Core L2 cache |
| Ollama | 11434 | ✓ Operational | L3 fallback |
| TurboQuant | 8090 | ✓ Operational | TurboQuant LLM |
| Qdrant | 6333 | ✗ Down | Vector storage |
| Redis | 6379 | ? Docker only | L1 exact cache |
| CUDA | N/A | ✓ Available | GPU acceleration |

**CUDA Device**: RTX 3060 Ti, 8 GB VRAM  
**N-API Binary**: tensorrt_bridge.node (368 KB) ✓ Ready

## Action Items

### 1. Fix Root Workspace Configuration ✓

**Status**: DONE

Added `"workspaces"` to root `package.json`:

```json
{
  "workspaces": [
    "packages/parent-atlas-core",
    "packages/parent-atlas-retrieval",
    "packages/parent-atlas-ingest",
    "packages/parent-atlas-opencode"
  ]
}
```

### 2. Recover Qdrant Service

**Status**: TODO

Qdrant (:6333) is not responding. This is required for:
- Bifrost L2 semantic caching (reads from Qdrant)
- TurboVec prefilter (cluster routing via SOM)
- Search operations (vector similarity)

**Recovery steps:**

```bash
# 1. Check if Qdrant container is running
docker ps | grep qdrant

# 2. If down, start it
docker-compose up -d qdrant

# 3. Verify health
curl http://127.0.0.1:6333/health

# 4. Confirm collections exist
curl http://127.0.0.1:6333/collections | jq '.result | length'
```

**Expected output**: 
- Collections ≥ 58 (codebase_chunks_768, legal_documents, etc.)
- Health endpoint returns `{"status": "ok"}`

### 3. Verify Redis Access

**Status**: READY (Docker)

Redis is only accessible via Docker since redis-cli is not in PATH. This is normal.

**Access via Docker:**

```bash
# Check Redis health
docker exec legal-ai-redis redis-cli PING

# Check Redis memory
docker exec legal-ai-redis redis-cli INFO memory | grep used_memory_human

# Flush test data (if needed)
docker exec legal-ai-redis redis-cli FLUSHDB
```

**Expected**: PONG response and memory usage < 2 GB

### 4. Install and Build Packages

**Status**: TODO

```bash
# 1. Install workspace dependencies
npm install

# 2. Build core package (no external deps)
npm run build -w @deeds/parent-atlas-core

# 3. Build retrieval package (depends on core)
npm run build -w @deeds/parent-atlas-retrieval

# 4. Build ingest package (depends on core)
npm run build -w @deeds/parent-atlas-ingest

# 5. Build OpenCode package (depends on core + retrieval)
npm run build -w @deeds/parent-atlas-opencode

# Optional: Build all at once
npm run build --workspaces
```

**Expected**: All packages compile to `dist/` with 0 TypeScript errors

### 5. Verify GPU Operations

**Status**: TODO

After build succeeds:

```bash
# Check CUDA availability
node -e "const addon = require('./packages/parent-atlas-retrieval/native/tensorrt_bridge.node'); console.log('CUDA available:', addon.isCudaAvailable() === 1 ? 'YES' : 'NO');"

# Expected output: CUDA available: YES

# Test batch similarity (if Qdrant is up)
npm run test -w @deeds/parent-atlas-retrieval -- --grep "GPU"
```

### 6. Test Bifrost L1/L2 Caching

**Status**: TODO (after services up)

```bash
# Test L1 exact-match (via Redis)
curl -X POST http://127.0.0.1:5173/api/embed \
  -H "Content-Type: application/json" \
  -d '{"text":"authentication","model":"embeddinggemma"}' \
  -w "\nLatency: %{time_total}s\n"

# Expected: <100ms (cached) or 500ms-2s (first call)

# Test L2 semantic caching (via Bifrost + Qdrant)
curl -X POST http://127.0.0.1:5173/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is authentication?"}],"model":"gemma4"}' \
  -w "\nLatency: %{time_total}s\n"

# Expected: 5-30s (first call), 2-5s (L2 hit), 5ms (L1 hit)
```

### 7. Test OpenCode Skills

**Status**: TODO (after build)

```bash
# Start OpenCode with Parent Atlas plugin
claude code --opencode parent-atlas

# Try skills:
@atlas search "authentication validation" --top-k 5
@atlas gpu-stats
@atlas analyze "ace:packet:auth:001"
```

### 8. Run Smoke Tests

**Status**: TODO

```bash
# Run package-level tests
npm test --workspaces

# Run integration smoke test
npm run smoke:graphify

# Check GPU acceleration health
npm run atlas:gpu:health
```

## Service Dependency Graph

```
User Query
  ↓
SvelteKit /api/atlas/*
  ├─ bifrostChat() → Bifrost :3040 → Qdrant :6333
  ├─ turbovecPrefilter() → TurboVec :8792 → SOM clusters
  ├─ batchCosineSimilarity() → CUDA (tensorrt_bridge.node)
  └─ Redis :6379 (L1 cache)
  
OpenCode @atlas skills
  ├─ @atlas search → Bifrost + TurboVec + GPU
  ├─ @atlas analyze → Postgres + Qdrant + Neo4j
  └─ @atlas gpu-stats → CUDA + Redis + services

Fallback chain
  L1 (Redis, 5ms) → L2 (Bifrost+Qdrant, 2-5s) → L3 (TurboQuant :8090, 25-30s)
```

## Performance Targets

| Operation | Latency | Speedup | Status |
|-----------|---------|---------|--------|
| L1 exact match | 5ms | 6,542× | Pending Redis |
| L2 semantic + prefilter | 2-5s | 5-10× | Pending Qdrant |
| GPU reranking (1000 items) | 25ms | 100× | ✓ Ready |
| JSON parsing (100KB) | 2.4ms | 5× | ✓ Ready |

## Troubleshooting

### "Module not found: @deeds/parent-atlas-retrieval"

```bash
# Solution 1: npm install (fetch workspace)
npm install

# Solution 2: Build package first
npm run build -w @deeds/parent-atlas-retrieval
```

### "CUDA available: NO"

```bash
# Check N-API binary
ls -lh packages/parent-atlas-retrieval/native/tensorrt_bridge.node

# Check CUDA driver
nvidia-smi

# If RTX 3060 Ti shows, CUDA should be available
# If not, recompile N-API binary:
cd simd-bridge/cpp
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86
cmake --build build --config Release
```

### "Bifrost L3 fallback not working"

```bash
# Verify TurboQuant or Ollama
curl http://127.0.0.1:8090/health   # TurboQuant
curl http://127.0.0.1:11434/api/tags # Ollama

# If TurboQuant down, Ollama is always fallback
# Both :8090 and :11434 should not be required to be up simultaneously
```

### "Qdrant connection refused"

```bash
# Start Qdrant
docker-compose up -d qdrant
docker logs legal-ai-qdrant

# Wait 5-10 seconds for startup
sleep 10
curl http://127.0.0.1:6333/health
```

## Completion Checklist

### Immediate (Session)
- [ ] Services operational (Bifrost ✓, Ollama ✓, TurboQuant ✓, Qdrant ?, Redis Docker)
- [ ] npm install succeeds
- [ ] Packages build with 0 errors
- [ ] GPU detection works (CUDA available)
- [ ] Smoke tests pass

### Short-term (Phase 17 completion)
- [ ] All 7 pre-production gates pass (GPU-ACCELERATION-WIRING-CHECKLIST.md)
- [ ] SvelteKit /api/atlas/* routes wired to package imports
- [ ] OpenCode @atlas skills functional
- [ ] Performance benchmarks verified (100× GPU speedup)

### Long-term (Production)
- [ ] npm packages published (@deeds/*)
- [ ] Documentation updated
- [ ] Team trained
- [ ] Monitoring in place (Langfuse, Redis stats)

## References

- [GPU-ACCELERATION-WIRING-CHECKLIST.md](GPU-ACCELERATION-WIRING-CHECKLIST.md) — 7 pre-production gates
- [PARENT-ATLAS-PACKAGE-INTEGRATION.md](PARENT-ATLAS-PACKAGE-INTEGRATION.md) — SvelteKit wiring guide
- [docs/reports/gpu-native-matmul-lane-audit-2026-06-05.md](reports/gpu-native-matmul-lane-audit-2026-06-05.md) — GPU architecture

## Next Steps

1. **NOW**: Recover Qdrant service (`docker-compose up -d qdrant`)
2. **NEXT**: `npm install && npm run build --workspaces`
3. **THEN**: Test GPU via `@atlas gpu-stats` in OpenCode
4. **FINALLY**: Verify all 7 pre-production gates pass

---

**Last Updated**: June 15, 2026  
**Owner**: Phase 17 Runtime Recovery  
**Blocker**: Qdrant service (down)
