# Claude Workflow for Svelte Diagnostics

Use Claude (desktop/app) with the generated artifacts to get structured, repo‑wide fixes.

Artifacts to attach or paste
- `svelte-top100.json`
- `svelte-errors-by-type.json`
- `svelte-errors-by-file.json` (or relevant file slices)

Prompt template
```
You are assisting with a SvelteKit + TS monorepo. Using the attached Top 100 errors and per‑file index, propose a prioritized plan and concrete code changes that:
- Address root causes, not just surface errors
- Keep changes minimal, consistent with current style
- Avoid unrelated refactors
- Include exact file paths and code blocks
- Note any tsconfig/svelte.config/vite alias adjustments
```

Follow‑ups
- “Draft patches for the top 3 error types across all affected files”
- “Generate a migration checklist for $lib alias and ambient module declarations”
- “Suggest a safe ‘ignore’ or ‘skipLibCheck’ strategy to unblock dev while we fix types”

Validation
- Re‑run VS Code Task: “Diagnostics + Ollama Suggestions”
- Run: “Analyze Svelte Errors (Top 100)” to confirm deltas

