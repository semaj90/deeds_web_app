-- Feature Records: typed artifact versioning
-- Every computed feature (embedding, cluster, pagerank, SAE latent, etc.) gets
-- a stable UUID, version string, content hash, and JSONB payload.
-- This is the "Git for computed features" table described in the retrieval OS design.
--
-- Applied manually — not in drizzle journal.

CREATE TABLE IF NOT EXISTS feature_records (
  -- Stable identity
  feature_id       UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- What packet this belongs to
  packet_key       TEXT          NOT NULL REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,

  -- What kind of feature this is
  feature_type     TEXT          NOT NULL,
  -- Allowed values (enforced at app layer, not DB — types evolve faster than constraints):
  --   embedding384    content_embedding_384 from EmbeddingGemma
  --   embedding768    768-dim variant (deprecated)
  --   pca64           PCA projection of embedding384
  --   som20           SOM cell assignment (x, y, distance)
  --   kmeans64        KMeans cluster assignment (cluster_id, distance)
  --   pagerank        cuGraph/Neo4j PageRank score
  --   community       Leiden/Louvain community ID + confidence
  --   graphsage128    GraphSAGE neighborhood embedding (128-dim)
  --   sae_latent      Sparse Autoencoder activation pattern (sparse JSONB)
  --   ast             Tree-sitter symbol extraction
  --   summary         Gemma4-generated text summary
  --   collaborative   ALS/BPR matrix factorization score (query_cluster × packet)

  -- Version of the extractor/model that produced this
  -- Examples: "embeddinggemma-384-v1", "som-20x20-v3", "als-k64-v1"
  version          TEXT          NOT NULL,

  -- SHA-256 of the canonical input that produced this feature.
  -- Allows cache invalidation when source content changes.
  snapshot_hash    TEXT          NOT NULL,

  -- Arbitrary structured payload — schema defined by feature_type + version.
  -- Kept in JSONB so new feature types don't need schema migrations.
  payload          JSONB         NOT NULL DEFAULT '{}',

  -- Arrow-compatible scalar fields for fast read without JSONB parsing
  -- (populated only when feature_type has a primary scalar)
  scalar_f32       REAL,         -- Primary scalar (score, rank, cluster_id, etc.)
  vector_f32       TEXT,         -- Compact float32 array as base64 (for dims < 256)

  -- Lifecycle
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  superseded_at    TIMESTAMPTZ,  -- NULL = current; set when a newer version replaces this
  superseded_by    UUID          REFERENCES feature_records(feature_id)
);

-- One current feature per (packet, type, version) — superseded rows kept for audit
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_records_current
  ON feature_records (packet_key, feature_type, version)
  WHERE superseded_at IS NULL;

-- Fast lookup by type + version (for batch export to Arrow)
CREATE INDEX IF NOT EXISTS idx_feature_records_type_version
  ON feature_records (feature_type, version, created_at DESC);

-- Fast lookup by packet (for feature envelope assembly)
CREATE INDEX IF NOT EXISTS idx_feature_records_packet
  ON feature_records (packet_key, feature_type)
  WHERE superseded_at IS NULL;

-- GIN index on payload for ad-hoc JSONB queries during development
CREATE INDEX IF NOT EXISTS idx_feature_records_payload
  ON feature_records USING GIN (payload jsonb_path_ops);


-- Recommendation Events: canonical interaction ledger
-- Records every retrieval exposure and outcome event.
-- Sparse (query_cluster × packet) and (task_state × tool) matrices
-- are derived from this table via SQL aggregation.
--
-- Design principles:
--   - Append-only (never UPDATE, never DELETE)
--   - Pseudonymized: actor_key is SHA-256(user_id + salt), not raw user_id
--   - exposure logged separately from acceptance (avoids missing-data bias)
--   - model_version + policy_version versioned so offline evaluation can
--     reconstruct which policy produced each exposure

CREATE TABLE IF NOT EXISTS recommendation_events (
  event_id         BIGSERIAL     PRIMARY KEY,

  -- Context
  actor_key        TEXT,         -- Pseudonymized: SHA-256(user_id + daily_salt)
  session_key      TEXT,         -- Pseudonymized session identifier
  query_text       TEXT,         -- Raw query text (for offline analysis)
  query_hash       TEXT          NOT NULL, -- SHA-256(lower(query_text))[:16]
  query_cluster_id TEXT,         -- SOM cell or KMeans cluster of query embedding

  -- What was shown / acted on
  packet_key       TEXT          NOT NULL, -- FK to atlas_packets (soft — no REFERENCES for perf)
  source_ref       TEXT          NOT NULL, -- Denormalized for analytics without join
  item_kind        TEXT          NOT NULL DEFAULT 'packet',
  -- Allowed item_kind values: packet, chunk, tool, repair, suggestion

  -- Event semantics
  event_type       TEXT          NOT NULL,
  -- Exposure events (must log before acceptance events):
  --   exposed         packet was shown to user (REQUIRED before any acceptance event)
  --   not_displayed   retrieved but filtered out before display
  -- Acceptance events:
  --   opened          user opened / expanded the result
  --   copied          user copied text from result
  --   cited           user cited this packet in output
  --   accepted        user accepted a recommendation
  --   rejected        user dismissed / downvoted
  --   ignored         shown but no interaction within session
  -- Tool / task events:
  --   tool_executed   tool was called successfully
  --   tool_failed     tool returned error
  --   repair_accepted fix was applied
  --   repair_rejected fix was rejected / reverted
  --   manual_correction user manually edited rather than accepting
  -- Quality signals:
  --   dwell_time      user spent ≥ N seconds on result (event_value = seconds)
  --   repeated_retrieval same packet retrieved again in same session
  --   validation_failure schema / lint / test failure after acceptance

  -- Numeric value for quantitative events (dwell_time, tool latency, etc.)
  event_value      REAL,

  -- Position in the displayed ranked list (1-based, NULL if not displayed)
  position         INTEGER,

  -- Which ranked list this position is from (NULL = unknown)
  ranked_list_id   TEXT,

  -- Model / policy version that produced this ranking
  model_version    TEXT          NOT NULL DEFAULT 'rrf-baseline-v1',
  policy_version   TEXT          NOT NULL DEFAULT 'default-v1',

  -- Timestamp (always UTC)
  occurred_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Fast time-series scans (most common: "last N days")
CREATE INDEX IF NOT EXISTS idx_rec_events_time
  ON recommendation_events (occurred_at DESC);

-- Per-actor history (collaborative filtering input)
CREATE INDEX IF NOT EXISTS idx_rec_events_actor
  ON recommendation_events (actor_key, occurred_at DESC)
  WHERE actor_key IS NOT NULL;

-- Per-packet signals (item popularity, acceptance rate)
CREATE INDEX IF NOT EXISTS idx_rec_events_packet
  ON recommendation_events (packet_key, event_type, occurred_at DESC);

-- Query-cluster → packet matrix (offline ALS input)
CREATE INDEX IF NOT EXISTS idx_rec_events_cluster_packet
  ON recommendation_events (query_cluster_id, packet_key)
  WHERE query_cluster_id IS NOT NULL
    AND event_type IN ('opened', 'copied', 'cited', 'accepted', 'dwell_time');

-- Task / tool matrix
CREATE INDEX IF NOT EXISTS idx_rec_events_tool
  ON recommendation_events (event_type, packet_key)
  WHERE event_type IN ('tool_executed', 'tool_failed', 'repair_accepted', 'repair_rejected');


-- Sparse interaction view: query_cluster × packet acceptance counts
-- Used as input to ALS factorization (offline, not queried on hot path).
-- Each row is one (cluster, packet) pair with weighted interaction count.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_cluster_packet_interactions AS
SELECT
  query_cluster_id,
  packet_key,
  source_ref,
  -- Weighted implicit feedback score
  -- Weights mirror the event importance in the recommendation literature:
  --   cite / accept = 4×, copy = 2×, open = 1×, dwell = 0.5× per second (capped at 5×)
  SUM(
    CASE event_type
      WHEN 'cited'     THEN 4.0
      WHEN 'accepted'  THEN 4.0
      WHEN 'copied'    THEN 2.0
      WHEN 'opened'    THEN 1.0
      WHEN 'dwell_time' THEN LEAST(COALESCE(event_value, 0) * 0.1, 5.0)
      ELSE 0.0
    END
  )                                      AS implicit_score,
  COUNT(*)                               AS event_count,
  COUNT(*) FILTER (WHERE event_type = 'exposed') AS exposure_count,
  COUNT(*) FILTER (WHERE event_type IN ('opened','copied','cited','accepted')) AS acceptance_count,
  MAX(occurred_at)                       AS last_seen_at
FROM recommendation_events
WHERE query_cluster_id IS NOT NULL
GROUP BY query_cluster_id, packet_key, source_ref;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_cluster_packet
  ON mv_cluster_packet_interactions (query_cluster_id, packet_key);

CREATE INDEX IF NOT EXISTS idx_mv_cluster_packet_score
  ON mv_cluster_packet_interactions (query_cluster_id, implicit_score DESC);

COMMENT ON MATERIALIZED VIEW mv_cluster_packet_interactions IS
  'Sparse query_cluster × packet interaction matrix for offline ALS/BPR training. '
  'Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cluster_packet_interactions';
