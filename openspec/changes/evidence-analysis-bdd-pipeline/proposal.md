# Proposal: Evidence Analysis BDD Pipeline & Case-to-Analysis Journey

## Summary
Align the multimodal evidence analysis and playback pipelines with the 56 executable BDD scenarios across:
1. `media-analysis-durable-pipeline.feature` (18 scenarios) — Durable media admission, worker recovery, silent video probes, bounded timeouts, deterministic sampling.
2. `evidence-image-and-video-findings.feature` (11 scenarios) — Source-coordinate bounding boxes, non-identifying person labels, face gallery decoupling, unreviewed proposal labels, and reviewer accept/reject/correct separation.
3. `evidence-analysis-indexing-and-readback.feature` (13 scenarios) — Multimodal vector isolation, canonical PostgreSQL outbox sync, case-scoped search, and revision-isolated caching.
4. `case-evidence-analysis.feature` (14 scenarios) — Full end-to-end case overview, evidence board guidance, durable job status recovery, 1-fps frame scrubber, source-timed seeking, and fail-closed case authorization.

## Motivation
Recent audits established that:
- Inline upload requests in `video-ingest-service.ts` bypassed durable worker leasing, risking dropped jobs on large or slow media uploads.
- Silent CCTV/surveillance footage (e.g., Cam-N-04 at 14:02:35) lacked an `ffprobe` audio stream presence check, failing audio extraction before visual frame analysis could run.
- YOLO detections lacked explicit non-identifying flags and aspect-ratio mapping back to original source dimensions.
- The 56 BDD scenarios define the forensic requirements for chain-of-custody, immutable original evidence preservation, and human-in-the-loop review.

## Scope
- Implement and verify the 56 BDD scenario matrix across all 4 feature files.
- Provide end-to-end Playwright tests executing the complete case-to-analysis journey.
- Ensure FilmCraft / Evidence Board synchronization matches the 254,016,000,000 tick standard and 1-fps frame scrubbers.

## Capabilities
- `durable-media-processing`: Durable, restart-safe media analysis jobs and derived media outputs.
- `source-grounded-media-findings`: Revision-bound image/video findings with source locators and human review.
- `evidence-analysis-indexing`: Canonical indexing, projection isolation, revision-aware cache behavior, and readback.
- `case-evidence-analysis`: The authorized case-to-exhibit-to-analysis user journey.
