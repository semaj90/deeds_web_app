# Parent Atlas Gemma 4: Windows 10 WGSL baseline and browser-backend comparison
Status: scaffolds committed; no tests or GPU executions verified on user's workstation.
Date: 2026-10-09

## Four offline tests (does NOT initialize models)
From `sveltekit-frontend`:
```powershell
node --version
npx --no-install tsx --test src/lib/ai/gemma4-wgsl-kernel-oracle-v1.test.ts
npx --no-install tsx --test src/lib/ai/gemma4-gpu-admission-v1.test.ts
```
If tsx is absent: record `RUNNER_UNAVAILABLE`, **do not install**. These files use Node's built-in assertions and node:test; TS execution still requires a compatible existing loader. Each successful test logs one `atlas.wgsl.kernel.telemetry.v1` JSON line. Preserve exit code plus stdout, runtime versions and git SHA in a local receipt before considering admission.

## Opt-in Windows 10 browser GPU test
1. Verify RTX 3060 Ti driver, Chrome/Edge WebGPU (chrome://gpu), and existing GPU process/service occupancy using Windows Task Manager GPU graphs or nvidia-smi. Browser adapter limits do not indicate available VRAM.
2. Use the installed SvelteKit dev server (normal `npm run dev`, not `dev:gpu`); only if dependencies already exist.
3. Open `http://localhost:5173/atlas-wgsl-parity-v1.html` (use the actual dev server port). Localhost is a secure context in Chromium. The page is static and does not load external scripts or model weights.
4. Click **Run one WebGPU kernel** once. The generated `atlas.wgsl.browser.parity.v1` receipt prints on-page and in console with reason, durationMs, maxAbsError, adapterLimitBytes, modelLoaded=false, weightsDownloaded=false. PASS requires real shader compilation, dispatch, mapAsync readback and max absolute error <=1e-6.
5. Save console JSON and browser/driver/GPU information. A PASS is only one elementwise-add WGSL oracle, not Gemma 4 kernels/model inference.

## Four follow-on test families (DO NOT count as passed)
- [ ] KERNEL-REAL-02 Freeze an actual Gemma 4 operation shape (e.g., matmul/RMSNorm) from audited model graph and compare reference FP32/f16/quantized dequant steps to WGSL with explicit tolerance and workgroup synchronization; do not equate vector addition with architecture parity.
- [ ] GPU-LEASE-03 Integrate a verified free-memory budget and lease with the existing Parent Atlas single-owner GPU scheduler. Keep `gemma4-e2b-client.ts` fail-closed until a validated owner binds grant to model digest, device, budget and expiry; enforce at the load call boundary. Reject stale claims and check resource headroom immediately before allocation.
- [ ] INFERENCE-RECEIPT-04 After approved local artifacts and user-triggered inference, independently capture exact model/tokenizer revision and local content hashes, quantization, runtime, GPU provider, input token IDs, output token IDs, elapsed time, peak memory and verified no-unapproved-network trace. Do not label model output quality or source-grounding as proven from a kernel PASS.
- [ ] BACKEND-COMPARE-05 Compare Transformers.js WebGPU against LiteRT-LM **JS browser** as separate executors with their own compatible weights and tokenizer/template, identical logical prompt, constrained max tokens and measured prefill/decode. Record backend-specific tokenization and shapes; different quantization or model build = quality/throughput comparison, NOT token-for-token numerical backend parity. Do not load both large models simultaneously on an 8GB board.
- [ ] SAMPLER-OWNER-06 Reconcile workstation `onnx/token-sampling.ts` (absent on GitHub branch) with `onnx/inference.ts` inline stochastic sampler. No duplicate helper, no unreviewed existing behavior change. Tests for all-masked, NaN, ties, seeded sampling and inference import isolation.
- [ ] MTP-ISOLATION-07 Keep E2B-it-assistant speculative draft model unavailable until verified target/drafter APIs and KV cache compatibility. Neither LiteRT-LM JS model examples nor third-party kernel bundles establish draft/target admission.

## External demo caution
The user-provided `gemma-4-e2b.js` from a Hugging Face Space is a bundled/minified model-specific implementation, not a compact audited reference kernel. Inspect license, provenance, fetch origins, shader extraction, expected tensor layouts and weights before copying anything. Never eval or import that remote script into the privileged app path just to run these smoke tests.

## Windows 10 caveats
- Node/V8 runs unit tests and server-side JS; it cannot run WebGPU compute by itself without a compatible GPU implementation. Browser WebGPU uses Chromium's GPU stack/Dawn; no CUDA kernel or DirectML execution is implied.
- Chrome/Edge GPU process and native Torch/cuVS services may compete for RTX 3060 Ti VRAM. Use sequential model execution and do not evict running model owners.
- Real shader compilation errors -> `BLOCKED` with cause; numerical mismatch after successful dispatch -> `FAIL`. Preserve environment metadata for reproduction.

## 2026-10-09 RMSNorm real-operator increment
Three additional committed files: `gemma4-rmsnorm-oracle-v1.ts`, `gemma4-rmsnorm-oracle-v1.test.ts`, and `static/atlas-rmsnorm-parity-v1.html`. This is a fixed 2x4 **illustrative RMSNorm f32** operator; it has NOT been verified against the E2B graph tensor layout, Gemma weight convention (e.g. weight offset), epsilon, fused quantized implementation, or shape. Never label it `GEMMA4_MODEL_OPERATOR_PARITY` from this fixture.

PowerShell, using existing dependencies (no installs):
```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
npx --no-install tsx --test src/lib/ai/gemma4-rmsnorm-oracle-v1.test.ts
npm run dev
```
Once the server starts, open `http://localhost:5173/atlas-rmsnorm-parity-v1.html` (adjust port) and deliberately click **Run GPU RMSNorm parity**. Collect the on-screen JSON receipt and console line `[ATLAS_RMSNORM_GPU_TELEMETRY]`. Required: status PASS, valid reference/actual vectors, maximum absolute and relative error inside declared tolerances, observed GPU submission and mapAsync readback, browser/device/driver evidence collected separately. BLOCKED is not PASS. Add true execution traces and shader/program digests before any production evidence-admission step.

- [ ] RMS-04 Run 2x4 browser RMSNorm shader/readback on Windows 10 Chrome/Edge GPU, save telemetry and operator receipt.
- [ ] RMS-05 Add a second odd-width and multi-workgroup shape with bounds protection and f32/f16 tolerance study.
- [ ] RMS-06 Audit real Gemma 4 E2B ONNX weights and operator graph; freeze shape, epsilon, weight convention, quantization and source digest; port fixture-only shader to actual graph-compatible test.
- [ ] RMS-07 Remove dual-source WGSL definition by routing fixture/browser through one audited asset owner; static runner currently duplicates the shader for no-build offline use. Enforce shader digest equality before claiming parity.
- [ ] RMS-08 Implement actual model inference receipt only after trusted GPU owner lease, offline artifact manifest, user approval and explicit model load; never use static fixture pass for inference.

## Canonical WGSL source ownership (2026-10-09)
- Source-of-truth shaders: `sveltekit-frontend/static/atlas-kernels/add-f32-v1.wgsl` and `rmsnorm-f32-v1.wgsl`.
- The HTML5 test pages fetch the versioned static WGSL assets on the operator's click; the Node TS numerical oracle tests use `node:fs` to read those exact assets. **Browser access via a localhost fetch is local asset I/O, not model-weight download.** Do not remove these assets after a build.
- The TS oracle exports asset paths, not duplicate shader contents. Production app should use the same versioned URL with checked SHA-256 and browser-only lazy loader; backend-specific code must not own a second copy of the shader.
- [ ] WGSL-SHA-01 Pin asset SHA-256 hashes in a generated manifest and independently verify browser-fetched bytes; fail closed on mismatches and log `shaderSha256`, `fixtureChecksum`, backend/runtime, adapter identity where permitted.
- [ ] WGSL-STATIC-02 Confirm Vite/SvelteKit static deployment serves `.wgsl` consistently with correct MIME/CSP/fetch policy and no silent cache revision mismatch.
- [ ] WGSL-WIDTH-03 Run odd-width (e.g. 7/65), varying row counts, zero-valued rows and f32 accumulation-bound tests; create actual model-revision-specific shape + norm convention fixtures before Gemma parity claims.

## Executor separation / enhancement order
| Owner | Role | Immediate requirement |
| --- | --- | --- |
| Browser HTML5 + JS WebGPU | canonical first GPU parity executor in Chrome/Edge on Windows 10 | verified WGSL, CPU oracle and readback receipt |
| Node/V8 test runner | pure fixture/spec/receipt validator; NOT a browser WebGPU device | existing `tsx` or TS transform, `node:test` |
| Dawn C++ native | optional separate WebGPU executor/adapter for cross-runtime driver parity | CMake-native smoke only after browser parity, no duplicate shader |
| Node N-API native addon | optional bridge to Dawn if there is a measured Node-specific orchestration need | use versioned binary/ABI contract; no raw pointers over RPC |
| LiteRT-LM JS | independent Gemma E2B browser inference backend, NOT an extension of the fixture shader | backend-specific model packaging, tokenizer/template, tested admission |
| Transformers.js/ONNX Runtime Web | current Gemma E2B browser inference owner | memory/artifact/explicit approval gates before load |
| gRPC/QUIC | remote orchestration/telemetry/evidence boundary; not WebGPU browser-native dispatch API | typed descriptors, immutable packet identities, bounded transfers |

### Incremental JS optimizations (not assumed gains)
1. Cache shader module/pipeline by (`shaderSha256`, adapter/device generation, specialization parameters) inside the existing session/device owner; clear on device loss. Do not cache stale pipelines.
2. For small tensors, batch dispatches and recycle GPU buffers with explicit lifetime/generation tracking; benchmark copying overhead instead of blindly increasing concurrency.
3. Use workgroup tiled/parallel reduction for larger real RMSNorm widths, benchmarking scalar baseline; ensure synchronization and numerical tolerance across shapes and f16/f32. Current scalar loop per row is a *correctness baseline only*.
4. Avoid readbacks in inference hot path, but retain explicit test readback. Prefer `queue.onSubmittedWorkDone()` and CPU timing (not GPU kernel timing) unless timestamp-query feature is supported and verified.
5. Keep model weights/sequence KV/quantized matmul separate from toy f32 fixture and explicitly budget VRAM; no unverified free-memory inference from WebGPU adapter limits.

MTP, REAP and neural-memory proposals remain independent evidence domains. No compilation, GPU run, dependency install or model load was performed by these GitHub edits.

## Post LiteRT-LM JS parity: tensor/shader/cache/packet fabric (design gates, not runtime proof)
- [ ] CACHE-01 **Backend fixture parity first:** pin exact Gemma 4 E2B model assets, prompt/chat template, tokenizer, quantization, engine version, device and seed. Run Transformers.js and LiteRT-LM browser backends **sequentially**, capture output/tokenization and cold/warm prefill/decode receipts, no claim of identical logits unless weights/layout numerics match.
- [ ] CACHE-02 **Shader registry:** SHA-256 versioned WGSL bytes and immutable per-device compiled pipeline key = shaderDigest + deviceGeneration + entryPoint + constants/layout + feature set. Shader source stored on disk/HTTP cache; WebGPU pipeline object is only cached in owning GPUDevice process and is invalidated on device loss.
- [ ] CACHE-03 **Tensor descriptor only:** use packetKey + sourceRevision + representationRevision + encodingVersion + contentDigest, as well as dtype, shape, strides, quantization, byteLength, ownerId, deviceGeneration, residency, leaseGeneration. Never serialize raw GPUBuffer/OS pointer. Reuse existing Atlas packet/address registry owners, do not create second authority.
- [ ] CACHE-04 **Browser storage separation:** IndexedDB for metadata/index; OPFS/Cache API only for verified immutable tensor/model bytes when browser supported and quota policy allows. Browser CPU ArrayBuffer, optional SAB (crossOriginIsolated + COOP/COEP verified) and GPUBuffer have DISTINCT lifetimes. IndexedDB bytes are not GPU buffer residency.
- [ ] CACHE-05 **Budget and eviction:** GPU buffers have explicit reservation, generation, bounded LRU and in-flight pin/readback fences; no eviction until queue work completes. Account by actual allocation size and owner. On device loss, invalidate handles and rebuild from verified CPU/persistent materialization; no blind `empty_cache` or service eviction.
- [ ] CACHE-06 **Transfer paths:** browser worker messages use transferable ArrayBuffer for one-owner zero-copy *CPU* transfer; SharedArrayBuffer for opt-in CPU shared views, guarded with Atomics. Browser WebGPU requires writeBuffer/copyBuffer upload, not direct SAB mmap of VRAM. Native Node mmap/Arrow can serve bounded canonical bytes; crossing process/machine boundaries uses descriptors/length/checksum, not pointers.
- [ ] CACHE-07 **Native executor boundary:** optional Dawn C++ consumes same WGSL bytes and frozen fixture, writing its own execution receipt. N-API only if Node native call/ABI benchmarking proves benefit. CUDA/cuTile has separate compiled kernels and correctness comparison (same input/dtype/shape/tolerance) instead of executing WGSL in CUDA.
- [ ] CACHE-08 **RPC transport:** gRPC/QUIC for trusted server/sidecar commands and finite tensor transfers, with capability checks, packet descriptor, revision/lease fencing, limits and checksum. Browser does not gain arbitrary native pointers via RPC; consider WebTransport/WebSocket/HTTP where browser gRPC limitations apply.
- [ ] CACHE-09 **Negative controls:** stale content digest, wrong representationRevision, expired lease, device loss, GPU OOM, cache quota denied, SAB not isolated, buffer mapped/in-flight, shader checksum mismatch, backend artifact mismatch and transport truncation MUST reject without cache poisoning.
- [ ] CACHE-10 **Telemetry:** append-only receipt includes requestId/packetKey, artifactDigest, shaderDigest, backend, dtype/shape, bytesUploaded/readBack, cacheHitByTier, deviceGeneration, executionDurationMs, prefill/decode, blocked reason and authoritative evidenceRefs. Any comparator run with a missing backend is BLOCKED, not PASS.

The immediate implementation increment is CACHE-02/CACHE-03 pure TypeScript contract + negative tests (without GPU, model, native build, dependency install or datastore writes). Later wire to verified existing registry/device owner; do NOT allocate persistent caches as part of contract-only work.

## 2026-10-09 browser backend comparator and tensor descriptor scaffold
- Added `src/lib/ai/gemma4-browser-backend-compare-v1.ts` and five `node:test` cases. Pure receipts, no inference. A fixture PASS is NOT a verified runtime receipt. Cross-export mismatches are labeled quality/throughput comparisons only. Measurements from actual model runs are pending.
- Added `src/lib/ai/atlas-tensor-cache-descriptor-v1.ts` and four `node:test` cases. These reject stale generation/revisions, unsupported strides, checksum shape and byte-count mismatch. They do NOT create a cache, validate actual content bytes, authorize materialization or supersede the canonical packet registry.
- [ ] BACKEND-REAL-01 Resolve compatible LiteRT-LM browser JS runtime and complete E2B web model artifact manifest; check licensing/import API and avoid automatic downloads. Keep separate from Transformers.js model owner.
- [ ] BACKEND-REAL-02 Run sequential user-approved browser inference with same logical fixture, real model/tokenizer SHA-256 and execution timing. Independently verify receipts before comparison; do not trust caller self-reported PASS.
- [ ] CACHE-IMPLEMENT-01 Check existing packet registry, device owner and evidence writer. Bind descriptors only after authoritative lease and byte/digest checks, with IndexedDB/OPFS and WebGPU cache as separately owned materializations.
- Offline, no-install commands from `sveltekit-frontend`: `npx --no-install tsx --test src/lib/ai/gemma4-browser-backend-compare-v1.test.ts` and `npx --no-install tsx --test src/lib/ai/atlas-tensor-cache-descriptor-v1.test.ts`.
- **Test execution:** not performed by GitHub edits. No local runtime, browser, model or GPU proof claimed.
