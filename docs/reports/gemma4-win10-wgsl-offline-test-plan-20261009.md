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
