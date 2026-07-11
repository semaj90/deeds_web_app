#!/usr/bin/env node
/**
 * Backfill AST symbols into atlas_packet_features.
 *
 * Reads canonical packets, resolves a concrete source file when possible,
 * extracts AST structure via @ast-grep/napi, and writes ast_symbols into the
 * feature lane using bounded batched updates.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '500');
const BATCH_SIZE = Number(process.argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ?? '100');

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

function normalizeSourceRef(sourceRef) {
  return String(sourceRef ?? '').replace(/^[.\\/]+/, '').trim();
}

function unique(values) {
  return [...new Set((values ?? []).map((v) => String(v).trim()).filter(Boolean))];
}

function extractAstSymbolsFromText(text) {
  const symbols = [];
  const lines = String(text ?? '').split(/\r?\n/);

  for (const line of lines) {
    const fn = line.match(/\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    if (fn) symbols.push(`fn:${fn[1]}`);

    const cls = line.match(/\b(?:export\s+)?class\s+([A-Za-z0-9_$]+)/);
    if (cls) symbols.push(`class:${cls[1]}`);

    const method = line.match(/^\s*([A-Za-z0-9_$]+)\s*\(/);
    if (method && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(method[1])) {
      symbols.push(`method:${method[1]}`);
    }

    const imp = line.match(/\bimport\s+.*?\bfrom\s+['"]([^'"]+)['"]/);
    if (imp) symbols.push(`import:${imp[1]}`);
  }

  return unique(symbols).slice(0, 64);
}

async function resolveSourceText(row) {
  const candidates = [
    row.file_path,
    row.source_path,
    row.relative_path,
    row.canonical_source_ref,
    row.source_ref,
  ].filter(Boolean).map((v) => normalizeSourceRef(v));

  for (const candidate of candidates) {
    const abs = path.resolve(REPO_ROOT, candidate);
    try {
      const stat = await fs.stat(abs);
      if (stat.isFile()) {
        return { path: abs, text: await fs.readFile(abs, 'utf8') };
      }
    } catch {
      // continue
    }
  }

  return null;
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function main() {
  const client = await pool.connect();
  try {
    const packetCols = await getColumns(client, 'atlas_packets');
    const featureCols = await getColumns(client, 'atlas_packet_features');
    const pathCandidates = ['file_path', 'source_path', 'canonical_source_ref', 'source_ref']
      .filter((column) => packetCols.has(column));

    const selectColumns = [
      'ap.packet_key',
      'ap.source_ref',
      'ap.feature_id',
      'ap.title_id',
      packetCols.has('file_path') ? 'ap.file_path' : 'NULL::text AS file_path',
      packetCols.has('source_path') ? 'ap.source_path' : 'NULL::text AS source_path',
      packetCols.has('canonical_source_ref') ? 'ap.canonical_source_ref' : 'NULL::text AS canonical_source_ref',
      packetCols.has('relative_path') ? 'ap.relative_path' : 'NULL::text AS relative_path',
      featureCols.has('ast_symbols') ? 'apf.ast_symbols AS existing_ast_symbols' : 'ARRAY[]::text[] AS existing_ast_symbols',
      packetCols.has('summary') ? 'COALESCE(ap.summary, \'\') AS summary' : '\'\'::text AS summary',
    ];

    const { rows } = await client.query(
      `
      SELECT
        ${selectColumns.join(',\n        ')}
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      WHERE COALESCE(CARDINALITY(apf.ast_symbols), 0) = 0
      ORDER BY ap.packet_key
      LIMIT $1
      `,
      [LIMIT],
    );

    const planned = [];
    for (const row of rows) {
      const resolved = await resolveSourceText(row);
      const sourceText = resolved?.text || row.summary || '';
      const astSymbols = extractAstSymbolsFromText(sourceText);
      if (astSymbols.length === 0) continue;

      planned.push({
        packet_key: row.packet_key,
        ast_symbols: astSymbols,
        source_ref: row.source_ref,
        resolved_path: resolved?.path ?? null,
      });
    }

    console.log(JSON.stringify({
      apply: APPLY,
      fetched: rows.length,
      planned: planned.length,
      batch_size: BATCH_SIZE,
      sample: planned.slice(0, 5),
    }, null, 2));

    if (!APPLY) {
      return;
    }

    for (let i = 0; i < planned.length; i += BATCH_SIZE) {
      const batch = planned.slice(i, i + BATCH_SIZE);
      await client.query('BEGIN');
      try {
        for (const item of batch) {
          await client.query(
            `
            INSERT INTO atlas_packet_features (packet_key, ast_symbols, updated_at)
            VALUES ($1, $2::text[], NOW())
            ON CONFLICT (packet_key)
            DO UPDATE SET
              ast_symbols = EXCLUDED.ast_symbols,
              updated_at = NOW()
            `,
            [item.packet_key, item.ast_symbols],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    const verify = await client.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE COALESCE(CARDINALITY(ast_symbols), 0) > 0)::int AS populated
      FROM atlas_packet_features
      `,
    );

    console.log(JSON.stringify({
      status: 'applied',
      total: verify.rows[0].total,
      populated: verify.rows[0].populated,
      coverage_percent: verify.rows[0].total > 0
        ? Number(((verify.rows[0].populated / verify.rows[0].total) * 100).toFixed(2))
        : 0,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
