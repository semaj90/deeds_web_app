#!/usr/bin/env node
/**
 * TAXONOMY-ORDINAL-01 proof (read-only).
 *
 * Proves buildTaxonomyOrdinalMapV1 (packages/parent-atlas/src/core/
 * taxonomy-ordinal-map-v1.ts) against the real, live taxonomy_nodes table —
 * not a synthetic fixture. Contract-only: builds the typed ordinal map and
 * checks determinism/coverage; performs zero writes and no GPU execution.
 * Per root CLAUDE.md's ACE-RADIX-01 governance, live radix-sort/BitFrost
 * wiring on top of this map remains blocked until that gate reaches a full
 * PASS — this script does not attempt it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true, quiet: true });
const REPORT = resolve(ROOT, 'docs/reports/taxonomy-ordinal-map-v1.json');

const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

async function main() {
  const { buildTaxonomyOrdinalMapV1 } = await import(
    pathToFileURL(resolve(ROOT, 'packages/parent-atlas/dist/core/taxonomy-ordinal-map-v1.js')).href
  );

  const { rows } = await pool.query(
    `SELECT node_key, level, parent_key FROM taxonomy_nodes ORDER BY node_key`
  );

  const taxonomyRevision = `taxonomy:live:${rows.length}`;
  const map = buildTaxonomyOrdinalMapV1({
    taxonomyRevision,
    nodes: rows.map((r) => ({
      taxonomyNodeKey: r.node_key,
      level: r.level,
      parentKey: r.parent_key,
    })),
  });

  const mapAgain = buildTaxonomyOrdinalMapV1({
    taxonomyRevision,
    nodes: rows.map((r) => ({ taxonomyNodeKey: r.node_key, level: r.level, parentKey: r.parent_key })),
  });

  const byLevel = {};
  for (const row of map.rows) byLevel[row.level] = (byLevel[row.level] ?? 0) + 1;

  const report = {
    schema: 'atlas.taxonomy-ordinal-map-v1.proof',
    generatedAt: new Date().toISOString(),
    liveRowCount: rows.length,
    mapRowCount: map.rows.length,
    rowCountMatches: rows.length === map.rows.length,
    deterministic: map.taxonomyOrdinalMapChecksum === mapAgain.taxonomyOrdinalMapChecksum,
    taxonomyOrdinalMapChecksum: map.taxonomyOrdinalMapChecksum,
    denseOrdinalRange: [map.rows[0]?.taxonomyOrdinal ?? null, map.rows[map.rows.length - 1]?.taxonomyOrdinal ?? null],
    rowsByLevel: byLevel,
    canonicalAuthority: map.canonicalAuthority,
    writesPerformed: false,
    gpuExecutionPerformed: false,
    note: 'Contract-only proof. No live radix-sort/BitFrost execution — blocked on ACE-RADIX-01 full PASS per root CLAUDE.md governance.',
  };

  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await pool.end();
  process.exit(report.rowCountMatches && report.deterministic ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
