# GA8-JUDGE-01 frozen evaluation boundary

Status: IMPLEMENTED_ON_REVIEW_BRANCH, LIVE PROOF PENDING.

This tranche supersedes `python/sweep_llm_judged_relevance.py` as independent GA8 evidence without deleting historical artifacts. The historical script re-enters the label-aware `sweep_ga8_blend_weight.build_pool()` path and therefore remains prototype evidence only.

## Frozen proof chain

1. `python/freeze_ga8_semantic_candidate_pool_v1.py`
   - reads only query fields from the historical query source;
   - requires an explicit `GA8_EMBEDDING_MODEL_REVISION`;
   - admits semantic_768 top-N candidates only;
   - stores the exact evidence text that later reaches the judge plus its checksum;
   - binds query text, embedding checksum, model revision, semantic scores, candidate rows, and evidence text into `candidatePoolChecksum`;
   - records `labelInputsUsed=0`, `graphInputsUsed=0`, and `canonicalAuthority=false`.
2. `python/judge_ga8_frozen_semantic_pool_v1.py`
   - performs no SQL/Qdrant/embedding/graph reads;
   - independently recomputes every frozen pool and evidence checksum before judging;
   - hides path/rank/semantic/PageRank information;
   - performs two seeded anonymous batch passes;
   - uses a pointwise third adjudication only for disagreements or parse misses;
   - accepts a final grade only when at least two observed grades agree;
   - emits 0..3 graded `LLM_JUDGED_PROXY` rows and never human-gold status.
3. `python/freeze_ga8_graph_authority_snapshot_v1.py`
   - consumes exactly the frozen candidate universe;
   - performs no candidate discovery;
   - requires graph revision, feature revision, PageRank parameters, and a graph-provenance receipt checksum;
   - records that the legacy authority table itself does not carry a joinable graph revision, so the revision is `OPERATOR_SUPPLIED_RECEIPT_BOUND`, not independently inferred;
   - fails closed if any frozen candidate lacks PageRank instead of converting absence to score 0.
4. `python/sweep_ga8_frozen_judgments_v1.py`
   - pure offline evaluation over the three artifacts;
   - verifies exact candidate-universe equality for pools, judgments, and PageRank rows;
   - recomputes the judgment-universe checksum instead of trusting the stored value;
   - evaluates a query only when every frozen candidate has a resolved grade;
   - min-max normalizes semantic and PageRank features over the complete frozen pool before blending;
   - reports nDCG@10 primary, MRR@10 grade>=2, and `judgedPoolRecall@10` grade>=2;
   - never claims corpus recall, human gold, or canonical authority.

The candidate coordinate is intentionally `candidateId`, not `packetKey`: the current experiment originates from `codebase_chunk_index.id` UUIDs. `poolOrdinal` is pool-local and explicitly not canonical CandidateOrdinal.

## Required workstation provenance

Use exact artifact/revision values already proven on the workstation. Do not substitute model tags or guessed graph revisions.

```bash
export GA8_EMBEDDING_MODEL_REVISION='<exact EmbeddingGemma artifact revision/checksum>'
export GA8_JUDGE_MODEL_REVISION='<exact Ornith artifact revision/checksum>'
export GA8_GRAPH_REVISION='<exact graph revision>'
export GA8_GRAPH_FEATURE_REVISION='<exact PageRank feature revision>'
export GA8_GRAPH_PROVENANCE_RECEIPT_CHECKSUM='sha256:<checksum of the receipt proving those graph/PageRank parameters>'
export GA8_PAGERANK_DAMPING='<exact value>'
export GA8_PAGERANK_TOLERANCE='<exact value>'
export GA8_PAGERANK_MAX_ITERATIONS='<exact value>'
```

## Exact live proof sequence

From repo root on branch `agent/ga8-judge-freeze-v1-20260829`:

```bash
python -m py_compile \
  python/ga8_judge_v2_common.py \
  python/freeze_ga8_semantic_candidate_pool_v1.py \
  python/judge_ga8_frozen_semantic_pool_v1.py \
  python/freeze_ga8_graph_authority_snapshot_v1.py \
  python/sweep_ga8_frozen_judgments_v1.py

pytest -q python/test_ga8_judge_v2_common.py

python python/freeze_ga8_semantic_candidate_pool_v1.py
python python/judge_ga8_frozen_semantic_pool_v1.py
python python/freeze_ga8_graph_authority_snapshot_v1.py
python python/sweep_ga8_frozen_judgments_v1.py
```

Expected generated proof artifacts:

```text
.tmp/atlas/ga8-frozen-semantic-candidate-pools-v1.ndjson
.tmp/atlas/ga8-llm-judged-semantic-relevance-v2.ndjson
.tmp/atlas/ga8-graph-authority-feature-snapshot-v1.json

docs/reports/ga8-frozen-semantic-candidate-pool-v1.json
docs/reports/ga8-llm-judged-semantic-relevance-v2.json
docs/reports/ga8-graph-authority-feature-snapshot-v1.json
docs/reports/ga8-frozen-llm-silver-ablation-v1.json
```

## Acceptance

The tranche is live-proven only when all of the following hold:

```text
semantic freeze:
  labelInputsUsed = 0
  graphInputsUsed = 0
  embedding model revision is explicit

judge:
  evidenceTier = LLM_JUDGED_PROXY
  candidateRows == candidateRowsExpected
  humanGoldRelevanceSetProven = false

PageRank freeze:
  pageRankMissingRows = 0
  provenanceReceiptChecksum is sha256-qualified

ablation:
  exact pool/judgment/graph candidate universes match
  judgmentUniverseChecksum recomputes exactly
  evaluatedQueries > 0
  featureNormalization = PER_QUERY_MIN_MAX_OVER_COMPLETE_FROZEN_POOL_V1
  corpusRecallClaimed = false
  writes.postgres/qdrant/neo4j/valkey = false
```

Historical GA8 proxy and first LLM-judged receipts remain preserved but are not promotion evidence for this clean frozen ablation. No production ranking path, database schema, Qdrant collection, graph store, cache, or latent_256 live caller is changed by this tranche.
