#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const OUT = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_CODE_REVISION_OWNER_CANARY_OUT ?? 'docs/reports/code-revision-owner-canary.json',
);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const limit = Math.max(1, Math.min(100, Number(process.env.ATLAS_CODE_REVISION_OWNER_CANARY_SAMPLE ?? 10)));

function normalizeHash(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const digest = text.startsWith('sha256:') ? text.slice('sha256:'.length) : text;
  return /^[a-f0-9]{64}$/.test(digest) ? digest : null;
}

function validLegacyGitRevision(value: unknown): boolean {
  return typeof value === 'string' && /^(?:[a-f0-9]{7,64}|(?:refs\/)?(?:heads|tags)\/[A-Za-z0-9._/-]+)$/i.test(value.trim());
}

async function gitHead(): Promise<string | null> {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function inspectRow(row: { source_ref: string; source_revision: string | null; content_hash: string | null }, head: string | null) {
  const sourceRef = row.source_ref.replace(/\\/g, '/').trim();
  const absolute = path.resolve(REPO_ROOT, sourceRef);
  const insideRepo = absolute === REPO_ROOT || absolute.startsWith(`${REPO_ROOT}${path.sep}`);
  let actualHash: string | null = null;
  let regularFile = false;
  if (insideRepo) {
    try {
      regularFile = (await stat(absolute)).isFile();
      if (regularFile) actualHash = createHash('sha256').update(await readFile(absolute)).digest('hex');
    } catch { /* classified below */ }
  }
  const storedHash = normalizeHash(row.content_hash);
  const exactByteDigestMatches = Boolean(actualHash && storedHash && actualHash === storedHash);
  return {
    sourceRef,
    sourceRevision: row.source_revision,
    storedContentHash: storedHash,
    actualContentHash: actualHash,
    sourceInsideRepository: insideRepo,
    regularFile,
    exactByteDigestMatches,
    legacyGitProvenanceValid: validLegacyGitRevision(row.source_revision),
    currentGitHead: head,
    currentGitHeadMatchesSourceRevision: Boolean(head && row.source_revision === head),
  };
}

await pool.query('BEGIN READ ONLY');
try {
  const tableResult = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'graphify_files'
    ) AS exists
  `);
  const tableExists = Boolean(tableResult.rows[0]?.exists);
  const columnResult = tableExists
    ? await pool.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'graphify_files'
      `)
    : { rows: [] as { column_name: string }[] };
  const columns = new Set(columnResult.rows.map((row) => row.column_name));
  const requiredColumns = ['source_ref', 'source_revision', 'content_hash'];
  const requiredColumnsPresent = requiredColumns.every((column) => columns.has(column));
  const head = await gitHead();
  const rows = tableExists && requiredColumnsPresent
    ? (await pool.query<{ source_ref: string; source_revision: string | null; content_hash: string | null }>(`
        SELECT source_ref, source_revision, content_hash
        FROM graphify_files
        WHERE source_ref IS NOT NULL
        ORDER BY source_ref
        LIMIT $1
      `, [limit])).rows
    : [];
  const samples = await Promise.all(rows.map((row) => inspectRow(row, head)));
  const compatibilityPass = samples.length > 0 && samples.every((sample) =>
    sample.sourceInsideRepository &&
    sample.regularFile &&
    sample.exactByteDigestMatches &&
    sample.legacyGitProvenanceValid,
  );
  const status = !tableExists || !requiredColumnsPresent
    ? 'REVISION_OWNER_NOT_READY'
    : samples.length === 0
      ? 'REVISION_OWNER_TABLE_READY_NO_SAMPLE_ROWS'
      : compatibilityPass
        ? 'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND'
        : 'REVISION_ORIGIN_NOT_PROVEN';
  const report = {
    schemaVersion: 'atlas.code-revision-owner-canary.v1',
    status,
    sourceRevisionStorageSemantics: compatibilityPass ? 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1' : 'UNKNOWN',
    sourceRevisionAuthorityField: compatibilityPass ? 'CONTENT_HASH' : 'NONE',
    readOnly: true,
    canonicalWriteAttempted: false,
    durableOwnerBound: false,
    fanoutMayConsumeAsCanonical: false,
    tableExists,
    requiredColumns,
    requiredColumnsPresent,
    sampleLimit: limit,
    sampleCount: samples.length,
    currentGitHead: head,
    samples,
    nextGate: 'CANONICAL_GRAPHIFY_SOURCE_INVENTORY_WRITER_AND_SINGLE_ROW_READBACK',
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, output: OUT }, null, 2));
  if (status !== 'REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND') process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
