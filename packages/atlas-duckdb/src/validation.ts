type DuckDBConnection = any;

export interface SchemaValidationResult {
  isValid: boolean;
  missingColumns: string[];
  missingIndexes: string[];
  rowCount: number;
  sampleRow: Record<string, unknown> | null;
  errors: string[];
}

export interface RowParityResult {
  duckdbRowCount: number;
  postgresRowCount: number;
  isParityMatch: boolean;
  rowCountDifference: number;
  sampleMismatches: Array<{
    packet_key: string;
    duckdbFields: number;
    postgresFields: number;
  }>;
  errors: string[];
}

export async function validateCorpusSnapshotSchema(
  connection: DuckDBConnection
): Promise<SchemaValidationResult> {
  const errors: string[] = [];
  const missingColumns: string[] = [];
  const missingIndexes: string[] = [];

  const requiredColumns = [
    'packet_key',
    'source_ref',
    'summary',
    'legacy_domain',
    'normalized_domain',
    'lexical_keywords',
    'lexical_bm25_terms',
    'structural_symbols',
    'structural_ast_facts',
    'representation_id',
    'representation_revision',
    'embedding_digest',
    'qdrant_vector_dim',
    'content_embedding_768',
    'kmeans_cluster',
    'som_cluster',
    'naive_bayes_predictions',
    'page_rank_score',
    'content_hash',
    'summary_hash'
  ];

  try {
    // Get table schema
    const schemaResult = await connection.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'snapshot_packets'
      ORDER BY ordinal_position
    `);

    const actualColumns = new Set(
      (schemaResult as Array<{ column_name: string; data_type: string }>).map(
        (row) => row.column_name
      )
    );

    for (const col of requiredColumns) {
      if (!actualColumns.has(col)) {
        missingColumns.push(col);
      }
    }

    // Get row count
    const countResult = await connection.query(
      'SELECT COUNT(*) AS cnt FROM snapshot_packets'
    );
    const rowCount = Number((countResult[0] as { cnt: bigint }).cnt);

    // Get sample row
    let sampleRow: Record<string, unknown> | null = null;
    if (rowCount > 0) {
      const sampleResult = await connection.query(
        'SELECT * FROM snapshot_packets LIMIT 1'
      );
      sampleRow = (sampleResult[0] as Record<string, unknown>) || null;
    }

    return {
      isValid: missingColumns.length === 0 && missingIndexes.length === 0,
      missingColumns,
      missingIndexes,
      rowCount,
      sampleRow,
      errors
    };
  } catch (err) {
    errors.push(
      `Schema validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return {
      isValid: false,
      missingColumns,
      missingIndexes,
      rowCount: 0,
      sampleRow: null,
      errors
    };
  }
}

export async function validateDomainTrainingRowsSchema(
  connection: DuckDBConnection
): Promise<SchemaValidationResult> {
  const errors: string[] = [];
  const missingColumns: string[] = [];
  const missingIndexes: string[] = [];

  const requiredColumns = [
    'packet_key',
    'source_ref',
    'label',
    'text',
    'source_group',
    'content_hash',
    'split_name'
  ];

  try {
    const schemaResult = await connection.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'domain_training_rows'
      ORDER BY ordinal_position
    `);

    const actualColumns = new Set(
      (schemaResult as Array<{ column_name: string; data_type: string }>).map(
        (row) => row.column_name
      )
    );

    for (const col of requiredColumns) {
      if (!actualColumns.has(col)) {
        missingColumns.push(col);
      }
    }

    const countResult = await connection.query(
      'SELECT COUNT(*) AS cnt FROM domain_training_rows'
    );
    const rowCount = Number((countResult[0] as { cnt: bigint }).cnt);

    let sampleRow: Record<string, unknown> | null = null;
    if (rowCount > 0) {
      const sampleResult = await connection.query(
        'SELECT * FROM domain_training_rows LIMIT 1'
      );
      sampleRow = (sampleResult[0] as Record<string, unknown>) || null;
    }

    return {
      isValid: missingColumns.length === 0 && missingIndexes.length === 0,
      missingColumns,
      missingIndexes,
      rowCount,
      sampleRow,
      errors
    };
  } catch (err) {
    errors.push(
      `Schema validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return {
      isValid: false,
      missingColumns,
      missingIndexes,
      rowCount: 0,
      sampleRow: null,
      errors
    };
  }
}

export async function validateRowParity(
  connection: DuckDBConnection,
  pgAlias: string = 'canonical_pg'
): Promise<RowParityResult> {
  const errors: string[] = [];

  try {
    // Get DuckDB row count
    const duckdbCountResult = await connection.query(
      'SELECT COUNT(*) AS cnt FROM snapshot_packets'
    );
    const duckdbRowCount = Number(
      (duckdbCountResult[0] as { cnt: bigint }).cnt
    );

    // Get PostgreSQL row count
    const pgCountResult = await connection.query(`
      SELECT COUNT(*) AS cnt FROM ${pgAlias}.atlas_packets
    `);
    const postgresRowCount = Number((pgCountResult[0] as { cnt: bigint }).cnt);

    const isParityMatch = duckdbRowCount === postgresRowCount;
    const rowCountDifference = Math.abs(duckdbRowCount - postgresRowCount);

    // Sample mismatches (if any)
    const sampleMismatches: Array<{
      packet_key: string;
      duckdbFields: number;
      postgresFields: number;
    }> = [];

    if (!isParityMatch && rowCountDifference > 0) {
      // Find some packets that differ
      const mismatchSample = await connection.query(`
        SELECT
          sp.packet_key,
          7 AS duckdb_fields,
          COUNT(*) AS pg_fields
        FROM snapshot_packets sp
        LEFT JOIN ${pgAlias}.atlas_packets ap ON sp.packet_key = ap.packet_key
        WHERE ap.packet_key IS NULL
        LIMIT 5
      `);

      for (const row of mismatchSample as Array<{
        packet_key: string;
        duckdb_fields: number;
        pg_fields: number;
      }>) {
        sampleMismatches.push({
          packet_key: row.packet_key,
          duckdbFields: row.duckdb_fields,
          postgresFields: row.pg_fields
        });
      }
    }

    return {
      duckdbRowCount,
      postgresRowCount,
      isParityMatch,
      rowCountDifference,
      sampleMismatches,
      errors
    };
  } catch (err) {
    errors.push(
      `Row parity validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return {
      duckdbRowCount: 0,
      postgresRowCount: 0,
      isParityMatch: false,
      rowCountDifference: 0,
      sampleMismatches: [],
      errors
    };
  }
}
