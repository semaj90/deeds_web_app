# GA8-JUDGE-01 frozen evaluation boundary

Status: IMPLEMENTED_ON_REVIEW_BRANCH, NOT YET LIVE-RUN.

This change supersedes the current `python/sweep_llm_judged_relevance.py` as promotion evidence without deleting it or rewriting its historical receipt. The old script remains useful as a historical prototype, but it re-enters `sweep_ga8_blend_weight.build_pool()` with LLM-positive IDs and therefore retains a label-aware injection path.

The replacement pipeline is deliberately split into immutable phases:

1. `python/freeze_ga8_semantic_candidate_pool_v1.py`
   - reads only query fields from the existing query set;
   - embeds with semantic_768;
   - admits semantic top-N candidates only;
   - records semantic scores/evidence checksums;
   - records `labelInputsUsed=0` and `graphInputsUsed=0`;
   - emits `FrozenSemanticCandidatePoolV1` NDJSON.
2. `python/judge_ga8_frozen_semantic_pool_v1.py`
   - performs no SQL/Qdrant/embedding/graph reads;
   - hides candidate path/rank/semantic/PageRank information from the judge;
   - uses anonymous seeded batches in two presentation passes;
   - grades 0..3;
   - records parse failure separately from a legitimate zero grade;
   - retains only equal two-pass grades as stable promotion inputs;
   - emits `LLM_SILVER_LABELS_CREATED`, never human-gold status.
3. `python/freeze_ga8_graph_authority_snapshot_v1.py`
   - consumes only the frozen candidate universe;
   - performs no candidate discovery;
   - requires operator-supplied graph revision, feature revision, damping, tolerance, and max-iteration parameters;
   - freezes the exact PageRank vector and vector checksum.
4. `python/sweep_ga8_frozen_judgments_v1.py`
   - pure offline evaluation over the three artifacts above;
   - performs no database, Qdrant, embedding, LLM, Neo4j, or Valkey calls;
   - verifies candidate and graph checksums before evaluation;
   - excludes unstable judgments rather than averaging them;
   - reports nDCG@10 as primary, MRR@10 with grade>=2, and `judgedPoolRecall@10` with grade>=2;
   - explicitly does not claim corpus recall;
   - remains `canonicalAuthority=false` and `humanGoldRelevanceSetProven=false`.

The candidate-coordinate name is intentionally `candidateId`, not `packetKey`, because this experiment currently originates from `codebase_chunk_index.id` UUIDs. `poolOrdinal` is explicitly pool-local and is not a canonical CandidateOrdinal.

## Required live-run configuration

The semantic freeze can run with the existing database/Ollama endpoints, but a promotion-quality run should set an explicit immutable embedding model revision:

```text
GA8_EMBEDDING_MODEL_REVISION=<exact model/artifact revision>
```

The judge refuses to run without:

```text
GA8_JUDGE_MODEL_REVISION=<exact model/artifact revision>
```

The graph freeze refuses to run without all of:

```text
GA8_GRAPH_REVISION=<exact graph revision>
GA8_GRAPH_FEATURE_REVISION=<exact PageRank feature revision>
GA8_PAGERANK_DAMPING=<value>
GA8_PAGERANK_TOLERANCE=<value>
GA8_PAGERANK_MAX_ITERATIONS=<value>
```

This is intentional. Missing lineage is surfaced rather than fabricated.

## Validation performed before branch creation

The new Python modules were syntax-compiled locally with `python -m py_compile`. The offline sweep was also exercised against a synthetic two-query frozen pool + stable graded judgments + graph snapshot; it produced a deterministic `GA8_LLM_SILVER_FROZEN_ABLATION_PROVEN` receipt and selected the expected semantic-heavy ranking in that fixture.

No production ranking path, database schema, Qdrant collection, graph store, cache, or runtime caller was changed.
