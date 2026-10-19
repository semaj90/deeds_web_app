-- Parent Atlas learned-artifact admission registry v1 (additive, registry only, canonical=false).
-- One row per (kind, name, checksum): which learned artifact (logistic head, low-rank basis, policy/value net,
-- PPO policy, GEPA prompt set, procedural-memory snapshot, XGBoost model) may be loaded, from which VERIFIED
-- training evidence, evaluated against which run, under which revisions, and in which admission state.
-- It stores REFERENCES (tensor artifact / model weights ids, checksums) only: never weights, hidden reasoning,
-- KV cache or tensor snapshots. SHADOW is the default; CHALLENGER/PROMOTED need evaluation evidence and stored
-- weights, and trained kinds also need the digest of the verified receipt set they were trained on.
CREATE TABLE IF NOT EXISTS atlas_learned_artifact_admission_v1 (
  admission_id                uuid        NOT NULL DEFAULT uuidv7() PRIMARY KEY,
  artifact_kind               text        NOT NULL CHECK (artifact_kind IN (
                                'logistic_head','low_rank_basis','policy_value_net','ppo_policy',
                                'gepa_prompt_set','procedural_memory_snapshot','xgboost_model')),
  artifact_name               text        NOT NULL CHECK (btrim(artifact_name) <> ''),
  artifact_revision           text        NOT NULL CHECK (btrim(artifact_revision) <> ''),
  artifact_checksum           text        NOT NULL CHECK (artifact_checksum ~ '^sha256:[0-9a-f]{64}$'),
  tensor_artifact_id          uuid        REFERENCES atlas_tensor_artifacts (artifact_id),
  model_weights_id            uuid        REFERENCES model_weights (id),
  training_receipt_set_digest text        CHECK (training_receipt_set_digest ~ '^sha256:[0-9a-f]{64}$'),
  training_receipt_count      integer     CHECK (training_receipt_count >= 0),
  eval_run_id                 text        CHECK (eval_run_id IS NULL OR btrim(eval_run_id) <> ''),
  eval_metrics                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  workspace_revision          text        NOT NULL CHECK (btrim(workspace_revision) <> ''),
  feature_revision            text        NOT NULL CHECK (btrim(feature_revision) <> ''),
  ordinal_map_checksum        text        CHECK (ordinal_map_checksum ~ '^[0-9a-f]{64}$'),
  taxonomy_revision           text,
  source_revision             text,
  compute_backend             text        NOT NULL CHECK (compute_backend IN (
                                'cpu_oracle','cpu','cuda_torch','cuda_xgboost','cuvs','cutile','cublaslt')),
  admission_state             text        NOT NULL DEFAULT 'SHADOW' CHECK (admission_state IN (
                                'SHADOW','CHALLENGER','PROMOTED','RETIRED','REJECTED')),
  supersedes_admission_id     uuid        REFERENCES atlas_learned_artifact_admission_v1 (admission_id),
  decided_by                  text        NOT NULL CHECK (btrim(decided_by) <> ''),
  decided_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
  canonical                   boolean     NOT NULL DEFAULT false CHECK (canonical = false),
  CONSTRAINT atlas_learned_artifact_unique UNIQUE (artifact_kind, artifact_name, artifact_checksum),
  CONSTRAINT atlas_learned_artifact_loadable_needs_eval
    CHECK (admission_state NOT IN ('CHALLENGER','PROMOTED') OR eval_run_id IS NOT NULL),
  CONSTRAINT atlas_learned_artifact_loadable_needs_storage
    CHECK (admission_state NOT IN ('CHALLENGER','PROMOTED') OR tensor_artifact_id IS NOT NULL OR model_weights_id IS NOT NULL),
  CONSTRAINT atlas_learned_artifact_trained_needs_receipts
    CHECK (admission_state NOT IN ('CHALLENGER','PROMOTED')
           OR artifact_kind IN ('low_rank_basis','procedural_memory_snapshot')
           OR (training_receipt_set_digest IS NOT NULL AND coalesce(training_receipt_count, 0) > 0))
);
CREATE INDEX IF NOT EXISTS idx_atlas_learned_artifact_state
  ON atlas_learned_artifact_admission_v1 (artifact_kind, admission_state);
COMMENT ON TABLE atlas_learned_artifact_admission_v1 IS
  'Admission registry for learned artifacts (references only), canonical=false. CHALLENGER/PROMOTED needs eval evidence and stored weights; trained kinds also need the digest of the verified receipt set. SHADOW is the default.';
