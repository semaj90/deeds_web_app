# ACE Recovery Skill

Use when file discovery, graph exports, ACE packets, Qdrant tags, Redis cache, or fallback recovery fails.

## Rules

- Never read guessed paths.
- Never use task tool for deterministic commands.
- Never claim MCP ran unless a tool result exists.
- If a command fails with missing description, retry once with a description.
- If graph smoke passes but export fails, report degraded success.

## Semantic Variance Recovery

If exact path discovery fails, recover through this order:

1. file discovery
2. `rg` confirmed paths
3. Qdrant tag recall
4. Redis ACE semantic cache
5. LangExtract entities
6. did-you-mean cosine candidates
7. ACE packet
8. Gemma4 stream

## Recovery smoke priorities

- graph exports
- DuckDB smoke
- ACE packet injection
- Redis cache packet verification
- top-100 summary/retrieval packets

