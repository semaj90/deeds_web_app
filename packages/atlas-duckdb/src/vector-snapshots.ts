type DuckDBConnection = any;

function quoteIdentifier(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export interface VectorSnapshotStats {
  snapshotTable: string;
  limit: number;
  selectedRows: number;
  rowsWithEmbedding: number;
  rowsWithExactDimension: number;
  rowsWithFiniteNorm: number;
  rowsWithPositiveNorm: number;
  uniquePacketKeys: number;
  uniqueSourceRefs: number;
  duplicatePacketKeys: number;
  duplicateSourceRefs: number;
  minNorm: number;
  maxNorm: number;
  meanNorm: number;
  identityParityRows: number;
}

export interface VectorSnapshotValidationOptions {
  expectedDimension?: number;
  limit?: number;
  snapshotTable?: string;
  embeddingColumn?: string;
  expectedRepresentationId?: string;
  requireUniqueSourceRefs?: boolean;
  requireSourceRefParity?: boolean;
}

export interface VectorSnapshotValidationResult extends VectorSnapshotStats {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  sampleMismatches: Array<{
    packet_key: string;
    source_ref: string;
    embedding_dimension: number;
    embedding_norm: number;
  }>;
}

export interface BuildVectorSnapshotOptions {
  limit?: number;
  outputTable?: string;
  /**
   * Postgres source column to snapshot. Defaults to the canonical
   * `embedding` column (semantic_768). Pass `content_embedding_384`
   * explicitly only for legacy replay or migration snapshots that are
   * deliberately preserving the legacy 384 lane.
   */
  sourceColumn?: string;
  expectedDimension?: number;
}

export function parsePgVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }

  const text = String(value ?? '').trim();
  if (!text) return [];

  return text
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => Number.parseFloat(item.trim()))
    .filter(Number.isFinite);
}

export function vectorNorm(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

export async function buildVectorSnapshot(
  connection: DuckDBConnection,
  pgAlias: string = 'canonical_pg',
  options: BuildVectorSnapshotOptions = {},
): Promise<VectorSnapshotStats> {
  const limit = options.limit ?? 5000;
  const snapshotTable = options.outputTable ?? 'vector_snapshot_packets';
  const sourceColumn = options.sourceColumn ?? 'embedding';
  const expectedDimension = options.expectedDimension ?? 768;
  const outputEmbeddingColumn = sourceColumn === 'embedding' ? 'semantic_embedding_768' : 'content_embedding_384';
  const expectedRepresentationId = sourceColumn === 'embedding' ? 'semantic_768' : 'legacy_384';
  const tableSql = quoteIdentifier(snapshotTable);
  const sourceColumnSql = quoteIdentifier(sourceColumn);
  const outputEmbeddingColumnSql = quoteIdentifier(outputEmbeddingColumn);
  const pgCatalog = quoteIdentifier(pgAlias);
  const pgSchema = quoteIdentifier('public');

  await connection.run(`
    CREATE OR REPLACE TABLE ${tableSql} AS
    SELECT
      p.packet_key,
      p.source_ref,
      p.feature_id,
      p.title_id,
      p.summary,
      p.domain_class AS legacy_domain,
      p.domain_class AS normalized_domain,
      CASE WHEN p.${sourceColumnSql} IS NOT NULL THEN '${expectedRepresentationId}' ELSE NULL END AS representation_id,
      p.representation_revision,
      p.embedding_digest,
      p.qdrant_vector_dim,
      CAST(p.${sourceColumnSql} AS VARCHAR) AS ${outputEmbeddingColumnSql}
    FROM ${pgCatalog}.${pgSchema}.atlas_packets AS p
    WHERE p.${sourceColumnSql} IS NOT NULL
    ORDER BY p.packet_key
    LIMIT ${limit}
  `);

  await connection.run(`ANALYZE ${tableSql};`);

  const rows = await connection.query(`
    SELECT
      packet_key,
      source_ref,
      representation_id,
      representation_revision,
      embedding_digest,
      qdrant_vector_dim,
      ${outputEmbeddingColumnSql}
    FROM ${tableSql}
    ORDER BY packet_key
  `);

  return validateVectorSnapshotRows(rows, {
    expectedDimension,
    limit,
    snapshotTable,
    embeddingColumn: outputEmbeddingColumn,
    expectedRepresentationId,
  });
}

export function validateVectorSnapshotRows(
  rows: Array<Record<string, unknown>>,
  options: VectorSnapshotValidationOptions = {},
): VectorSnapshotValidationResult {
  const expectedDimension = options.expectedDimension ?? 768;
  const limit = options.limit ?? rows.length;
  const snapshotTable = options.snapshotTable ?? 'vector_snapshot_packets';
  const embeddingColumn = options.embeddingColumn ?? 'semantic_embedding_768';
  const expectedRepresentationId = options.expectedRepresentationId ?? 'semantic_768';
  const requireUniqueSourceRefs = options.requireUniqueSourceRefs ?? false;
  const requireSourceRefParity = options.requireSourceRefParity ?? false;
  const warnings: string[] = [];
  const errors: string[] = [];
  const sampleMismatches: VectorSnapshotValidationResult['sampleMismatches'] = [];

  const packetKeys = new Set<string>();
  const sourceRefs = new Set<string>();
  let rowsWithEmbedding = 0;
  let rowsWithExactDimension = 0;
  let rowsWithFiniteNorm = 0;
  let rowsWithPositiveNorm = 0;
  let identityParityRows = 0;
  let sumNorm = 0;
  let minNorm = Number.POSITIVE_INFINITY;
  let maxNorm = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const packetKey = String(row.packet_key ?? '').trim();
    const sourceRef = String(row.source_ref ?? '').trim();
    const embedding = parsePgVector(row[embeddingColumn]);
    const embeddingDimension = embedding.length;
    const embeddingNorm = vectorNorm(embedding);
    const rowRepresentationId = String(row.representation_id ?? '').trim();

    if (packetKey) packetKeys.add(packetKey);
    if (sourceRef) sourceRefs.add(sourceRef);
    if (packetKey && sourceRef) identityParityRows++;

    if (rowRepresentationId !== expectedRepresentationId) {
      errors.push(
        `expected representation_id=${expectedRepresentationId} for ${packetKey || sourceRef || 'unknown row'}, got ${rowRepresentationId || 'missing'}`,
      );
    }

    if (embeddingDimension > 0) {
      rowsWithEmbedding++;
    }
    if (embeddingDimension === expectedDimension) {
      rowsWithExactDimension++;
    } else if (embeddingDimension > 0 && sampleMismatches.length < 20) {
      sampleMismatches.push({
        packet_key: packetKey,
        source_ref: sourceRef,
        embedding_dimension: embeddingDimension,
        embedding_norm: embeddingNorm,
      });
    }

    if (Number.isFinite(embeddingNorm)) {
      rowsWithFiniteNorm++;
      sumNorm += embeddingNorm;
      minNorm = Math.min(minNorm, embeddingNorm);
      maxNorm = Math.max(maxNorm, embeddingNorm);
      if (embeddingNorm > 0) rowsWithPositiveNorm++;
    }
  }

  const selectedRows = rows.length;
  const uniquePacketKeys = packetKeys.size;
  const uniqueSourceRefs = sourceRefs.size;
  const duplicatePacketKeys = selectedRows - uniquePacketKeys;
  const duplicateSourceRefs = selectedRows - uniqueSourceRefs;
  const meanNorm = rowsWithFiniteNorm > 0 ? sumNorm / rowsWithFiniteNorm : 0;

  if (selectedRows === 0) {
    errors.push('vector snapshot returned no rows');
  }

  if (rowsWithExactDimension !== selectedRows) {
    errors.push(
      `expected ${selectedRows} vectors with dimension ${expectedDimension}, got ${rowsWithExactDimension}`,
    );
  }

  if (duplicatePacketKeys > 0) {
    warnings.push(`duplicate packet keys detected: ${duplicatePacketKeys}`);
  }

  if (requireUniqueSourceRefs && duplicateSourceRefs > 0) {
    warnings.push(`duplicate source refs detected: ${duplicateSourceRefs}`);
  }

  if (rowsWithPositiveNorm !== selectedRows) {
    errors.push(
      `expected all vectors to have positive norms, got ${rowsWithPositiveNorm}/${selectedRows}`,
    );
  }

  if (requireSourceRefParity && identityParityRows !== selectedRows) {
    warnings.push(
      `identity parity incomplete: ${identityParityRows}/${selectedRows} rows have both packet_key and source_ref`,
    );
  }

  return {
    snapshotTable,
    limit,
    selectedRows,
    rowsWithEmbedding,
    rowsWithExactDimension,
    rowsWithFiniteNorm,
    rowsWithPositiveNorm,
    uniquePacketKeys,
    uniqueSourceRefs,
    duplicatePacketKeys,
    duplicateSourceRefs,
    minNorm: Number.isFinite(minNorm) ? minNorm : 0,
    maxNorm: Number.isFinite(maxNorm) ? maxNorm : 0,
    meanNorm,
    identityParityRows,
    isValid: errors.length === 0,
    warnings,
    errors,
    sampleMismatches,
  };
}
