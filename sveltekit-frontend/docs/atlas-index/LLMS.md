# AGENTS.md — `sveltekit-frontend/docs/atlas-index`

## Manual Verification Note (2026-05-22)

Read-only retrieval chain coverage is split across route-test files:

- `tests/routes/auto/api/chat/stream.cache-hit.test.ts` (cache-path and stream error shape)
- `tests/routes/auto/api/chat/stream.retrieval-chain.test.ts` (chain order and fallback contract)
- `tests/routes/auto/api/chat/stream.test-harness.ts` (shared mock wiring, default setup, and fixture builders)

OpenCode retrieval lane:

- Command: `.opencode/command/rg-atlas.md`
- Command: `.opencode/command/mcp-trace.md`
- Command: `.opencode/command/mcp-turbovec.md`
- Command: `.opencode/command/mcp-engram.md`
- Command: `.opencode/command/mcp-langextract.md`
- Agent: `.opencode/agents/rg-atlas.md`
- Agent: `.opencode/agents/mcp-toolchain.md`
- Agent: `.opencode/agents/trace-mcp-tooling.md`
- Agent: `.opencode/agents/metadata-context-analysis.md`
- Skill: `.opencode/skills/rg-atlas/SKILL.md`
- Skill: `.opencode/skills/mcp-toolchain/SKILL.md`
- Skill: `.opencode/skills/trace-mcp-tooling/SKILL.md`
- Skill: `.opencode/skills/metadata-context-analysis/SKILL.md`

Lane order:

- `rg` for exact recall.
- LangExtract for compact structure.
- SourceRefs first, synthesis second.
- No file edits in this lane.

Retrieval-chain assertion coverage includes:

- SSE retrieval stages emitted in-order:
  `sourceRef_exact_match -> graph.expand_neighborhood -> turbovec.rank_chunks -> engram.chat_memory_recent`
- `callTraceMcp` invocation order exactly:
  `graph.expand_neighborhood, turbovec.rank_chunks, engram.chat_memory_recent`
- Fallback behavior when chain ranking returns no refs:
  emits rerank breakdown with source `toon.rerankFeaturesWithBreakdown`

Refactor guardrail:

- Vitest does not allow directly exporting a `vi.hoisted(...)` variable.
- In `stream.test-harness.ts`, keep the hoisted binding private and export a normal alias.

Validation run:

- Command:
  `npm run test:run -- tests/routes/auto/api/chat/stream.cache-hit.test.ts tests/routes/auto/api/chat/stream.retrieval-chain.test.ts`
- Result:
  `2 files passed, 5 tests passed`

Sidecar smoke run:

- Command:
  `npm run smoke:mcp:opencode-sidecars`
- Result:
  `ok: true`
- Notes:
  `turbovec-sidecar`, `engram-embed`, and `langextract` all reported healthy.
  The run also logged a TCP connect warning on `127.0.0.1:8791`, but the smoke still finished green.
  Treat this warning as non-fatal for the smoke gate unless `ok` flips to `false` or a required sidecar reports unhealthy.

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-15T03:29:31.367Z · agents.md spec · regen: npm run agents:write -->

> Directory: sveltekit-frontend/docs/atlas-index

## Snapshot

- 2 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- no audit signals


## Files (2)

- `codebase-atlas.json`
- `codebase-atlas.min.json`

## Tools

> MCP tools the Gemma4 agent should reach for inside this directory.
- kag.multi_lane_search
- graph.expand_neighborhood
- topology.same_som_cluster
- clusters.get_members
- context.build_kv_packet
- taxonomy.children

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 0/2 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "atlas-index", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "docs atlas-index", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "sveltekit-frontend/docs/atlas-index/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
