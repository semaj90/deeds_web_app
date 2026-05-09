# Knowledge Base

Shared ingestion spine for two pipelines.

Pipeline A: legal/admin documents

- PDFs, statutes, briefs, exhibits, court docs
- access-controlled
- citation-preserving
- evidence-safe

Pipeline B: dev/codebase graph

- JSONL graph nodes
- markdown memories
- code graph and vault notes
- workspace-scoped

Shared card outputs:

- `memory/kb/cards/codebase_graph_cards.jsonl`
- `memory/kb/cards/codebase_graph_cards.report.json`
- `memory/kb/cards/codebase_graph_cards.invalid.jsonl`
- `memory/kb/cards/codebase_graph_cards.rank.json`

Flow:

`source file -> source_hash -> parser -> chunks -> notecards -> summaries -> embeddings -> graph edges -> context packs -> LLM analysis -> audit log`
