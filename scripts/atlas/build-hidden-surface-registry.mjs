#!/usr/bin/env node
/**
 * Phase 3C: Build Hidden Surface Registry
 *
 * Inventories all non-canonical storage layers:
 *   - atlas surface (Postgres)
 *   - neschrom97 surface (CouchDB cards, archived packets)
 *   - duckdb surface (offline analytics snapshots)
 *   - engram surface (memory cache, vector index)
 *   - seaweedfs surface (cold object storage)
 *
 * Output: docs/reports/hidden-surface-registry.json
 * No mutations. Read-only inventory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const SVELTEKIT_ROOT = path.join(ROOT, 'sveltekit-frontend');

// Environment
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(SVELTEKIT_ROOT, '.env.local'),
    path.join(SVELTEKIT_ROOT, '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

// ══════════════════════════════════════════════════════════════════════════════
// SURFACE: ATLAS (Postgres canonical)
// ══════════════════════════════════════════════════════════════════════════════

async function surfaceAtlas(pool) {
  console.log('\n📋 Atlas Surface (Postgres)...');

  const result = await pool.query(`
    SELECT
      'atlas_feature_map' as table_name,
      COUNT(*) as row_count,
      COUNT(*) FILTER (WHERE feature_id IS NOT NULL) as with_labels,
      COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant,
      COUNT(*) FILTER (WHERE som_cluster IS NOT NULL) as with_som
    FROM atlas_feature_map
    UNION ALL
    SELECT
      'atlas_directory_manifest',
      COUNT(*),
      COUNT(*) FILTER (WHERE summary_text IS NOT NULL),
      COUNT(*) FILTER (WHERE centroid IS NOT NULL),
      COUNT(*) FILTER (WHERE som_bmu_row IS NOT NULL) as with_som
    FROM atlas_directory_manifest
  `);

  return {
    surface: 'atlas',
    backend: 'postgres',
    tables: result.rows.map(r => ({
      name: r.table_name,
      rows: r.row_count,
      with_labels: r.with_labels,
      with_qdrant: r.with_qdrant,
      with_som: r.with_som,
    })),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SURFACE: NESCHROM97 (archived cards, cached packets)
// ══════════════════════════════════════════════════════════════════════════════

function surfaceNeschrom97() {
  console.log('\n🗂️  NES/CHROM97 Surface (.opencode/)...');

  const surfaces = [];

  // Scan .opencode/ndjson/ (card exports)
  const ndjsonPath = path.join(SVELTEKIT_ROOT, '..', '.opencode', 'ndjson');
  if (fs.existsSync(ndjsonPath)) {
    const ndjsonFiles = globSync('**/*.ndjson', { cwd: ndjsonPath });
    const totalLines = ndjsonFiles.reduce((sum, file) => {
      try {
        const content = fs.readFileSync(path.join(ndjsonPath, file), 'utf8');
        return sum + content.split('\n').filter(l => l.trim()).length;
      } catch {
        return sum;
      }
    }, 0);

    surfaces.push({
      location: '.opencode/ndjson/',
      type: 'card_export',
      files: ndjsonFiles.length,
      lines: totalLines,
      description: 'Exported NES/CHROM97 cards (read-only archive)',
    });
  }

  // Scan .opencode/cards/ (card JSON objects)
  const cardsPath = path.join(SVELTEKIT_ROOT, '..', '.opencode', 'cards');
  if (fs.existsSync(cardsPath)) {
    const cardFiles = globSync('**/*.json', { cwd: cardsPath });
    surfaces.push({
      location: '.opencode/cards/',
      type: 'card_json',
      files: cardFiles.length,
      description: 'Individual card JSON objects',
    });
  }

  return {
    surface: 'neschrom97',
    backend: 'filesystem',
    locations: surfaces,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SURFACE: DUCKDB (offline analytics snapshots)
// ══════════════════════════════════════════════════════════════════════════════

function surfaceDuckdb() {
  console.log('\n📊 DuckDB Surface (.tmp/)...');

  const duckdbPath = path.join(ROOT, '.tmp');
  const parquetFiles = globSync('**/*.parquet', { cwd: duckdbPath });
  const csvFiles = globSync('**/*.csv', { cwd: duckdbPath });

  return {
    surface: 'duckdb',
    backend: 'filesystem',
    analytics_snapshots: {
      parquet_files: parquetFiles.length,
      csv_exports: csvFiles.length,
      total_files: parquetFiles.length + csvFiles.length,
      description: 'Offline analytics and batch reconciliation artifacts',
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SURFACE: ENGRAM (memory cache, vector index)
// ══════════════════════════════════════════════════════════════════════════════

function surfaceEngram() {
  console.log('\n🧠 Engram Surface (.tmp/engram-cache/)...');

  const engramPath = path.join(ROOT, '.tmp', 'engram-cache');
  if (!fs.existsSync(engramPath)) {
    return {
      surface: 'engram',
      backend: 'filesystem',
      status: 'not_found',
      location: '.tmp/engram-cache/',
    };
  }

  const files = globSync('**/*', { cwd: engramPath });
  const manifestFiles = files.filter(f => f.endsWith('.manifest.json') || f.endsWith('.index.json'));

  return {
    surface: 'engram',
    backend: 'filesystem',
    location: '.tmp/engram-cache/',
    total_files: files.length,
    manifest_files: manifestFiles.length,
    description: 'Runtime memory cache and vector index snapshots',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SURFACE: SEAWEEDFS (cold object storage — planned)
// ══════════════════════════════════════════════════════════════════════════════

function surfaceSeaweedfs() {
  console.log('\n❄️  SeaweedFS Surface (cold storage)...');

  return {
    surface: 'seaweedfs',
    backend: 'object_storage',
    status: 'planned',
    description: 'Cold storage for manifests, summaries, centroids (not raw code)',
    buckets: {
      'legal-evidence': 'evidence manifests and metadata',
      'atlas-cold': 'atlas directory manifests and cold storage metadata',
      'archive': 'archive snapshots and backups',
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   Phase 3C: Hidden Surface Registry Builder');
    console.log('═══════════════════════════════════════════════════════════');

    const registry = {
      timestamp: new Date().toISOString(),
      version: '3.0',
      description: 'Inventory of canonical and non-canonical storage surfaces',
      surfaces: [
        await surfaceAtlas(pool),
        surfaceNeschrom97(),
        surfaceDuckdb(),
        surfaceEngram(),
        surfaceSeaweedfs(),
      ],
      preservation_rules: {
        atlas: 'Canonical PostgreSQL source of truth — never mutate without explicit backfill',
        neschrom97: 'Archived card exports — read-only, evidence only',
        duckdb: 'Offline analytics snapshots — generated, not canonical',
        engram: 'Runtime memory cache — ephemeral, regenerated on startup',
        seaweedfs: 'Cold object storage — future, for manifests and summaries only (NOT raw code)',
      },
    };

    // Write report
    const reportDir = path.join(ROOT, 'docs', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const jsonPath = path.join(reportDir, 'hidden-surface-registry.json');
    fs.writeFileSync(jsonPath, JSON.stringify(registry, null, 2));

    console.log(`\n✅ Registry written to ${jsonPath}`);
    console.log(`\n📦 Surface Summary:`);
    for (const surface of registry.surfaces) {
      console.log(`  - ${surface.surface.toUpperCase()}: ${surface.backend}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
