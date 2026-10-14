const { Client } = require('pg');

const client = new Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5434'),
  database: process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.PGUSER || 'legal_admin',
  password: process.env.PGPASSWORD || '123456'
});

async function main() {
  await client.connect();

  const getColumns = async (tableName) => {
    const result = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    return new Map(result.rows.map((row) => [row.column_name, row]));
  };

  const chunkColumns = await getColumns('codebase_chunk_index');

  console.log('=== 1. EMBEDDING COLUMN OVERLAP (codebase_chunk_index) ===');
  const embOverlap = await client.query(`
    SELECT
        COUNT(*) AS total_rows,
        COUNT(*) FILTER (
            WHERE content_embedding IS NOT NULL
              AND content_embedding_768 IS NOT NULL
        ) AS both_embeddings,
        COUNT(*) FILTER (
            WHERE content_embedding IS NOT NULL
              AND content_embedding_768 IS NULL
        ) AS halfvec_only,
        COUNT(*) FILTER (
            WHERE content_embedding IS NULL
              AND content_embedding_768 IS NOT NULL
        ) AS vector_only,
        COUNT(*) FILTER (
            WHERE content_embedding IS NULL
              AND content_embedding_768 IS NULL
        ) AS neither_embedding
    FROM public.codebase_chunk_index;
  `);
  console.table(embOverlap.rows[0]);

  console.log('=== 2. LATENT POPULATION & TYPES (codebase_chunk_index) ===');
  console.table([...chunkColumns.values()].filter(({ column_name }) =>
    column_name.includes('latent') || column_name.includes('content_embedding')
  ));

  const countedColumns = [
    'content_embedding', 'content_embedding_768', 'latent_128', 'latent_256',
    'latent_64', 'error_embedding_latent_128', 'error_embedding_latent_256',
    'error_embedding_latent_64'
  ].filter((columnName) => chunkColumns.has(columnName));
  const latentCountExpressions = countedColumns.map((columnName) =>
    `count(${columnName}) as count_${columnName}`
  );
  const latentCounts = await client.query(`
    SELECT count(*) as total_rows${latentCountExpressions.length ? `, ${latentCountExpressions.join(', ')}` : ''}
    FROM public.codebase_chunk_index;
  `);
  console.table(latentCounts.rows[0]);

  console.log('=== 3. AST STRUCTURAL ELIGIBILITY COVERAGE (public.atlas_ast_nodes) ===');
  const astColumns = await getColumns('atlas_ast_nodes');
  const astExpectedColumns = [
    'relative_path', 'source_ref_key', 'tree_node_id', 'workspace_id',
    'source_revision', 'start_byte', 'end_byte', 'source_content_hash', 'superseded_by'
  ];
  console.log('AST columns present/missing:');
  console.table(astExpectedColumns.map((columnName) => ({
    column_name: columnName,
    present: astColumns.has(columnName),
    ...(astColumns.get(columnName) || {})
  })));

  const astCoverageChecks = [
    ['valid_byte_spans', astColumns.has('start_byte') && astColumns.has('end_byte'),
      "start_byte IS NOT NULL AND end_byte IS NOT NULL AND start_byte >= 0 AND end_byte > start_byte"],
    ['workspace_bound', astColumns.has('workspace_id'), "workspace_id IS NOT NULL AND workspace_id::text <> ''"],
    ['source_revision_bound', astColumns.has('source_revision'), "source_revision IS NOT NULL AND source_revision::text <> ''"],
    ['source_hash_bound', astColumns.has('source_content_hash'), "source_content_hash IS NOT NULL AND source_content_hash::text <> ''"],
    ['not_marked_superseded', astColumns.has('superseded_by'), 'superseded_by IS NULL']
  ].filter(([, available]) => available);
  const astCoverageExpressions = astCoverageChecks.map(([alias, , condition]) =>
    `COUNT(*) FILTER (WHERE ${condition}) AS ${alias}`
  );
  const requiredForQualification = ['start_byte', 'end_byte', 'workspace_id', 'source_revision', 'source_content_hash', 'superseded_by'];
  if (requiredForQualification.every((columnName) => astColumns.has(columnName))) {
    astCoverageExpressions.push(`COUNT(*) FILTER (
      WHERE start_byte IS NOT NULL AND end_byte > start_byte
        AND workspace_id IS NOT NULL AND workspace_id::text <> ''
        AND source_revision IS NOT NULL AND source_revision::text <> ''
        AND source_content_hash IS NOT NULL AND source_content_hash::text <> ''
        AND superseded_by IS NULL
    ) AS structurally_qualified_candidates`);
  }
  if (astColumns.size) {
    const astCoverage = await client.query(`
      SELECT count(*) AS total_nodes${astCoverageExpressions.length ? `, ${astCoverageExpressions.join(', ')}` : ''}
      FROM public.atlas_ast_nodes;
    `);
    console.table(astCoverage.rows[0]);
  } else {
    console.log('atlas_ast_nodes is absent or has no visible columns in this database; coverage skipped.');
  }

  console.log('=== 4. LINEAGE ON LATENT_128 ROWS (55,169 ROWS) ===');
  if (!chunkColumns.has('latent_128')) {
    console.log('latent_128 column is absent; lineage coverage skipped.');
  } else {
    const lineageFields = [
      'latent_256_checkpoint_revision', 'source_revision', 'workspace_revision',
      'representation_revision', 'lineage_binding_checksum'
    ].filter((columnName) => chunkColumns.has(columnName));
    const lineageExpressions = lineageFields.map((columnName) =>
      `count(${columnName}) as has_${columnName}`
    );
    const latentLineage = await client.query(`
      SELECT count(*) as total_latent_128_rows${lineageExpressions.length ? `, ${lineageExpressions.join(', ')}` : ''}
      FROM public.codebase_chunk_index
      WHERE latent_128 IS NOT NULL;
    `);
    console.table(latentLineage.rows[0]);
  }

  await client.end();
}

main().catch(async (err) => {
  console.error('Audit failed:', err);
  await client.end().catch(() => {});
  process.exit(1);
});
