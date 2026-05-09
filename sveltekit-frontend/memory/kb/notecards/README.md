# Notecards

Legacy output lane. Use `memory/kb/cards/` for the shared KnowledgeCard pipeline.

Compact retrieval cards generated from graph node metadata.

Pipeline:

1. `npm run kb:graph-cards`
2. `npm run kb:graph-cards:rank`
3. `npm run kb:graph-cards:validate`

Inputs:

- Default: `memory/graph/codebase-graph.jsonl` if present
- Fallback: `docs/graph/codebase-graph.json`
- Override: `--input path/to/graph.jsonl`

Outputs:

- `graph_file_cards.jsonl`
- `graph_file_cards.report.json`
- `graph_file_cards.rank.json`
- `graph_file_cards.invalid.jsonl`

Card rule:

- parse fast
- compact card second
- retrieval third
- LLM synthesis last
