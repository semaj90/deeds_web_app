# llm recommendations

## Current guidance

- Start from `sveltekit-frontend/` for app work.
- Use the smallest verified change set.
- Update `llm/llm_timeline.md` whenever the hub changes.
- Keep `llm/llm_inventory.md` and `llm/llm_dependencies.md` aligned with real repo state.
- Keep directory wiki pages close to the original `AGENTS.md` indexing shape so ACE / KAG / Gemma4 retrieval stays predictable.
- Prefer a single master Karpathy page for script routing over scattering many tiny notes.
- Keep a workspace-root map alongside the app map so infra, bridges, and workflows are not hidden behind `sveltekit-frontend/`.

## Safeguards

- Never delete timeline history.
- Never replace a known page with a blank one.
- If a page already exists, append or refine rather than overwrite without cause.

## To-dos

- Add counts for files, modules, packages, and languages.
- Expand repo path mapping as the directory scan stabilizes.
- Keep the wiki small enough that an agent can read it quickly.
