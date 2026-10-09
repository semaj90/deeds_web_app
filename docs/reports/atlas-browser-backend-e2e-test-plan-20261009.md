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
