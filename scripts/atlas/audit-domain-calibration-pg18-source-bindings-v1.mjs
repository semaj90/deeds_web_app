#!/usr/bin/env node
/**
 * Read-only per-file comparison of the domain calibration review cohort against
 * PostgreSQL workspace source bindings and exact current checkout bytes.
 * Per-file matches do not establish whole-workspace currentness or gold eligibility.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { resolveCurrentWorkspaceFrameV1, computeWorkspaceFrameAuthorityV1 } from './lib/current-workspace-frame-selector-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.join(root, 'docs/reports/domain-calibration-gold-v2.jsonl');
const defaultOutput = path.join(root, '.tmp/review/domain-calibration-pg18-source-bindings-v1.json');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const outputPath = path.resolve(root, outputArg || path.relative(root, defaultOutput));
const frame = resolveCurrentWorkspaceFrameV1({ root, argv: process.argv.slice(2), env: process.env });
const frameAuthority = computeWorkspaceFrameAuthorityV1(frame);
if (frame.status !== 'CURRENT_WORKSPACE_FRAME_SELECTED' || !frame.selectedWorkspaceRevision || frame.authorityConflict) {
  throw new Error('AUTHORITATIVE_WORKSPACE_REVISION_UNRESOLVED');
}

const rows = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return { ...JSON.parse(line), _line: index + 1 }; }
  catch { throw new Error(`INVALID_JSONL_ROW:${index + 1}`); }
});
const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
const normHash = (value) => String(value ?? '').trim().toLowerCase().replace(/^sha256:/, '');
const rowRefs = new Map();
for (const row of rows) {
  const base = normalizeRef(row.canonicalSourceRef || row.sourceRef);
  if (!base) continue;
  const variants = new Set([base]);
  if (base.startsWith('sveltekit-frontend/')) variants.add(base.slice('sveltekit-frontend/'.length));
  else variants.add(`sveltekit-frontend/${base}`);
  for (const ref of variants) {
    if (!rowRefs.has(ref)) rowRefs.set(ref, new Set());
    rowRefs.get(ref).add(row._line);
  }
}

const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });
let dbRows = [];
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const refs = [...rowRefs.keys()];
    const result = await client.query(
      `SELECT canonical_source_ref::text AS canonical_source_ref,
              workspace_revision::text AS workspace_revision,
              source_revision::text AS source_revision,
              content_digest::text AS content_digest,
              byte_length
       FROM public.atlas_workspace_source_bindings
       WHERE repo_id = $1 AND workspace_revision = $2 AND canonical_source_ref = ANY($3::text[])
       ORDER BY canonical_source_ref`,
      ['deeds-web-app', frame.selectedWorkspaceRevision, refs],
    );
    dbRows = result.rows;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

const repoReal = fs.realpathSync(root);
function readCurrentSource(refs) {
  const candidates = [...new Set(refs)].map((ref) => path.resolve(root, ...ref.split('/')));
  const targetCandidate = candidates.find((candidate) => fs.existsSync(candidate));
  if (!targetCandidate) return { status: 'LOCAL_BYTES_MISSING' };
  const target = fs.realpathSync(targetCandidate);
  if (target !== repoReal && !target.startsWith(`${repoReal}${path.sep}`)) return { status: 'PATH_OUTSIDE_REPOSITORY' };
  const bytes = fs.readFileSync(target);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return { status: 'LOCAL_BYTES_NOT_UTF8', digest, byteLength: bytes.length }; }
  return { status: 'LOCAL_BYTES_READABLE', digest, byteLength: bytes.length };
}

const dbByRef = new Map();
for (const binding of dbRows) {
  const ref = normalizeRef(binding.canonical_source_ref);
  const list = dbByRef.get(ref) ?? [];
  list.push(binding);
  dbByRef.set(ref, list);
}
const results = rows.map((row) => {
  const base = normalizeRef(row.canonicalSourceRef || row.sourceRef);
  const variants = [...new Set([base, base.startsWith('sveltekit-frontend/') ? base.slice(19) : `sveltekit-frontend/${base}`])];
  if (!base || base.startsWith('/') || base.split('/').includes('..')) {
    return { line: row._line, packetKey: row.packetKey ?? null, sourceRef: row.sourceRef ?? null, status: 'UNSAFE_OR_MISSING_SOURCE_REF' };
  }
  const local = readCurrentSource(variants);
  const bindings = variants.flatMap((ref) => dbByRef.get(ref) ?? []);
  const unique = [...new Map(bindings.map((binding) => [normalizeRef(binding.canonical_source_ref), binding])).values()];
  let status = local.status;
  if (local.status === 'LOCAL_BYTES_READABLE') {
    if (unique.length > 1) status = 'AMBIGUOUS';
    else if (unique.length === 0) status = 'NO_BINDING';
    else {
      const binding = unique[0];
      const expectedDigest = normHash(binding.content_digest);
      const expectedRevision = normHash(binding.source_revision);
      status = expectedDigest === local.digest && expectedRevision === local.digest
        ? 'DB_BINDING_MATCHES_LOCAL_BYTES'
        : 'DB_BINDING_CONTENT_MISMATCH';
      return {
        line: row._line, packetKey: row.packetKey ?? null, sourceRef: row.sourceRef ?? null,
        canonicalSourceRef: binding.canonical_source_ref,
        workspaceRevision: binding.workspace_revision,
        sourceRevision: binding.source_revision,
        contentDigest: binding.content_digest,
        byteLength: Number(binding.byte_length),
        currentSourceSha256: `sha256:${local.digest}`,
        status,
      };
    }
  }
  return { line: row._line, packetKey: row.packetKey ?? null, sourceRef: row.sourceRef ?? null, currentSourceSha256: local.digest ? `sha256:${local.digest}` : null, status };
});

const countByStatus = Object.fromEntries([...new Set(results.map((row) => row.status))].sort().map((status) => [status, results.filter((row) => row.status === status).length]));
const receipt = {
  schema: 'atlas.domain-calibration-pg18-source-bindings-audit.v1',
  generatedAt: new Date().toISOString(),
  input: path.relative(root, inputPath).replaceAll('\\', '/'),
  inputSha256: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex')}`,
  selectedWorkspaceRevision: frame.selectedWorkspaceRevision,
  workspaceFrame: {
    status: frame.status,
    selectedSource: frame.selectedSource,
    selectedAuthority: frame.selectedAuthority,
    authorityConflict: frame.authorityConflict,
    frameAuthoritative: frameAuthority.frameAuthoritative,
  },
  wholeWorkspaceCurrentness: 'NOT_PROVEN',
  perFileBindingMatchCount: countByStatus.DB_BINDING_MATCHES_LOCAL_BYTES ?? 0,
  counts: countByStatus,
  rows: results,
  canonicalAuthority: false,
  goldEligible: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const tempPath = `${outputPath}.${process.pid}.tmp`;
try {
  fs.writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(tempPath, outputPath);
} finally {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}
console.log(JSON.stringify({ output: path.relative(root, outputPath).replaceAll('\\', '/'), rows: results.length, selectedWorkspaceRevision: frame.selectedWorkspaceRevision, wholeWorkspaceCurrentness: receipt.wholeWorkspaceCurrentness, counts: countByStatus, canonicalAuthority: false, goldEligible: false, writesPerformed: false }, null, 2));
