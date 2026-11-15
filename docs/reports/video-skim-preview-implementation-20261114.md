# Full-duration video skim preview implementation

## Scope

Added a rebuildable, timestamped preview index to the existing canonical video analysis worker and connected it to the existing evidence modal. The preview is a visual navigation aid; its samples are not a complete decode or analysis of every source frame.

## Implementation

- FFmpeg extracts bounded windows of up to 600 low-resolution samples. The interval is at least one second and increases for longer videos to cap a manifest at 14,400 sample positions.
- Sharp composes 160×90 samples into 1600×900 JPEG sprite tiles. Each tile is content-addressed and written to the existing `atlas-artifacts` bucket.
- The PostgreSQL evidence row stores the manifest in its existing video-analysis JSONB. The manifest binds source SHA-256 revision, analysis and processing revisions, duration, sample timestamps, tile layout, object keys, and tile digests.
- Canonical readback validates the manifest schema, exact timestamps, tile references, and skim status after commit.
- The authorized tile endpoint rechecks evidence access, source revision, expected object key, byte length, SHA-256, and JPEG structure before serving a private no-store response.
- The evidence modal exposes the full-duration sample scrubber and an approximately 23-second rapid scan. Opening a selected position seeks the original video; every sample remains available on the scrubber even while rapid scan skips between positions.
- OpenSpec tasks 5.1–5.5 remain unchecked.

## Verification and limits

Focused Vitest checks passed **22/22 across 3 files**: manifest validation (3), worker integration seams/readback (16), and tile authorization/integrity (3). These use fixtures and mocks; no real FFmpeg extraction, SeaweedFS readback, or authenticated browser run was performed. `npm run check:fast` reported two existing errors in unrelated `opfs-video-cache.ts` and `nes-fsm-native-runtime-v1.ts`; it reported no errors in the skim implementation files. The result is **CREATED / WIRED / fixture-PROVEN**, not end-to-end PROVEN or DONE. Existing worker retries recompute the bounded extraction; this implementation does not add per-window durable checkpoints. Artifact objects from a failed attempt may remain orphaned and are not deleted automatically. The worker artifact-key bug found by the fixture test (use of an undefined hash variable) was corrected before the passing run.

## Handoff fields

- **likely_cause:** The viewer only had a bounded analysis-frame list, so it could not skim the full source duration.
- **evidence:** `video-skim-preview-v1.ts`, `durable-video-analysis-v1.ts`, the authorized skim tile route, `EvidenceViewModal.svelte`, and OpenSpec tasks 5.1–5.5.
- **patch_targets:** `sveltekit-frontend/src/lib/server/features/evidence/video/video-skim-preview-v1.ts`; `sveltekit-frontend/src/lib/server/features/evidence/video/durable-video-analysis-v1.ts`; `sveltekit-frontend/src/routes/api/evidence/[id]/frames/+server.ts`; `sveltekit-frontend/src/routes/api/evidence/[id]/skim-preview/[tileIndex]/+server.ts`; `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`; `sveltekit-frontend/src/lib/styles/evidence-document-modal.css`; `openspec/changes/evidence-analysis-bdd-pipeline/tasks.md`.
- **safe_next_command:** `git diff --check -- sveltekit-frontend/src/lib/server/features/evidence/video sveltekit-frontend/src/routes/api/evidence/[id]/frames/+server.ts sveltekit-frontend/src/routes/api/evidence/[id]/skim-preview sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte sveltekit-frontend/src/lib/styles/evidence-document-modal.css openspec/changes/evidence-analysis-bdd-pipeline/tasks.md`
- **smoke_command:** `cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/video/__tests__/video-skim-preview-v1.spec.ts src/lib/server/features/evidence/video/__tests__/durable-video-analysis-v1.spec.ts "src/routes/api/evidence/[id]/skim-preview/[tileIndex]/skim-preview.route.spec.ts"`
- **report_path:** `docs/reports/video-skim-preview-implementation-20261114.md`
