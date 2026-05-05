# AGENTS.md — `tests`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory: tests

## Snapshot

- 133 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- 🔴 SSR-unsafe: 7 · 🟠 hardcoded localhost: 1


## Files (133)

- `ace-context-glossary.spec.ts`
- `ace-ingest-route.spec.ts`
- `ace-pipeline-wiring.spec.ts`
- `ace-policy.spec.ts`
- `ace-status-route.spec.ts`
- `ace-summarize-route.spec.ts`
- `ai-analysis-pipeline.spec.ts`
- `ai-canon-routes.spec.ts`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "tests", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "tests", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
