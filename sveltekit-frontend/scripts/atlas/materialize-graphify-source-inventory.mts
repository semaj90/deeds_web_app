#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const apply = process.argv.includes('--apply');
const sourceArgIndex = process.argv.indexOf('--source');
const requestedSource = sourceArgIndex >= 0 ? process.argv[sourceArgIndex + 1] : null;
const limit = Math.max(1, Math.min(5000, Number(process.env.ATLAS_GRAPHIFY_SOURCE_LIMIT ?? (requestedSource ? 1 : 100))));
const out = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_GRAPHIFY_SOURCE_INVENTORY_PLAN_OUT ?? 'docs/reports/graphify-source-inventory-plan.json',
);
const producerRevision = 'atlas.graphify-source-inventory-writer.v1';

if (apply && process.env.ATLAS_GRAPHIFY_SOURCE_INVENTORY_APPLY !== '1') {
  throw new Error('GRAPHIFY_SOURCE_INVENTORY_APPLY_CONFIRMATION_REQUIRED');
}
if (apply && process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') {
  throw new Error('GRAPHIFY_SOURCE_INVENTORY_NON_PRODUCTION_DATABASE_REQUIRED');
}

async function git(args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return result.stdout.trim();
}

async function gitMaybe(args: string[]): Promise<string | null> {
  try { return (await git(args)) || null; } catch { return null; }
}

function sourcePathAllowed(sourceRef: string): boolean {
  const normalized = sourceRef.replace(/\\/g, '/');
  return Boolean(normalized) && !normalized.startsWith('.git/') && !normalized.startsWith('node_modules/');
}

async function sourceRefs(): Promise<string[]> {
  if (requestedSource) return [requestedSource.replace(/\\/g, '/')];
  const output = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
  });
  return output.stdout.split('\0').filter(sourcePathAllowed).sort().slice(0, limit);
}

const workspaceRevision = await git(['rev-parse', 'HEAD']);
const refs = await sourceRefs();
const records = [] as Array<Record<string, unknown>>;
for (const sourceRef of refs) {
  const absolute = path.resolve(REPO_ROOT, sourceRef);
  if (absolute !== REPO_ROOT && !absolute.startsWith(`${REPO_ROOT}${path.sep}`)) continue;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) continue;
    const bytes = await readFile(absolute);
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    records.push({
      workspaceRevision,
      sourceRef,
      sourceRevision: workspaceRevision,
      contentHash,
      byteLength: bytes.byteLength,
      gitBlobOid: await gitMaybe(['hash-object', '--path', sourceRef, sourceRef]),
      sourceRevisionAuthority: 'content_hash',
      producerRevision,
    });
  } catch (error) {
    records.push({ sourceRef, status: 'SOURCE_READ_FAILED', error: error instanceof Error ? error.message : String(error) });
  }
}

const plan = {
  schemaVersion: 'atlas.graphify-source-inventory-plan.v1',
  mode: apply ? 'APPLY_NON_PRODUCTION' : 'DRY_RUN',
  readOnly: !apply,
  canonicalWriteAttempted: false,
  durableOwnerBound: false,
  workspaceRevision,
  sourceCount: records.filter((row) => typeof row.contentHash === 'string').length,
  records,
  authority: {
    sourceRevisionAuthorityColumn: 'content_hash',
    legacySourceRevisionColumn: 'source_revision',
    preservesLegacySourceRevisionSemantics: true,
  },
  nextGate: 'SINGLE_ROW_PERSISTENCE_READBACK_CANARY',
};

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

if (apply) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  await pool.query('BEGIN');
  try {
    for (const row of records) {
      if (typeof row.contentHash !== 'string') continue;
      await pool.query(`
        INSERT INTO graphify_files
          (workspace_revision, source_ref, source_revision, content_hash, byte_length, git_blob_oid, source_revision_authority, producer_revision)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (workspace_revision, source_ref) DO UPDATE SET
          source_revision = EXCLUDED.source_revision,
          content_hash = EXCLUDED.content_hash,
          byte_length = EXCLUDED.byte_length,
          git_blob_oid = EXCLUDED.git_blob_oid,
          source_revision_authority = EXCLUDED.source_revision_authority,
          producer_revision = EXCLUDED.producer_revision,
          updated_at = now()
      `, [row.workspaceRevision, row.sourceRef, row.sourceRevision, row.contentHash, row.byteLength, row.gitBlobOid, row.sourceRevisionAuthority, row.producerRevision]);
    }
    for (const row of records) {
      if (typeof row.contentHash !== 'string') continue;
      const readback = await pool.query<{
        workspace_revision: string;
        source_ref: string;
        source_revision: string | null;
        content_hash: string;
      }>(`
        SELECT workspace_revision, source_ref, source_revision, content_hash
        FROM graphify_files
        WHERE workspace_revision = $1 AND source_ref = $2
      `, [row.workspaceRevision, row.sourceRef]);
      const persisted = readback.rows[0];
      if (!persisted ||
        persisted.workspace_revision !== row.workspaceRevision ||
        persisted.source_ref !== row.sourceRef ||
        persisted.source_revision !== row.sourceRevision ||
        persisted.content_hash.toLowerCase() !== String(row.contentHash).toLowerCase()) {
        throw new Error(`GRAPHIFY_SOURCE_INVENTORY_READBACK_FAILED:${String(row.sourceRef)}`);
      }
    }
    await pool.query('COMMIT');
    plan.canonicalWriteAttempted = true;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: apply ? 'APPLIED_NON_PRODUCTION' : 'DRY_RUN_PROVEN', output: out, sourceCount: plan.sourceCount, workspaceRevision }, null, 2));
