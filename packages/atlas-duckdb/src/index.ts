// Core database lifecycle
export { createAtlasDuckDB, type AtlasDuckDB } from './database.js';

// Configuration
export { resolveDuckDBConfig, type AtlasDuckDBConfig } from './config.js';

// PostgreSQL attachment
export { attachCanonicalPostgres, type PostgresAttachOptions } from './postgres.js';

// Snapshot materialization
export {
  buildCorpusSnapshot,
  buildDomainTrainingRows,
  type SnapshotStats
} from './snapshots.js';

// Vector snapshots
export {
  buildVectorSnapshot,
  parsePgVector,
  validateVectorSnapshotRows,
  vectorNorm,
  type BuildVectorSnapshotOptions,
  type VectorSnapshotStats,
  type VectorSnapshotValidationOptions,
  type VectorSnapshotValidationResult
} from './vector-snapshots.js';

// Validation
export {
  validateCorpusSnapshotSchema,
  validateDomainTrainingRowsSchema,
  validateRowParity,
  type SchemaValidationResult,
  type RowParityResult
} from './validation.js';

// Exports
export {
  exportCorpusSnapshotParquet,
  exportDomainTrainingRowsParquet,
  exportSplitCounts,
  type ExportTrainingParquetOptions,
  type ExportResult
} from './exports.js';
