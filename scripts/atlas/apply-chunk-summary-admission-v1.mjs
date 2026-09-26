#!/usr/bin/env node
/** CEI-22 CLI over the CEI-21 writer. Default = DRY RUN (BEGIN..ROLLBACK, no writes). Writing requires --apply. */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { applyChunkSummaryAdmissions } from './lib/chunk-summary-admission-writer-v1.mjs';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const manifestPath = path.resolve(REPO_ROOT, arg('manifest') ?? (() => { throw new Error('MANIFEST_REQUIRED'); })());
const apply = process.argv.includes('--apply');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.ornith-lineage-bound-summary-proposal-manifest.v1') throw new Error('UNSUPPORTED_MANIFEST');
const proposals = [];
for (const s of manifest.shards) {
  const rows = (await fs.readFile(path.resolve(path.dirname(manifestPath), s.path), 'utf8')).split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  proposals.push(...rows);
}
// --frozen-from=<superseded manifest>: the intended canary targets (chunkRowId + sourceRevision) frozen BEFORE regeneration.
let frozenTargets = null;
if (arg('frozen-from')) {
  const fm = path.resolve(REPO_ROOT, arg('frozen-from'));
  const fman = JSON.parse(await fs.readFile(fm, 'utf8'));
  frozenTargets = [];
  for (const s of fman.shards) {
    const rows = (await fs.readFile(path.resolve(path.dirname(fm), s.path), 'utf8')).split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
    frozenTargets.push(...rows.map((r) => ({ chunkRowId: r.chunkRowId, sourceRevision: r.sourceRevision })));
  }
}
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });
const client = await pool.connect();
try {
  const receipt = await applyChunkSummaryAdmissions({ client, proposals, repositoryId: manifest.scope.repositoryId, apply, frozenTargets });
  console.log(JSON.stringify(receipt, null, 2));
} finally { client.release(); await pool.end(); }
