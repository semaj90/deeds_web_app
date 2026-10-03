#!/usr/bin/env node

/**
 * CURRENT_SUMMARY_REGEN cohort freeze — read-only, no generation, no DB/Valkey writes.
 * Classifies every current identity by what summary work it needs, verifies the exact input bytes
 * (disk sha256 == admitted hash), attaches legacy chunk-summary hints as NON-authoritative context,
 * and seals a manifest so CEI-05 (summary admission) consumes a fixed cohort.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const EXEC = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const shardRoot = path.join(REPO_ROOT, '.tmp/atlas/current-enriched-index-shards-v1');
const dir = process.argv[2] ?? fs.readdirSync(shardRoot).sort().at(-1);
const manifestIn = JSON.parse(fs.readFileSync(path.join(shardRoot, dir, 'manifest.json'), 'utf8'));
const recs = [];
for (const s of manifestIn.shards) for (const l of fs.readFileSync(path.join(shardRoot, dir, s.path), 'utf8').split('\n')) if (l) recs.push(JSON.parse(l));

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 240000 });
const client = await pool.connect();
let mem; let hints;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  mem = new Map((await client.query(`SELECT source_ref, byte_length::bigint AS bytes, lower(replace(content_hash,'sha256:','')) AS chash, lower(replace(code_source_revision,'sha256:','')) AS rev FROM public.graphify_execution_file_membership_v2 WHERE execution_id = $1::uuid AND repository_id = 'repo:root'`, [EXEC])).rows.map((r) => [r.source_ref, r]));
  hints = new Map((await client.query(`SELECT source_ref, count(*)::int AS n, count(*) FILTER (WHERE metadata ? 'phase8_5_quarantine')::int AS q
    FROM public.codebase_chunk_index WHERE summary IS NOT NULL AND btrim(summary) <> '' AND summary_model IS NULL GROUP BY source_ref`)).rows.map((r) => [r.source_ref, r]));
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }

const need = (r) => {
  if (r.lineageState === 'REVISION_QUALIFIED') return r.summary.present ? 'SUMMARY_PRESENT_PENDING_ADMISSION' : 'REGEN_SUMMARY_AND_EMBEDDING';
  if (r.lineageState === 'REVISION_HASH_CONFLICT') return 'BLOCKED_DIGEST_REFRESH_FIRST';
  if (r.lineageState === 'REVISION_MISSING') return 'BLOCKED_REVISION_STAMP_FIRST';
  if (r.lineageState === 'LEGACY_ONLY' || r.lineageState === 'IDENTITY_UNRESOLVED') return 'BLOCKED_PACKET_CREATION_FIRST';
  return 'BLOCKED_UNKNOWN';
};
const OVERSIZE_TOKENS = 40000; // leaves room inside the 65,536 window minus 8,192 reserved output and prompt scaffolding
const out = []; const tally = {}; const bump = (k) => { tally[k] = (tally[k] ?? 0) + 1; };
let diskChecked = 0; let diskMismatch = 0; let diskMissing = 0;
for (const r of recs) {
  const n = need(r); bump(n);
  if (n !== 'REGEN_SUMMARY_AND_EMBEDDING' && n !== 'SUMMARY_PRESENT_PENDING_ADMISSION') { continue; }
  const m = mem.get(r.sourceRef);
  let inputBytes = 'UNVERIFIED';
  const p = path.join(REPO_ROOT, r.sourceRef);
  if (n === 'REGEN_SUMMARY_AND_EMBEDDING') {
    if (!fs.existsSync(p)) { inputBytes = 'FILE_MISSING'; diskMissing += 1; }
    else { diskChecked += 1; const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); if (m && h === m.chash) inputBytes = 'EXACT_ADMITTED_BYTES'; else { inputBytes = 'DISK_HASH_MISMATCH'; diskMismatch += 1; } }
  }
  const legacyRef = r.sourceRef.replace(/^sveltekit-frontend\//, '');
  const h = hints.get(legacyRef);
  const estTokens = m ? Math.ceil(Number(m.bytes) / 3.5) : null;
  out.push({
    packetKey: r.packetKey, sourceRef: r.sourceRef, sourceRevision: r.sourceRevision, workspaceRevision: r.workspaceRevision,
    need: n, inputBytesStatus: inputBytes, byteLength: m ? Number(m.bytes) : null, estTokens,
    promptStrategy: estTokens === null ? 'UNKNOWN' : estTokens > OVERSIZE_TOKENS ? 'CHUNKED_DAG_REQUIRED' : 'SINGLE_PROMPT',
    fileKind: r.fileKind, astEligibility: r.astEligibility, astState: r.astState, domainClass: r.domainClass, pagerank: r.pagerank,
    legacyChunkSummaryHint: h ? { authoritative: false, chunkSummaries: h.n, quarantinedRegenerate: h.q, note: 'modelless, unrevisioned, sveltekit-frontend-relative ref; context only' } : null,
  });
}
// deterministic order: pagerank desc (kanban utility proxy), then sourceRef
out.sort((a, b) => (b.pagerank ?? -1) - (a.pagerank ?? -1) || (a.sourceRef < b.sourceRef ? -1 : 1));
out.forEach((o, i) => { o.cohortOrdinal = i; });

const outDir = path.join(REPO_ROOT, '.tmp/atlas/current-summary-regen-cohort-v1'); fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const body = out.map((o) => JSON.stringify(o)).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, `cohort-${stamp}.ndjson`), body, { flag: 'wx' });
const cohortSha = crypto.createHash('sha256').update(body).digest('hex');

const regen = out.filter((o) => o.need === 'REGEN_SUMMARY_AND_EMBEDDING');
const by = (arr, f) => arr.reduce((a, o) => { const k = f(o); a[k] = (a[k] ?? 0) + 1; return a; }, {});
const receipt = {
  schema: 'atlas.current-summary-regen-cohort.v1', gate: 'CURRENT_SUMMARY_REGEN_FREEZE', mode: 'READ_ONLY', writesPerformed: false, generated: false,
  sourceShards: { dir: path.relative(REPO_ROOT, path.join(shardRoot, dir)), rootSha256: manifestIn.rootSha256 }, workspaceRevision: manifestIn.workspaceRevision, executionId: EXEC,
  identities: recs.length, classification: tally,
  frozen: { file: `.tmp/atlas/current-summary-regen-cohort-v1/cohort-${stamp}.ndjson`, rows: out.length, sha256: cohortSha, order: 'pagerank desc then sourceRef (utility proxy; final priority belongs to the board scoring)' },
  regenCohort: {
    rows: regen.length, inputBytesStatus: by(regen, (o) => o.inputBytesStatus), promptStrategy: by(regen, (o) => o.promptStrategy),
    byFileKind: Object.fromEntries(Object.entries(by(regen, (o) => o.fileKind)).sort((a, b) => b[1] - a[1]).slice(0, 12)),
    astEligibility: by(regen, (o) => o.astEligibility), withLegacyChunkHint: regen.filter((o) => o.legacyChunkSummaryHint).length,
    withQuarantinedHint: regen.filter((o) => o.legacyChunkSummaryHint?.quarantinedRegenerate > 0).length,
    totalEstTokens: regen.reduce((s, o) => s + (o.estTokens ?? 0), 0), largestEstTokens: Math.max(...regen.map((o) => o.estTokens ?? 0)),
    diskVerified: { checked: diskChecked, mismatch: diskMismatch, missing: diskMissing },
  },
  rules: ['input for generation = exact admitted source bytes (disk hash equals membership hash); legacy chunk summaries are hints only', 'no summary text is admitted without CEI-05 claim eligibility + revision binding', 'CHUNKED_DAG_REQUIRED rows must go through the DAG prefill path, not a single prompt', 'blocked classes need stamping/refresh/packet-creation before entering the cohort'],
  consumers: ['CEI-05 summary admission', 'CEI-06 semantic_768 regeneration', 'board task candidates (one per cohort row)'],
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/current-summary-regen-cohort-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
