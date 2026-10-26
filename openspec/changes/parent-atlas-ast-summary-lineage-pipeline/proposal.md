# Proposal: AST-grep chunk → symbol → summary lineage pipeline

## Why

Summaries are needed for codebase analysis, but only 14.7% of `codebase_chunk_index` rows have one, and nothing records which chunk, symbol, LSP fact or `sourceRef` produced it. Summarization is the last step; the earlier steps must be exact before a model writes anything.

## What

Build the pipeline in this order, with each stage using an existing owner:

1. ast-grep / Tree-sitter chunking (`:8095 /ast/chunk`) → native chunks with byte spans.
2. Symbol extraction (`scripts/atlas/lib/ast-grep-symbol-extraction.mjs`, `ast-chunk-source-path-v1.mjs`).
3. LSP language facts (`scripts/atlas/lib/indexed-source-lsp-v1.mjs`), as evidence only.
4. Canonical payload keyed by `sourceRef` + `sourceRevision`, linking chunk → symbol → feature_label.
5. Hyperparameter index (tuple-keyed dict in Python, linked list only where order matters).
6. Summary generation with Ornith on `:8090`, grounded in steps 1–4, then admitted through the summary gate.

## Non-goals

- No langextract summaries. LangExtract produces grounded spans and entities, not summaries.
- No writes to Postgres, Qdrant, Redis, or Neo4j in this change until a separate apply gate is approved.
- No new embedding model or dimension. Canonical stays `semantic_768`.
- No change to canonical identity. `packet_key`, `source_ref`, and revisions are not fuzzy-matched.

## Owners and authority

Authority follows `CLAUDE.md`: Postgres is canonical, and every derived artifact is non-canonical until admitted. Existing owners are reused; any new code must be checked against `docs/architecture/runtime-ownership-registry.json` first.
