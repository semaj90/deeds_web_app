#!/usr/bin/env node
/**
 * SUM-04: atomic 12-row canonical summary canary. REHEARSAL BY DEFAULT.
 *
 *   npx tsx scripts/atlas/run-sum04-summary-canary-v1.mts --manifest=<sealed manifest.json>            # rehearsal: everything executes, then ROLLBACK
 *   ATLAS_AUTHORIZE_SUM04_CANARY=1 npx tsx ... --manifest=<...> --apply --expect-rows=12                  # real commit
 *
 * All rows go through the single admission kernel inside ONE serializable transaction. Any row that is not
 * ADMITTED, any readback mismatch, or any change to legacy `summary_hash`/`summary` aborts everything
 * (ROLLBACK). Writes only `summary_text` + `summary_provenance` (empty slots only). Pinned manifest required;
 * never "latest". Receipt is exclusive-create.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { admitCanonicalChunkSummaryV1 } from './lib/canonical-chunk-summary-admission-v1.mjs';
import { createPostgresChunkSummaryAdmissionRepositoryV1 } from './lib/postgres-chunk-summary-admission-repository-v1.mjs';
import { computeSourceIdentityKeyV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/stable-file-identity-mint-v1.ts';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const die = (m: string): never => { throw new Error(m); };
const manifestArg = args.get('manifest') ?? die('MANIFEST_REQUIRED (pin an explicit sealed manifest; "latest" is refused)');
const repoId = args.get('repo-id') ?? 'deeds-web-app';
const expectRows = Number(args.get('expect-rows') ?? 12);
const APPLY = args.get('apply') === 'true';
if (APPLY && process.env.ATLAS_AUTHORIZE_SUM04_CANARY !== '1') die('EXPLICIT_SUM04_CANARY_AUTHORIZATION_REQUIRED');
if (APPLY && expectRows !== 12) die('SUM04_FIRST_PROOF_IS_EXACTLY_12_ROWS');

const prefixed = (b: Buffer | string) => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const manifestPath = path.resolve(REPO_ROOT, manifestArg);
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.ornith-lineage-bound-summary-proposal-manifest.v1' || manifest.canonicalAuthority !== false) die('UNSUPPORTED_OR_CANONICAL_MANIFEST');
const proposals: any[] = [];
for (const shard of manifest.shards ?? []) {
  const bytes = await fs.readFile(path.resolve(path.dirname(manifestPath), shard.path));
  if (prefixed(bytes) !== shard.sha256) die(`SHARD_CHECKSUM_MISMATCH:${shard.path}`);
  const rows = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  if (rows.length !== shard.rows) die(`SHARD_ROW_COUNT_MISMATCH:${shard.path}`);
  proposals.push(...rows);
}
if (proposals.length !== manifest.counts?.generated) die('MANIFEST_GENERATED_COUNT_MISMATCH');
if (prefixed(JSON.stringify(proposals.map((r) => r.summarySha256))) !== manifest.rootChecksum) die('PROPOSAL_ROOT_CHECKSUM_MISMATCH');
if (proposals.length !== expectRows) die(`EXPECTED_${expectRows}_ROWS_GOT_${proposals.length}`);
if (new Set(proposals.map((p) => p.chunkRowId)).size !== proposals.length) die('DUPLICATE_CHUNK_ROW_IN_CANARY');
if (new Set(proposals.map((p) => p.workspaceRevision)).size !== 1) die('MIXED_WORKSPACE_REVISIONS_IN_CANARY');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000 });
const outer = await pool.connect();
// The kernel/adapter open their own BEGIN/COMMIT; route them all onto one outer serializable transaction.
const sharedPool = {
  async connect() {
    return {
      async query(sql: string, params?: unknown[]) {
        if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [], rowCount: 0 };
        return outer.query(sql, params as any[]);
      },
      release() {},
    };
  },
};
const repository = createPostgresChunkSummaryAdmissionRepositoryV1({
  pool: sharedPool, repositoryUuid: repoId, identityRepositoryId: repoId, computeSourceIdentityKeyV1,
});

const ids = proposals.map((p) => p.chunkRowId);
const legacySnapshot = async () => (await outer.query(
  'SELECT id::text AS id, summary_hash, summary FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[]) ORDER BY id', [ids])).rows;
const receipt: any = {
  schema: 'atlas.sum04-canary-receipt.v1', generatedAt: new Date().toISOString(), mode: APPLY ? 'APPLY' : 'REHEARSAL',
  manifest: path.relative(REPO_ROOT, manifestPath), manifestRoot: manifest.rootChecksum, requested: proposals.length,
  workspaceRevision: proposals[0].workspaceRevision, results: [], checks: {}, status: 'FAILED', failure: null, committed: false,
};
let failure: string | null = null;
try {
  await outer.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  const before = await legacySnapshot();
  const pre = await outer.query('SELECT count(*)::int n FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[]) AND (summary_text IS NOT NULL OR summary_provenance IS NOT NULL)', [ids]);
  receipt.checks.unexpectedExisting = pre.rows[0].n;
  if (pre.rows[0].n !== 0) failure = 'UNEXPECTED_EXISTING_CANONICAL_SUMMARY';

  if (!failure) {
    for (const p of proposals) {
      const r: any = await admitCanonicalChunkSummaryV1({ proposal: p, repository });
      receipt.results.push({ chunkRowId: p.chunkRowId, status: r.status, reasons: r.reasons });
      if (r.status !== 'ADMITTED') { failure = failure ?? `ROW_NOT_ADMITTED:${p.chunkRowId}:${r.status}`; if (APPLY) break; } // rehearsal reports every blocker
    }
  }
  if (!failure) {
    const back = (await outer.query(
      'SELECT id::text AS id, summary_text, summary_provenance FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])', [ids])).rows;
    const byId = new Map(back.map((r: any) => [r.id, r]));
    let readbackOk = 0; let digestOk = 0;
    for (const p of proposals) {
      const r: any = byId.get(p.chunkRowId);
      if (r?.summary_text === p.summary) readbackOk += 1;
      const d = r?.summary_provenance?.summaryDigest;
      if (typeof d === 'string' && d.endsWith(createHash('sha256').update(r.summary_text ?? '', 'utf8').digest('hex'))) digestOk += 1;
    }
    const after = await legacySnapshot();
    const legacyUnchanged = JSON.stringify(before) === JSON.stringify(after);
    Object.assign(receipt.checks, { readbackMatched: readbackOk, summaryDigestRecomputedMatched: digestOk, legacySummaryColumnsUnchanged: legacyUnchanged });
    if (readbackOk !== proposals.length || digestOk !== proposals.length || !legacyUnchanged) failure = 'READBACK_OR_LEGACY_INVARIANT_FAILED';
  }
} catch (e: any) { failure = `EXCEPTION:${e.message}`; }

const commit = !failure && APPLY;
try { await outer.query(commit ? 'COMMIT' : 'ROLLBACK'); } catch (e: any) { failure = failure ?? `FINALIZE_FAILED:${e.message}`; }
receipt.committed = commit && !failure;
receipt.failure = failure;
receipt.status = failure ? 'FAILED' : (APPLY ? 'APPLY_COMMITTED_PENDING_INDEPENDENT_READBACK' : 'REHEARSAL_PROVEN_ROLLED_BACK');
if (receipt.committed) { // independent fresh-connection readback
  const c = await pool.query('SELECT count(*)::int n FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[]) AND summary_provenance->>\'schema\' = \'atlas.summary-provenance.v1\'', [ids]);
  receipt.checks.independentReadbackRows = c.rows[0].n;
  receipt.status = c.rows[0].n === proposals.length ? 'APPLY_PROVEN' : 'FAILED';
} else if (!APPLY && !failure) {
  const c = await pool.query('SELECT count(*)::int n FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[]) AND (summary_text IS NOT NULL OR summary_provenance IS NOT NULL)', [ids]);
  receipt.checks.rowsStillEmptyAfterRollback = c.rows[0].n === 0;
  if (c.rows[0].n !== 0) receipt.status = 'FAILED';
}
outer.release(); await pool.end();
const out = path.join(REPO_ROOT, 'docs', 'reports', `sum04-canary-${receipt.mode.toLowerCase()}-${receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
await fs.writeFile(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, mode: receipt.mode, requested: receipt.requested, admitted: receipt.results.filter((r: any) => r.status === 'ADMITTED').length, checks: receipt.checks, failure, out: path.relative(REPO_ROOT, out) }, null, 2));
process.exit(receipt.status === 'FAILED' ? 1 : 0);
