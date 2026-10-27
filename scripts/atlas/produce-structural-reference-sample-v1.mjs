#!/usr/bin/env node
// Read-only bounded sample producer: admitted source bytes -> 8095 /ast/chunk (text in, evidence out) -> edge summary receipt.
// No database writes, no sidecar state change (the endpoint is pure over the posted text). Output only under .tmp/atlas.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const limit = Math.min(Number(arg('limit', '20')), 50);
const prefix = arg('prefix', 'sveltekit-frontend/src/lib/server/atlas/identity/');
const out = path.resolve(root, arg('out', '.tmp/atlas/structural-reference-sample-20261027.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sidecar = arg('sidecar', 'http://127.0.0.1:8095');
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' }).trim();
const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const EXECUTION_ID = '01a1763a-4355-71d7-9b81-2c7a1814a41f';
const LANG = { '.ts': 'typescript', '.mts': 'typescript', '.js': 'javascript', '.mjs': 'javascript' };

const rows = psql(`select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='${EXECUTION_ID}' and repository_id='repo:root' and repository_relative_path like '${prefix.replace(/'/g, "''")}%' order by repository_relative_path limit ${limit * 3}`)
  .split('\n').filter(Boolean).map((l) => l.split('\t'));

const result = { files: [], skipped: [], predicateCounts: {}, resolution: {}, totals: { filesSent: 0, edges: 0, chunks: 0 } };
for (const [rel, admittedRevision] of rows) {
  if (result.totals.filesSent >= limit) break;
  const lang = LANG[path.extname(rel)];
  if (!lang) { result.skipped.push({ rel, reason: 'LANGUAGE_NOT_IN_SAMPLE_SET' }); continue; }
  let bytes;
  try { bytes = fs.readFileSync(path.join(root, rel)); } catch { result.skipped.push({ rel, reason: 'MISSING_ON_DISK' }); continue; }
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== admittedRevision && digest.slice(7) !== admittedRevision) { result.skipped.push({ rel, reason: 'WORKTREE_BYTES_DIFFER_FROM_ADMITTED_REVISION' }); continue; }
  if (bytes.length > 900000) { result.skipped.push({ rel, reason: 'TOO_LARGE' }); continue; }
  try {
    const res = await fetch(`${sidecar}/ast/chunk`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ source: bytes.toString('utf8'), language: lang, filePath: rel, sourceRef: rel, sourceRevision: digest, workspaceRevision: admission.workspaceRevision }) });
    if (res.status !== 200) { result.skipped.push({ rel, reason: `HTTP_${res.status}` }); continue; }
    const j = await res.json();
    result.totals.filesSent += 1; result.totals.chunks += j.chunks?.length ?? 0; result.totals.edges += j.edges?.length ?? 0;
    for (const e of j.edges ?? []) {
      const p = String(e.type ?? e.predicate ?? 'UNKNOWN').toUpperCase();
      result.predicateCounts[p] = (result.predicateCounts[p] ?? 0) + 1;
      const r = `${e.resolved === true ? 'RESOLVED' : 'UNRESOLVED'}:${String(e.resolution ?? 'none')}`;
      result.resolution[r] = (result.resolution[r] ?? 0) + 1;
    }
    result.files.push({ rel, sourceRevision: digest, syntaxStatus: j.syntax_status, chunks: j.chunks?.length ?? 0, edges: j.edges?.length ?? 0, engine: `${j.engine}@${j.engine_version}`, edgeKeys: j.edges?.[0] ? Object.keys(j.edges[0]) : [] });
  } catch (error) { result.skipped.push({ rel, reason: `REQUEST_FAILED:${error.name}` }); }
}
const body = { schema: 'atlas.structural-reference-sample.v1', workspaceRevision: admission.workspaceRevision, executionId: EXECUTION_ID, prefix, limit, ...result, writesPerformed: false, canonicalAuthority: false, note: 'Edges here are parser output over admitted bytes; they have no stable symbol ids until reconciled, so none are relation candidates yet.' };
const receiptSha256 = `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ totals: result.totals, predicateCounts: result.predicateCounts, resolution: result.resolution, skipped: result.skipped.length, skippedReasons: [...new Set(result.skipped.map((s) => s.reason))], edgeKeys: result.files.find((f) => f.edgeKeys.length)?.edgeKeys ?? null, receiptSha256, output: path.relative(root, out) }, null, 1));
