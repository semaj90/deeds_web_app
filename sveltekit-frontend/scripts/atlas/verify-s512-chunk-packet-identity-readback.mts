#!/usr/bin/env node

/**
 * S512-ID4 read-only determinism verifier.
 *
 * This verifies that the frozen chunk/packet bridge can be read back
 * deterministically. It does not rebuild the linker and does not promote
 * UNRESOLVED or AMBIGUOUS rows to admitted identity.
 */
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const REPORT_PATH = 'docs/reports/s512-chunk-packet-identity-readback-v1.json';
const root = process.cwd().endsWith('sveltekit-frontend') ? '..' : '.';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

function checksum(rows: Record<string, unknown>[]): string {
  const serialized = rows.map((row) => JSON.stringify(canonical(row))).sort().join('\n');
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 120000,
});

let report: Record<string, unknown>;
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const exists = await client.query(`
    SELECT to_regclass('public.atlas_chunk_packet_identity_links') IS NOT NULL AS present
  `);
  if (!exists.rows[0]?.present) {
    report = { schema: 'atlas.s512-chunk-packet-identity-readback.v1', status: 'TABLE_MISSING', readOnly: true };
  } else {
    const first = (await client.query('SELECT * FROM public.atlas_chunk_packet_identity_links')).rows as Record<string, unknown>[];
    const second = (await client.query('SELECT * FROM public.atlas_chunk_packet_identity_links')).rows as Record<string, unknown>[];
    const firstChecksum = checksum(first);
    const secondChecksum = checksum(second);
    const methodCounts = first.reduce<Record<string, number>>((counts, row) => {
      const method = String(row.match_method ?? 'MISSING');
      counts[method] = (counts[method] ?? 0) + 1;
      return counts;
    }, {});
    report = {
      schema: 'atlas.s512-chunk-packet-identity-readback.v1',
      status: first.length === second.length && firstChecksum === secondChecksum ? 'READBACK_DETERMINISTIC' : 'READBACK_DRIFT',
      readOnly: true,
      admittedRows: methodCounts.EXACT_CANONICAL_ID ?? 0,
      unresolvedRows: methodCounts.UNRESOLVED ?? 0,
      ambiguousRows: methodCounts.AMBIGUOUS ?? 0,
      totalRows: first.length,
      methodCounts,
      firstChecksum,
      secondChecksum,
      algorithmRevisions: [...new Set(first.map((row) => String(row.algorithm_revision ?? 'MISSING')))].sort(),
      note: 'Deterministic readback does not authorize bridge consumption; S512-ID3 admission remains pending.',
    };
  }
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* connection may be closed */ }
  report = {
    schema: 'atlas.s512-chunk-packet-identity-readback.v1',
    status: 'READBACK_ERROR',
    readOnly: true,
    error: error instanceof Error ? error.message : String(error),
  };
} finally {
  client.release();
  await pool.end();
}

const fs = await import('node:fs/promises');
const reportPath = `${root}/${REPORT_PATH}`;
await fs.mkdir(new URL('.', `file://${process.cwd().replaceAll('\\', '/')}/${root}/docs/reports/`), { recursive: true }).catch(() => {});
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));

