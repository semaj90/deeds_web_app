# Agentic Retrieval Checklist - 2026-05-08

## Prompt-Ready Checklist

1. Identify the exact file, route, or error.
2. Check route ownership and AGENTS.md first.
3. Pull repo truth: source, tests, schemas, next_steps, graph cards.
4. Search sparse: path, symbols, error text, citations.
5. Search dense: KnowledgeCards and embeddings.
6. Expand graph neighbors and related docs.
7. Add external sources only if repo evidence is insufficient.
8. Rank results against repo truth.
9. Build a small context pack.
10. Make the smallest fix.
11. Verify with the narrowest test.
12. Escalate to smoke gates if needed.
13. Log the outcome.

## Rules

- Exact matches first.
- Legal/admin and dev/codebase stay separate.
- No raw source dump unless required.
- No mutation during inspection.
- No fix without verification.

## Sources

- Repo files
- AGENTS.md
- next_steps notes
- graph cards
- tests and smoke outputs
- web search / Firecrawl
- GitHub MCP
- language docs
