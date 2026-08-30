type DuckDBConnection = any;

function quoteIdentifier(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export interface SnapshotStats {
  totalRows: number;
  rowsWithNormalizedDomain: number;
  rowsWithEmbedding: number;
  rowsWithSOMCluster: number;
  nullableDomainRows: number;
}

/**
 * Build a local DuckDB snapshot from canonical PostgreSQL.
 * Materializes once, analyzes many times.
 * Run this before launching semantic training rows, Naive Bayes, etc.
 */
export async function buildCorpusSnapshot(
  connection: DuckDBConnection,
  pgAlias: string = 'canonical_pg'
): Promise<SnapshotStats> {
  const pgCatalog = quoteIdentifier(pgAlias);
  const pgSchema = quoteIdentifier('public');

  await connection.run(`
    CREATE OR REPLACE TABLE snapshot_packets AS
    SELECT
      c.id,
      c.relative_path,
      c.content,
      c.domain AS legacy_domain,

      c.domain AS normalized_domain,
      CAST(0.95 AS REAL) AS normalized_domain_confidence,

      CAST(c.semantic_tags AS VARCHAR) AS lexical_keywords,
      c.symbol AS lexical_identifiers,
      CAST(c.kind AS VARCHAR) AS lexical_symbols,
      CAST(c.tags->'imports' AS VARCHAR) AS lexical_imported_modules,

      c.symbol AS structural_symbol_name,
      c.kind AS structural_symbol_kind,
      c.relative_path AS structural_path,
      CAST(c.tags->'imports' AS VARCHAR) AS structural_imports,
      CAST(c.tags->'calls' AS VARCHAR) AS structural_calls,
      CAST(c.tags->'exports' AS VARCHAR) AS structural_exports,

      CASE WHEN c.content_embedding_768 IS NOT NULL THEN 'semantic_768' ELSE NULL END AS representation_id,
      NULL::INTEGER AS representation_revision,
      NULL::VARCHAR AS embedding_digest,
      CASE WHEN c.content_embedding_768 IS NOT NULL THEN 768 ELSE NULL END AS qdrant_vector_dim,
      CAST(c.content_embedding_768 AS VARCHAR) AS content_embedding_768,
      c.gpu_cluster AS kmeans_cluster,
      c.som_cluster,
      c.qdrant_id AS qdrant_point_id,
      c.page_rank_score,
      CAST(c.semantic_tags AS VARCHAR) AS used_concepts,

      c.content_hash,
      '' AS summary_hash
    FROM ${pgCatalog}.${pgSchema}.codebase_chunk_index AS c
    WHERE c.content_embedding_768 IS NOT NULL
  `);

  // Analyze for query planning
  await connection.run('ANALYZE snapshot_packets;');

  // Collect statistics
  const statsResult = await connection.query(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(CASE WHEN normalized_domain IS NOT NULL THEN 1 END) AS rows_with_normalized_domain,
      COUNT(CASE WHEN content_embedding_768 IS NOT NULL THEN 1 END) AS rows_with_embedding,
      COUNT(CASE WHEN representation_id IS NOT NULL THEN 1 END) AS rows_with_representation_id,
      COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) AS rows_with_som_cluster,
      COUNT(CASE WHEN normalized_domain IS NULL THEN 1 END) AS nullable_domain_rows
    FROM snapshot_packets
  `);

  const row = statsResult[0];

  return {
    totalRows: Number(row.total_rows),
    rowsWithNormalizedDomain: Number(row.rows_with_normalized_domain),
    rowsWithEmbedding: Number(row.rows_with_embedding),
    rowsWithSOMCluster: Number(row.rows_with_som_cluster),
    nullableDomainRows: Number(row.nullable_domain_rows)
  };
}

/**
 * Build semantic training rows for domain classification.
 * Replaces 61K JavaScript loops with one parallel SQL query.
 */
export async function buildDomainTrainingRows(
  connection: DuckDBConnection
): Promise<{ totalRows: number; trainRows: number; validationRows: number; testRows: number }> {
  await connection.run(`
    CREATE OR REPLACE TABLE domain_training_rows AS
    WITH base AS (
      SELECT
        id,
        relative_path,
        normalized_domain AS label,
        COALESCE(concat_ws(
          ' ',
          content,
          relative_path
        ), '') AS text,

        REGEXP_REPLACE(
          relative_path,
          '[/\\\\][^/\\\\]+$',
          ''
        ) AS source_group,
        content_hash
      FROM snapshot_packets
      WHERE normalized_domain IS NOT NULL
    ),
      deduplicated AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY
              COALESCE(content_hash, CAST(id AS VARCHAR))
            ORDER BY CAST(id AS VARCHAR)
          ) AS duplicate_rank
        FROM base
      )
      SELECT
        id AS packet_key,
        relative_path AS source_ref,
        label,
        text,
        source_group,
        content_hash,

        CASE
          WHEN HASH(source_group || ':42') % 100 < 70
            THEN 'train'
          WHEN HASH(source_group || ':42') % 100 < 85
            THEN 'validation'
          ELSE 'test'
        END AS split_name
      FROM deduplicated
      WHERE duplicate_rank = 1;
  `);

  const splitStats = await connection.query(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(CASE WHEN split_name = 'train' THEN 1 END) AS train_rows,
      COUNT(CASE WHEN split_name = 'validation' THEN 1 END) AS validation_rows,
      COUNT(CASE WHEN split_name = 'test' THEN 1 END) AS test_rows
    FROM domain_training_rows
  `);

  const row = splitStats[0];

  return {
    totalRows: Number(row.total_rows),
    trainRows: Number(row.train_rows),
    validationRows: Number(row.validation_rows),
    testRows: Number(row.test_rows)
  };
}
