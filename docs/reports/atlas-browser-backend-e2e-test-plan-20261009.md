# Parent Atlas Browser Backend E2E Harness — 2026-10-09
Status: source scaffolds committed; no live Windows/browser proof.

## Ordered, fail-closed gates
1. Freeze request/packet/revision-qualified logical input fixture with SHA-256 and tokenizer/template digest.
2. Read-only check local artifacts, runtime/package compatibility, approved origins, model SHA-256, offline mode and independently verified GPU budget/lease.
3. Validate tensor descriptor (metadata only); byte readback/digest remains authoritative owner work.
4. Run Transformers.js browser backend in its isolated model executor. Capture independently verifiable output/provenance/metrics.
5. Release its model and await device/lease teardown + readback. Prove no overlapping VRAM reservations.
6. Run LiteRT-LM JS browser backend with its own compatible web model artifacts, tokenizer/template and isolated session.
7. Compare records under common fixtureDigest; mismatch in model/tokenizer/quantization => cross-artifact quality/performance, never logit parity.
8. Server-side verifier checks observed evidence, digest and source/model revisions against canonical registry, ContextManifest and GPU owner.
9. Emit one immutable run receipt with BLOCKED/FAIL/PASS distinctly. Mock receipts cannot satisfy step 8.

## Implemented fixture-only E2E
`sveltekit-frontend/src/lib/ai/atlas-browser-comparison-e2e-v1.ts` coordinates two sequential injected adapters, returning `FIXTURE_PASS` or `BLOCKED` and hardcoded `admissibleAsRuntimeEvidence:false`. Its telemetry events are fixture-local rather than proof of GPU execution. There is deliberately no local model/adapter import, network call, cache/database write or GPU device allocation.
`atlas-browser-comparison-e2e-v1.test.ts` contains five cases: sequential mock success, stale tensor preflight, wrong fixture identity, missing executor and missing GPU execution claim. Authoring is NOT a passing local test.

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
npx --no-install tsx --test src/lib/ai/atlas-browser-comparison-e2e-v1.test.ts
```
If tsx isn't installed, mark RUNNER_UNAVAILABLE; don't install. Save process exit code and stdout plus Node and git revisions.

## Open engineering tasks
- [ ] E2E-06 Implement read-only ArtifactManifestV1 with path containment, external ONNX tensor references, sizes, local SHA-256 and reject remote URLs; LiteRT web assets are independently verified.
- [ ] E2E-07 Version existing runtime adapter contracts with explicit `prepare`, `run`, `dispose` and cleanup-verified receipts, cancellation and timeout; reject concurrent sessions. No backend implementations loaded in unit tests.
- [ ] E2E-08 Validate GPU owner lease and actual available budget from external proof; do not infer free VRAM from WebGPU adapter limits. Browser client currently intentionally blocks Gemma4 auto-loading.
- [ ] E2E-09 Freeze tokenizer/template and decoding settings including IDs/masks/stop; record separately for both model exports.
- [ ] E2E-10 Bind requestId/packetKey/source+representation revisions and fixture/artifact SHA-256 to authoritative packet/ContextManifest resolver. Never promote mock fixture output.
- [ ] E2E-11 Real browser telemetry: adapter capabilities, driver/runtime version if exposed, timeline phases (download excluded, prepare, prefill, TTFT, decode, teardown), peak VRAM if independently available, cache hit per tier and GPU execution witness.
- [ ] E2E-12 Implement model/session teardown and wait for GPU completion before next executor; device-loss, canceled load and OOM negative cases.
- [ ] E2E-13 Validate actual receipt with independently authenticating verifier and readback, not caller-reported status flags.
- [ ] E2E-14 Real Windows 10 end-to-end proof: warm/cold runs, sequential 8GB budget, blocked/no-model cases, separate numeric and quality comparisons, no cross-backend weight parity without matching artifact.
- [ ] E2E-15 Reconcile local uncommitted `onnx/token-sampling.ts` and existing inline Gemma 3 sampler; no parallel authority.
- [ ] E2E-16 Implement persistent IndexedDB/OPFS tensor bytes and shader cache only after owner census, byte digest checks, quotas, lease/generation and eviction proof.
- [ ] E2E-17 Native Dawn/CUDA/cuTile/N-API and gRPC/QUIC are challenger executors/transports after browser proof, never first E2E prerequisites.

## E2E-06..09 source increment, 2026-10-09
- [x] E2E-06 **Manifest-shape validator scaffold** in `atlas-offline-model-artifact-manifest-v1.ts` + three `node:test` cases. It checks declared relative-path safety, sizes, syntax of digests and model/tokenizer presence, but does NOT independently read, hash, or validate external ONNX tensor bytes. Model load always denied.
- [x] E2E-07 **Lifecycle-port mock scaffold** in `atlas-browser-executor-lifecycle-v1.ts` + four `node:test` cases. Calls `dispose` in `finally`, including partial `prepare` failure, and blocks the next backend when release verification fails or throws. `runtimeReleaseProven` always false; mock verification cannot assert real freed VRAM.
- [ ] E2E-08 **Verified GPU resource admission not wired**. Existing `gemma4-gpu-admission-v1.ts` remains fail-closed. Need live resource owner, revocation/expiry/lease proof, device-loss invalidation and independently witnessed teardown, not adapter maxBufferSize.
- [x] E2E-09 **Frozen prompt/tokenization shape scaffold** in `atlas-frozen-browser-prompt-v1.ts` + four `node:test` cases. Different backend token IDs are allowed, but hashes/IDs are caller-provided and NOT independently verified.
- [ ] E2E-07a Add explicit abort/timeout/dispose-after-abort and teardown deadline with a trustworthy owner. Beware JS Promise timeout races: `Promise.race` alone doesn't cancel an in-flight GPU operation or guarantee resource release.
- [ ] E2E-06a Build file-backed read-only SHA-256 verifier with path containment, canonical asset and real model export digest. Reject symlink escapes and preserve ONNX external-data dependencies. No downloads.
- [ ] E2E-09a Independently tokenize both approved model artifacts; compare rendered prompt bytes, chat templates, stop IDs, mask and revision-qualified output.
- [ ] E2E-08a Bind GPU lease grants to owner/device generation/model digest; model runtime remains blocked until verified.
- [ ] E2E-08b Persist telemetry/receipt only via existing evidence owner after authoritative readback; never accept caller-supplied gpuExecutionObserved or mock release as proof.

Safe no-install Windows 10 commands from `sveltekit-frontend`:
```powershell
npx --no-install tsx --test src/lib/ai/atlas-offline-model-artifact-manifest-v1.test.ts
npx --no-install tsx --test src/lib/ai/atlas-browser-executor-lifecycle-v1.test.ts
npx --no-install tsx --test src/lib/ai/atlas-frozen-browser-prompt-v1.test.ts
```
Source changes are committed through GitHub API; workstation tests, real browser sessions, GPU and model artifact bytes have not been executed or verified.
