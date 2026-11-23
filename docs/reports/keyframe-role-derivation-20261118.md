# Keyframe role derivation

The existing `keyframe-role-proposals-20261118.json` was derived from detector boxes and their frame positions. `main_character` means the largest/most central person box in the sampled image; `unknown_person` means other detected person boxes without identifying text. Those are visual prominence guesses, not identity, narrative role, or person-of-interest findings. The proposal file correctly leaves all entries unpersisted and `proposed`.

An existing Python helper was already present: `atlas_role_evidence_v1.py` calls the configured :8095 `/extract` API, then combines returned PERSON spans with a bounded role lexicon. Its keyframe adapter is `atlas_keyframe_analysis_v1.py`. I found that the scratch `run_analysis.py` did not call that adapter and did not assign an analysis-run ID. I updated it to attach role proposals per frame, prefilter roleless OCR before calling :8095, use a fresh UUID run ID and run-specific mask directory, write an immutable receipt, and archive the prior latest receipt before refreshing the convenience copy. The linked-observation builder now requires and carries that exact analysis-run ID. These `scratch/` runner edits are gitignored and remain local-only. A separate TypeScript draft was initially added before this existing owner was found; it is marked deprecated and has no callers.

The current three-frame OCR receipt provides no textual role/name support: frame 0 has no OCR; frame 2750 reads fragments including “Sorry to hear this happened to you”; frame 7500 reads “Provide more details here”. These phrases identify no person and contain no role term. The large central detector box therefore remains only the `main_character` visual heuristic. The current receipt lacks `analysisRunId`, so it cannot be used as if it came from the new run contract; no replacement video analysis was run.

The scratch keyframe analysis is now **WIRED in code, NOT RUN** with this role path. No case-record or scene writes were added. A text mention remains separate from visual detections; linking it to a track needs a separately reviewed action. `main_character`, `NPC`, and criminality are excluded from automatic role proposals.

## Closeout

```yaml
likely_cause: The previous labels came from visual box-size and position heuristics, which cannot establish a person's identity or legal role.
evidence:
  - docs/reports/keyframe-role-proposals-20261118.json
  - sveltekit-frontend/src/lib/server/services/langextract-service.ts
  - python/langextract_service.py
patch_targets:
  - python/atlas_role_evidence_v1.py
  - python/atlas_keyframe_analysis_v1.py
  - scratch/yolox-keyframes/run_analysis.py
  - scratch/yolox-keyframes/link.py
  - openspec/changes/crime-scene-reconstruction/tasks.md
safe_next_command: "cd sveltekit-frontend; npm run check:fast"
smoke_command: "After focused validation, submit a scratch text span to the existing LangExtract path and verify exact span/source hashes; do not persist the proposal."
report_path: "docs/reports/keyframe-role-derivation-20261118.md"
```
