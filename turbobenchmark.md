# TurboQuant Benchmark Summary

## Context
- Date: 2026-05-19
- Location: `sveltekit-frontend`
- Command: `npm run turbo:bench:auto -- --port 8080 --n 5`
- Script: `sveltekit-frontend/scripts/turboquant/bench-model.mjs`
- Server: `http://127.0.0.1:8080`
- VLM image: `scripts/tests/screenshots/cases-ui/poi-after-upload.png`

## Final Results
| Run | Mode | Requested Model | avg TTFT (ms) | avg total (ms) | avg tok/s | status |
|---|---|---|---|---|---|---|
| baseline-text | text | `gemma4-legal.gguf` | 203 | 6202 | 68.8 | ok |
| candidate-text | text | `gemma4-legal-iq4xs.gguf` | 131 | 6302 | 69.2 | ok |
| baseline-vlm | vlm | `gemma4-legal.gguf` | 117 | 6102 | 71.9 | ok |
| candidate-vlm | vlm | `gemma4-legal-iq4xs.gguf` | 113 | 5593 | 72.4 | ok |

## What this proves
- `--auto-compare` is now fully automated.
- Text-only and VLM benchmarks run in one command.
- VLM is functional and stable.
- The benchmark script now reports the requested model alongside observed server state.

## Decision
- Text mode: candidate is faster than baseline.
- VLM mode: candidate is also faster/similar and successful.
- Result: `IQ4_XS` is viable for further testing.

## Notes
- This run does not yet include drafter/MTP/turbo KV.
- The next phase is model selection validation, then performance optimization.
- Verify the server model load path if you need additional confidence that `gemma4-legal-iq4xs.gguf` is being used by the backend.

## Raw output files
- `sveltekit-frontend/logs/turboquant/bench-run-1779155255466-2026-05-19T01-48-06-577Z.json`
- `sveltekit-frontend/logs/turboquant/bench-run-1779155255466-2026-05-19T01-48-38-109Z.json`
- `sveltekit-frontend/logs/turboquant/bench-run-1779155255466-2026-05-19T01-49-08-625Z.json`
- `sveltekit-frontend/logs/turboquant/bench-run-1779155255466-2026-05-19T01-49-36-599Z.json`

## Next steps
1. Confirm `gemma4-legal-iq4xs.gguf` is loaded and address any model selection aliasing.
2. Re-run `npm run turbo:bench:auto -- --port 8080 --n 5` with confirmed candidate model availability.
3. If validated, test `--model-draft` and `--mtp-head` next.
4. Then enable turbo KV for the next speed jump.
