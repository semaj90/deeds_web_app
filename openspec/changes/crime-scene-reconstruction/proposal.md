# Proposal: Crime-scene reconstruction from uploaded evidence

## Why

A user creates a case, supplies an initial who/what/when/where/why/how brief, selects evidence, and wants a complete interactive HTML5 reconstruction experience they can navigate, inspect, and play through an event timeline. The existing courtroom renderer, scene-primitive registry, splat calibration, timeline bridge, and video-analysis pipeline provide parts, but there is no complete owner joining qualified case inputs to an event-driven, revision-pinned browser scene. A 2D storyboard is an optional companion view, not a required first product.

## What changes

- A "set the scene" action on the authorized evidence board, which starts an explicit, idempotent scene job. Uploading evidence alone starts nothing.
- A planner that proposes beats (who, what, why, how) from the authorized timeline, transcript segments and summaries. Every beat cites evidence with its source revision. The model may only emit the SceneIntent v1 shape.
- A deterministic clip window (20 s, decided) and a camera track stored as data. The renderer only interpolates stored keyframes.
- A browser-based, game-like scene experience with procedural city/beach/indoor environments, reusable actors and props, spatial-cell streaming, instanced repeated scenery, camera navigation, selection, an event timeline, and deterministic play/pause/scrub/replay.
- A versioned scene-generation plan and durable worker handoff that bind selected evidence, source revisions, reviewed observations, independent clock lanes, scene events, asset recipes, and expected scene revision. User-authored blockouts remain usable without AI or evidence uploads.
- Event-driven visuals that follow saved event/source intervals; no cross-source ordering or synchronized playback without a reviewed clock mapping. Claims remain source-cited and explicitly reviewed, disputed, hypothetical, or unknown.
- Optional 2D storyboard, GLB/SPZ, video, Blender optimization, or Unreal Windows executable exports as revision-pinned derivatives. None is required to run the HTML5 scene.
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
