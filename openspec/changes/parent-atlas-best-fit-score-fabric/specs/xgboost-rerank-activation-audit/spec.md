## ADDED Requirements

### Requirement: The learned reranker's score is never aliased as a cross-encoder score

The XGBoost/LightGBM sidecar's raw prediction SHALL be carried in dedicated `learnedReranker*`
fields (`learnedRerankerRawScore`, `learnedRerankerScoreNormalized`,
`learnedRerankerNormalizationKind`, `learnedRerankerModelRevision`, `learnedRerankerKind`,
`learnedRerankerCalibrated`, `learnedRerankerIsProbability`) on a reranked candidate. It SHALL
NEVER be written into `crossEncoderScore`/`crossEncoderScoreNormalized`, and it SHALL NEVER be
blended against dense/bm25/graph/pagerank/domain signals via `blendScores()`, since those signals
are already inputs the sidecar's own feature vector consumes.

#### Scenario: A learned-reranker-ranked candidate carries no cross-encoder score

- **WHEN** `computeLearnedRerankerOrder()` ranks a candidate set using the sidecar's raw scores
- **THEN** each ranked candidate's `crossEncoderScore` and `crossEncoderScoreNormalized` remain
  unset
- **AND** the raw score appears only in `learnedRerankerRawScore`
- **AND** `scoreMethod` is `'LEARNED_MODEL'`, not `'CROSS_ENCODER'` or `'SIGNAL_BLEND'`

#### Scenario: A raw learned-reranker score is never presented as a calibrated probability

- **WHEN** a candidate carries a `learnedRerankerRawScore`
- **THEN** `learnedRerankerCalibrated` is `false` and `learnedRerankerIsProbability` is `false`
- **AND** any derived `learnedRerankerScoreNormalized` carries `learnedRerankerNormalizationKind:
  'QUERY_LOCAL_RANK_PERCENTILE'`, never an implicit claim of `[0,1]` probability semantics

### Requirement: The sidecar exposes a machine-readable score contract

The XGBoost/LightGBM sidecar's `/health` and `/score` endpoints SHALL report `modelType`,
`modelRevision` (content hash of the loaded model file), `objective`, `featureSchemaRevision`, and
`scoreSemantics` (`REGRESSION_SCORE` | `RANKING_SCORE` | `UNKNOWN_SCORE_SEMANTICS`, derived from
the model's own objective, never guessed), and `calibrated` (always `false` for this sidecar). The
`/score` response SHALL be named `rawScores`, with `scores` retained only as a compatibility alias.

#### Scenario: Health check reports real model identity

- **WHEN** a caller requests `/health` from the sidecar
- **THEN** the response includes `modelRevision`, `objective`, `featureSchemaRevision`, and
  `scoreSemantics` derived from the actually-loaded model, not hardcoded values

#### Scenario: Sidecar fails closed on a non-finite prediction

- **WHEN** `/score` would return a NaN or Infinity prediction for any row, or a row/score-count
  mismatch
- **THEN** the sidecar returns an error response instead of a partial or corrupted score array

### Requirement: The learned-reranker fallback path is gated by an explicit execution mode

The learned-reranker fallback path SHALL be gated by an `off | shadow | active` mode, defaulting to
`shadow`. In `off` mode the sidecar is never called. In `shadow` mode the sidecar is called and an
evaluation receipt is emitted, but the sidecar's own candidate order SHALL NOT become the served
ranking. In `active` mode the sidecar's own order becomes the fallback ranking when the
cross-encoder is unavailable.

#### Scenario: Shadow mode never changes served ranking

- **GIVEN** `XGBOOST_RERANK_MODE` is unset (the default) or explicitly `shadow`
- **WHEN** the cross-encoder fails and the sidecar is reachable
- **THEN** the sidecar is called and a shadow receipt is emitted
- **AND** the served `provenance.modelVersion` is never the sidecar's model identity — it falls
  through to the local weighted fallback or retrieval-order fallback instead

#### Scenario: Active mode serves the learned reranker's own order

- **GIVEN** `XGBOOST_RERANK_MODE=active`
- **WHEN** the cross-encoder fails and the sidecar returns valid scores
- **THEN** candidates are ranked directly by descending raw score (tie-broken by retrieved rank,
  then packet key)
- **AND** the served `provenance.modelVersion` reflects the sidecar's real model identity

#### Scenario: Off mode never touches the network

- **GIVEN** `XGBOOST_RERANK_MODE=off`
- **WHEN** the cross-encoder fails
- **THEN** the sidecar's `/health` and `/score` endpoints are never called

### Requirement: Shadow evaluation captures both the served baseline and the challenger

Every shadow-mode evaluation SHALL emit a receipt containing both the `baseline` (what was actually
served — `scoreMethod`, `modelVersion`, ordered packet keys) and the `challenger` (the learned
reranker's own would-be order, marked `scoreMethod: 'LEARNED_MODEL'`, `calibrated: false`,
`isProbability: false`), tagged with an `eligibilityReason` explaining why the fallback path was
eligible at all (fallback traffic is not representative of all retrieval traffic). The receipt
SHALL record `servedOrderChecksum`, `baselineOrderChecksum`, and `challengerOrderChecksum`, with
`servedOrderChecksum === baselineOrderChecksum` always holding in shadow mode.

#### Scenario: A shadow receipt records both baseline and challenger orders

- **WHEN** a shadow-mode evaluation runs
- **THEN** the emitted receipt's `baseline.orderedPacketKeys` matches what was actually served
- **AND** `challenger.orderedPacketKeys` reflects the sidecar's own ranking of the same candidates
- **AND** `servedOrderChecksum` equals `baselineOrderChecksum`

#### Scenario: Receipts are written to a bounded, queryable stream

- **WHEN** a shadow receipt is emitted
- **THEN** it is appended to the `atlas:xgboost:shadow:receipts:v1` Valkey Stream via `XADD` with
  an approximate `MAXLEN` bound
- **AND** the entry carries `schema`, `requestId`, `modelRevision`, `featureRevision`, `objective`,
  and the full canonical `receipt` JSON as separate fields

### Requirement: Shadow-eval aggregation never itself decides promotion

A read-only aggregator SHALL consume the shadow-receipt stream and compute top1Changed rate,
top-K overlap, rank correlation, and served-order integrity, without ever writing to the stream,
changing the execution mode, or emitting a promotion verdict.

#### Scenario: Aggregator produces evidence, not a verdict

- **WHEN** the shadow-eval aggregator runs against the receipt stream
- **THEN** it produces `top1ChangedRate`, `avgTop10Overlap`, `avgSpearmanRho`, and
  `servedOrderIntegrityOk`
- **AND** its `promotionVerdict` field is always `null`

### Requirement: Training evaluation metrics match the training objective

XGBoost training SHALL use an `eval_metric` (and, for a ranking objective, `lambdarank_pair_method`
/`lambdarank_num_pair_per_sample`) consistent with the selected objective — a ranking objective
uses NDCG-based metrics, never RMSE. Regardless of training objective, the final reported ranking
evaluation SHALL always include NDCG@5, NDCG@10, and MRR@10, plus per-trace (not only aggregate)
metrics.

#### Scenario: A ranking objective is evaluated with ranking metrics during training

- **WHEN** the trainer is invoked with `--objective=rank:ndcg`
- **THEN** the training `eval_metric` is NDCG-based, not RMSE
- **AND** `lambdarank_pair_method=topk` and `lambdarank_num_pair_per_sample=10` are set

#### Scenario: Final evaluation is uniform across objectives

- **WHEN** training completes for any objective
- **THEN** the report includes `ndcg_at_5`, `ndcg_at_10`, `mrr_at_10`, and a `per_trace` breakdown

### Requirement: Training never overwrites the canonical model without explicit promotion

A training run SHALL write its model and report to an immutable, content-addressed candidate path
(`models/xgboost-candidates/<objective-slug>-<datasetRevision>-<modelRevision>.ubj` and a matching
`docs/reports/xgboost-objective-<slug>-<modelRevision>.json`) by default. The canonical
`models/xgboost-reranker.ubj` and `docs/reports/xgboost-training-report.json` paths SHALL be
written only when an explicit `--promote` flag is passed.

#### Scenario: A default training run never touches the canonical model path

- **WHEN** the trainer is run without `--promote`
- **THEN** a new candidate model and report are written under their content-addressed paths
- **AND** `models/xgboost-reranker.ubj`'s bytes are unchanged

#### Scenario: Two objectives trained back to back never collide

- **WHEN** `reg:squarederror` and `rank:ndcg` are trained against the same feature dataset without
  `--promote`
- **THEN** each produces its own distinct candidate model and report path
- **AND** neither run's output overwrites the other's

#### Scenario: Promotion is explicit and logged

- **WHEN** the trainer is run with `--promote`
- **THEN** the candidate model is copied to the canonical model path and the canonical report is
  written
- **AND** graph-manifest invalidation fires only for this promoted run, not for every candidate run
