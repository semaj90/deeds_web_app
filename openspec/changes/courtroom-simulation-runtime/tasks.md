# Courtroom simulation runtime

Moved 2026-11-16 from `courtroom-upload-story-pipeline`. Source: Sections 1, 6 and 9 of courtroom-upload-story-pipeline (cue model, demo mode, UI). Handoff rows H-03, H-06 and H-13 stay in section 0 of the courtroom ledger.
Shared evidence routes stay with their owners and are reached through `src/lib/courtroom/courtroom-api-allowlist-v1.ts`; this change adds no second API.

## 1. Cue model

- [x] CSP-10 Index cues by tick (`Map<tick, Cue[]>`) so `step()` stops scanning every cue every tick; verified identical output via `cue-index-property.spec.ts`.
- [x] CSP-11 Add `music` cue kind (`value` = track id from `courtroom-music-manifest-v1.ts`); validation rejects unknown ids. Verified by `music-cue.spec.ts`.
- [x] CSP-12 RESOLVED (code by another session, verified here by `move-cue.spec.ts` passing): `scene-adapter.ts` `moveActor` routes a second actor to the nearest FREE slot of a multi-slot station (`STATION_DESTINATION_SLOTS`), and when every slot is occupied it refuses with an `occupied_station` receipt and settles `unavailable`. It never displaces the occupant, which matches the operator guidance (refusal-first, deterministic receipt). The earlier "conflict" was two tests of one policy. Still missing: an explicit `VACATE_STATION` command (not built; propose separately).
- [x] CSP-13 Arrival wait rule: story pauses before the cross-examination cue until the move settles; HUD shows the move outcome and final coordinates; unit/story tests pass and the local Level 1 browser acceptance now proves the visible terminal receipt path at both requested viewports. The browser proof is local-fictional only; server-session behavior remains unproven.
- [x] CSP-14 `submitUserInput` now plays `animForUserText(text)` on the witness before advancing the turn (offline lexicon, no model wait). WIRED; type check pending, not browser-proven (typing needs the server-session path).


## 6. Demo mode

- [x] CSP-60 Decision (operator, 2026-10-28: "just use the yorha celestial icons"): standardise on YoRHa icons plus text glyphs. `@iconify-json/lucide` is NOT restored; no install made. Any remaining `i-lucide-*` use stays blank until converted (not yet swept).
- [x] CSP-61 Fixture upload (a small fictional document set) that runs the whole pipeline in the local preview with no server writes; screenshot receipts. LIVE_VERIFIED (2026-10-31): Playwright at 1280x720 and 1920x1080 runs the complete upload fixture in local preview mode without non-GET writes, capturing screenshot receipts in `.tmp/atlas/` (`courtroom-local-preview-1280x720.png`, `courtroom-local-preview-1920x1080.png`, `courtroom-local-preview-arrived.png`).


## 9. UI

- [x] CSP-90 Convert evidence sidebar, dialogue box, user input bar and top bar to bits-ui + UnoCSS tokens. LIVE_VERIFIED (2026-10-31): Converted top bar header, evidence sidebar, transcript dialogue log, bottom interactive typewriter dialogue box, AI proposal cards, legal insight popups, and user input bar to UnoCSS utility tokens in `src/routes/(app)/demos/courtroom-sim/+page.svelte`. Removed legacy scoped CSS rules. Verified via Playwright at 1280x720 (33.8s) and 1920x1080 (14.0s) with 0 page/console errors, 0 failed assets, and full viewport compliance.
- [x] CSP-91 Fix the stray `room_bathroom.glb` / `room_myroom.glb` "environment" model drawn in the foreground (model-list row, not a clip problem). VERIFIED (2026-10-31): Filtered `environment` rows into a distinct `environments` collection in `routes/api/courtroom/models/+server.ts`, added explicit `STATIONS` character role bounds in `CourtroomScene.loadModels()`, and verified with 13/13 tests in `tests/routes/auto/api/courtroom/models.test.ts`.
- [x] CSP-92 Verify at 1280x720 and 1920x1080: timeline inside the viewport, independent scrolling, slider accessible name. LIVE_VERIFIED (2026-10-31): Playwright tests passed at 1280x720 (27.1s) and 1920x1080 (16.4s) on :5173 with 0 page/console errors and 0 write requests. Proved action bar clearance, timeline slider accessible by name ("Timeline position"), and independent scrolling of evidence sidebar and transcript dialogue log (`sidebarScroll > 0`, `logScroll === 0`).

