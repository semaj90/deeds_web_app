-- Runtime capability manifests — Python worker capability probe results.
-- Workers run python-capability-probe.py at startup and on a heartbeat,
-- then POST the JSON manifest to the control plane which upserts here.
--
-- The control plane queries this table to route tasks to capable workers:
--   SELECT runtime_id, manifest
--   FROM runtime_capability_manifests
--   WHERE healthy = true
--     AND expires_at > now()
--     AND manifest->'capabilities'->>'cpuNlpParallelThreads' = 'true';
--
-- Hard rules (enforced by the probe script, not by this schema):
--   PYTHON_VERSION_IS_NOT_A_CAPABILITY
--   FREE_THREADED_BUILD_MUST_BE_PROBED
--   GIL_RUNTIME_STATE_MUST_BE_PROBED
--   RAPIDS_ON_WINDOWS_REQUIRES_WSL2
--   PYTORCH_FREE_THREADED_SUPPORT_IS_AN_ISOLATED_EXPERIMENTAL_LANE
--   PROCESS_ISOLATION_REMAINS_DEFAULT_FOR_GPU_AND_MODEL_WORKERS

CREATE TABLE IF NOT EXISTS runtime_capability_manifests (
  runtime_id       text        PRIMARY KEY,
  runtime_class    text        NOT NULL,   -- 'python_nlp' | 'python_gpu' | 'go_retrieval' | 'ts_inline'
  host_id          text        NOT NULL,
  environment      text        NOT NULL,   -- 'wsl2' | 'linux' | 'windows_native' | 'linux_container'
  manifest_version text        NOT NULL,   -- schemaVersion from probe output
  manifest         jsonb       NOT NULL,
  healthy          boolean     NOT NULL DEFAULT false,
  probed_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by capability flag (used by task router)
CREATE INDEX IF NOT EXISTS idx_rcm_healthy_expires
  ON runtime_capability_manifests (healthy, expires_at)
  WHERE healthy = true;

-- GIN index for flexible JSONB capability queries
CREATE INDEX IF NOT EXISTS idx_rcm_manifest_capabilities
  ON runtime_capability_manifests
  USING gin ((manifest->'capabilities'));

-- Expire old entries automatically (pg_cron or application-level cleanup)
-- SELECT cron.schedule('expire_capability_manifests', '*/5 * * * *',
--   'DELETE FROM runtime_capability_manifests WHERE expires_at < now() - interval ''1 hour''');
