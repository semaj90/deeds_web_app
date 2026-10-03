#!/usr/bin/env node
/**
 * POSTGRES_INDEX_CAPABILITY_V1 — read-only, schema-driven audit (PG18-SCHEMA-01, PG18-INDEX-02, PG18-PLAN-03,
 * PG18-AIO-04, PG18-BITMAP-05 capability half, PGVECTOR-06 capability half).
 *
 * Three verdicts are kept SEPARATE on purpose:
 *   INDEX_CAPABILITY_PROVEN            an index of the required access method exists, is valid, and reports the property
 *                                      (pg_index_has_property 'index_scan' / 'bitmap_scan'), with the required leading column.
 *   PLANNER_SELECTED_BITMAP_FOR_FIXTURE the DEFAULT plan for a representative query used a bitmap path. Never a failure when it
 *                                      did not: on small/selective tables Index/Seq Scan can be the correct cheaper plan.
 *   BITMAP_PLAN_GENERATABLE            a probe with seq/index scans disabled (SET LOCAL, rolled back) proves a bitmap plan CAN form.
 *   AIO_EXECUTION: io_method + pg_aios are OBSERVED; zero pg_aios rows is NOT_OBSERVED, not FAILED (pg_aios shows only in-flight handles).
 * Only SELECT / EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) of bounded read queries and SET LOCAL inside a rolled-back
 * transaction are run. Writes ONLY docs/reports/postgres-index-capability-v1.json. pgvector HNSW is NOT folded into the bitmap layer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (sql, stdin = false) => execFileSync('docker', ['exec', ...(stdin ? ['-i'] : []), 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-qAt', '-F', '|', ...(stdin ? ['-f', '-'] : ['-c', sql])], { input: stdin ? sql : undefined, maxBuffer: 1 << 26, timeout: 120000 }).toString().trim();
const q = (sql) => { try { return run(sql); } catch (e) { return `ERR:${String(e.message).slice(0, 100)}`; } };
const rows = (sql) => q(sql).split('\n').filter((l) => l && !l.startsWith('ERR:')).map((l) => l.split('|'));
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

// Schema-driven contract: what each table must be able to do (lookup shapes the pipeline actually issues).
const CONTRACT = {
  atlas_symbol_registry: { required: ['stable_symbol_id', 'canonical_key', 'language', 'symbol_kind', 'canonical_name', 'canonical_qualified_name', 'status'], capabilities: [
    { name: 'canonical_key exact', column: 'canonical_key', am: 'btree' }, { name: 'canonical_name lookup', column: 'canonical_name', am: 'btree' }, { name: 'name fuzzy (trigram)', column: 'canonical_name', am: 'gin', opclass: 'gin_trgm_ops', optional: true }] },
  atlas_symbol_versions: { required: ['symbol_version_id', 'stable_symbol_id', 'source_ref', 'source_revision', 'workspace_revision', 'qualified_name', 'byte_start', 'byte_end'], capabilities: [
    { name: 'source_ref lookup', column: 'source_ref', am: 'btree' }, { name: 'source_revision filter', column: 'source_revision', am: 'btree' }, { name: 'stable_symbol_id join', column: 'stable_symbol_id', am: 'btree' }, { name: 'qualified_name lookup', column: 'qualified_name', am: 'btree' }] },
  atlas_ast_nodes: { required: ['tree_node_id', 'structural_key', 'relative_path', 'node_kind', 'qualified_symbol', 'source_content_hash', 'source_revision'], capabilities: [
    { name: 'relative_path lookup', column: 'relative_path', am: 'btree' }, { name: 'source_revision filter', column: 'source_revision', am: 'btree' }, { name: 'source_content_hash lookup', column: 'source_content_hash', am: 'btree' }, { name: 'node_kind filter', column: 'node_kind', am: 'btree' }, { name: 'ast_generation filter', column: 'ast_generation', am: 'btree', optional: true }] },
  atlas_packets: { required: ['packet_key', 'source_ref', 'domain_class'], capabilities: [{ name: 'packet_key exact', column: 'packet_key', am: 'btree' }, { name: 'source_ref lookup', column: 'source_ref', am: 'btree' }, { name: 'domain_class filter', column: 'domain_class', am: 'btree', optional: true }] },
  codebase_chunk_index: { required: ['content_embedding'], capabilities: [{ name: 'semantic_768 ANN', column: 'content_embedding', am: 'hnsw', vector: true }] },
};

const report = { schema: 'atlas.postgres-index-capability.v1', generatedAt: new Date().toISOString(), server: {}, tables: {}, fixtures: [], aio: {}, verdicts: {}, canonicalAuthority: false, writesPerformed: false };
report.server = { version: q('show server_version'), ioMethod: q('show io_method'), effectiveIoConcurrency: q('show effective_io_concurrency'), ioWorkers: q('show io_workers'), extensions: rows("select extname, extversion from pg_extension where extname in ('vector','pg_trgm','btree_gin')").map(([n, v]) => `${n} ${v}`) };
const pgMajor = Number(String(report.server.version).split('.')[0]);
const vectorVersion = (report.server.extensions.find((e) => e.startsWith('vector ')) ?? '').split(' ')[1] ?? null;

for (const [table, c] of Object.entries(CONTRACT)) {
  const exists = q(`select to_regclass('public.${table}') is not null`) === 't';
  const cols = exists ? rows(`select column_name from information_schema.columns where table_name=${lit(table)}`).map((r) => r[0]) : [];
  const idx = exists ? rows(`select c.relname, am.amname, i.indisvalid, i.indisready, (i.indpred is not null), coalesce((select a.attname from pg_attribute a where a.attrelid=i.indrelid and a.attnum=i.indkey[0]),''), coalesce((select o.opcname from pg_opclass o where o.oid=i.indclass[0]),''), pg_index_has_property(i.indexrelid,'index_scan'), pg_index_has_property(i.indexrelid,'bitmap_scan') from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam where i.indrelid=${lit(`public.${table}`)}::regclass`).map(([name, am, valid, ready, partial, lead, opclass, scan, bitmap]) => ({ name, am, valid: valid === 't', ready: ready === 't', partial: partial === 't', leadingColumn: lead, opclass, indexScan: scan === 't', bitmapScan: bitmap === 't' })) : [];
  const missingColumns = c.required.filter((x) => !cols.includes(x));
  const caps = c.capabilities.map((cap) => {
    if (!cols.includes(cap.column)) return { ...cap, status: cap.optional ? 'NOT_APPLICABLE_COLUMN_ABSENT' : 'MISSING_COLUMN' };
    const hit = idx.filter((i) => i.valid && i.ready && i.leadingColumn === cap.column && i.am === cap.am && (!cap.opclass || i.opclass === cap.opclass));
    if (!hit.length) return { ...cap, status: cap.optional ? 'OPTIONAL_ABSENT' : 'MISSING_INDEX' };
    const best = hit[0];
    return { ...cap, status: 'INDEX_CAPABILITY_PROVEN', index: best.name, partial: best.partial, indexScan: best.indexScan, bitmapScan: best.bitmapScan, note: cap.vector ? 'ANN index: no bitmap scans by design; kept separate from the B-tree/GIN bitmap layer' : undefined };
  });
  report.tables[table] = { exists, rows: exists ? Number(q(`select count(*) from ${table}`)) : null, missingColumns, indexes: idx.map((i) => `${i.name} [${i.am}${i.partial ? ',partial' : ''}] lead=${i.leadingColumn || 'expr'} bitmap=${i.bitmapScan}`), capabilities: caps };
}

// pgvector iterative scan (0.8+) is what keeps filtered HNSW from under-returning; capability only here, parity fixture NOT_RUN.
const [maj, min] = String(vectorVersion ?? '0.0').split('.').map(Number);
report.pgvector = { version: vectorVersion, iterativeScanSupported: maj > 0 || min >= 8, hnswIterativeScanSetting: q("select coalesce(current_setting('hnsw.iterative_scan', true), 'unset (vector extension not loaded in this session)')"), exactVsHnswParityFixture: 'NOT_RUN (PGVECTOR-06 needs a frozen filtered fixture and exact oracle)' };

// Representative fixtures: a real sampled value each, bounded. Default plan (planner choice) + forced-bitmap probe (capability).
const one = (sql) => (rows(sql)[0] ?? [])[0];
const sPath = one('select relative_path from atlas_ast_nodes where relative_path is not null limit 1');
const sSrc = rows('select source_ref, source_revision from atlas_symbol_versions where source_ref is not null limit 1')[0] ?? [];
const packetDomainSource = rows(`
  select domain_class, source_ref
  from atlas_packets
  where domain_class is not null and source_ref is not null
  group by domain_class, source_ref
  order by count(*) desc, domain_class, source_ref
  limit 1
`)[0] ?? [];
const FIX = [
  { id: 'ast_by_path_kind', tables: ['atlas_ast_nodes'], sql: `select tree_node_id from atlas_ast_nodes where relative_path = ${lit(sPath)} and node_kind = 'method' limit 200`, expects: ['relative_path', 'node_kind'] },
  { id: 'symbol_version_by_source', tables: ['atlas_symbol_versions'], sql: `select symbol_version_id from atlas_symbol_versions where source_ref = ${lit(sSrc[0])} and source_revision = ${lit(sSrc[1])} limit 200`, expects: ['source_ref', 'source_revision'] },
  { id: 'packets_domain_source', tables: ['atlas_packets'], sql: `select packet_key from atlas_packets where domain_class = 'database' and source_ref like 'src/lib/server/%' limit 200`, expects: ['domain_class', 'source_ref'] },
  ...(packetDomainSource.length === 2 ? [{
    id: 'packets_domain_source_exact',
    tables: ['atlas_packets'],
    sql: `select packet_key from atlas_packets where domain_class = ${lit(packetDomainSource[0])} and source_ref = ${lit(packetDomainSource[1])} limit 200`,
    expects: ['domain_class', 'source_ref'],
  }] : []),
];
const walk = (n, acc = []) => { if (!n) return acc; acc.push(n['Node Type']); (n.Plans ?? []).forEach((p) => walk(p, acc)); return acc; };
const explain = (sql, force) => {
  const body = `BEGIN;\n${force ? 'SET LOCAL enable_seqscan=off; SET LOCAL enable_indexscan=off; SET LOCAL enable_indexonlyscan=off;\n' : ''}EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ${sql};\nROLLBACK;\n`;
  try { const j = JSON.parse(run(body, true))[0]; const nodes = walk(j.Plan); return { nodes: [...new Set(nodes)], bitmapHeap: nodes.includes('Bitmap Heap Scan'), bitmapAnd: nodes.includes('BitmapAnd'), bitmapOr: nodes.includes('BitmapOr'), indexScan: nodes.some((n) => n.startsWith('Index')), seqScan: nodes.includes('Seq Scan'), sharedHit: j.Plan['Shared Hit Blocks'] ?? null, sharedRead: j.Plan['Shared Read Blocks'] ?? null, planRows: j.Plan['Plan Rows'], actualRows: j.Plan['Actual Rows'], executionMs: j['Execution Time'], settings: j.Settings ?? {} }; } catch (e) { return { error: String(e.message).slice(0, 160) }; }
};
for (const f of FIX) {
  const def = explain(f.sql, false), forced = explain(f.sql, true);
  report.fixtures.push({ id: f.id, tables: f.tables, expectedIndexedColumns: f.expects, defaultPlan: def, plannerSelectedBitmap: !!def.bitmapHeap, bitmapProbe: { ...forced, bitmapPlanGeneratable: !!forced.bitmapHeap }, verdict: def.error ? 'PLAN_ERROR' : (def.bitmapHeap ? 'PLANNER_SELECTED_BITMAP_FOR_FIXTURE' : `PLANNER_CHOSE_${def.indexScan ? 'INDEX_SCAN' : def.seqScan ? 'SEQ_SCAN' : 'OTHER'}_NOT_A_FAILURE`) });
}

// AIO: capability vs observation, kept apart.
const inFlight = Number(q('select count(*) from pg_aios'));
report.aio = { pgMajor, ioMethod: report.server.ioMethod, capability: pgMajor >= 18 && ['worker', 'io_uring'].includes(report.server.ioMethod) ? 'PG18_AIO_CAPABLE' : 'NOT_CAPABLE_OR_SYNC', pgAiosInFlightNow: inFlight, executionObservation: inFlight > 0 ? 'OBSERVED' : 'NOT_OBSERVED (zero in-flight handles is not a failure; needs a cold, I/O-heavy fixture)' };

const capList = Object.values(report.tables).flatMap((t) => t.capabilities);
report.verdicts = {
  'PG18-SCHEMA-01': Object.values(report.tables).every((t) => t.exists && !t.missingColumns.length) ? 'PROVEN' : 'GAPS',
  'PG18-INDEX-02': capList.some((c) => c.status === 'MISSING_INDEX' || c.status === 'MISSING_COLUMN') ? 'GAPS' : 'PROVEN',
  'PG18-PLAN-03': report.fixtures.every((f) => !f.defaultPlan.error) ? 'PROVEN (plans captured as JSON)' : 'PLAN_ERRORS',
  'PG18-AIO-04': `${report.aio.capability}; ${report.aio.executionObservation.split(' ')[0]}`,
  'PG18-BITMAP-05': report.fixtures.some((f) => f.bitmapProbe.bitmapPlanGeneratable) ? `BITMAP_PLAN_GENERATABLE (${report.fixtures.filter((f) => f.bitmapProbe.bitmapPlanGeneratable).length}/${report.fixtures.length} fixtures); planner-selected in ${report.fixtures.filter((f) => f.plannerSelectedBitmap).length}/${report.fixtures.length}; BitmapAnd combining shown: ${report.fixtures.some((f) => f.bitmapProbe.bitmapAnd)}` : 'NOT_GENERATABLE',
  'PGVECTOR-06': `capability only: HNSW ${capList.find((c) => c.vector)?.status}; iterative_scan supported ${report.pgvector.iterativeScanSupported}; parity NOT_RUN`,
};
const missing = Object.entries(report.tables).flatMap(([t, v]) => v.capabilities.filter((c) => /^MISSING/.test(c.status)).map((c) => `${t}.${c.column} (${c.name}: ${c.status})`));
report.gaps = missing;
fs.writeFileSync(path.join(ROOT, 'docs/reports/postgres-index-capability-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ server: { v: report.server.version, io: report.server.ioMethod, eic: report.server.effectiveIoConcurrency }, verdicts: report.verdicts, gaps: missing, fixtures: report.fixtures.map((f) => `${f.id}: ${f.verdict} | default=[${f.defaultPlan.nodes}] | bitmapProbe=[${f.bitmapProbe.nodes}] ${f.defaultPlan.executionMs}ms`) }, null, 1));
