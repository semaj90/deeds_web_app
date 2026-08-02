#!/usr/bin/env node
/**
 * Freeze a deterministic 5,000-vector snapshot from PostgreSQL into DuckDB.
 * 768-dim variant of freeze-vector-snapshot-5k.mts, sourcing from
 * atlas_packets.embedding (halfvec(768), canonical embeddinggemma output)
 * instead of the deprecated content_embedding_384 direct-slice projection.
 * 384 is not a valid embeddinggemma Matryoshka truncation boundary
 * (768/512/256/128 only) — see src/lib/server/vector/lane-registry.ts.
 *
 * This is the reference snapshot used for Qdrant / TurboVec parity, brute-force
 * reference evaluation, and clustering lane setup.
 *
 * Usage:
 *   npx tsx scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts [--verify] [--apply]
 *
 * ⚠️ MUST be run from project root, NOT sveltekit-frontend/
 * This prevents creating duplicate DuckDB files in wrong locations.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  createAtlasDuckDB,
  attachCanonicalPostgres,
  buildVectorSnapshot,
  validateVectorSnapshotRows,
  parsePgVector,
  vectorNorm,
} from '../../../packages/atlas-duckdb/src/index.ts';
import { EMBEDDINGGEMMA_FULL768_V1 } from '../../../sveltekit-frontend/src/lib/server/vector/embeddinggemma-prefix384.ts';
import { VECTOR_INDEX_REGISTRY } from '../../../sveltekit-frontend/src/lib/server/vector/vector-index-registry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SNAPSHOT_DIR = path.join(REPO_ROOT, '.tmp', 'atlas-vector-snapshots');
const MANIFEST_PATH = path.join(SNAPSHOT_DIR, 'vector-snapshot-5k-768-manifest.json');
const PARQUET_PATH = path.join(SNAPSHOT_DIR, 'vector-snapshot-5k-768.parquet');
const SOURCE_COLUMN = 'embedding';
const EXPECTED_DIMENSION = 768;

/** Verify working directory is project root */
function validateWorkingDirectory(): void {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fsSync.existsSync(packageJsonPath)) {
    console.error(`❌ ERROR: Must be run from project root`);
    console.error(`   Current directory: ${process.cwd()}`);
    console.error(`   This script should be run from the workspace root, not from sveltekit-frontend/`);
    console.error(`\n   Fix: cd $(git rev-parse --show-toplevel) && npx tsx scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts`);
    process.exit(1);
  }
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function main() {
  validateWorkingDirectory();

  const limit = 5000;
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');
  const apply = args.includes('--apply');

  console.log(`🔨 Freezing ${limit}-packet vector snapshot (768-dim fixed variant)...`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Contract: ${EMBEDDINGGEMMA_FULL768_V1}`);
  console.log(`Source column: atlas_packets.${SOURCE_COLUMN}`);
  console.log(`DuckDB output: ${path.relative(REPO_ROOT, PARQUET_PATH)}`);
  console.log(`Threads: ${process.env.ATLAS_DUCKDB_THREADS || 'auto'}`);
  console.log(`Memory limit: ${process.env.ATLAS_DUCKDB_MEMORY_LIMIT || '4GB'}`);

  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const startTime = performance.now();
  let db: Awaited<ReturnType<typeof createAtlasDuckDB>> | null = null;

  try {
    db = await createAtlasDuckDB({ databasePath: path.join(SNAPSHOT_DIR, 'atlas-vector-snapshot-5k-768.duckdb') });
    const pgAlias = await attachCanonicalPostgres(db.connection);

    const stats = await buildVectorSnapshot(db.connection, pgAlias, {
      limit,
      outputTable: 'vector_snapshot_packets_5k_768',
      sourceColumn: SOURCE_COLUMN,
      expectedDimension: EXPECTED_DIMENSION,
    });

    const snapshotRows = await db.connection.query(`
      SELECT
        packet_key,
        source_ref,
        semantic_embedding_768,
        representation_id
      FROM vector_snapshot_packets_5k_768
      ORDER BY packet_key
    `);

    const validation = validateVectorSnapshotRows(snapshotRows, {
      expectedDimension: EXPECTED_DIMENSION,
      limit,
      embeddingColumn: 'semantic_embedding_768',
      expectedRepresentationId: 'semantic_768',
    });

    if (apply) {
      await db.connection.run(`
        COPY vector_snapshot_packets_5k_768
        TO '${escapeSqlLiteral(PARQUET_PATH)}'
        (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
      `);
    }

    const rows = snapshotRows as Array<{
      packet_key: string;
      source_ref: string;
      semantic_embedding_768: unknown;
      representation_id: string | null;
    }>;

    const rowFingerprint = stableHash(
      rows.map((row) => ({
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        embedding_norm: vectorNorm(parsePgVector(row.semantic_embedding_768)),
      })),
    );

    const manifest = {
      contract_version: EMBEDDINGGEMMA_FULL768_V1,
      source_column: SOURCE_COLUMN,
      expected_dimension: EXPECTED_DIMENSION,
      generated_at: new Date().toISOString(),
      snapshot_kind: 'deterministic-5k-vector-freeze-768',
      registry: VECTOR_INDEX_REGISTRY.vectorSnapshot5k,
      snapshot: {
        duckdb_path: path.relative(REPO_ROOT, path.join(SNAPSHOT_DIR, 'atlas-vector-snapshot-5k-768.duckdb')),
        parquet_path: path.relative(REPO_ROOT, PARQUET_PATH),
        manifest_path: path.relative(REPO_ROOT, MANIFEST_PATH),
        limit,
        selected_rows: stats.selectedRows,
        identity_parity_rows: validation.identityParityRows,
        unique_packet_keys: validation.uniquePacketKeys,
        unique_source_refs: validation.uniqueSourceRefs,
        rows_with_exact_dimension: validation.rowsWithExactDimension,
        rows_with_finite_norm: validation.rowsWithFiniteNorm,
        rows_with_positive_norm: validation.rowsWithPositiveNorm,
        min_norm: validation.minNorm,
        max_norm: validation.maxNorm,
        mean_norm: validation.meanNorm,
        row_fingerprint: rowFingerprint,
      },
      validation,
      mode: apply ? 'apply' : 'dry-run',
    };

    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(`✓ Snapshot rows: ${validation.selectedRows}`);
    console.log(`✓ Exact ${EXPECTED_DIMENSION}-dim rows: ${validation.rowsWithExactDimension}`);
    console.log(`✓ Positive norm rows: ${validation.rowsWithPositiveNorm}`);
    console.log(`✓ Unique packet keys: ${validation.uniquePacketKeys}`);
    console.log(`✓ Unique source refs: ${validation.uniqueSourceRefs}`);
    console.log(`✓ Norm range: ${validation.minNorm.toFixed(6)} → ${validation.maxNorm.toFixed(6)}`);
    console.log(`✓ Manifest: ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
    if (apply) {
      console.log(`✓ Parquet: ${path.relative(REPO_ROOT, PARQUET_PATH)}`);
    } else {
      console.log(`✓ Parquet export skipped in dry-run`);
    }

    if (verify) {
      if (validation.errors.length > 0) {
        throw new Error(validation.errors.join('; '));
      }
      if (validation.warnings.length > 0) {
        console.warn(`Warnings: ${validation.warnings.join(' | ')}`);
      }
      const sample = rows[0];
      if (sample) {
        const vector = parsePgVector(sample.semantic_embedding_768);
        console.log(`✓ Sample packet_key: ${sample.packet_key}`);
        console.log(`✓ Sample vector length: ${vector.length}`);
      }
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Vector snapshot (5K, 768-dim) frozen in ${elapsed}s`);
  } finally {
    if (db) {
      await db.close();
    }
  }
}

main().catch((err) => {
  console.error(`❌ Vector snapshot failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
