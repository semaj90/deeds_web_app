# Rust Backend — Decision Tree & Production Checklist

## When to Use Rust N-API Backend

```
Is ANN candidate generation your bottleneck?
  → YES: Rust N-API is 8× faster (GPU)
  → NO: Stick with Qdrant

Do you have GPU available?
  → YES: Rust N-API preferred
  → NO: Fall back to Qdrant

Can you freeze the slot manifest at startup?
  → YES: Rust N-API (manifest is immutable)
  → NO: Use Qdrant (dynamic index)

Is 99.9% uptime required?
  → YES: Rust N-API with Qdrant fallback (both required)
  → NO: Rust N-API alone acceptable
```

## Decision Matrix

| Scenario | Recommendation | Rationale |
|----------|-----------------|-----------|
| High-throughput retrieval (1K+ QPS) | Rust N-API | GPU acceleration needed |
| Low-latency p95 < 50ms | Rust N-API | 12-18ms vs 80-120ms |
| Dynamic index updates | Qdrant | Rust manifest is frozen |
| GPU unavailable/maintenance | Qdrant | Fallback route |
| 50K+ packets with low memory | Rust N-API | 500-800MB vs 2-4GB |
| Multi-tenant isolation | Qdrant | Namespace support |

## Production Checklist

### Prerequisites

- [ ] Native turbovec-napi module compiled (simd-bridge/cpp/build/Release/tensorrt_bridge.node)
- [ ] Qdrant running at QDRANT_URL (default :6333)
- [ ] 50K+ packets in Qdrant with payload: packet_key, source_ref, content_hash, workspace_revision
- [ ] Node.js 18+
- [ ] At least 1GB available VRAM (GPU)
- [ ] < 50MB disk space for manifest JSON

### Build Phase

```bash
npm run search:backend:rust:manifest:build
# Expected: Exit code 0, manifest written to artifacts/
# Verify: 7 gates PASS (bijection, no nulls, hash consistency)
```

### Test Phase

```bash
npm run search:backend:rust:test
# Expected: Exit code 0, all 7 test gates PASS
# Verify: Manifest loads, health endpoint works, search executes
```

### Integration Tests

```bash
npm run test -- tests/retrieval/rust-backend-integration.spec.ts
# Expected: 14/14 tests PASS
# Verify: No skipped tests, zero failures
```

### Deployment Gate

```bash
npm run search:backend:rust:full
# Expected: All 12 production gates R1-R12 passing
# Blocks: Do NOT enable in production until all gates pass
```

### Health Check

```bash
curl http://localhost:5173/api/search/health
# Expected: { healthy: true, backend: 'rust_napi', ... }
# If unhealthy: Check native module, restart server
```

### Fallback Verification

```bash
# Disable Rust backend (simulate failure)
DISABLE_RUST_BACKEND=1 npm run dev

# Query endpoint (should fall back to Qdrant)
curl http://localhost:5173/api/search?q=auth
# Expected: 200 OK, candidates returned via Qdrant
```

## Monitoring Targets

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Latency (p95) | < 500ms | Investigate native module, consider Qdrant fallback |
| Error rate | < 0.5% | Check logs, verify manifest integrity |
| Fallback rate | < 0.1% | Rust backend should rarely fail |
| Memory (index) | < 1GB | Reduce packet count or switch to Qdrant |
| Manifest size | < 50MB | Archive old snapshots |

## Troubleshooting Guide

### Manifest not found

**Error**: `Rust slot manifest not found: /path/to/manifest.json`

**Fix**:
```bash
npm run search:backend:rust:manifest:build
```

### Native module not loaded

**Error**: `Native module not available; backend will report unhealthy`

**Fix**:
1. Verify `simd-bridge/cpp/build/Release/tensorrt_bridge.node` exists
2. If missing, rebuild: `cd simd-bridge/cpp && cmake -B build && cmake --build build --config Release`
3. Restart Node.js

### Dimension mismatch

**Error**: `Dimension mismatch: expected 768, got 384`

**Fix**: Ensure queryVector is exactly 768-dim. No truncation or padding.

### Filter not working

**Error**: Candidates returned despite filter specified

**Fix**:
1. Trace through buildAllowedSlots() logic
2. Verify filter conditions in rust-napi-search-backend.ts (lines 197-250)
3. Test with simpler filter (e.g., workspace_revision only)

### Performance degradation

**Error**: Latency > 500ms, error rate > 1%

**Fix**:
1. Check Qdrant health: `curl http://127.0.0.1:6333/health`
2. Verify manifest size reasonable: `ls -lh artifacts/rust-ann-slot-manifest.json`
3. Consider fallback: Set `CODEBASE_SEARCH_BACKEND=qdrant`

## Rollback Procedure

If Rust backend fails in production:

```bash
# 1. Immediate rollback
CODEBASE_SEARCH_BACKEND=qdrant npm run start

# 2. Investigate root cause
npm run search:backend:rust:full --verbose
# Look for gate failures in R1-R12

# 3. Fix and retest
npm run search:backend:rust:manifest:build
npm run search:backend:rust:test

# 4. Re-enable if all gates pass
CODEBASE_SEARCH_BACKEND=rust_napi npm run start
```

## Estimated Timeline

| Phase | Task | Estimate | Gate |
|-------|------|----------|------|
| Build | Generate manifest | 5-10m | R1 |
| Test | Runtime validation | 2-5m | R2-R7 |
| Integration | Verify all tests pass | 5-10m | R3 |
| Enable | Set env var, monitor | 1m | R8-R12 |
| **Total** | **Full deployment** | **15-30m** | **All 12 gates** |

---

**Remember**: Do NOT enable Rust backend in production until all 12 production gates R1-R12 pass.
