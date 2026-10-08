# ORNITH-35B-MMPROJ-Q8 — Experimental admission gates

Scope: Ornith 1.5 **35B-A3B** projector only. Do not substitute for the existing 9B projector; existing `ORNITH-VLM-MMPROJ-01` receipt is 9B BF16 and is not evidence for the 35B candidate.

## Provenance
- Record BF16 and Q8_0 GGUF URLs, hashes, model-family identity, source conversion script URL and its commit.
- The reported 902,822,240-byte BF16 and 614,194,176-byte Q8_0 sizes and 83/251 tensor split are **claims to reproduce**, not verified facts here.
- Do not import third-party Python files without a source URL, commit pin and review. The user-supplied text provides filenames but no trustworthy repository URL.

## Gates
- [ ] MMPROJ-Q8-01 Confirm both actual artifacts and SHA256, GGUF header, model-family linkage.
- [ ] MMPROJ-Q8-02 Parse and compare full metadata, allowing only explicitly justified quantization metadata changes.
- [ ] MMPROJ-Q8-03 Verify all tensor names/shapes, 251 unchanged byte-identical and 83 BF16->Q8_0 conversions (or record deviations and fail).
- [ ] MMPROJ-Q8-04 Confirm quantizable contiguous axis, 32-element block layout, half-scale decoding and per-tensor errors.
- [ ] MMPROJ-Q8-05 Repeat conversions deterministically; record producer revision and output digest.
- [ ] MMPROJ-Q8-06 Real-image projector activation parity and downstream vision-answer quality vs BF16, fixed images/prompts/seeds.
- [ ] MMPROJ-Q8-07 Bench peak VRAM, projector-load, clip warmup, 1/4 concurrent streams, context length; show no fatal OOM.
- [ ] MMPROJ-Q8-08 Regression: default Ornith 9B / Gemma4 unaffected, no cross-family substitution.
- [ ] MMPROJ-Q8-09 Runtime ABI/llama.cpp commit compatibility and CUDA vs CPU offload modes.
- [ ] MMPROJ-Q8-10 Emit revision-qualified PASS/FAIL receipt; no promotion until all mandatory gates pass.

## Tensor audit utility

Requires `numpy` and matching `llama.cpp/gguf-py` (do not install into production sidecar):

```bash
PYTHONPATH=/path/to/llama.cpp/gguf-py python3 scripts/experiments/mmproj_tensor_compare.py \
  /path/to/mmproj-Ornith-1.5-35B-BF16.gguf \
  /path/to/mmproj-Ornith-1.5-35B-Q8_0.gguf \
  --max-abs 0.005 --report artifacts/mmproj-35b-comparison.json
```

Interpretation: PASS only confirms file-level tensor reconstruction and unchanged fields under tool policy. Not a proof of generation quality, live multimodal behavior, or runtime VRAM safety.

## Discovered existing owner

`docs/reports/ornith-vlm-mmproj-01-proof-v1.json`: previously completed 9B BF16 projector smoke test, launcher model-family isolation, `scripts/launch-turboquant.ps1`. **Retain** existing owner and do not modify it for this 35B evaluation.

## Subsequent implementation

Use offline script for verification, not as a runtime weight-conversion hot path. Quantizer creation should use pinned gguf quantization API and known GGUF metadata-preserving writer; vendor-copy only with license/provenance and tests. No model GGUF files committed.
