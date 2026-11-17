# Evidence Analysis Progress UI — 2026-11-15

## What changed

The case-scoped Evidence Detail page now receives progress changes from the existing owner-authorized `/api/evidence/realtime?jobId=...` SSE endpoint, which reads the durable `analysis_jobs` record. The existing static job status line is replaced by an accessible `role="progressbar"` with a hard-edged, striped green/gold fill and a short CSS width transition. At queued/running 0%, the bar shows an indeterminate sweep and says the worker has not reported a percentage; it does not invent progress. Reduced-motion preferences disable animation. Terminal SSE events update the displayed status and close their stream. Page cleanup closes all EventSource connections.

This uses Svelte 5 runes, CSS animation, the current SSE/API ownership, and PostgreSQL `analysis_jobs`. It adds no Python animation, new queue, state machine, or dependency.

The repo already had two nearby progress owners:
- `sveltekit-frontend/src/lib/components/evidence/EvidenceUploadProgress.svelte` handles upload/ingest progress with SSE.
- `sveltekit-frontend/src/lib/components/agent/AgentBattleExpWidget.svelte` and `src/lib/agent/agent-exp-tracker.ts` implement a Pokémon-style simulated agent XP demo. That widget awards demo XP and is not wired to evidence analysis; the new evidence bar uses its retro visual direction only and displays real job progress.

## Runtime checks

- Durable worker Python: `C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe`, Python 3.11.9; `faster-whisper` 1.2.1, PyAV 18.1.0, CTranslate2 4.9.0. No extra virtual environment is needed for the app's shim. `C:\Python313\python.exe` has faster-whisper 1.2.1 and PyAV 19.0.2, but `media-processing.ts` launches the repository-root `.venv`, not global Python 3.13.
- FFmpeg exists in C: at `C:\Users\james\Videos\deeds-web-app\tools\ffmpeg\ffmpeg.exe` and `C:\Users\james\.stacher\ffmpeg.exe`. The frontend `.env` points `FFMPEG_PATH` to the Stacher copy; the repository root `.env` points to the repo copy.
- `C:\Users\james\.stacher\ffprobe.exe` exists beside the configured Stacher executable. The worker derives the sibling FFprobe path when `FFPROBE_PATH` is not set.

## Verification

- Playwright file — **3 passed**: deterministic media modal; live authorized WebM viewer plus completed job progress readback; adversarial SSE payload with `progress: 137` confirmed a still-running job is clamped to 99% rather than shown complete.
- Screenshot: `docs/reports/screenshots/evidence-analysis-progress-live-20261115.png`.
- `git diff --check` on the changed page and E2E spec — passed.
- `npm run check:fast` reported **5 errors** in existing unrelated files: `src/lib/client/video-editor/opfs-video-cache.ts`, `src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.ts`, `src/lib/splat/generated-scene-asset-provenance-v1.ts`, and `src/lib/splat/scene-primitive-registry-v1.ts` (two errors). It reported no diagnostics for the changed evidence detail page.

## Proof boundary

- **CREATED:** animated, accessible job progress bar and browser assertion/screenshot.
- **WIRED:** active job updates use the authorized existing SSE endpoint and durable job record.
- **PROVEN:** live completed-job readback and 100% visual state in Chromium; a malformed over-100 SSE update stays below complete until a terminal event.
- **NOT PROVEN:** a browser capture during a still-running Whisper job. The bar will remain indeterminate until this worker reports a percentage; this is intentional because faster-whisper currently returns its transcript after processing rather than streaming a verified percentage.
- **DONE:** the requested evidence detail progress indicator is implemented. The general analysis pipeline and its unrelated check failures remain open.

## Structured handoff

- **likely_cause:** Evidence detail rendered a one-time job percentage, while active durable jobs already exposed owner-checked progress over SSE.
- **evidence:** `analysis_jobs.progress`; `src/routes/api/evidence/realtime/+server.ts`; `src/routes/(app)/cases/[id]/evidence/[evidenceId]/+page.svelte`; live Chromium screenshot.
- **patch_targets:** `sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/[evidenceId]/+page.svelte`; `sveltekit-frontend/tests/e2e/evidence-video-viewer.spec.ts`; `openspec/changes/evidence-analysis-bdd-pipeline/tasks.md`.
- **safe_next_command:** `git diff --check -- sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/[evidenceId]/+page.svelte sveltekit-frontend/tests/e2e/evidence-video-viewer.spec.ts`.
- **smoke_command:** `npm exec -- playwright test tests/e2e/evidence-video-viewer.spec.ts --project=chromium --grep "authorized persisted video viewer" --reporter=list` with the live case/evidence environment variables documented in `video-viewer-playwright-browser-proof-20261115.md`.
- **report_path:** `docs/reports/evidence-analysis-progress-ui-20261115.md`.
