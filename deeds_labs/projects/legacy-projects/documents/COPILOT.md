# Copilot Workflow for Svelte Diagnostics

This repository produces machine‑readable diagnostics and summaries so Copilot can generate targeted fixes.

Artifacts
- `svelte-check.log` — raw log captured from svelte-check
- `svelte-top100.json` — top 100 messages with counts
- `svelte-errors-by-type.json` — messages with counts + example files
- `svelte-errors-by-file.json` — per‑file items with line/column

Run in VS Code (Tasks)
1) “Svelte Check (log to file)”
2) “Analyze Svelte Errors (Top 100)”
3) “Index Svelte Errors (by file/type)”

Prompt starters (open a file, then run Copilot Chat)
- “Summarize svelte-errors-by-type.json and propose repo‑level mitigations.”
- “For src/routes/…/+page.svelte, fix the top 3 errors found in svelte-errors-by-file.json.”
- “Create a PR plan to eliminate ‘Cannot find module $lib/…’ errors across the repo.”

Tips
- Ask Copilot to produce minimal, safe diffs and include file paths.
- Use the Top 100 to prioritize a migration path (path aliases, generics, missing types).
- Validate with Tasks → “Svelte Diagnostics (Log → Analyze → Index)”.

