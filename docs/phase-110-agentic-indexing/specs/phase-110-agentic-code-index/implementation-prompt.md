# Claude Code / Codex / OpenCode implementation prompt

You are implementing Parent Atlas Phase 110: Provenance-Aware Agentic Code Indexing.

Use the repository itself as evidence. Do not create duplicate owners before searching existing files.

## Required first actions

Run:

```bash
bash scripts/atlas/phase-110-discover.sh .
```

Then inspect:

```bash
sed -n '1,240p' artifacts/phase-110/discovery/STATUS.md
wc -l artifacts/phase-110/discovery/*.txt
```

Use `rg`, `ast-grep`, tree-sitter/treechunker, existing MCP tools, and repository tests to map current owners.

## Contract authority

- This specification and the repository's existing tested contracts are acceptance authorities.
- Postgres remains canonical.
- Qdrant, Redis, Neo4j, summaries, clusters, and ACE are projections.
- Static code presence is not runtime proof.
- Do not report TensorRT/N-API as wired until the explicit bridge proof gate passes.

## Implementation constraints

1. Reuse existing environment loaders, DB clients, Qdrant adapters, schemas, parser owners, queue modules, and validation helpers.
2. Replace placeholders with existing functions only after proving signatures and runtime ownership.
3. Keep dense and sparse representations separate.
4. Do not derive lexical terms from dense vectors.
5. Run reranking only after fused top-K retrieval.
6. Treat K-means/SOM/PageRank as routing features.
7. Preserve model, parser, prompt, source, and workspace revisions.
8. Quarantine failures; do not silently skip files.
9. Use incremental content-hash invalidation.
10. Every completion claim must name the test or runtime probe that proves it.

## Deliverables

- migration/schema additions
- canonical artifact and provenance repository
- extraction adapter over existing treechunker/tree-sitter
- structural ast-grep rules
- lexical feature builder
- dense representation worker
- Qdrant projection and readback validation
- RRF fusion
- reranker adapter
- label observation repository
- versioned clustering feature materializer
- K-means and SOM run records
- optional graph projection behind proof gate
- ACE packet builder integration
- JSONL export/import validation
- tests and smoke health checks
- discovery and proof matrix

## Stop conditions

Stop and mark `GATED` rather than inventing an implementation when:

- an authoritative table or adapter cannot be found;
- a native addon is missing or ABI-incompatible;
- vector representation metadata conflicts;
- a source span cannot be verified;
- a projection cannot read back to the canonical artifact;
- a runtime service is unavailable.

## Final report format

Report:

- files changed
- existing owners reused
- migrations created
- tests run and exact outcomes
- runtime probes run and exact outcomes
- coverage counts
- remaining gates
- claims explicitly not proven
