-- ============================================================
-- Storage Tier Routing Layer  (Phase 9C / Vector Layer 2)
-- ============================================================
-- Adds the compressed-vector routing tier to the retrieval stack.
--
-- Architecture:
--   Layer 1 (Cold)  — Postgres pgvector 768d + Qdrant   truth recall
--   Layer 2 (Warm)  — Compressed 64d/128d + centroids   fast routing
--   Layer 3 (Hot)   — Redis cluster cards + ACE packets sub-10ms
--   Layer 4 (Graph) — Neo4j / CouchDB PageRank          relation reasoning
--
-- Pipeline:
--   Ingest → embed 768d → autoencode → assign centroid → store tiers
--   Query  → embed 768d → autoencode → top-K centroids → filter Qdrant
--          → rerank 768d + graph authority → ACE packet → Gemma4
--
-- APPLY:
--   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < this_file.sql
-- ============================================================

BEGIN;

-- ── Layer 2A: Centroid Registry ──────────────────────────────────────────────
-- One row per k-means centroid per collection.
-- centroid_key is stable across re-runs: "{collection}:k{k}:c{idx}"
CREATE TABLE IF NOT EXISTS centroid_registry (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  centroid_key   varchar(128) UNIQUE NOT NULL,  -- e.g. "codebase_chunk_index:k20:c07"
  collection     varchar(100) NOT NULL,          -- "codebase_chunk_index" | "evidence_vectors"
  dim_in         integer     NOT NULL DEFAULT 768, -- source embedding dimension
  dim_out        integer     NOT NULL DEFAULT 64,  -- compressed centroid dimension
  cluster_k      integer     NOT NULL,            -- total K for this run
  cluster_idx    integer     NOT NULL,            -- which centroid (0..K-1)
  centroid_vector vector(64),                     -- 64d compressed centroid
  member_count   integer     NOT NULL DEFAULT 0,
  semantic_label text,                            -- Gemma4-generated cluster label
  top_tags       text[]      NOT NULL DEFAULT '{}',
  authority_score real        NOT NULL DEFAULT 0, -- Karpathy blend of members
  built_at       timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS centroid_registry_collection_k_idx
  ON centroid_registry (collection, cluster_k, cluster_idx);

CREATE INDEX IF NOT EXISTS centroid_registry_authority_idx
  ON centroid_registry (collection, authority_score DESC);

-- ── Layer 2B: Cluster Cards ──────────────────────────────────────────────────
-- Denormalized fast-access card per centroid — synced to Redis cluster:card:{id}.
-- Redis TTL 3600s; Postgres is the durable ground truth.
CREATE TABLE IF NOT EXISTS cluster_cards (
  centroid_id      uuid        PRIMARY KEY REFERENCES centroid_registry(id) ON DELETE CASCADE,
  collection       varchar(100) NOT NULL,
  top_chunk_ids    uuid[]      NOT NULL DEFAULT '{}',   -- up to top-100 within cluster
  top_file_paths   text[]      NOT NULL DEFAULT '{}',   -- fast display (no join needed)
  top_tags         text[]      NOT NULL DEFAULT '{}',
  cluster_summary  text,                               -- Gemma4 cluster summary
  representative_embedding vector(768),               -- centroid in 768d space (for final rerank)
  authority_score  real        NOT NULL DEFAULT 0,
  member_count     integer     NOT NULL DEFAULT 0,
  last_rebuilt_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cluster_cards_collection_authority_idx
  ON cluster_cards (collection, authority_score DESC);

-- ── Layer 2C: Extend codebase_chunk_index with routing columns ───────────────
ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS centroid_id       uuid REFERENCES centroid_registry(id),
  ADD COLUMN IF NOT EXISTS compressed_embedding vector(64),
  ADD COLUMN IF NOT EXISTS reconstruction_error real,  -- MSE of 768d->64d->768d round-trip
  ADD COLUMN IF NOT EXISTS routing_tier      varchar(10) DEFAULT 'cold';
  -- routing_tier: 'cold' (uncompressed), 'warm' (compressed+centroid), 'hot' (in Redis)

CREATE INDEX IF NOT EXISTS codebase_chunk_centroid_idx
  ON codebase_chunk_index (centroid_id) WHERE centroid_id IS NOT NULL;

-- ── Layer 2D: Extend evidence_vectors with routing columns ───────────────────
-- evidence_vectors is a sidecar (no Drizzle schema) — add directly
ALTER TABLE evidence_vectors
  ADD COLUMN IF NOT EXISTS centroid_id       uuid REFERENCES centroid_registry(id),
  ADD COLUMN IF NOT EXISTS compressed_embedding vector(64),
  ADD COLUMN IF NOT EXISTS reconstruction_error real,
  ADD COLUMN IF NOT EXISTS routing_tier      varchar(10) DEFAULT 'cold';

CREATE INDEX IF NOT EXISTS evidence_vectors_centroid_idx
  ON evidence_vectors (centroid_id) WHERE centroid_id IS NOT NULL;

-- ── Layer 3 Redis contract (documentation only — no SQL) ─────────────────────
-- cluster:card:{centroid_id}     HASH  top_chunk_ids,top_tags,summary,authority  TTL 3600s
-- cluster:members:{centroid_id}  ZSET  chunk_id → 768d_score                     TTL 3600s
-- centroid:routing:{collection}  HASH  cluster_idx → centroid_id                 TTL 7200s
-- ace:cluster:top:{collection}   ZSET  centroid_id → authority_score             TTL 1800s

COMMIT;
