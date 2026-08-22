type DuckDBConnection = any;

export interface ExportTrainingParquetOptions {
  outputPath: string;
  compression?: 'uncompressed' | 'zstd' | 'gzip' | 'snappy';
  rowGroupSize?: number;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  rowsExported: number;
  fileSize: number;
  duration: number;
  errors: string[];
}

export async function exportCorpusSnapshotParquet(
  connection: DuckDBConnection,
  options: ExportTrainingParquetOptions
): Promise<ExportResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  let rowsExported = 0;
  let fileSize = 0;

  const compression = options.compression ?? 'zstd';
  const rowGroupSize = options.rowGroupSize ?? 100000;

  try {
    // Execute COPY TO for Parquet export with optimized settings
    await connection.run(`
      COPY snapshot_packets
      TO '${options.outputPath}'
      (FORMAT PARQUET, COMPRESSION ${compression.toUpperCase()}, ROW_GROUP_SIZE ${rowGroupSize})
    `);

    // Get row count and file size
    const countResult = await connection.query(
      'SELECT COUNT(*) AS cnt FROM snapshot_packets'
    );
    rowsExported = Number((countResult[0] as { cnt: bigint }).cnt);

    // Get file size (platform-agnostic)
    try {
      const fs = await import('fs').catch(() => null);
      if (fs) {
        const stats = fs.statSync(options.outputPath);
        fileSize = stats.size;
      }
    } catch {
      // File size not available, continue anyway
    }

    return {
      success: true,
      outputPath: options.outputPath,
      rowsExported,
      fileSize,
      duration: performance.now() - startTime,
      errors
    };
  } catch (err) {
    errors.push(
      `Parquet export failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return {
      success: false,
      outputPath: options.outputPath,
      rowsExported: 0,
      fileSize: 0,
      duration: performance.now() - startTime,
      errors
    };
  }
}

export async function exportDomainTrainingRowsParquet(
  connection: DuckDBConnection,
  options: ExportTrainingParquetOptions
): Promise<ExportResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  let rowsExported = 0;
  let fileSize = 0;

  const compression = options.compression ?? 'zstd';
  const rowGroupSize = options.rowGroupSize ?? 100000;

  try {
    await connection.run(`
      COPY domain_training_rows
      TO '${options.outputPath}'
      (FORMAT PARQUET, COMPRESSION ${compression.toUpperCase()}, ROW_GROUP_SIZE ${rowGroupSize})
    `);

    const countResult = await connection.query(
      'SELECT COUNT(*) AS cnt FROM domain_training_rows'
    );
    rowsExported = Number((countResult[0] as { cnt: bigint }).cnt);

    try {
      const fs = await import('fs').catch(() => null);
      if (fs) {
        const stats = fs.statSync(options.outputPath);
        fileSize = stats.size;
      }
    } catch {
      // File size not available
    }

    return {
      success: true,
      outputPath: options.outputPath,
      rowsExported,
      fileSize,
      duration: performance.now() - startTime,
      errors
    };
  } catch (err) {
    errors.push(
      `Parquet export failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return {
      success: false,
      outputPath: options.outputPath,
      rowsExported: 0,
      fileSize: 0,
      duration: performance.now() - startTime,
      errors
    };
  }
}

export async function exportSplitCounts(
  connection: DuckDBConnection
): Promise<Record<string, number>> {
  try {
    const result = await connection.query(`
      SELECT split_name, COUNT(*) AS cnt
      FROM domain_training_rows
      GROUP BY split_name
      ORDER BY split_name
    `);

    const counts: Record<string, number> = {};
    for (const row of result as Array<{ split_name: string; cnt: bigint }>) {
      counts[row.split_name] = Number(row.cnt);
    }

    return counts;
  } catch (err) {
    console.error(
      `Split counts export failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return {};
  }
}
