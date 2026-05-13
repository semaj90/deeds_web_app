# Path Mapping + Retrieval Stack - 2026-05-08

## Goal

Create the canonical path-mapping layer that lets the agent pull the right repo, docs, web, and MCP context before any fix is proposed.

## Canonical Seams

- `src/lib/server/atlas/context-for-file.ts`
- `src/mcp/trace-mcp-server.ts`
- `src/routes/api/ace/recommendations/+server.ts`
- `scripts/smoke-atlas-context.mjs`
- `scripts/generate-agents-md.mjs`
- `scripts/index-vault-md.mjs`
- `scripts/kb/search-graph-cards.mjs`
- `src/lib/phase72/routeGraphAdapter.ts`
- `docs/design/2026-05-13_daily-activity-atlas.md`

## What Already Exists

- `codebase.context_for_file` and `agents_md.context_for_file` already expose the main path-mapping flow.
- `smoke-atlas-context.mjs` already verifies the end-to-end context-for-file lane.
- `api/ace/recommendations` already wraps the context packet for UI use.
- `routeGraphAdapter.ts` is the main route-graph bridge and should be treated as a consolidation target, not a new parallel path.

## Retrieval Inputs

- Repo code and route files
- AGENTS.md envelopes
- KnowledgeCards from codebase graph and legal/admin docs
- Vault markdown and session notes
- Daily activity atlas entries and date-indexed workflow summaries
- Web sources via Firecrawl or search
- GitHub/MCP metadata when needed

## Retrieval Order

1. Exact path and error match.
2. AGENTS.md / route ownership.
3. KnowledgeCards and graph neighbors.
4. Sparse search and dense search.
5. Context packet build.
6. Compare to repo truth.
7. Patch the smallest correct target.

## Build Order

1. Normalize path lookup into one shared helper shape.
2. Feed repo/docs/web/MCP sources into the same retrieval ladder.
3. Add daily activity atlas lookups for date-scoped workflow context.
4. Keep read-only context extraction separate from mutation paths.
5. Reuse `context_for_file` everywhere before adding new tools.
6. Only then expand to broader agentic error fixing.

## Checklist

- Path inputs resolve to a single canonical file id.
- Route ownership is known before search starts.
- Cards are ranked before LLM use.
- Retrieval returns a small, source-linked context pack.
- No lane mutates data during inspection.
- No new parallel path exists for the same file lookup.

## Exit Criteria

- The agent can answer “what owns this file?” quickly.
- The agent can find the nearest doc, card, and route context.
- The agent can pull today/yesterday workflow context from the daily atlas.
- The same path map works for code, docs, and legal/admin sources.
