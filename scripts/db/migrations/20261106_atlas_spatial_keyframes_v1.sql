-- scripts/db/migrations/20261106_atlas_spatial_keyframes_v1.sql
-- Candidate sidecar SQL: PostgreSQL 18 AIO Bitmap & Keyframe occupancy bitset table.
-- Candidate only; not applied to live PostgreSQL 18 database without scratch DB authorization.

CREATE TABLE IF NOT EXISTS public.atlas_spatial_keyframes_v1 (
    scene_id UUID NOT NULL,
    title_id VARCHAR(64) NOT NULL,
    source_sha256 CHAR(64) NOT NULL,
    revision_id INTEGER DEFAULT 1 NOT NULL,
    -- 256-bit occupancy mask matching the 256 slots in the 16 KB N64 cache
    active_slot_bitset BIT(256) NOT NULL,
    -- Binary payload: N * 64 bytes (AtlasExhibitTransform64B / Keyframes)
    packed_transforms_blob BYTEA NOT NULL,
    -- K-Means Top-K Cluster centroids and labels from unsupervised indexing
    cluster_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scene_id, revision_id)
);

CREATE INDEX IF NOT EXISTS idx_spatial_keyframes_sha256 
    ON public.atlas_spatial_keyframes_v1 (source_sha256);

CREATE INDEX IF NOT EXISTS idx_spatial_keyframes_title 
    ON public.atlas_spatial_keyframes_v1 (title_id);
