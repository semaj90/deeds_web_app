# GPU Routing + Autoencoder + SeaweedFS — 2026-05-09

> Session deliverables: SeaweedFS migration, 4×4 query router, autoencoder
> training script, speculative decoding launcher, npm scripts.
> All paths repo-relative from workspace root.

## Files Added This Session

| File | Purpose |
|---|---|
| `docker/seaweedfs/s3.json` | SeaweedFS S3 gateway credentials (matches MinIO dev defaults) |
| `sveltekit-frontend/src/lib/server/routing/query-router-4x4.ts` | 4×4 routing matrix — signal→backend dispatch + RRF fusion |
| `sveltekit-frontend/scripts/train-autoencoder.mjs` | Contrastive autoencoder training 768→64 (fixes Xavier flat outputs) |

## Files Modified

| File | Change |
|---|---|
| `docker-compose.yml` | Added 4 SeaweedFS services under `--profile seaweedfs` + 2 named volumes |
| `sveltekit-frontend/src/lib/server/env.server.ts` | `SEAWEED_*` vars override `MINIO_*` transparently |
| `sveltekit-frontend/scripts/launch-turboquant.ps1` | `--cache-reuse 256` (PLE) + speculative decoding `-md` flag |
| `sveltekit-frontend/package.json` | Added `ae:train`, `ae:train:resume`, `ae:train:dry`, `ae:train:fast`, `dev:full` |

---

## TODO — Ordered by Dependency

### Phase 1 — Data Prerequisites (run first, unblocks everything)

- [ ] `npm run graphify:semantic`
  Populates `codebase_chunks_768` Qdrant collection with dense + sparse vectors.
  **Unblocks**: autoencoder training, BM42 L3 lane, G-HR3/G-HR4 smoke gates,
  web_search lane seeding, karpathy:gpu blend scores.

- [ ] `npm run ae:train`
  Trains 768→64 autoencoder via PyTorch (`scripts/train-autoencoder.py`).
  RTX 3060 Ti: ~30 sec for 30 epochs. No Colab needed — autoencoder fits in <1MB VRAM.
  Saves weights to Redis `ace:autoencoder:weights` (7-day TTL).
  **Fixes**: Xavier random weights → flat tanh → useless 64-dim vectors.
  Resume with `npm run ae:train:resume` if interrupted.
  Fallback (CPU-only JS, incomplete backprop): `npm run ae:train:js`

- [ ] `npm run karpathy:gpu`
  Rebuilds Karpathy blend scores using trained encoder.
  Updates `gpu:karpathy:scores`, `gpu:karpathy:by_lane`, `gpu:karpathy:encoded`.

- [ ] `npm run karpathy:ace:hits`
  Audits hit-rate: are high-authority files actually retrieved by ACE?
  Reports ghosts (high blend, never retrieved) → tune lane weights.

### Phase 2 — Architecture Wiring

- [ ] Wire `QueryRouter4x4` into `fetchACPKnowledgeResults()`
  File: `src/lib/server/ace/context-assembler.ts`
  Replace hardcoded lane weights with `extractSignal()` + `router.route()`.
  Dispatch only backends above threshold (0.15) in parallel.
  Fuse results via `rrfFuse()` weighted by routing share.

- [ ] Add `web_search` as proper multi-lane L10 entry
  Currently only lives inside `gemma4-agent.ts` (L370).
  Move SearXNG call into `multi-lane-retrieval.ts` lane runner
  so ACE can call it without requiring a full agent round-trip.
  Expose as MCP tool: `kag.web_search` (query → SearXNG → ranked snippets).

- [ ] Persist `QueryRouter4x4` matrix to Redis + wire adaptation
  Key: `ace:router:matrix` (JSON, 7-day TTL).
  Hook: after each `recordChunkHits()` call, compute per-backend reward
  (hits that came from each backend) → call `router.adapt(signal, reward)`.
  Hebbian update: `M[i][j] += lr * reward[i] * signal[j]`.

- [ ] CUDA Graph capture in `autoencoder-bridge.ts`
  File: `src/lib/server/gpu/autoencoder-bridge.ts`
  Add C++ function `captureAEGraph()` to `libtorch_graph.cc`:
  fixed-shape (batch=64, dim=768) capture → replay saves ~10× launch overhead.
  Rebuild: `cmake --build simd-bridge/cpp/build --config Release`.

### Phase 3 — Speculative Decoding Setup

- [ ] Download gemma3-270m.gguf draft model
  Source: huggingface.co `google/gemma-3-1b-it-GGUF` or similar small GGUF.
  Place in `C:\Users\james\Desktop\llama-server-cuda\models\`.
  Set `DRAFT_MODEL_PATH` in `.env`:
  ```
  DRAFT_MODEL_PATH=C:\Users\james\Desktop\llama-server-cuda\models\gemma3-270m.gguf
  DRAFT_N=5
  ```
  Restart TurboQuant: `npm run turbo:start:detached`.
  Expected gain: +30-50% tok/s on long prompts (draft on CPU RAM, verify on GPU).

### Phase 4 — Validation

- [ ] `npm run smoke:hyperrag`
  Verify G-HR3 and G-HR4 pass (currently warn: "0 chunks — run graphify:semantic").
  All 10 gates should be green after Phase 1 data is populated.
  Run: `npm run smoke:hyperrag:strict` for exit-1-on-warning mode.

- [ ] Playwright upload tests
  Requires dev server running first: `npm run dev` (separate terminal).
  Then: `npx playwright test tests/e2e/evidence-diagnostics-upload.spec.ts`
  Seeded PW-TEST case: `99fb7d6a-c9a2-41a9-9aab-ffd5ed2e8684`
  (manually seeded 2026-05-09 — re-seed if Docker postgres was wiped).

### Phase 5 — Infrastructure

- [ ] Validate SeaweedFS migration
  ```bash
  docker compose --profile seaweedfs up -d
  ```
  Add to `.env`:
  ```
  SEAWEED_ENDPOINT=127.0.0.1
  SEAWEED_S3_PORT=8333
  SEAWEED_ACCESS_KEY=minio
  SEAWEED_SECRET_KEY=minio123
  ```
  Test: upload an evidence file → confirm stored in SeaweedFS S3 bucket.
  Stop MinIO after validation: `docker compose stop minio`.

### Phase 6 — Forward-Looking

- [ ] WebGPU WGSL schema encoder
  File: `src/lib/webgpu/schema-encoder.wgsl` (new)
  Encode Qdrant payloads `{trust_tier, som_cluster, karpathy_blend}` to
  `Float32Array[16]` per document — compute shader reranks 1000 docs in ~0.3ms
  vs ~50ms CPU loop. Wire into client-side ACE result display.

- [ ] RAPIDS cuGraph PageRank for large graphs (>10K nodes)
  Add Python sidecar script `scripts/rapids-pagerank.py` via RabbitMQ
  queue `graph.pagerank`. Falls back to Neo4j GDS for <10K nodes.
  Activate in `graphify:gpu:turbo` heavy lane.

- [ ] `npm run graphify:full`
  Full pipeline regeneration after all weights are trained:
  SOM + hypergraph + PageRank + cluster summaries + ACE plans.
  Run after ae:train + karpathy:gpu complete.

---

## Key Concepts (session reference)

| Term | Meaning |
|---|---|
| PLE | Persistent Layer Encoding — `--cache-reuse 256` reuses system prompt KV across requests |
| Speculative decoding | Draft (gemma3 CPU) generates 5 tokens; target (Gemma4 GPU) verifies in 1 pass |
| RotorQuant | Rotation-based quantization (Hadamard/QuaRot) — reduces outliers before quantizing; `IQ4_XS` uses this |
| TQ1_0 / IQ1_S | 1-bit ternary GGUF formats (BitNet-style) — draft-model use only, quality degrades |
| 4×4 matrix | Signal vector (semantic/lexical/graph/trust) × backend weights (Qdrant/Postgres/Neo4j/MCP) |
| CUDA Graph | Capture GPU op sequence once, replay without CPU submission overhead (~10× speedup) |
| RRF | Reciprocal Rank Fusion — fuses multi-backend results weighted by routing share |
| Xavier init | Random weight init — all 64-dim autoencoder outputs collapse to ~0 (why ae:train is needed) |

## npm Quick Reference

```bash
# Phase 1
npm run graphify:semantic         # populate Qdrant sparse+dense
npm run ae:train                  # train autoencoder (PyTorch GPU, ~30s on RTX 3060 Ti)
npm run ae:train:resume           # resume from saved Redis weights
npm run ae:train:js               # JS fallback (CPU, ~3-5 min, incomplete backprop)
npm run karpathy:gpu              # rebuild blend scores
npm run karpathy:ace:hits         # audit hit-rate

# Phase 4
npm run smoke:hyperrag            # 10-gate HyperRAG regression
npm run smoke:hyperrag:strict     # exit 1 on any warning

# Phase 5
docker compose --profile seaweedfs up -d

# Dev
npm run dev:full                  # Docker + TurboQuant + ACE + Frontend + TRACE-MCP
npm run turbo:start:detached      # TurboQuant only
```
