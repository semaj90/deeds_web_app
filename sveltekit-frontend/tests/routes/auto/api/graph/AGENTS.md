# AGENTS.md — `tests/routes/auto/api/graph`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory: tests/routes/auto/api/graph

## Snapshot

- 10 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- no audit signals


## Files (10)

- `analyze.test.ts`
- `cases.test.ts`
- `colab-export.test.ts`
- `connections.test.ts`
- `hypergraph.test.ts`
- `recommendations.test.ts`
- `relationships.test.ts`
- `som-topology.test.ts`


## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "graph", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "api graph", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "tests/routes/auto/api/graph/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
