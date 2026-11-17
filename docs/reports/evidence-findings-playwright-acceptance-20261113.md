# Evidence Findings Playwright Acceptance

Date: 2026-11-13  
OpenSpec owner: `courtroom-upload-story-pipeline`  
State: acceptance contract created; live browser behavior not proven

## Scope

Added an opt-in Playwright suite for the BDD feature `evidence-image-and-video-findings.feature`. The suite requires an explicit authenticated storage-state file, one authorized case ID, image and video evidence IDs, their immutable source revisions, and the video finding timestamp. It uses the case board and evidence viewer without seeding, uploading, mocking findings, triggering inference, or cleaning up user data.

The image scenario expects a durable finding to identify its source revision and model/preprocessing revisions, then highlight a region in original image coordinates. The video scenario expects a revision-bound finding to seek the source player to its declared presentation time and remain marked as an unreviewed proposal.

The current evidence viewer does not yet expose the expected persistent findings sidebar or these source-provenance selectors. The test is therefore an acceptance target for the missing UI/pipeline connection, not evidence that the feature currently works. OpenSpec task `17B.12` remains unchecked pending implementation and authorized readback.

## Verification

Command:

```text
npm exec -- playwright test --config playwright.evidence-findings.config.ts --list
```

Observed output:

```text
Listing tests:
  evidence-findings-source-context.spec.ts:37:2 › Review image and video analysis findings in their source context › an image finding opens the admitted image revision and highlights its original region
  evidence-findings-source-context.spec.ts:60:2 › Review image and video analysis findings in their source context › a video finding seeks to its source time and retains source revision provenance
Total: 2 tests in 1 file
```

`git diff --check` on the scoped task and new test/config paths exited 0; Git emitted only its LF-to-CRLF working-copy notice for the pre-existing edited OpenSpec ledger. The browser tests themselves were not run because no explicit user session and disposable case/evidence fixture were supplied in this run.

## GAN

- **CREATED:** Two source-context Playwright scenarios and a dedicated isolated config.
- **WIRED:** The suite navigates the authorized case board and opens the existing evidence viewer; expected persistent findings UI remains unwired.
- **PROVEN:** Playwright discovered both tests. No browser, analysis, persistence, authorization, or independent readback behavior was exercised.
- **DONE:** No. See unchecked OpenSpec task `17B.12`.

## Handoff

- **likely_cause:** The existing viewer can display media and run local/on-demand tools, but it does not yet present durable, source-revision-bound image/video findings as navigable sidebar items.
- **evidence:** `sveltekit-frontend/tests/bdd/features/evidence-image-and-video-findings.feature`; current image controls and local-only video dHash in `sveltekit-frontend/src/lib/components/evidence/EvidenceViewModal.svelte`; video analysis page shape in `sveltekit-frontend/src/routes/(analysis)/video-analysis/[evidenceId]/+page.svelte`.
- **patch_targets:** `sveltekit-frontend/tests/e2e/evidence-findings-source-context.spec.ts`; `sveltekit-frontend/playwright.evidence-findings.config.ts`; `openspec/changes/courtroom-upload-story-pipeline/tasks.md`.
- **safe_next_command:** Review the focused diff and provide a dedicated authenticated, disposable case fixture with image/video evidence IDs and expected revisions.
- **smoke_command:** With those fixture values set, run `npm exec -- playwright test --config playwright.evidence-findings.config.ts` from `sveltekit-frontend`.
- **report_path:** `docs/reports/evidence-findings-playwright-acceptance-20261113.md`.
