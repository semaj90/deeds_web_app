## ADDED Requirements

### Requirement: XGBoost GPU runtime proof SHALL be independent of reranker promotion proof
`XGBOOST_GPU_RUNTIME_PROVEN` (CUDA execution capability on this workstation) and
`XGBOOST_RERANKER_PRODUCTION_PROVEN` (the trained model is trustworthy enough for
production ranking) SHALL be tracked as two separate gates. Achieving the former SHALL
NOT be cited as evidence toward the latter, and SHALL NOT depend on canonical trace
dataset lineage being unblocked.

#### Scenario: GPU runtime proof uses a synthetic matrix, not live trace data
- **WHEN** proving `XGBOOST_GPU_RUNTIME_PROVEN`
- **THEN** the proof is performed against a synthetic, randomly generated feature matrix, not `docs/reports/xgboost-features.csv` or any trace-derived dataset

#### Scenario: A GPU runtime proof receipt does not claim reranker promotion
- **WHEN** a GPU runtime proof receipt (e.g. `docs/reports/xgboost-gpu-runtime-proof-*.json`) is written
- **THEN** it records only CUDA execution evidence (build info, device in `save_config()`, VRAM activity, finite predictions) and does not set or imply `gate_pass`/promotion status for the reranker itself

### Requirement: Training runs SHALL record which device actually executed
Every `xgboost-training-report.json`-shaped output SHALL record the resolved compute
device (not just the requested one), and a run requesting GPU execution SHALL fail
closed rather than silently completing on CPU.

#### Scenario: Requested GPU device unavailable
- **WHEN** `train-xgboost-reranker.py` is invoked with an explicit GPU device request and CUDA is not usable
- **THEN** the script exits with a non-zero status and does not write a report claiming `gate_pass: true`

#### Scenario: Training report includes the actual device
- **WHEN** `train-xgboost-reranker.py` completes a training run successfully
- **THEN** the written report includes the device that actually executed training, not merely the device that was requested

### Requirement: Ranking objectives SHALL use explicit query grouping
When `train-xgboost-reranker.py` is invoked with a ranking objective (`rank:pairwise` or
`rank:ndcg`), the constructed training and validation matrices SHALL carry an explicit
`qid` (or equivalent group) assignment derived from `trace_id`, with same-group rows
contiguous in the matrix.

#### Scenario: Ranking objective without qid is rejected or corrected
- **WHEN** `--objective=rank:pairwise` or `--objective=rank:ndcg` is selected
- **THEN** the resulting `DMatrix`/`QuantileDMatrix` has a non-null `qid` array whose group boundaries exactly match `trace_id` boundaries in the (sorted) row order
