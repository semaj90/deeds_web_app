-- ============================================================================
-- Migration: 20261031_pgvector_mrl_latent_kmeans_knn.sql
-- Purpose: Lock PostgreSQL 18 pgvector to EmbeddingGemma 768 + MRL (512/256/128)
--          + PyTorch Latent (256/128/64) + KMeans Centroid Top-K KNN routing.
-- ============================================================================

-- 1. Extend evidence_vectors with MRL slices, PyTorch latents, and KMeans cluster binding
ALTER TABLE public.evidence_vectors
    ADD COLUMN IF NOT EXISTS mrl_512 vector(512),
    ADD COLUMN IF NOT EXISTS mrl_256 vector(256),
    ADD COLUMN IF NOT EXISTS mrl_128 vector(128),
    ADD COLUMN IF NOT EXISTS latent_256 vector(256),
    ADD COLUMN IF NOT EXISTS latent_128 vector(128),
    ADD COLUMN IF NOT EXISTS latent_64 vector(64),
    ADD COLUMN IF NOT EXISTS sign_bitset_128 BYTEA CHECK (octet_length(sign_bitset_128) = 16),
    ADD COLUMN IF NOT EXISTS kmeans_cluster_id SMALLINT,
    ADD COLUMN IF NOT EXISTS kmeans_revision TEXT;

-- 2. KMeans Centroid Registry (400 clusters = 20x20 SOM/KMeans grid, bound to NES LUT)
CREATE TABLE IF NOT EXISTS public.atlas_kmeans_centroids_v1 (
    kmeans_revision     TEXT NOT NULL,
    cluster_id          SMALLINT NOT NULL CHECK (cluster_id >= 0 AND cluster_id < 400),
    nes_lut_byte        SMALLINT NOT NULL,
    centroid_768        vector(768) NOT NULL,
    centroid_mrl_128    vector(128) NOT NULL,
    centroid_latent_128 vector(128),
    member_count        INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kmeans_revision, cluster_id)
);

-- 3. HNSW & KMeans-Partitioned Indexes for Fast Two-Stage KNN
CREATE INDEX IF NOT EXISTS idx_evidence_vectors_mrl128_hnsw
    ON public.evidence_vectors USING hnsw (mrl_128 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE is_superseded = false;

CREATE INDEX IF NOT EXISTS idx_evidence_vectors_latent128_hnsw
    ON public.evidence_vectors USING hnsw (latent_128 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE is_superseded = false;

CREATE INDEX IF NOT EXISTS idx_evidence_vectors_kmeans_cluster
    ON public.evidence_vectors (case_id, kmeans_revision, kmeans_cluster_id)
    INCLUDE (id, evidence_id, chunk_index)
    WHERE is_superseded = false;

-- 4. Two-Stage KMeans -> Top-K Exact 768-D KNN Function
-- Stage A: Finds top P nearest KMeans centroids using mrl_128
-- Stage B: Ranks candidates inside those centroids using canonical embedding (768-D)
CREATE OR REPLACE FUNCTION public.match_evidence_kmeans_knn_topk(
    p_case_id UUID,
    p_query_768 vector(768),
    p_query_mrl_128 vector(128),
    p_kmeans_revision TEXT,
    p_probe_clusters INTEGER DEFAULT 8,
    p_top_k INTEGER DEFAULT 20
)
RETURNS TABLE (
    vector_point_id UUID,
    evidence_id UUID,
    chunk_index INTEGER,
    content TEXT,
    kmeans_cluster_id SMALLINT,
    nes_lut_byte SMALLINT,
    cosine_similarity_768 DOUBLE PRECISION,
    source_revision TEXT
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
    WITH nearest_clusters AS (
        SELECT c.cluster_id, c.nes_lut_byte
        FROM public.atlas_kmeans_centroids_v1 c
        WHERE c.kmeans_revision = p_kmeans_revision
        ORDER BY c.centroid_mrl_128 <=> p_query_mrl_128 ASC
        LIMIT p_probe_clusters
    )
    SELECT
        ev.id AS vector_point_id,
        ev.evidence_id,
        ev.chunk_index,
        ev.content,
        ev.kmeans_cluster_id,
        nc.nes_lut_byte,
        (1.0 - (ev.embedding <=> p_query_768))::double precision AS cosine_similarity_768,
        ev.source_revision
    FROM public.evidence_vectors ev
    JOIN nearest_clusters nc
      ON ev.kmeans_cluster_id = nc.cluster_id
    WHERE ev.case_id = p_case_id
      AND ev.kmeans_revision = p_kmeans_revision
      AND ev.is_superseded = false
    ORDER BY ev.embedding <=> p_query_768 ASC
    LIMIT p_top_k;
$$;
