# Proposal: Crime-scene reconstruction from uploaded evidence

## Why

A user uploads evidence (documents, photos, video, transcripts) and wants a scene they can review: a 2D storyboard first, with 3D review later. Today the repository has the pieces (the courtroom renderer, scene-primitive registry, splat calibration, the timeline bridge, and a video-analysis pipeline) but no owner that turns source-bound evidence into a reviewable scene proposal.

## What changes

- A "set the scene" action on the authorized evidence board, which starts an explicit, idempotent scene job. Uploading evidence alone starts nothing.
- A planner that proposes beats (who, what, why, how) from the authorized timeline, transcript segments and summaries. Every beat cites evidence with its source revision. The model may only emit the SceneIntent v1 shape.
- A deterministic clip window (20 s, decided) and a camera track stored as data. The renderer only interpolates stored keyframes.
- A 2D storyboard output, each panel labeled as a demonstrative reconstruction with its source revisions and measured or hypothesis status.
- A later 3D review path: a pilot that tracks a person in a 10 s clip and produces an unreviewed low-poly proposal.

## Out of scope

- Upload, storage, worker and failure handling. These stay in `courtroom-upload-story-pipeline`.
- Playback of the courtroom simulation. That is `courtroom-simulation-runtime`.
- Text analysis and any machine-learning passes. That is `courtroom-text-analysis-ml`.
- The jester demo. That is `jester-accessory-demo`.
- Generative video. Evidence is never replaced by generated footage.

## Impact

- Routes: shared evidence routes keep their owners and are reached through `src/lib/courtroom/courtroom-api-allowlist-v1.ts`. No new general-purpose API.
- Database: scene-revision ownership is unresolved (MAP-01 in `courtroom-upload-story-pipeline` section 13e). Pose and reconstruction tables are drafts only and are not applied.
- Evidence bytes and rows are never modified. Derived outputs go to derived storage only.
