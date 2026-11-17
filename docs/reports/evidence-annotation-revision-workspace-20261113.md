# Evidence annotation revision workspace — 2026-11-13

## Outcome

Added a source-bound annotation revision path for the existing evidence viewer. It stores structured review annotations in the existing `evidence_versions` owner and does not rewrite, copy, or flatten original evidence bytes. The viewer can save notes and page/time markers, then display the latest revision history.

This is a metadata revision, not a content replacement and not an indexing operation. Receipts explicitly report `index.status: not_requested` and `canonicalAuthority: false`. No new table, migration, queue, or feature-registry row was created.

## Changes

- Added the `atlas.evidence-annotation-revision.v1` Zod contract for PDF, image, video, audio, scene, and document annotations, including bounded item counts and location validation.
- Added idempotent annotation persistence through the existing `evidence_versions` table. The transaction locks the evidence row, rechecks case and source SHA-256, and allocates the next version.
- Extended `POST /api/evidence/[id]/versions` with a size-bounded JSON request branch; existing multipart image-markup behavior remains available.
- Corrected revision-history reads to require authorized case access for case-linked evidence, or owner access for unlinked evidence. Responses are private/no-store and retain stable top-level fields on failure.
- Added viewer controls to save a review note with PDF page or current audio/video time location, and to reload/show revision history.

## Verification

- Focused Vitest: 3 files, 42 tests passed. Coverage includes all six modalities, source/case/hash mismatch, malformed audio ranges, idempotent saves, bounded JSON route validation, case denial, and authorized revision-history reads.
- Svelte compiler: `EvidenceViewModal.svelte` compiled with zero warnings.
- Scoped `git diff --check`: passed. Git emitted only line-ending normalization notices.
- No live database or SeaweedFS writes, browser run, model call, or indexing job was performed.

## Remaining work

1. Reconcile and implement the existing canonical incremental-index/outbox contract before setting any revision to indexable. Annotation-only changes should update only the annotation projection; source text edits need chunk-level invalidation and embedding regeneration.
2. Add a scratch PostgreSQL readback for concurrent revision allocation and idempotency; current persistence tests use ports/mocks.
3. Run an authenticated desktop browser flow against scratch storage to save a PDF page note and a media timestamp, reload history, and verify original object hash unchanged.
4. Add explicit history-route tests against a real authorization/readback fixture if the scratch harness supports this route.

## GAN status

- **CREATED:** Typed annotation revision contract and viewer history UI.
- **WIRED:** Viewer → authorized route → evidence revision service → existing `evidence_versions`; route authorizes owner/case collaborator and rechecks evidence case/hash under row lock.
- **PROVEN:** Focused contract/route tests and Svelte compilation.
- **DONE:** No. Scratch database/storage readback, authenticated browser acceptance, and incremental reindex remain unproven or intentionally unrequested.

## Handoff

- `likely_cause`: Viewer markup and notes had no general source-bound revision representation, and revision history reads were owner-only despite case-authorized revision writes.
- `evidence`: `src/lib/server/features/evidence/evidence-revision-v1.ts`, `src/routes/api/evidence/[id]/versions/+server.ts`, `src/lib/components/evidence/EvidenceViewModal.svelte`, and focused Vitest results.
- `patch_targets`: `sveltekit-frontend/src/lib/server/features/evidence/evidence-revision-v1.ts`; `sveltekit-frontend/src/lib/server/features/evidence/evidence-revision-v1.spec.ts`; `sveltekit-frontend/src/routes/api/evidence/[id]/versions/+server.ts`; `sveltekit-frontend/src/routes/api/evidence/[id]/versions/versions-markup-revision.route.spec.ts`; `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`; `sveltekit-frontend/src/lib/styles/evidence-document-modal.css`.
- `safe_next_command`: `rg -n "document\.parse|evidence.*index|incremental.*index|outbox" sveltekit-frontend/src/lib/server sveltekit-frontend/src/routes/api/evidence`.
- `smoke_command`: `cd sveltekit-frontend; npm exec -- vitest run src/lib/server/features/evidence/evidence-revision-v1.spec.ts 'src/routes/api/evidence/[id]/versions/versions-markup-revision.route.spec.ts' src/lib/components/evidence/evidence-markup-v1.spec.ts`.
- `report_path`: `docs/reports/evidence-annotation-revision-workspace-20261113.md`.
