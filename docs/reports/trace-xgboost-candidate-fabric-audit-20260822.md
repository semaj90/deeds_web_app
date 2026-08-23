# Trace/XGBoost and candidate-fabric audit — 2026-08-22

## Scope

Read-only repository audit of the current `deeds-web-app` checkout after the
root shadow-tree archival. No Postgres, Qdrant, Neo4j, Valkey, model, or index
writes were performed.

## Findings

- The root shadow tree is already archived; no copy or merge into the live
  SvelteKit tree is required.
- The live candidate-feature fabric exists under
  `sveltekit-frontend/src/lib/server/atlas/features/`:
  `CandidateFeatureSnapshotV1`, columnar materialization, Arrow IPC writer and
  readback, and GPU parity contracts are present. Snapshot and columnar focused
  tests passed `10/10`.
- Arrow readback import boundary is fixed: the focused snapshot/columnar/
  readback suites pass `13/13`. The deterministic producer proof still fails
  with `CANDIDATE_FEATURE_ARROW_BYTES_NONDETERMINISTIC`; logical checksums and
  readback pass, but byte-level artifact determinism is not yet proven.
- The XGBoost exporter had a legacy dry-run fallback that expanded synthetic
  `packet:<label>:<ordinal>` references through `atlas_packets.feature_id`.
  That is not canonical packet identity and could create many false training
  rows.
- The exporter now requires a non-empty, checksum-verified trace-label bridge
  in both dry-run and apply modes and queries packets only by explicit
  `packet_key`. Apply remains separately blocked by promotion-disabled bridge
  policy and current identity/revision gates.
- No lineage-valid trace dataset or XGBoost promotion proof exists. GPU
  training, SearchRuntime feedback, and graph/Qdrant fanout remain blocked.

## Status

`TRACE_BRIDGE_IMPLEMENTED_UNPROVEN`  
`XGBOOST_DATASET_DATA_JOIN_BLOCKED`  
`CANDIDATE_FEATURE_SNAPSHOT_FIXTURE_PROVEN`  
`CANDIDATE_FEATURE_ARROW_READBACK_FIXTURE_PROVEN`  
`CANDIDATE_FEATURE_ARROW_BYTE_DETERMINISM_BLOCKED`  
`FANOUT_BLOCKED`

## Next bounded gates

1. Create or review explicit bridge rows with packet identity, source evidence,
   and revision/cardinality fields; do not infer them from labels.
2. Isolate the remaining Apache Arrow byte nondeterminism, then run the mmap
   observer; do not promote the artifact on logical readback alone.
3. Export only after the bridge checksum, trace/source revision set, qid/group
   split, and dataset checksum gates pass.
4. Keep XGBoost CPU evaluation first; CUDA/QuantileDMatrix is a challenger
   proof after dataset lineage is valid.
