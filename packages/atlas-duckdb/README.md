# @atlas/duckdb

DuckDB multicore analytical sidecar for atlas ML pipelines. Replaces row-by-row Node.js loops with parallel set-oriented SQL queries, materializing once and analyzing many times.

## Features

- **One-instance lifecycle**: Shared DuckDB connection for multiple analyses
- **PostgreSQL read-only attachment**: Connect to canonical Postgres truth via the `postgres` extension
- **Thread-pooled configuration**: Auto-detect available cores or override via `ATLAS_DUCKDB_THREADS`
- **Snapshot materialization**: Build local DuckDB tables once, query them efficiently many times
- **Parquet export**: Export query results to Parquet for Python training pipelines
- **Schema validation**: Verify snapshot schema and row parity against PostgreSQL

## Installation

```bash
npm install @atlas/duckdb
```

## Configuration

Configure via environment variables:

- `ATLAS_DUCKDB_PATH` - Database file path (default: `data/atlas-ml/atlas-analytics.duckdb`)
- `ATLAS_DUCKDB_THREADS` - Thread count for parallel operations (default: `floor(cores / 2)`)
- `ATLAS_DUCKDB_MEMORY_LIMIT` - Memory limit (default: `4GB`)
- `ATLAS_DUCKDB_TEMP_DIR` - Temporary directory (default: `data/atlas-ml/tmp`)

## Quick Start

```typescript
import {
  createAtlasDuckDB,
  attachCanonicalPostgres,
  buildCorpusSnapshot,
  validateCorpusSnapshotSchema,
  exportCorpusSnapshotParquet
} from '@atlas/duckdb';

// 1. Create DuckDB instance (one per process)
const db = await createAtlasDuckDB();

// 2. Attach PostgreSQL for reading
const pgAlias = await attachCanonicalPostgres(db.connection);

// 3. Build local snapshot (replaces many Node.js queries)
const stats = await buildCorpusSnapshot(db.connection, pgAlias);
console.log(`Built snapshot with ${stats.totalRows} rows`);

// 4. Validate schema against PostgreSQL
const validation = await validateCorpusSnapshotSchema(db.connection);
if (!validation.isValid) {
  console.error('Schema mismatch:', validation.missingColumns);
}

// 5. Export results for training
const exportResult = await exportCorpusSnapshotParquet(db.connection, {
  outputPath: 'data/snapshots/corpus.parquet',
  compression: 'zstd',
  rowGroupSize: 100000
});
console.log(`Exported ${exportResult.rowsExported} rows to ${exportResult.outputPath}`);

// 6. Close when done
await db.close();
```

## API Reference

### Database Lifecycle

#### `createAtlasDuckDB(overrides?)`
Creates or opens a DuckDB instance with optional configuration overrides.

```typescript
const db = await createAtlasDuckDB({
  databasePath: 'data/custom.duckdb',
  threads: 4,
  memoryLimit: '8GB'
});

// Use db.connection for queries
// Use db.config to access resolved configuration
// Call db.close() when done
```

### PostgreSQL Attachment

#### `attachCanonicalPostgres(connection, options?)`
Attaches PostgreSQL as read-only via the DuckDB `postgres` extension.

```typescript
const alias = await attachCanonicalPostgres(db.connection, {
  alias: 'canonical_pg',  // How to reference in queries
  schema: 'public'        // PostgreSQL schema
});

// Now query:
const result = await db.connection.query(`
  SELECT * FROM ${alias}.atlas_packets LIMIT 1
`);
```

### Snapshot Materialization

#### `buildCorpusSnapshot(connection, pgAlias?)`
Creates a `snapshot_packets` table by joining 5 PostgreSQL tables. Replaces repeated scans with one materialization.

```typescript
const stats = await buildCorpusSnapshot(db.connection, 'canonical_pg');

// Returns:
// {
//   totalRows: 61659,
//   rowsWithNormalizedDomain: 58304,
//   rowsWithEmbedding: 40568,
//   rowsWithSOMCluster: 39942,
//   nullableDomainRows: 3355
// }
```

#### `buildDomainTrainingRows(connection)`
Creates a `domain_training_rows` table with train/validation/test splits for domain classification.

```typescript
const splits = await buildDomainTrainingRows(db.connection);

// Returns:
// {
//   totalRows: 35219,
//   trainRows: 24653,      // 70%
//   validationRows: 5281,  // 15%
//   testRows: 5285         // 15%
// }
```

### Validation

#### `validateCorpusSnapshotSchema(connection)`
Verifies `snapshot_packets` table structure against expected schema.

```typescript
const result = await validateCorpusSnapshotSchema(db.connection);

// Returns:
// {
//   isValid: true,
//   missingColumns: [],
//   missingIndexes: [],
//   rowCount: 61659,
//   sampleRow: { packet_key: '...', ... },
//   errors: []
// }
```

#### `validateRowParity(connection, pgAlias?)`
Checks that DuckDB snapshot row counts match PostgreSQL.

```typescript
const parity = await validateRowParity(db.connection, 'canonical_pg');

// Returns:
// {
//   duckdbRowCount: 61659,
//   postgresRowCount: 61659,
//   isParityMatch: true,
//   rowCountDifference: 0,
//   sampleMismatches: [],
//   errors: []
// }
```

### Exports

#### `exportCorpusSnapshotParquet(connection, options)`
Exports `snapshot_packets` to a Parquet file optimized for Python training.

```typescript
const result = await exportCorpusSnapshotParquet(db.connection, {
  outputPath: 'data/snapshots/corpus-768.parquet',
  compression: 'zstd',      // 'uncompressed' | 'zstd' | 'gzip' | 'snappy'
  rowGroupSize: 100000      // Optimize for vectorized Python ops
});

// Returns:
// {
//   success: true,
//   outputPath: 'data/snapshots/corpus-768.parquet',
//   rowsExported: 61659,
//   fileSize: 1234567,
//   duration: 2341,          // milliseconds
//   errors: []
// }
```

#### `exportSplitCounts(connection)`
Returns train/validation/test split counts without exporting.

```typescript
const counts = await exportSplitCounts(db.connection);
// Returns: { train: 24653, validation: 5281, test: 5285 }
```

## Configuration Resolution

The `resolveDuckDBConfig()` function applies the following priority order:

1. **Explicit overrides** (highest priority)
2. **Environment variables** (`ATLAS_DUCKDB_*`)
3. **Computed defaults** (lowest priority)

Example:

```typescript
// Env: ATLAS_DUCKDB_THREADS=6, ATLAS_DUCKDB_MEMORY_LIMIT=8GB
const config = resolveDuckDBConfig({
  databasePath: 'custom.duckdb'  // Explicit override
  // threads: undefined (uses env)
  // memoryLimit: undefined (uses env)
});

// Results in:
// {
//   databasePath: 'custom.duckdb',
//   threads: 6,                           // from env
//   memoryLimit: '8GB',                   // from env
//   tempDirectory: 'data/atlas-ml/tmp',   // default
//   readOnly: false                       // default
// }
```

## NPM Scripts

From `sveltekit-frontend/package.json`:

```bash
# Build and validate 5,000-packet snapshot
npm run atlas:duckdb:snapshot:dry
npm run atlas:duckdb:snapshot:verify

# Validate snapshot against PostgreSQL
npm run atlas:duckdb:validate
npm run atlas:duckdb:validate:full  # Includes detailed NULL analysis and splits
```

## Performance Characteristics

Typical performance on RTX 3060 Ti / 8GB (61.6K packets):

| Operation | Time | Notes |
|-----------|------|-------|
| `buildCorpusSnapshot` | ~2-3s | 5 table join, parallel scan |
| `buildDomainTrainingRows` | ~1-2s | CTE deduplication, HASH split assignment |
| `validateRowParity` | <1s | Count comparison |
| `exportCorpusSnapshotParquet` (ZSTD) | ~5-10s | 768-dim vectors, 100K row groups |

Speedups over Node.js row loops:

- **Corpus snapshot**: 100-200× faster (5 tables × 61K rows in SQL vs Node loop)
- **Training rows**: 50-100× faster (deduplication + splits)
- **Parquet export**: 20-50× faster (vectorized write vs row-by-row)

## Hard Rules

1. **One write-owner per .duckdb file** — Multiple processes reading is OK; only one writes.
2. **PostgreSQL is canonical** — DuckDB snapshots are derived; never use DuckDB as truth.
3. **Set-oriented operations** — Replace row loops with SQL queries; DuckDB is for analytical ops, not OLTP.
4. **Conservative PostgreSQL settings** — `pg_connection_limit=8` prevents workstation resource exhaustion.
5. **Async exports for large datasets** — Parquet export can take 10+ seconds for full 61K dataset; use background jobs.

## Error Handling

All functions follow the pattern of returning error details:

```typescript
try {
  const result = await exportCorpusSnapshotParquet(db.connection, { ... });
  if (!result.success) {
    console.error('Export failed:', result.errors);
  }
} catch (err) {
  // Network/connection errors
  console.error('Fatal error:', err);
}
```

Validation functions return structured results without throwing:

```typescript
const validation = await validateCorpusSnapshotSchema(db.connection);
if (!validation.isValid) {
  validation.errors.forEach(e => console.error(e));
  validation.missingColumns.forEach(c => console.log(`Missing: ${c}`));
}
```

## Integration with Python

Export Parquet snapshots for downstream Python training:

```bash
# From Node.js
npm run atlas:duckdb:snapshot:dry

# Then in Python
import pyarrow.parquet as pq
df = pq.read_table('data/snapshots/corpus-768.parquet').to_pandas()

# Train classifiers
from sklearn.ensemble import RandomForestClassifier
clf = RandomForestClassifier(n_jobs=-1)
clf.fit(df['embedding'].values, df['domain'].values)
```

## Troubleshooting

### Error: "Extension postgres not found"
PostgreSQL extension not installed. Ensure DuckDB was built with PostgreSQL support, or fall back to reading Parquet exports instead of live PostgreSQL attachment.

### Error: "Cannot connect to PostgreSQL"
PostgreSQL not running or credentials incorrect. Check `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` environment variables.

### Error: "Disk quota exceeded"
`ATLAS_DUCKDB_TEMP_DIR` filled up. Increase temp directory quota or set a different path via environment variable.

### Error: "Assertion failed: CTID unique"
PostgreSQL row access inconsistency. Re-run with fresh PostgreSQL snapshot or use a more conservative `pg_pages_per_task` setting.

## See Also

- [Parent Atlas documentation](../../docs/architecture/parent-atlas-architecture.md)
- [Canonical packet flow](../../docs/architecture/canonical-packet-truth-flow.md)
- [DuckDB documentation](https://duckdb.org/docs/)
