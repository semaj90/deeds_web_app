-- Domain registry view for the EmbeddingGemma 2 challenger index. Read-only derived view; no data change.
CREATE OR REPLACE VIEW codebase_chunk_eg2_domain_registry AS
SELECT
  COALESCE(domain, '(unclassified)') AS domain,
  count(*)::int AS indexed_chunks,
  min(created_at) AS first_indexed_at,
  max(created_at) AS last_indexed_at
FROM codebase_chunk_eg2_embeddings
GROUP BY COALESCE(domain, '(unclassified)');
