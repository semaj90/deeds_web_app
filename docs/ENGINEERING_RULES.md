# Engineering Rules (project-wide)

This file captures lightweight engineering rules introduced during the OpenCode / ACE pipeline work.

1) Script Naming Rule
- All project scripts under `scripts/` and `scripts/opencode/` MUST use snake_case filenames (e.g. `generate_summaries_from_source.mjs`).
- Rationale: avoids ambiguous hyphen/underscore mismatches across shells, CLI tooling, and human typing.
- Enforcement: CI lint job should add a check to reject `-` (hyphen) in script filenames; until then, maintainers must prefer snake_case.

2) OpenCode Prompt Discipline: MODULE_NOT_FOUND
- If a generated prompt or tool-run emits `MODULE_NOT_FOUND` / `ERR_MODULE_NOT_FOUND`, treat it as an authoring/filename error, not a model generation task.
- Actions:
  - Log the exact missing module path and propose the corrected snake_case filename when available.
  - Do NOT auto-modify filenames or create files to satisfy the module; require human confirmation.
  - Add a short hint to the prompt: "Check for hyphen vs underscore in script names (use snake_case)."

3) Recovery Policy for Empty Summaries
- If a deterministic source-backed summary-run recovers 0 valid summaries, mark those cards as unresolved and exclude them from ACE/Qdrant uploads.
- Record a backup of the merged summaries file (`.opencode/cards/summaries.merged.jsonl.bak`) before any write.

4) Notes
- These rules are intentionally narrow and ops-focused; propose CI checks separately (e.g., a file-name lint step and a prompt-discipline guideline in PR template).
