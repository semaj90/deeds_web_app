# Parent Atlas Recommendation And Retrieval Policy

## Decision

PostgreSQL is the canonical source for packet identity, graph snapshots,
interaction events, recommendation outcomes, and model artifacts. Qdrant,
TurboVec, Valkey, and Neo4j are derived execution or acceleration layers.

Neo4j is a derived relationship index. It may serve a snapshot-scoped,
canonical-node traversal, but it must not be a durable identity authority,
source of PageRank truth, or recommender training store.

## Audit Snapshot

| Surface | State | Evidence |
|---|---|---|
| Query-to-candidate contract | `IMPLEMENTED` | HyperRAG declares cache, Postgres, TurboVec, Qdrant, and Neo4j lanes. |
| Canonical graph authority | `FIXTURE_PROVEN` | V2 graph contract and fixture parity are proven; full corpus is not materialized. |
| User interaction storage | `IMPLEMENTED` | `user_interaction_history` schema exists, but the live table has 0 rows. |
| Outcome-based learning | `NOT_RUN` | `outcome_ledger` has 0 rows. |
| Dispatcher learning | `NOT_RUN` | Dispatcher telemetry logs to console and explicitly has a persistence TODO. |
| K-means routing | `IMPLEMENTED` | Existing trainer uses a random 5k snapshot and Redis TTL centroids; no immutable cluster snapshot exists. |
| TurboVec ANN | `BLOCKED` | Live health reports `indexed: 0`, `dim: 64`, and collection `codebase_chunks_768`; the runtime client requires 768 while the shadow builder produces 384. |
| LLM recommendations | `IMPLEMENTED` | Admin recommendation engine synthesizes actions, but its response is not a trained or validated probabilistic ranker. |

## Retrieval And Recommendation Separation

```text
query analysis
  -> exact identifiers / rg evidence
  -> lexical FTS and sparse retrieval
  -> dense Qdrant candidate retrieval
  -> optional TurboVec challenger when its lane contract is proven
  -> canonical identity normalization
  -> bounded graph traversal from a pinned V2 snapshot
  -> RRF and diversity
  -> query-candidate reranker
  -> bounded authority prior
  -> recommendation policy
  -> ACP action proposal or ACE evidence packet
```

`tree_node_id` is an identity and containment join key. It is not a learned
feature by itself. It may select a directory or ancestor scope only after its
collision audit and snapshot membership are proven.

K-means and SOM are soft routing signals: select the nearest few centroids or
nearby SOM cells, retain a global dense fallback, and record the routing
snapshot. They must not act as hard filters and must not create PageRank edges.

Cluster or topology similarity edges are retrieval evidence only. The current
Neo4j mirror creates directory-proxy cluster edges and same-cluster topology
edges; those are excluded from V2 structural-authority projections.

## Probabilistic Recommendation Model

Start with calibrated logistic regression after durable labels exist. For a
candidate action or evidence item with feature vector `x`:

```text
p(success | x) = sigmoid(theta dot x + intercept)
loss = -[y log(p) + (1-y) log(1-p)]
d(loss)/d(theta) = (p - y) x
```

The partial derivative says the update is proportional to prediction error. A
successful outcome (`y = 1`) increases weight for observed useful features; a
rejected, failed, or dismissed outcome decreases it. Train offline against
time-split data, then store the model version, feature schema, calibration,
and evaluation artifact in PostgreSQL. Never update weights from a live request.

Initial features may include:

- per-lane rank and RRF contribution, never incomparable raw vector scores;
- reranker score and truncation status;
- exact identifier coverage and lexical coverage;
- pinned graph path validity, path confidence, and hop count;
- V2 authority percentile as a capped post-rerank feature only;
- centroid distance, cluster snapshot ID, and global-fallback marker;
- historical acceptance only after its identity, actor, and time window are
  recorded;
- measured latency, token count, and cache reuse as costs, not proxy labels.

Do not train matrix factorization, ALS, or user-neighbor collaborative filtering
while interaction data is empty. They would be cold-start artifacts. The first
model should be global, content-aware logistic ranking with a deterministic
fallback. Personalization can follow after durable user-item feedback has
adequate coverage and privacy review.

## ACP Recommendation Contract

An ACP recommendation should be an explainable action proposal, not an
unbounded agent command. It needs:

```text
request_id, query_hash, snapshot_id, retrieval_policy_version,
candidate identity, candidate provenance, model_version,
probability, calibration_version, expected_token_cost,
expected_latency_ms, expected_utility, approval_requirement,
and observed outcome.
```

Recommendation ranking can reduce tokens, time, and energy by preferring a
small evidence bundle with strong exact, semantic, and graph support. Those
costs must be measured per run; do not fabricate a single productivity label.

## Staged Work

1. Persist dispatcher and ACP recommendation impressions, clicks, accepts,
   dismissals, execution outcomes, latency, token usage, and canonical packet
   identities to PostgreSQL.
2. Materialize the V2 full-corpus snapshot and prove live NetworkX/GDS parity.
3. Implement bounded V2 graph traversal and graph RRF canary before allowing
   graph features into any recommendation model.
4. Persist deterministic K-means outputs with snapshot, seed, dimension,
   centroid vectors, assignments, and evaluation metrics; keep Valkey as a
   rebuildable warm cache.
5. Repair TurboVec as a single named lane with a declared dimension and source
   snapshot, then compare it to Qdrant through recall and latency evaluation.
6. Build an offline logistic regression dataset, train/calibrate it, and prove
   a temporal holdout improvement over deterministic ranking.
7. Only then evaluate a personalized or matrix-factorization experiment.

## Deferred Work

Token remapping follows the retrieval and recommendation audit so it can use
measured ACE evidence and outcome data. Gradient checkpointing belongs to
offline PyTorch training or adapter experiments. It is not part of LangGraph or
Mastra orchestration and must remain outside the online retrieval request path.
