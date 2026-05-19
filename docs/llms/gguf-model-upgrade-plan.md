# GGUF Model Upgrade Plan

## Purpose

This plan documents the next steps for testing and promoting the desktop IQ4_XS model candidate into the repo-backed TurboQuant/RotorQuant runtime.

## Current state

- Active repo model: `vendor/models/gemma4-legal.gguf`
  - This is the active merged GRPO legal model in the repository.
- Desktop upgrade candidate: `C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs.gguf`
  - This is the IQ4_XS upgrade candidate.
- Desktop duplicate/original merged file: `C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-merged-q4km.gguf`
- Supporting desktop artifacts:
  - `C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs-direct.gguf`
  - `C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-f16.gguf`
  - `C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-f16-test.gguf`

## Path mapping

| Environment | Model path | Purpose |
|---|---|---|
| Repo active runtime | `c:\Users\james\Videos\deeds-web-app\vendor\models\gemma4-legal.gguf` | Current merged GRPO legal model used by `ROTORQUANT_MODEL_PATH` and `TURBO_MODEL_PATH`.
| Repo vendor vision tower | `c:\Users\james\Videos\deeds-web-app\vendor\models\mmproj-gemma4.gguf` | SigLIP multimodal projector for VLM.
| Repo VLM runtime | `gemma4-legal.gguf + mmproj-gemma4.gguf` | Combined text + vision runtime when projector is enabled.
| Desktop candidate | `c:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs.gguf` | IQ4_XS upgrade candidate.
| Desktop backup | `c:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-merged-q4km.gguf` | Original merged duplicate; should not be promoted.
| Desktop fallback | `c:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs-direct.gguf` | Direct IQ4_XS fallback without iMatrix calibration.
| Desktop artifacts | `c:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-f16.gguf` and `gemma4-legal-f16-test.gguf` | Cleanup candidates after upgrade.
## Model clarification

- `gemma4-legal.gguf` is the merged GRPO legal text model with LoRA fused in.
- It is not the unified VLM model by itself; VLM behavior is provided separately via `mmproj-gemma4.gguf` and the `gemma4-legal-vlm` runtime alias.
- Therefore `LEGAL_LORA_PATH` must remain unset for these merged GGUFs.

## Validation result

- A temporary startup test was performed on port `8091` using `gemma4-legal-iq4xs.gguf`.
- The candidate model loaded successfully and `http://127.0.0.1:8091/health` returned `ok`.
## Test plan

1. Prepare the desktop candidate for runtime testing.

```powershell
$env:ROTORQUANT_MODEL_PATH = 'C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs.gguf'
$env:TURBO_MODEL_PATH = 'C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs.gguf'
$env:LEGAL_LORA_PATH = ''
# If you need VLM support, also set:
$env:TURBO_MMPROJ_PATH = 'C:\Users\james\Videos\deeds-web-app\vendor\models\mmproj-gemma4.gguf'
```

2. Start the TurboQuant server using the existing launcher.

- Use the repo's dev task or:
  - `npm run turbo:start:detached`
  - or the equivalent VS Code TurboQuant launch task.

3. Validate the model is loaded and healthy.

- Check `http://localhost:8090/health` (or `http://localhost:8091/health` if you used a test port).
- Run a simple query via the existing TurboQuant test task or curl to `/v1/chat/completions`.
- If testing VLM, start the server with the projector enabled by setting `TURBO_MMPROJ_PATH` and using the same launcher.
  - Use `gemma4-legal-vlm` as the VLM alias when available.
  - The benchmark script already performs a `/health` check before running inference.
  - This is a reasoning-focused VLM validation, not a YOLO/Ultralytics object-detection or fine-tuning benchmark.
  - Example OpenAI-compatible image request via `/v1/chat/completions`:

    ```powershell
    curl -s -X POST http://localhost:8090/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d '{"model":"gemma4-legal-vlm","messages":[{"role":"user","content":"Describe this image in legal-evidence terms: list visible people, objects, actions, and locations."}],"image_url":"data:image/png;base64,<BASE64_IMAGE_DATA>","stream":false}'
    ```

  - Example repo-local `api/generate` style request:

    ```powershell
    curl -s -X POST http://localhost:8090/api/generate \
      -H "Content-Type: application/json" \
      -d '{"model":"gemma4-legal-vlm","prompt":"Describe this image in legal-evidence terms. List visible people, objects, actions, and locations.","images":[{"data":"<BASE64_IMAGE_DATA>","format":"png"}],"stream":false}'
    ```

4. Run benchmark validation.

- `npm run turbo:bench:rotorquant` or equivalent benchmark script.
- For VLM testing, run the benchmark explicitly against the VLM alias and port:
  - `npm run turbo:bench -- --port 8080 --label vlm --model gemma4-legal-vlm`
- Measure:
  - tokens per second
  - first-token latency
  - total response latency
  - any error or quality regressions

5. Compare against the current `vendor/models/gemma4-legal.gguf` baseline.

- If the Desktop IQ4_XS candidate matches or improves performance and quality, promote it.

## Promotion plan

1. Back up the current active repo model.

```powershell
copy c:\Users\james\Videos\deeds-web-app\vendor\models\gemma4-legal.gguf `
  c:\Users\james\Videos\deeds-web-app\vendor\models\gemma4-legal-backup.gguf
```

2. Replace the repo model with the tested IQ4_XS candidate.

```powershell
copy C:\Users\james\Desktop\gemma4-legal-iq4xs\gemma4-legal-iq4xs.gguf `
  c:\Users\james\Videos\deeds-web-app\vendor\models\gemma4-legal.gguf
```

3. Keep the Desktop candidate copy as a backup, but do not promote the duplicate merged Q4_K_M or F16 artifacts.

## Clean-up recommendations

After successful promotion:

- Remove or archive the following desktop files if they are no longer needed:
  - `gemma4-legal-merged-q4km.gguf`
  - `gemma4-legal-f16.gguf`
  - `gemma4-legal-f16-test.gguf`
- Keep `gemma4-legal-iq4xs-direct.gguf` only as a fallback if the calibrated IQ4_XS candidate regresses.

## Notes

- `gemma4-legal-iq4xs.gguf` is the preferred candidate for upgrade.
- `gemma4-legal.gguf` in repo is already the merged GRPO model.
- `LEGAL_LORA_PATH` should remain unset for the merged candidate.

## Current runtime mode

- `gemma4-legal.gguf` is the current main model.
- `mmproj-gemma4.gguf` is only used for the VLM projector when enabled.
- `TURBO_PROFILE=stock`
- `MTP_ENABLED=false`
- `ENABLE_MTP_DRAFTER=false`
- `MTP_DRAFT_MODEL` is unset / inactive
- `MTP_HEAD_PATH` / `--mtp-head` is not active
- `QJL / turbo-style V-cache` is not active

So right now your runtime is:

```
NORMAL MODE
Gemma4 → 1 token → 1 token → 1 token
```

Not:

```
DRAFT MODE
small model guesses → Gemma4 verifies
```

And not:

```
MTP MODE
Gemma4 + .mtp head → multiple tokens per step
```

### What the launcher supports for later benchmarking

- `ENABLE_MTP_DRAFTER=true` + `MTP_DRAFT_MODEL=<small.gguf>`
  - separate small draft model
  - Gemma4 verifies the draft
  - medium speed boost if the draft is accurate

- `MTP_HEAD_PATH=<model>.mtp` + `TURBO_PROFILE=turboquant|atomicbot`
  - real Gemma4 MTP head
  - higher reward
  - requires a Gemma4-compatible TurboQuant/AtomicBot binary

- `DRAFT_MODEL_PATH` is deprecated and ignored by the launcher.

### What this means for Bitfrost / local LLM inference

- `bifrostChat()` is the cache layer upstream of Gemma4.
- If Bifrost hits, the final Gemma4 runtime is skipped entirely.
- If Bifrost misses, the assistant falls through to `turboQuantChat()` and then `llama-server`.
- So drafter/MTP affects only the final Gemma4 runtime stage, not the Redis/Bifrost retrieval layer.
- In the SvelteKit chat assistant, no frontend change is needed; this is a backend runtime tuning change.

## Next steps: test + integrate

1. Verify the current baseline and caching stack.
  - `curl http://localhost:3040/health`
  - `curl http://localhost:8090/health`
  - confirm the app is using `bifrostChat()` / `turboQuantChat()` in server logs.

2. Benchmark the current candidate baseline first.
  - `npm run turbo:bench:rotorquant`
  - record tokens/sec, first-token latency, total latency, and output quality.

2a. Probe runtime/tool support.
  - `npm run models:probe`
  - confirm the current `TURBO_MODEL_PATH` and `TURBO_MMPROJ_PATH` values.
  - check whether the current `llama-server` binary supports `turbo*` / `tbq*` V-cache levels.

3. Test draft-model speculative decoding.
  - set `ENABLE_MTP_DRAFTER=true`
  - set `MTP_DRAFT_MODEL=C:\path\to\small-draft-model.gguf`
  - restart the launcher and compare.
  - this is the easy “draft model” path that can give a medium speed boost.

4. Test MTP / `--mtp-head` later only after the binary and sidecar exist.
  - set `TURBO_PROFILE=turboquant` or `atomicbot`
  - ensure `LLAMA_SERVER_PATH` points to a Gemma4-compatible TurboQuant binary
  - set `MTP_HEAD_PATH=C:\path\to\model.mtp`
  - this is the higher-risk, higher-reward path.

5. Keep the local chat assistant integration separate.
  - leave `BIFROST_ENABLED=true`
  - keep the SvelteKit route using the existing OpenAI facade
  - treat drafter/MTP as a backend runtime tuning step, not a frontend change

---

Created to capture the exact desktop-to-repo path mapping and upgrade/test procedure for the current GGUF model lane.
