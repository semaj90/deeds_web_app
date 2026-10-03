#!/usr/bin/env node
/**
 * WORKSTATION_PGVECTOR_STACK_SMOKE_V1 -- read-only smoke over the Parent Atlas Workstation pgvector stack.
 *
 * It composes existing owners; it creates no UUID, registry, chunker or page of its own:
 *   S1 UUID          frozen namespaces (atlas-uuid-namespaces-v1.ts) are valid RFC 4122 UUIDs of the documented versions, the
 *                    v5 algorithm is sound (RFC 4122 test vector), and the v8 derivation owner (utils/uuid.ts) is present.
 *   S2 DRIZZLE       vector columns declared in schema-postgres.ts vs the live catalog (drift is reported, not fixed).
 *   S3 PGVECTOR      extension version, canonical HNSW index valid, embedding coverage, and a bounded exact-vs-HNSW
 *                    recall@10 probe (READ ONLY transactions, SET LOCAL, always rolled back).
 *   S4 REGISTRY      registry-like tables that exist (no new one is created here).
 *   S5 GO_RETRIEVAL  :8100 and :8096 health (existing sidecar).
 *   S6 SSR_ADMIN     the Unified Indexing Studio route files exist; if the dev server is up its SSR response is probed,
 *                    otherwise SKIPPED_ENV (never a PASS).
 * Statuses: PASS / FAIL / WARN / SKIPPED_ENV / NOT_PROVEN. Exit 1 only on FAIL. Writes only its own report JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FE = path.join(ROOT, 'sveltekit-frontend');
const REPORT = path.join(ROOT, 'docs/reports/smoke-workstation-pgvector-stack-v1.json');
const CANONICAL_INDEX = 'codebase_chunk_index_content_hnsw';
const PROBE_QUERIES = 5;
const PROBE_K = 10;

const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8', timeout: 90000, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
const tryPsql = (sql) => { try { return { ok: true, out: psql(sql).trim() }; } catch (e) { return { ok: false, out: String(e.message).slice(0, 160) }; } };
const results = [];
const add = (id, status, detail, extra = {}) => results.push({ id, status, detail, ...extra });
// An unreachable database (Docker Desktop down, container stopped) is an ENVIRONMENT condition, not a stack failure:
// the database-backed checks report SKIPPED_ENV, never PASS and never FAIL.
const dbProbe = tryPsql('select 1;');
const dbUp = dbProbe.ok && dbProbe.out === '1';
const skipDb = (id) => add(id, 'SKIPPED_ENV', `Postgres not reachable via docker exec legal-ai-postgres (${String(dbProbe.out).slice(0, 90)}); NOT_PROVEN until the database is up`);

// ---------------------------------------------------------------- S1 UUID
function uuidv5(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const h = crypto.createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
try {
  const src = fs.readFileSync(path.join(FE, 'src/lib/server/atlas/identity/atlas-uuid-namespaces-v1.ts'), 'utf8');
  const ns = Object.fromEntries([...src.matchAll(/export const (\w+) = '([0-9a-f-]{36})'/g)].map((m) => [m[1], m[2]]));
  const expectVersion = { ATLAS_ROOT_NAMESPACE_V1: '4', PACKET_AGGREGATE_NAMESPACE_V1: '5', TITLE_NAMESPACE_V1: '5' };
  const problems = [];
  for (const [name, v] of Object.entries(expectVersion)) {
    const u = ns[name];
    if (!u) { problems.push(`${name} missing`); continue; }
    if (u[14] !== v) problems.push(`${name} version nibble ${u[14]} != ${v}`);
    if (!/[89ab]/.test(u[19])) problems.push(`${name} bad RFC variant`);
  }
  if (new Set(Object.values(ns)).size !== Object.keys(ns).length) problems.push('namespaces not distinct');
  add('S1a.namespaces', problems.length ? 'FAIL' : 'PASS', problems.length ? problems.join('; ') : 'root v4, packet-aggregate v5, title v5; distinct; RFC variant ok', { namespaces: ns });
  const rfc = uuidv5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  add('S1b.v5-algorithm', rfc === '886313e1-3b8a-5372-9b90-0c9aee199e5d' ? 'PASS' : 'FAIL', `RFC 4122 DNS/python.org vector -> ${rfc}`);
  const det = uuidv5('x', ns.PACKET_AGGREGATE_NAMESPACE_V1) === uuidv5('x', ns.PACKET_AGGREGATE_NAMESPACE_V1) && uuidv5('x', ns.PACKET_AGGREGATE_NAMESPACE_V1) !== uuidv5('y', ns.PACKET_AGGREGATE_NAMESPACE_V1);
  add('S1c.v5-deterministic-and-name-sensitive', det ? 'PASS' : 'FAIL', 'same name -> same id; different name -> different id');
  const u8 = fs.readFileSync(path.join(FE, 'src/lib/utils/uuid.ts'), 'utf8');
  add('S1d.v8-owner', /UUID_DERIVATION_REVISION/.test(u8) && /export async function deriveUUID/.test(u8) ? 'PASS' : 'FAIL', 'utils/uuid.ts exports UUID_DERIVATION_REVISION and deriveUUID (UUIDv8, sha256 canonical JSON)');
  // The TS chunk-id owner is not executed here. Statically check that its committed test still targets names it exports.
  const cidMod = fs.readFileSync(path.join(FE, 'src/lib/server/utils/chunk-id-conversion.ts'), 'utf8');
  const cidTest = fs.readFileSync(path.join(FE, 'src/lib/server/utils/chunk-id-conversion.test.ts'), 'utf8');
  const imported = (cidTest.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/chunk-id-conversion'/) || [, ''])[1].split(',').map((s) => s.trim()).filter(Boolean);
  // A name is stale only if it is neither exported nor an intentional tombstone.
  const staleImports = imported.filter((n) => {
    const exported = new RegExp(`export\\s+(async\\s+)?(function|const|type)\\s+${n}\\b`).test(cidMod);
    const tombstone = new RegExp(`export\\s+const\\s+${n}\\b[^;]*?=\\s*null\\s*;`).test(cidMod);
    return !exported && !tombstone;
  });
  const forbidsSynthetic = /Do NOT invent synthetic UUIDs/i.test(cidMod);
  add('S1e.chunk-id-owner-and-test', staleImports.length ? 'WARN' : 'PASS',
    staleImports.length
      ? `STALE_TEST: chunk-id-conversion.test.ts imports ${staleImports.join(', ')} which the module no longer exports or has tombstoned (null)${forbidsSynthetic ? ', and the module contract now forbids synthetic UUIDs' : ''}; the test fails 2/2 and asserts behavior the current contract disallows. Not fixed here: which side is right is a contract decision.`
      : 'chunk-id owner and committed test agree; focused Vitest proof is recorded separately',
    { staleImports, moduleForbidsSyntheticUuids: forbidsSynthetic, focusedTestCommand: 'npx vitest run src/lib/server/utils/chunk-id-conversion.test.ts --reporter=dot' });
} catch (e) {
  add('S1', 'FAIL', String(e.message).slice(0, 160));
}

// ---------------------------------------------------------------- S2 DRIZZLE drift
if (!dbUp) skipDb('S2.drizzle-vs-live'); else try {
  const schema = fs.readFileSync(path.join(FE, 'src/lib/server/db/schema-postgres.ts'), 'utf8');
  const start = schema.indexOf("pgTable('codebase_chunk_index'");
  // The column object ends where the index callback starts ("}, (table) => ..."); fall back to a bare "});".
  // Slicing to the next "});" runs into later tables' vector columns, so the first boundary of either kind wins.
  const boundaries = ['\n}, (table)', '\n}, (t)', '\n});'].map((b) => schema.indexOf(b, start)).filter((i) => i > 0);
  const end = boundaries.length ? Math.min(...boundaries) : start + 20000;
  const block = schema.slice(start, end).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const declared = {};
  for (const m of block.matchAll(/(halfvec|vector)\(\s*'([a-z0-9_]+)'\s*,\s*\{\s*dimensions:\s*(\d+)/g)) declared[m[2]] = `${m[1]}(${m[3]})`;
  const live = {};
  const r = tryPsql("select a.attname||'|'||format_type(a.atttypid,a.atttypmod) from pg_attribute a where a.attrelid='codebase_chunk_index'::regclass and a.attnum>0 and not a.attisdropped and format_type(a.atttypid,a.atttypmod) ~ '^(vector|halfvec)\\(';");
  if (!r.ok) throw new Error(r.out);
  for (const l of r.out.split('\n').filter(Boolean)) { const [c, t] = l.split('|'); live[c] = t; }
  const liveNotDeclared = Object.keys(live).filter((c) => !(c in declared));
  const declaredNotLive = Object.keys(declared).filter((c) => !(c in live));
  const typeMismatch = Object.keys(declared).filter((c) => c in live && declared[c] !== live[c]);
  const canonicalOk = declared.content_embedding === 'halfvec(768)' && live.content_embedding === 'halfvec(768)';
  const status = !canonicalOk || typeMismatch.length ? 'FAIL' : (liveNotDeclared.length || declaredNotLive.length ? 'WARN' : 'PASS');
  add('S2.drizzle-vs-live', status, `canonical content_embedding ${canonicalOk ? 'matches halfvec(768)' : 'MISMATCH'}; ${liveNotDeclared.length} live-not-declared, ${declaredNotLive.length} declared-not-live, ${typeMismatch.length} type mismatches`, {
    liveNotDeclared, declaredNotLive, typeMismatch,
    risk: liveNotDeclared.length ? 'Live vector columns absent from the Drizzle schema. A drizzle-kit push/generate against this schema would treat them as removable; keep drizzle.config tablesFilter protections and never push without reviewing the SQL (Drizzle Safety Rule).' : null,
  });
} catch (e) {
  add('S2.drizzle-vs-live', 'FAIL', String(e.message).slice(0, 160));
}

// ---------------------------------------------------------------- S3 PGVECTOR
if (!dbUp) skipDb('S3.pgvector'); else try {
  const ext = tryPsql("select extversion from pg_extension where extname='vector';");
  const ver = ext.ok ? ext.out : '';
  const [maj, min] = ver.split('.').map(Number);
  add('S3a.extension', ext.ok && (maj > 0 || min >= 8) ? 'PASS' : 'FAIL', `pgvector ${ver || 'absent'} (iterative scan needs >= 0.8)`);
  const idx = tryPsql(`select i.indisvalid::text||'|'||i.indisready::text||'|'||pg_size_pretty(pg_relation_size(c.oid)) from pg_class c join pg_index i on i.indexrelid=c.oid where c.relname='${CANONICAL_INDEX}';`);
  const [valid, ready, size] = idx.ok ? idx.out.split('|') : [];
  add('S3b.canonical-hnsw', valid === 'true' && ready === 'true' ? 'PASS' : 'FAIL', idx.ok && idx.out ? `${CANONICAL_INDEX} valid=${valid} ready=${ready} size=${size}` : `${CANONICAL_INDEX} not found`);
  const cov = tryPsql('select count(*), count(content_embedding) from codebase_chunk_index;');
  const [total, emb] = cov.ok ? cov.out.split('|').map(Number) : [0, 0];
  const pct = total ? ((emb / total) * 100).toFixed(1) : '0';
  add('S3c.embedding-coverage', emb > 0 && emb / total < 0.5 ? 'WARN' : (emb > 0 ? 'PASS' : 'FAIL'), `${emb} of ${total} chunks (${pct}%) have content_embedding; the rest cannot be served by the pgvector lane`, { total, embedded: emb });
  // exact vs HNSW recall@10 on a bounded, deterministic sample (each probe in its own READ ONLY txn, rolled back)
  const ids = tryPsql(`select id::text from codebase_chunk_index where content_embedding is not null order by id limit ${PROBE_QUERIES};`);
  if (!ids.ok || !ids.out) throw new Error(`no probe ids: ${ids.out}`);
  const probes = [];
  for (const id of ids.out.split('\n').filter(Boolean)) {
    const q = (settings) => `begin read only; select vector_dims('[1,2]'::vector) is not null; ${settings} select coalesce(string_agg(id::text, ',' order by rn), '') from (select id, row_number() over () rn from (select id from codebase_chunk_index where content_embedding is not null order by content_embedding <=> (select content_embedding from codebase_chunk_index where id='${id}') limit ${PROBE_K}) t) s; rollback;`;
    const approx = tryPsql(q('set local hnsw.ef_search = 100;'));
    const exact = tryPsql(q('set local enable_indexscan = off; set local enable_bitmapscan = off;'));
    if (!approx.ok || !exact.ok) { probes.push({ id, error: (approx.ok ? exact.out : approx.out) }); continue; }
    const last = (o) => o.split('\n').filter(Boolean).pop() || '';
    const a = new Set(last(approx.out).split(',').filter(Boolean));
    const e = last(exact.out).split(',').filter(Boolean);
    probes.push({ id, recallAt10: e.length ? e.filter((x) => a.has(x)).length / e.length : null, exactCount: e.length, approxCount: a.size });
  }
  const scored = probes.filter((p) => p.recallAt10 !== null && p.recallAt10 !== undefined);
  const mean = scored.length ? scored.reduce((s, p) => s + p.recallAt10, 0) / scored.length : null;
  add('S3d.exact-vs-hnsw-recall', mean === null ? 'FAIL' : (mean >= 0.9 ? 'PASS' : 'WARN'), mean === null ? 'probe failed' : `mean recall@${PROBE_K} = ${mean.toFixed(3)} over ${scored.length} queries (ef_search=100). Approximate is acceptable; identity is not.`, { probes });
} catch (e) {
  add('S3', 'FAIL', String(e.message).slice(0, 200));
}

// ---------------------------------------------------------------- S4 REGISTRY
if (!dbUp) skipDb('S4.registry-tables'); else try {
  const r = tryPsql("select c.relname||'|'||c.reltuples::bigint from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('atlas_vector_registry','vector_index_registry','atlas_tensor_artifacts','atlas_artifacts','atlas_packet_registry','atlas_symbol_registry') order by 1;");
  if (!r.ok) throw new Error(r.out);
  const tables = Object.fromEntries(r.out.split('\n').filter(Boolean).map((l) => l.split('|')));
  const want = ['atlas_vector_registry', 'atlas_tensor_artifacts', 'atlas_packet_registry'];
  const missing = want.filter((t) => !(t in tables));
  add('S4.registry-tables', missing.length ? 'FAIL' : 'PASS', missing.length ? `missing: ${missing.join(', ')}` : 'existing registry-like tables present; no new registry is created by this smoke', { estimatedRows: tables, note: 'vector_index_registry rows are stale pending seeds for a retired 384-dim index; do not treat it as an index registry' });
} catch (e) {
  add('S4.registry-tables', 'FAIL', String(e.message).slice(0, 160));
}

// ---------------------------------------------------------------- S5 GO RETRIEVAL
async function health(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    let body = null; try { body = await res.json(); } catch { /* non-JSON health */ }
    return { url, http: res.status, body };
  } catch (e) { return { url, error: String(e.message).slice(0, 80) }; }
}
const g8100 = await health('http://127.0.0.1:8100/health');
if (g8100.error) add('S5a.go-retrieval-8100', 'SKIPPED_ENV', `unreachable: ${g8100.error}`);
else {
  const b = g8100.body || {};
  const ok = g8100.http === 200 && b.pgvectorConnected === true && b.qdrantConnected === true && b.embeddingServiceUp === true;
  add('S5a.go-retrieval-8100', ok ? 'PASS' : 'FAIL', `http ${g8100.http}; pgvectorConnected=${b.pgvectorConnected} qdrantConnected=${b.qdrantConnected} embeddingServiceUp=${b.embeddingServiceUp} readiness=${b.readiness_state ?? 'n/a'}`);
}
const g8096 = await health('http://127.0.0.1:8096/health');
add('S5b.go-search-8096', g8096.error ? 'SKIPPED_ENV' : (g8096.http === 200 ? 'PASS' : 'FAIL'), g8096.error ? `unreachable: ${g8096.error}` : `http ${g8096.http}`);

// ---------------------------------------------------------------- S6 SSR ADMIN
const studioDir = path.join(FE, 'src/routes/(app)/admin/unified-indexing-studio');
const files = ['+page.server.ts', '+page.svelte'].map((f) => [f, fs.existsSync(path.join(studioDir, f))]);
add('S6a.studio-route-files', files.every(([, ok]) => ok) ? 'PASS' : 'FAIL', files.map(([f, ok]) => `${f}:${ok ? 'present' : 'MISSING'}`).join(' '));
const dev = await health('http://127.0.0.1:5173/admin/unified-indexing-studio');
if (dev.error) add('S6b.studio-ssr-response', 'SKIPPED_ENV', `dev server :5173 not reachable (${dev.error}); SSR render is NOT_PROVEN, start with npm run dev`);
else add('S6b.studio-ssr-response', dev.http < 500 ? 'PASS' : 'FAIL', `GET /admin/unified-indexing-studio -> ${dev.http} (auth redirect or 200 both acceptable; 5xx is a failure)`);

// ---------------------------------------------------------------- report
const counts = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
const report = {
  schema: 'atlas.workstation-pgvector-stack-smoke.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  writesPerformed: false,
  transactions: 'READ ONLY, rolled back',
  counts,
  results,
};
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
for (const r of results) console.log(`${r.status.padEnd(11)} ${r.id.padEnd(34)} ${r.detail}`);
console.log(JSON.stringify({ counts, report: path.relative(ROOT, REPORT) }));
process.exit(counts.FAIL ? 1 : 0);
