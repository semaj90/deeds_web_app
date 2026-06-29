# cuVS Docker Implementation Checklist

**Date**: June 28, 2026  
**Status**: Ready to implement  
**Estimated Time**: 45 minutes (build + test)

---

## Phase 1: Setup (5 min)

- [ ] **1.1** Verify Docker GPU support
  ```bash
  docker run --rm --gpus all nvcr.io/nvidia/cuda:12.1-runtime-ubuntu22.04 nvidia-smi
  # Expect: RTX 3060 Ti with 8GB visible
  ```

- [ ] **1.2** Verify port 50051 is free
  ```bash
  netstat -an | grep 50051
  # Expect: empty output
  ```

- [ ] **1.3** Create directory structure
  ```bash
  mkdir -p docker/cuvs-grpc/{protos,src}
  mkdir -p src/lib/server/retrieval/{protos,generated}
  ```

---

## Phase 2: Proto & Build Files (10 min)

- [ ] **2.1** Create `protos/cuvs_service.proto`
  - Location: `c:\Users\james\Videos\deeds-web-app\docker\cuvs-grpc\protos\cuvs_service.proto`
  - Copy from CUVS-INSTALLATION-WINDOWS-RESEARCH.md section 3b
  - Verify: `syntax = "proto3"`, `service CuVSService` defined

- [ ] **2.2** Create `Dockerfile.cuvs-grpc`
  - Location: `c:\Users\james\Videos\deeds-web-app\docker\cuvs-grpc\Dockerfile`
  - Verify:
    - `FROM nvcr.io/nvidia/rapids:24.12-runtime-cuda12.1-runtime-ubuntu22.04`
    - `pip install grpcio grpcio-tools protobuf`
    - `EXPOSE 50051`
    - `CMD ["python", "src/cuvs_grpc_server.py"]`

- [ ] **2.3** Create `src/cuvs_grpc_server.py`
  - Location: `c:\Users\james\Videos\deeds-web-app\docker\cuvs-grpc\src\cuvs_grpc_server.py`
  - Copy from research doc, section 3b
  - Verify: `BuildIndex`, `Search`, `GetIndexInfo` RPC methods

- [ ] **2.4** Verify directory structure
  ```bash
  tree docker/cuvs-grpc/
  # Expected:
  # docker/cuvs-grpc/
  # ├── Dockerfile
  # ├── protos/
  # │   └── cuvs_service.proto
  # └── src/
  #     └── cuvs_grpc_server.py
  ```

---

## Phase 3: Docker Build & Test (15 min)

- [ ] **3.1** Build Docker image
  ```bash
  cd c:\Users\james\Videos\deeds-web-app
  docker build -t rapids-cuvs-grpc:latest -f docker/cuvs-grpc/Dockerfile .
  # Expect: "Successfully tagged rapids-cuvs-grpc:latest" (5–10 min on first build)
  ```

- [ ] **3.2** Verify image built
  ```bash
  docker images | grep rapids-cuvs-grpc
  # Expect: rapids-cuvs-grpc | latest | <id> | 12GB | recent timestamp
  ```

- [ ] **3.3** Start container standalone
  ```bash
  docker run --rm --gpus all -p 50051:50051 rapids-cuvs-grpc:latest &
  sleep 3
  # Expect: "cuVS gRPC server listening on port 50051"
  ```

- [ ] **3.4** Test gRPC health via grpcurl
  ```bash
  npm install -g @grpc/grpc-tools  # One-time
  grpcurl -plaintext localhost:50051 list
  # Expect: rapids.cuvs.CuVSService
  ```

- [ ] **3.5** Kill standalone container
  ```bash
  docker stop <container_id>
  ```

---

## Phase 4: Integration (10 min)

- [ ] **4.1** Update docker-compose.yml
  - Add `cuvs-grpc` service (see section 3b in research doc)
  - Verify:
    - `build: { context: ., dockerfile: docker/cuvs-grpc/Dockerfile }`
    - `ports: ["50051:50051"]`
    - `environment: CUDA_VISIBLE_DEVICES=0`
    - `deploy.resources.reservations.devices[0].count: 1`
    - `depends_on: [legal-ai-postgres]`

- [ ] **4.2** Create Node.js gRPC bridge
  - Location: `sveltekit-frontend/src/lib/server/retrieval/cuvs-grpc-bridge.ts`
  - Copy from research doc, section 3b
  - Update proto path: `./docker/cuvs-grpc/protos/cuvs_service.proto`
  - Update server URL: `process.env.CUVS_GRPC_URL || 'localhost:50051'`

- [ ] **4.3** Generate gRPC types (TypeScript)
  ```bash
  npm install --save-dev @grpc/grpc-js @grpc/proto-loader
  
  # Generate TypeScript stubs (if using grpc-web)
  # For now, proto-loader handles dynamic loading (no pre-gen needed)
  ```

- [ ] **4.4** Add env vars to `.env.local`
  ```bash
  CUVS_GRPC_URL=localhost:50051
  CUVS_GRPC_ENABLED=true
  ```

- [ ] **4.5** Verify imports in bridge
  - Check: `import * as grpc from '@grpc/grpc-js'`
  - Check: `import * as protoLoader from '@grpc/proto-loader'`

---

## Phase 5: Docker Compose Startup (5 min)

- [ ] **5.1** Start full stack
  ```bash
  docker-compose up -d cuvs-grpc
  # Expect: "legal-ai-cuvs-grpc" container created + started
  ```

- [ ] **5.2** Verify container running
  ```bash
  docker ps | grep cuvs-grpc
  # Expect: container id, status "Up X seconds"
  ```

- [ ] **5.3** Check logs
  ```bash
  docker logs legal-ai-cuvs-grpc
  # Expect: "cuVS gRPC server listening on port 50051"
  ```

- [ ] **5.4** Verify GPU access
  ```bash
  docker exec legal-ai-cuvs-grpc nvidia-smi
  # Expect: RTX 3060 Ti with 8GB visible
  ```

- [ ] **5.5** Health check via grpcurl
  ```bash
  grpcurl -plaintext localhost:50051 list rapids.cuvs.CuVSService
  # Expect: rapids.cuvs.CuVSService
  ```

---

## Phase 6: Node.js Client Test (5 min)

- [ ] **6.1** Create test script
  - Location: `tests/cuvs-grpc-client.spec.ts`
  - Template:
    ```typescript
    import { describe, it, expect, beforeAll } from 'vitest';
    import { initializeCuVSClient, isCuVSHealthy } from '$lib/server/retrieval/cuvs-grpc-bridge';

    describe('cuVS gRPC Client', () => {
      beforeAll(async () => {
        try {
          await initializeCuVSClient();
        } catch (err) {
          console.warn('cuVS unavailable (expected if container not running):', err.message);
        }
      });

      it('should connect to cuVS service', () => {
        // Expect: true if container running, false otherwise (non-blocking)
        expect(isCuVSHealthy()).toBeDefined();
      });
    });
    ```

- [ ] **6.2** Run test
  ```bash
  npm run test tests/cuvs-grpc-client.spec.ts
  # Expect: "✓ should connect to cuVS service"
  ```

- [ ] **6.3** Verify fallback behavior
  - Stop container: `docker stop legal-ai-cuvs-grpc`
  - Re-run test
  - Expect: Test still passes (graceful degradation, `isCuVSHealthy()` returns false)

---

## Phase 7: Retrieval Layer Integration (5 min)

- [ ] **7.1** Update `src/lib/server/retrieval/retrieval-orchestrator.ts`
  - Add import: `import { searchCuVS, isCuVSHealthy } from './cuvs-grpc-bridge'`
  - Add Layer 3a (before Qdrant fallback):
    ```typescript
    // Layer 3a: cuVS gRPC (experimental, optional)
    if (isCuVSHealthy()) {
      try {
        const cuvsResults = await searchCuVS(queryVector, 'default_index', k);
        return { source: 'cuvs', results: cuvsResults };
      } catch (err) {
        console.warn('cuVS search failed:', err.message);
        // Fall through to Layer 3b (Qdrant)
      }
    }
    
    // Layer 3b: Qdrant (existing)
    // ...
    ```

- [ ] **7.2** Add npm scripts
  ```json
  {
    "cuvs:start": "docker-compose up -d cuvs-grpc",
    "cuvs:stop": "docker-compose down cuvs-grpc",
    "cuvs:logs": "docker logs -f legal-ai-cuvs-grpc",
    "cuvs:test": "npm run test tests/cuvs-grpc-client.spec.ts",
    "cuvs:health": "grpcurl -plaintext localhost:50051 list"
  }
  ```

- [ ] **7.3** Verify retrieval fallback chain
  - Retrieval path: Query → Layer 1 (cache miss) → Layer 2 (Bifrost miss) → Layer 3a (cuVS) → Layer 3b (Qdrant) → Layer 4+ (fallback)

---

## Phase 8: Performance Validation (5 min)

- [ ] **8.1** Baseline measurement (Qdrant only)
  ```bash
  npm run benchmark:retrieval -- --samples 100 --disable-cuvs
  # Expected: 150–200ms p50, 400–500ms p99
  ```

- [ ] **8.2** With cuVS enabled
  ```bash
  npm run benchmark:retrieval -- --samples 100 --enable-cuvs
  # Expected: 100–150ms p50 (20–30% improvement)
  ```

- [ ] **8.3** Check GPU memory during search
  ```bash
  docker exec legal-ai-cuvs-grpc nvidia-smi
  # Expected: <2GB utilization (IVF-PQ is memory-efficient)
  ```

- [ ] **8.4** Monitor RTX 3060 Ti temperature
  ```bash
  nvidia-smi -q -d TEMPERATURE
  # Expected: <65°C (headroom for Ollama)
  ```

---

## Phase 9: Cleanup & Documentation (2 min)

- [ ] **9.1** Archive this checklist
  - Update status: "COMPLETE" + date

- [ ] **9.2** Update project README
  - Add "Optional: cuVS GPU ANN (experimental)" section
  - Include: `npm run cuvs:start` for enabling

- [ ] **9.3** Tag commit
  ```bash
  git add docker/cuvs-grpc/ sveltekit-frontend/src/lib/server/retrieval/cuvs-grpc-bridge.ts docker-compose.yml
  git commit -m "feat: cuVS Docker gRPC service for GPU-accelerated ANN (experimental, Layer 3a)"
  git tag feat/cuvs-grpc-layer3a
  ```

- [ ] **9.4** Create issue for future work
  - Title: "Phase 85 P4: cuVS index building & lifecycle management"
  - Blockers: Artifact registry (P1-missing-layer-1)
  - Depends on: Embedding backfill complete

---

## Rollback Plan

If cuVS integration breaks retrieval:

- [ ] **R1** Remove Layer 3a from orchestrator
  ```typescript
  // Comment out or delete cuVS logic
  // Qdrant (Layer 3b) still works as fallback
  ```

- [ ] **R2** Stop container
  ```bash
  docker-compose down cuvs-grpc
  ```

- [ ] **R3** Revert commit
  ```bash
  git revert HEAD
  ```

---

## Success Criteria

✅ All checks complete when:
1. `docker ps | grep cuvs-grpc` shows "Up X seconds"
2. `grpcurl -plaintext localhost:50051 list` returns `rapids.cuvs.CuVSService`
3. `npm run cuvs:test` passes
4. `npm run retrieval:test` passes with fallback
5. Performance improvement ≥15% on p50 latency
6. Commit tagged and ready for merge

---

## Troubleshooting

**Container fails to start:**
```bash
docker logs legal-ai-cuvs-grpc
# Check for: CUDA errors, Python import errors, port conflicts
```

**gRPC client times out:**
```bash
# Verify service is listening
docker exec legal-ai-cuvs-grpc lsof -i :50051
# Expect: python process on port 50051
```

**GPU not detected:**
```bash
docker exec legal-ai-cuvs-grpc nvidia-smi
# If empty: check docker --gpus flag and nvidia-docker installation
```

**Port 50051 already in use:**
```bash
# Find and kill existing process
lsof -i :50051
kill -9 <pid>
# OR change EXPOSE in Dockerfile to different port (50052)
```

---

**End of Checklist**
