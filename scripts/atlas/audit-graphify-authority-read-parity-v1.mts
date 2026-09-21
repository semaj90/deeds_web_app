#!/usr/bin/env node
/**
 * GRAPHIFY-AUTHORITY-READ-PARITY-01 live proof runner (read-only). Runs the REAL loader from
 * sveltekit-frontend/src/lib/server/atlas/admission/graphify-authority-read-parity-v1.ts inside
 * BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, then rolls back. Its only write is its own report file.
 * Runtime owner stays the legacy `canonical_authority` boolean; nothing here switches any reader.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadAuthorityReadParityV1 } from '../../sveltekit-frontend/src/lib/server/atlas/admission/graphify-authority-read-parity-v1.ts';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const reportPath = path.join(REPO_ROOT, 'docs/reports/graphify-authority-read-parity-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const client = await pool.connect();
let result: any = null;
let counts: any = null;
let databaseError: string | null = null;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  result = await loadAuthorityReadParityV1(client as any);
  counts = (await client.query(`SELECT (SELECT count(*) FROM public.graphify_executions WHERE canonical_authority IS TRUE)::int AS boolean_canonical_rows,
                                       (SELECT count(*) FROM public.graphify_execution_authority)::int AS authority_rows`)).rows[0];
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await client.query('ROLLBACK').catch(() => undefined);
  client.release();
  await pool.end();
}

const report = {
  schema: 'atlas.graphify-authority-read-parity.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LIVE_LOADER_READBACK',
  transaction: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; ... ROLLBACK',
  databaseError,
  booleanCanonicalRows: counts?.boolean_canonical_rows ?? null,
  authorityRows: counts?.authority_rows ?? null,
  status: databaseError ? 'LOADER_FAILED' : result.status,
  reasons: result?.reasons ?? [],
  counts: result?.counts ?? null,
  revisions: result?.revisions ?? [],
  runtimeOwner: 'canonical_authority',
  runtimeReaderCutover: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, revisions: report.revisions.map((r: any) => ({ parity: r.parity, legacy: r.booleanExecutionIds.map((i: string) => i.slice(0, 8)), authority: r.authorityExecutionId })) }, null, 2));
