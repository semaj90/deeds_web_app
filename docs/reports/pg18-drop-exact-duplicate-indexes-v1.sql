-- Generated from docs/reports/pg18-index-consolidation-audit-v1.json
-- Review-only DDL: drops ONLY exact duplicate index definitions (retains 1 canonical index per pair).
-- Do NOT run inside a transaction block (DROP INDEX CONCURRENTLY requires autocommit).

-- KEEP [atlas_packets]: atlas_packets_metadata_gin_idx (160 MB, scans=0)
-- DUP (160 MB, scans=0): CREATE INDEX idx_atlas_packets_metadata_gin ON public.atlas_packets USING gin (metadata)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_metadata_gin;

-- KEEP [atlas_packets]: idx_atlas_packets_payload_path (17 MB, scans=0)
-- DUP (21 MB, scans=0): CREATE INDEX idx_atlas_packets_payload_gin_pathops ON public.atlas_packets USING gin (payload jsonb_path_ops)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_payload_gin_pathops;

-- KEEP [atlas_packets]: idx_atlas_packets_source_feature (16 MB, scans=0)
-- DUP (10200 kB, scans=0): CREATE INDEX idx_packets_source_feature_multi_hop ON public.atlas_packets USING btree (source_ref, feature_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_packets_source_feature_multi_hop;

-- KEEP [atlas_packets]: idx_atlas_packets_source_ref (12 MB, scans=0)
-- DUP (12 MB, scans=0): CREATE INDEX idx_atlas_packets_source_ref_idx ON public.atlas_packets USING btree (source_ref)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_source_ref_idx;

-- KEEP [atlas_packets]: idx_atlas_packets_feature_id (5312 kB, scans=0)
-- DUP (5336 kB, scans=0): CREATE INDEX idx_atlas_packets_feature_id_idx ON public.atlas_packets USING btree (feature_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_feature_id_idx;

-- KEEP [atlas_packets]: idx_atlas_packets_packet_key (5160 kB, scans=0)
-- DUP (5160 kB, scans=0): CREATE INDEX idx_atlas_packets_packet_key_idx ON public.atlas_packets USING btree (packet_key)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_packet_key_idx;

-- KEEP [atlas_packets]: idx_atlas_packets_tags (3112 kB, scans=0)
-- DUP (3080 kB, scans=0): CREATE INDEX idx_atlas_packets_tags_gin ON public.atlas_packets USING gin (tags)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_tags_gin;

-- KEEP [atlas_packets]: idx_atlas_packets_community_id (2392 kB, scans=0)
-- DUP (2392 kB, scans=0): CREATE INDEX idx_atlas_packets_community_id_idx ON public.atlas_packets USING btree (community_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_community_id_idx;

-- KEEP [atlas_packets]: idx_atlas_packets_som_index (2168 kB, scans=0)
-- DUP (2192 kB, scans=0): CREATE INDEX idx_atlas_packets_som_index_idx ON public.atlas_packets USING btree (som_index)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_som_index_idx;

-- KEEP [atlas_packets]: idx_atlas_packets_domain_class (2168 kB, scans=0)
-- DUP (2176 kB, scans=0): CREATE INDEX idx_atlas_packets_domain_class_idx ON public.atlas_packets USING btree (domain_class)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_atlas_packets_domain_class_idx;

-- KEEP [codebase_chunk_index]: idx_codebase_chunk_metadata_gin (39 MB, scans=0)
-- DUP (39 MB, scans=0): CREATE INDEX codebase_chunk_index_metadata_gin ON public.codebase_chunk_index USING gin (metadata jsonb_path_ops)
DROP INDEX CONCURRENTLY IF EXISTS public.codebase_chunk_index_metadata_gin;

-- KEEP [codebase_chunk_index]: idx_codebase_chunk_semantic_tags_gin (2464 kB, scans=0)
-- DUP (2488 kB, scans=0): CREATE INDEX codebase_chunk_index_semantic_tags_gin ON public.codebase_chunk_index USING gin (semantic_tags)
DROP INDEX CONCURRENTLY IF EXISTS public.codebase_chunk_index_semantic_tags_gin;

