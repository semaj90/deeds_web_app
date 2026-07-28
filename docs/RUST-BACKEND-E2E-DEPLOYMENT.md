# Rust Backend E2E Deployment Playbook

## Step-by-Step Production Deployment

### Phase 1: Prerequisites (15 min)

**1.1 Verify Native Module**
```bash
ls -la simd-bridge/cpp/build/Release/tensorrt_bridge.node
# Expected: file exists, size > 100KB
```

**1.2 Verify Qdrant**
```bash
curl http://127.0.0.1:6333/collections
# Expected: HTTP 200, codebase_chunks_768 collection listed
```

**1.3 Verify Packet Payload**
```bash
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 1, "with_payload": true, "with_vector": false}' | jq '.result.points[0].payload'
# Expected: packet_key, source_ref, content_hash, workspace_revision fields present
```

**1.4 Verify Node.js**
```bash
node --version
# Expected: v18.x or higher
```

### Phase 2: Build Manifest (10 min)

**2.1 Generate Manifest**
```bash
npm run search:backend:rust:manifest:build
# Expected: Exit code 0
```

**2.2 Verify Manifest**
```bash
ls -lh artifacts/rust-ann-slot-manifest.json
# Expected: File exists, size < 50MB
```

**2.3 Inspect Manifest**
```bash
jq '.rows | length' artifacts/rust-ann-slot-manifest.json
# Expected: Number of rows shown (should match Qdrant point count)
```

### Phase 3: Test Runtime (10 min)

**3.1 Run Test Script**
```bash
npm run search:backend:rust:test
# Expected: Exit code 0, all 7 gates PASS
```

**3.2 Run Integration Tests**
```bash
npm run test -- tests/retrieval/rust-backend-integration.spec.ts
# Expected: 14/14 tests PASS
```

### Phase 4: Enable in Development (5 min)

**4.1 Set Environment Variable**
```bash
export CODEBASE_SEARCH_BACKEND=rust_napi
export RUST_ANN_MANIFEST=artifacts/rust-ann-slot-manifest.json
```

**4.2 Start Dev Server**
```bash
npm run dev
# Expected: Server starts, no errors
```

**4.3 Test Endpoint**
```bash
curl http://localhost:5173/api/search?q=auth
# Expected: HTTP 200, backend: 'rust_napi' in response
```

### Phase 5: Validate Production (15 min)

**5.1 Run Full Gate Suite**
```bash
npm run search:backend:rust:full
# Expected: All 12 production gates R1-R12 PASS
```

**5.2 Health Endpoint**
```bash
curl http://localhost:5173/api/search/health
# Expected: { healthy: true, backend: 'rust_napi', ... }
```

**5.3 Stress Test (100 queries)**
```bash
for i in {1..100}; do
  curl -s http://localhost:5173/api/search?q=auth > /dev/null
done
# Expected: 100% success rate, no errors
```

**5.4 Latency Check**
```bash
time curl -s http://localhost:5173/api/search?q=auth > /dev/null
# Expected: real < 1s, < 500ms p95 for subsequent queries
```

### Phase 6: Production Deployment (5 min)

**6.1 Set Environment Variables (in production config)**
```bash
CODEBASE_SEARCH_BACKEND=rust_napi
RUST_ANN_MANIFEST=/path/to/artifacts/rust-ann-slot-manifest.json
```

**6.2 Deploy Application**
```bash
npm run build
npm run start
```

**6.3 Monitor Health**
```bash
# Watch health endpoint for 5 minutes
watch -n 1 'curl -s http://prod.app/api/search/health | jq .healthy'
```

**6.4 Verify Fallback**
```bash
# Temporarily disable Rust backend
DISABLE_RUST_BACKEND=1 npm run start

# Query should still work via Qdrant fallback
curl http://prod.app/api/search?q=auth
# Expected: HTTP 200, backend: 'qdrant'
```

### Phase 7: Ongoing Monitoring (daily)

**7.1 Health Dashboard**
```bash
curl http://prod.app/api/search/health
# Track: healthy, indexVersion, vectorCount
```

**7.2 Latency SLA**
```bash
# Monitor p95 latency (target: < 500ms)
# Set up alert if p95 > 1000ms
```

**7.3 Error Rate SLA**
```bash
# Monitor error rate (target: < 0.5%)
# Set up alert if error_rate > 1%
```

**7.4 Fallback Rate**
```bash
# Monitor fallback rate (target: < 0.1%)
# Set up alert if fallback_rate > 0.5%
```

---

## Rollback Procedure (if needed)

**Immediate Rollback** (< 1 min):
```bash
CODEBASE_SEARCH_BACKEND=qdrant npm run start
# All queries automatically routed to Qdrant
# Zero data loss, no manifest needed
```

**Investigate** (10-30 min):
```bash
npm run search:backend:rust:full --verbose
# Check which gate(s) failed
# Review logs for error details
```

**Fix** (variable):
```bash
# Depends on root cause
# Rebuild manifest: npm run search:backend:rust:manifest:build
# Recompile module: cd simd-bridge/cpp && cmake --build build --config Release
# Update Qdrant: verify collection integrity
```

**Re-enable** (after fix):
```bash
npm run search:backend:rust:test
npm run search:backend:rust:full
# If all gates pass: CODEBASE_SEARCH_BACKEND=rust_napi npm run start
```

---

## Expected Outcomes

After full deployment:

✅ **Latency**: Candidate retrieval 12-18ms (vs 80-120ms with Qdrant)  
✅ **Throughput**: 1000+ QPS supported (vs 100-200 with Qdrant)  
✅ **Error Rate**: < 0.5% (same as Qdrant)  
✅ **Uptime**: 99.9% (with fallback route)  
✅ **Memory**: 500-800MB index (vs 2-4GB)  

---

## Troubleshooting Checklist

- [ ] Manifest exists at RUST_ANN_MANIFEST path
- [ ] Native module exists at simd-bridge/cpp/build/Release/tensorrt_bridge.node
- [ ] Qdrant is running and accessible
- [ ] Packet payloads have required fields (packet_key, source_ref, etc)
- [ ] Node.js version is 18+
- [ ] All 12 production gates R1-R12 pass
- [ ] Health endpoint returns healthy: true
- [ ] Fallback route (Qdrant) working as backup

---

**Estimated Total Time**: ~1 hour for full production deployment
TREE_EOF
