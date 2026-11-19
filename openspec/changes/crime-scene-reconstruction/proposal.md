# Proposal: Crime-scene reconstruction from uploaded evidence

## Why

A user uploads evidence (documents, photos, video, transcripts) and wants a scene they can review: a 2D storyboard first, with 3D review later. Today the repository has the pieces (the courtroom renderer, scene-primitive registry, splat calibration, the timeline bridge, and a video-analysis pipeline) but no owner that turns source-bound evidence into a reviewable scene proposal.

## What changes

- A "set the scene" action on the authorized evidence board, which starts an explicit, idempotent scene job. Uploading evidence alone starts nothing.
- A planner that proposes beats (who, what, why, how) from the authorized timeline, transcript segments and summaries. Every beat cites evidence with its source revision. The model may only emit the SceneIntent v1 shape.
- A deterministic clip window (20 s, decided) and a camera track stored as data. The renderer only interpolates stored keyframes.
- A 2D storyboard output, each panel labeled as a demonstrative reconstruction with its source revisions and measured or hypothesis status.
- A later 3D review path: a pilot that tracks a person in a 10 s clip and produces an unreviewed low-poly proposal.
- A source-bound image/video storybook handoff: report analysis coverage and unknowns, review visual/text observations, draft a cited hypothesis, then save image-space scene cells before any calibrated 2.5D/3D promotion.
- A separate legal-research panel may attach jurisdiction-qualified authorities retrieved through existing case-law search and admitted through ACE ContextManifest. It does not turn visual observations into a legal finding or replace attorney review.

## Capabilities

- `evidence-storybook-scene-handoff`: revision-bound observation coverage, review, cited storybook, and coordinate-safe scene handoff for uploaded evidence.

## Out of scope

- Upload, storage, worker and failure handling. These stay in `courtroom-upload-story-pipeline`.
- Playback of the courtroom simulation. That is `courtroom-simulation-runtime`.
- New text-analysis/vision model training or a replacement legal-search/indexing stack. Existing OCR, perception, case-law retrieval, and ACE owners are reused and must retain their current boundaries.
- Legal conclusions, identity attribution, guilt/innocence decisions, or automatic confirmation that an incident occurred or a location is correct.
- The jester demo. That is `jester-accessory-demo`.
- Generative video. Evidence is never replaced by generated footage.

## Impact

- Routes: shared evidence routes keep their owners and are reached through `src/lib/courtroom/courtroom-api-allowlist-v1.ts`. No new general-purpose API.
- Database: scene-revision owners exist (`scene-document-revisions-v1.ts`, `scene-markers/`); MAP-01 in `courtroom-upload-story-pipeline` section 13e is corrected. Pose and reconstruction tables are drafts only and are not applied.
- Evidence bytes and rows are never modified. Derived outputs go to derived storage only.
