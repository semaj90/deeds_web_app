#!/usr/bin/env node
/**
 * service-capability-rank-v1 -- rank the five local helper services, run bounded
 * read-only functional checks, and persist the result to service_capabilities.
 *
 * Layering: probe-parent-atlas-services.mjs stays the broad prober (no DB writes).
 * This hook is the persistence + functional-check layer for :8090 :8097 :8095 :8791 :8100.
 * /api/health only UPDATEs rows by service_name and never inserts, so rows must exist.
 *
 * Modes (default is dry-run, which writes nothing):
 *   (none)       plan + checks + pre-image, no DB writes
 *   --rehearse   run the upsert in a transaction, run post-checks, ALWAYS ROLLBACK
 *   --apply      upsert in one transaction; COMMIT only if post-checks pass, else ROLLBACK.
 *                Requires env SERVICE_CAPABILITY_APPLY_AUTHORIZED=1 (operator go-ahead).
 *                A failed post-commit readback restores the pre-image automatically.
 *   --refresh    schedule-safe: UPDATE only last_health_* and metadata on rows this hook already seeded
 *                (metadata.source = marker). Never inserts, never touches tier/is_required. If any of the
 *                five rows is missing it ROLLS BACK and exits 1 ("run --apply first"). No authorization
 *                variable needed: it writes the same columns /api/health writes for its own services.
 * On conflict only health fields and metadata change; tier and is_required are never overwritten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const MARKER = 'service-capability-rank-v1';
const TIER_ORDER = { core: 0, data: 1, inference: 2, future: 3 };
const args = new Set(process.argv.slice(2));
const MODE = args.has('--apply') ? 'apply' : args.has('--refresh') ? 'refresh' : args.has('--rehearse') ? 'rehearse' : 'dry-run';
const T = Number(process.env.SERVICE_CAPABILITY_TIMEOUT_MS || 5000);
// Test-only switch for proving the failure branches: 'postcheck' | 'readback'. Ignored in dry-run.
const FAULT = MODE === 'dry-run' ? '' : String(process.env.SERVICE_CAPABILITY_FAULT || '');
const STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
// Exclusive-create, unique per run: failed runs stay as history (repo receipt rule).
const RECEIPT = path.join(REPO_ROOT, '.tmp', 'atlas', `service-capability-rank-v1.${MODE}.${STAMP}.${randomUUID()}.receipt.json`);

const base = (p) => `http://127.0.0.1:${p}`;
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

// tier and is_required follow validate-graphify-startup.mjs (critical: llama-server, retrieval, TurboVec).
// smokes are ordered cheapest first; only scripts that exist on disk are kept.
const SERVICES = [
  { name: 'go-retrieval', tier: 'core', port: 8100, healthPath: '/health', required: true, check: checkRetrieval,
    smokes: ['scripts/atlas/go-retrieval-smoke.mjs'] },
  { name: 'turbovec', tier: 'data', port: 8791, healthPath: '/health', required: true, check: checkTurboVec,
    smokes: ['scripts/atlas/turbovec-sidecar-health.mjs', 'scripts/atlas/turbovec-sidecar-smoke.mjs', 'scripts/atlas/probe-mcp-and-turbovec.mjs'] },
  { name: 'llama-server', tier: 'inference', port: 8090, healthPath: '/health', required: true, check: checkLlama,
    smokes: ['scripts/atlas/validate-model-endpoints.mjs', 'scripts/probe-models.mjs', 'scripts/tests/smoke-opencode-tool-call.mjs', 'scripts/atlas/smoke-ornith-summary-leak-v1.mjs'] },
  { name: 'go-embedding', tier: 'inference', port: 8097, healthPath: '/health', required: false, check: checkEmbedding,
    smokes: ['scripts/validate-graphify-startup.mjs'] },
  { name: 'nlp-sidecar', tier: 'inference', port: 8095, healthPath: '/health', required: false, check: checkNlp,
    smokes: ['scripts/atlas/run-nlp-analysis-smoke-v1.mjs'] },
];

async function getJson(url, init = {}, timeoutMs = T) {
  const t0 = Date.now();
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body, ms: Date.now() - t0 };
}
const post = (url, payload, timeoutMs = T) => getJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, timeoutMs);
export async function retryOnceOnTransportFailure(operation) {
  try { return await operation(); } catch {
    return await operation();
  }
}
const pass = (note, extra = {}) => ({ status: 'PASS', note, ...extra });
const fail = (note, extra = {}) => ({ status: 'FAIL', note, ...extra });
const skip = (note) => ({ status: 'NOT_EXERCISED', note });

async function checkEmbedding() {
  const a = await post(`${base(8097)}/embed`, { texts: ['service capability smoke'] });
  const v = a.body?.embeddings?.[0];
  if (!a.ok || !Array.isArray(v)) return fail(`embed HTTP ${a.status}`);
  if (v.length !== 768 || !v.every(Number.isFinite)) return fail(`dims=${v.length} or non-finite`);
  const b = await post(`${base(8097)}/embed`, { texts: ['service capability smoke'] });
  const w = b.body?.embeddings?.[0] ?? [];
  const maxDiff = v.reduce((m, x, i) => Math.max(m, Math.abs(x - (w[i] ?? NaN))), 0);
  if (!(maxDiff < 1e-4)) return fail(`non-deterministic maxDiff=${maxDiff}`);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return pass(`768-d, deterministic (maxDiff ${maxDiff.toExponential(1)}), L2=${norm.toFixed(4)} (informational)`, { vector: v });
}

async function checkTurboVec(ctx) {
  const h = await getJson(`${base(8791)}/health`);
  const b = h.body ?? {};
  if (!h.ok || b.ok !== true || b.dim !== 128 || !(b.indexed > 0)) return fail(`health ok=${b.ok} dim=${b.dim} indexed=${b.indexed}`);
  const emb = ctx.embedding;
  if (!emb) return skip(`health only (indexed=${b.indexed}); no 768-d vector available for a search`);
  const head = emb.slice(0, 128);
  const n = Math.sqrt(head.reduce((s, x) => s + x * x, 0)) || 1;
  const s = await post(`${base(8791)}/search`, { vector: head.map((x) => x / n), limit: 5 });
  if (!s.ok || !Array.isArray(s.body?.ids) || s.body.ids.length === 0) return fail(`search HTTP ${s.status} ids=${s.body?.ids?.length}`);
  return pass(`indexed=${b.indexed}, dim=128, search returned ${s.body.ids.length} ids`);
}

async function checkLlama() {
  const slots = await getJson(`${base(8090)}/slots`).catch(() => null);
  if (slots?.body?.some?.((x) => x.is_processing)) return skip('slot busy; not interrupting inference');
  const models = await getJson(`${base(8090)}/v1/models`);
  const id = models.body?.data?.[0]?.id;
  if (!id) return fail('no model id from /v1/models');
  const res = await fetch(`${base(8090)}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: id, stream: true, max_tokens: 24, messages: [{ role: 'user', content: 'Reply with the word OK.' }] }),
    signal: AbortSignal.timeout(Math.max(T, 60000)),
  });
  const text = await res.text();
  const chunks = text.split('\n').filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'));
  if (!res.ok || chunks.length === 0 || !text.includes('[DONE]')) return fail(`stream HTTP ${res.status} chunks=${chunks.length}`);
  return pass(`model=${id}, streamed ${chunks.length} chunks to [DONE]`);
}

async function checkNlp() {
  const h = await getJson(`${base(8095)}/health`);
  const c = h.body?.capabilities ?? {};
  if (!h.ok || h.body?.status !== 'ok') return fail(`health status=${h.body?.status}`);
  if (!c.tree_sitter || !c.ast_grep) return fail(`tree_sitter=${c.tree_sitter} ast_grep=${c.ast_grep}`);
  const source = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';
  const r = await post(`${base(8095)}/ast/chunk`, { source, language: 'typescript', filePath: 'smoke.ts', sourceRevision: 'service-capability-smoke' });
  const b = r.body ?? {};
  if (!r.ok) return fail(`/ast/chunk HTTP ${r.status}`);
  if (b.schema !== 'atlas.ast.evidence.v1' || b.scan_completeness !== 'COMPLETE' || b.syntax_status !== 'CLEAN') return fail(`schema=${b.schema} scan=${b.scan_completeness} syntax=${b.syntax_status}`);
  if (!Array.isArray(b.chunks) || b.chunks.length < 1) return fail('no chunks returned');
  return pass(`/ast/chunk COMPLETE+CLEAN, ${b.chunks.length} chunks, ${b.edges?.length ?? 0} edges, engine ${b.engine} ${b.engine_version}`);
}

async function checkRetrieval() {
  const h = await getJson(`${base(8100)}/health`);
  const d = h.body?.dependencies ?? {};
  const bad = Object.entries(d).filter(([, v]) => v?.required && !v?.connected).map(([k]) => k);
  if (!h.ok || bad.length) return fail(`HTTP ${h.status}, required deps down: ${bad.join(',') || 'n/a'}`);
  // Cold FTS can take 2-3 s (warm ~30 ms): allow 20 s and retry once on a timeout/network error.
  const searchBody = { query: 'import export function', limit: 3 };
  const s = await retryOnceOnTransportFailure(() => post(`${base(8100)}/search/bm25`, searchBody, 20000));
  const b = s.body ?? {};
  if (!s.ok || b.error || b.read_only !== true || !Array.isArray(b.results)) return fail(`search HTTP ${s.status} error=${b.error ?? 'none'} read_only=${b.read_only}`);
  if (b.results.length < 1) return fail('search returned 0 results for a common query');
  // identity_status is informational here: FTS rows are REVIEW_REQUIRED until revisions are complete.
  return pass(`/search/bm25 ${b.results.length} results in ${b.total_ms}ms (lane ${b.lane}, identity ${b.identity_status}/${b.identity_reason})`);
}

function rank(rows) {
  return [...rows].sort((a, b) => Number(b.required) - Number(a.required) || TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.port - b.port)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

async function main() {
  const ctx = {};
  const results = [];
  // embedding first: TurboVec's search check reuses its vector
  const ordered = [...SERVICES].sort((a, b) => (a.name === 'go-embedding' ? -1 : b.name === 'go-embedding' ? 1 : 0));
  for (const svc of ordered) {
    const t0 = Date.now();
    let health, functional;
    try { const h = await getJson(base(svc.port) + svc.healthPath); health = { ok: h.ok, ms: h.ms }; }
    catch (e) { health = { ok: false, ms: Date.now() - t0, error: String(e.message ?? e) }; }
    try { functional = health.ok ? await svc.check(ctx) : fail('health unreachable'); }
    catch (e) { functional = fail(String(e.message ?? e)); }
    if (svc.name === 'go-embedding' && functional.vector) { ctx.embedding = functional.vector; delete functional.vector; }
    results.push({ ...svc, health, functional, smokes: svc.smokes.filter(exists) });
  }
  const ranked = rank(results);
  console.log(`mode=${MODE}`);
  for (const r of ranked) console.log(`#${r.rank} ${r.name.padEnd(13)} :${r.port} tier=${r.tier} required=${r.required} health=${r.health.ok} (${r.health.ms}ms) functional=${r.functional.status} - ${r.functional.note}\n     smokes: ${r.smokes.join(' | ') || '(none found)'}`);

  const receipt = { schema: `${MARKER}.receipt.v1`, mode: MODE, at: new Date().toISOString(), writesCommitted: false, services: ranked.map(({ check, ...r }) => r) };
  const requiredFail = ranked.some((r) => r.required && (!r.health.ok || r.functional.status === 'FAIL'));

  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2, connectionTimeoutMillis: T }); // 2: the open transaction client holds one; readback/restore use the pool
  const names = ranked.map((r) => r.name);
  try {
    const sel = () => pool.query('select service_name, tier, port, is_required, last_health_status, last_latency_ms, metadata from service_capabilities where service_name = any($1) order by service_name', [names]);
    const pre = (await sel()).rows;
    receipt.preImage = pre;
    console.log(`pre-image rows: ${pre.length}/${names.length}`);

    if (MODE === 'dry-run') { finish(receipt, requiredFail); return; }
    if (MODE === 'refresh') {
      const c = await pool.connect();
      try {
        await c.query('begin');
        let updated = 0;
        for (const r of ranked) {
          const meta = { source: MARKER, rank: r.rank, functional: { status: r.functional.status, note: r.functional.note }, smokes: r.smokes, probedAt: receipt.at };
          const res = await c.query(
            `update service_capabilities set last_health_check=now(), last_health_status=$2, last_latency_ms=$3, metadata=$4::jsonb
             where service_name=$1 and metadata->>'source'=$5`,
            [r.name, r.health.ok, r.health.ms, JSON.stringify(meta), MARKER]);
          updated += res.rowCount;
        }
        if (updated !== names.length) {
          await c.query('rollback');
          console.error(`refresh: only ${updated}/${names.length} rows exist for this hook; ROLLED BACK. Run --apply first.`);
          process.exitCode = 1;
        } else {
          await c.query('commit');
          receipt.writesCommitted = true;
          console.log(`refresh: updated ${updated}/${names.length} rows`);
        }
      } catch (e) {
        await c.query('rollback').catch(() => {});
        console.error('refresh FAILED:', e.message ?? e); process.exitCode = 1;
      } finally { c.release(); }
      finish(receipt, requiredFail); return;
    }
    if (MODE === 'apply' && process.env.SERVICE_CAPABILITY_APPLY_AUTHORIZED !== '1') {
      console.error('REFUSED: --apply needs SERVICE_CAPABILITY_APPLY_AUTHORIZED=1 (operator go-ahead).');
      process.exitCode = 2; return;
    }
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('begin');
      for (const r of ranked) {
        const meta = { source: MARKER, rank: r.rank, functional: { status: r.functional.status, note: r.functional.note }, smokes: r.smokes, probedAt: receipt.at };
        await client.query(
          `insert into service_capabilities (service_name, tier, port, health_endpoint, is_required, last_health_check, last_health_status, last_latency_ms, metadata)
           values ($1,$2::service_tier,$3,$4,$5,now(),$6,$7,$8::jsonb)
           on conflict (service_name) do update set port=excluded.port, health_endpoint=excluded.health_endpoint,
             last_health_check=excluded.last_health_check, last_health_status=excluded.last_health_status,
             last_latency_ms=excluded.last_latency_ms, metadata=excluded.metadata`,
          [r.name, r.tier, r.port, r.healthPath, r.required, r.health.ok, r.health.ms, JSON.stringify(meta)]);
      }
      const post = (await client.query('select service_name, port, last_health_status, metadata->>\'source\' as src from service_capabilities where service_name = any($1)', [names])).rows;
      const problems = [];
      if (post.length !== names.length) problems.push(`rows ${post.length}/${names.length}`);
      for (const r of ranked) {
        const row = post.find((p) => p.service_name === r.name);
        if (!row || row.port !== r.port || row.src !== MARKER || typeof row.last_health_status !== 'boolean') problems.push(`bad row ${r.name}`);
      }
      if (FAULT === 'postcheck') problems.push('FAULT_INJECTED_POSTCHECK');
      receipt.postChecks = { problems };
      if (MODE === 'rehearse' || problems.length) {
        await client.query('rollback');
        console.log(MODE === 'rehearse' ? 'rehearse: post-checks ' + (problems.length ? 'FAILED ' + problems.join('; ') : 'passed') + '; ROLLED BACK' : `apply: post-checks failed (${problems.join('; ')}); ROLLED BACK`);
        if (problems.length) process.exitCode = 1;
      } else {
        await client.query('commit'); committed = true;
        receipt.writesCommitted = true;
        const back = (await sel()).rows;
        if (FAULT === 'readback' || back.length !== names.length || back.some((b) => b.metadata?.source !== MARKER)) throw new Error('post-commit readback mismatch' + (FAULT === 'readback' ? ' (FAULT_INJECTED_READBACK)' : ''));
        console.log(`apply: committed and read back ${back.length}/${names.length} rows`);
      }
    } catch (e) {
      if (!committed) await client.query('rollback').catch(() => {});
      else { // auto-restore the pre-image after a failed readback
        try {
          const had = new Set(pre.map((p) => p.service_name));
          await pool.query('delete from service_capabilities where service_name = any($1) and metadata->>\'source\' = $2', [names.filter((n) => !had.has(n)), MARKER]);
          for (const p of pre) await pool.query('update service_capabilities set last_health_status=$2, last_latency_ms=$3, metadata=$4::jsonb where service_name=$1', [p.service_name, p.last_health_status, p.last_latency_ms, JSON.stringify(p.metadata)]);
          receipt.writesCommitted = false; receipt.autoRestored = true;
        } catch (restoreErr) {
          receipt.restoreFailed = String(restoreErr.message ?? restoreErr);
          console.error('RESTORE FAILED - table may contain committed rows; inspect service_capabilities:', receipt.restoreFailed);
        }
      }
      console.error('FAILED:', e.message ?? e); process.exitCode = 1;
    } finally { client.release(); }
    // after rehearse/rollback the table must equal the pre-image
    const after = (await sel()).rows.length;
    receipt.rowsAfter = after;
    if (MODE === 'rehearse' && after !== pre.length) { console.error(`rehearse left rows behind: ${after} vs ${pre.length}`); process.exitCode = 1; }
  } finally { await pool.end().catch(() => {}); }
  finish(receipt, requiredFail);
}

function finish(receipt, requiredFail) {
  fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(`receipt: ${path.relative(REPO_ROOT, RECEIPT)}`);
  if (requiredFail && !process.exitCode) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
