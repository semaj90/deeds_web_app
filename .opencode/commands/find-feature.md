Command: find-feature

Purpose
-------
Find feature wiring and produce a Gemma4 patch card for targeted fixes.

Behavior
--------
- Searches the repository for the provided feature name
- Aggregates `sourceRefs`, `relatedScripts`
- Writes `.opencode/feature-map/<feature>.json` and `<feature>-patch-card.json`
- Prints a compact JSON summary to stdout

Usage
-----
Run:

```bash
npm run opencode:find-feature -- --feature ace-context --json
```

Notes
-----
- Do not paste large outputs into chat. Inspect `.opencode/feature-map/<feature>.json` instead.
- The generated patch card is intended to be passed to the atlas-context subagent (Gemma4) for surgical edits.
