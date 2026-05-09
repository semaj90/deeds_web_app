# Agentic Retrieval Ladder - 2026-05-08

## Goal

Use one retrieval ladder for repo code, web sources, GitHub data, and legal/admin knowledge so the agent always starts with the same order.

## Source Order

1. Repo truth: source files, AGENTS.md, next_steps, tests, schemas, graph cards.
2. Path mapping: `context_for_file`, route ownership, and graph neighbors.
3. Sparse search: exact path, error text, symbol names, route names, citations.
4. Dense search: KnowledgeCards, embeddings, semantic doc hits.
5. Graph expansion: neighbors, clusters, shared resources, related routes.
6. External sources: Firecrawl, web search, GitHub MCP, docs, language references.
7. Rank and compare against repo truth.
8. Build a small context pack.
9. Propose the smallest correct fix.
10. Verify with tests and smoke gates.

## Retrieval Buckets

### Repo bucket

- Code files
- Route files
- AGENTS.md files
- next_steps notes
- Graph cards
- Smoke and test outputs

### Web bucket

- Firecrawl pages
- Public docs
- Search results
- API references

### GitHub bucket

- Open issues
- PRs
- commits
- file history
- release notes

### Legal/admin bucket

- PDFs
- cases
- statutes
- briefs
- evidence docs

## Ranking Rules

- Exact matches outrank semantic guesses.
- Route ownership outranks generic relevance.
- Recent fixes outrank stale context when the error is current.
- Graph neighbors outrank isolated hits.
- Legal/admin and dev/codebase contexts stay separate.

## Context Pack Rules

- Keep it short.
- Include source ids and file paths.
- Include only the most relevant cards or docs.
- Do not dump raw source unless needed for one exact check.
- Do not mix legal evidence with dev-only context.

## Verification Rules

- Confirm the target file or route exists.
- Confirm the schema or contract before editing.
- Confirm auth and validation where required.
- Run the narrowest test first.
- Expand to smoke gates only if the narrow check passes or the issue persists.

## Exit Criteria

- The agent can retrieve the right source on the first pass.
- The agent can explain why the chosen file is the right one.
- The fix is verified before any broader refactor starts.
