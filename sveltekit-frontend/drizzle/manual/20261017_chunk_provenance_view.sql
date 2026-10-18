-- DRAFT (not applied). Read-only resolver: "where did this chunk come from?" Pure view, no data written, no new indexes
-- needed (join columns already indexed: codebase_chunk_index.chunk_id/source_ref, atlas_external_doc_chunks.chunk_id/page_id).
-- Code chunks keep source_revision/workspace_revision NULL until the post-P20 revision deferral lifts; the view reports them as-is.
-- Rollback: DROP VIEW IF EXISTS chunk_provenance_v1;
CREATE OR REPLACE VIEW chunk_provenance_v1 AS
SELECT 'code'::text AS origin,
       c.chunk_id::text AS chunk_id,
       c.source_ref,
       c.relative_path AS file_path,
       NULL::text AS source_url,
       NULL::text AS fetcher,
       c.repo_id::text AS repo_id,
       c.workspace_revision::text AS workspace_revision,
       c.source_revision AS source_revision,
       c.file_content_hash::text AS content_hash,
       NULL::text AS crawl_revision,
       NULL::timestamptz AS retrieved_at
FROM codebase_chunk_index c
UNION ALL
SELECT 'external_doc'::text,
       d.chunk_id::text,
       p.url,
       NULL::text,
       p.url,
       p.fetcher,
       NULL::text,
       NULL::text,
       NULL::text,
       p.content_hash,
       p.crawl_revision,
       p.retrieved_at
FROM atlas_external_doc_chunks d
JOIN atlas_external_doc_pages p ON p.id = d.page_id;
