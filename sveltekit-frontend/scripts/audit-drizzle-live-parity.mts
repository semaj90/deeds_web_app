#!/usr/bin/env tsx
/**
 * Read-only Drizzle <-> live PostgreSQL parity audit (columns, types, nullability, indexes, special types).
 *
 * Complements scripts/audit-schema-drift.mjs (table/enum NAMES vs a doc) and
 * scripts/atlas/audit-postgres-contract-mirrors.mjs (packet tables only). Neither compares
 * column types or index methods against the live database.
 *
 *   cd sveltekit-frontend && npx tsx scripts/audit-drizzle-live-parity.mts [--out docs/reports/drizzle-live-parity.json]
 *
 * Loads the canonical schema entry (src/lib/server/db/schema.ts). SELECT/EXPLAIN only; never writes the database.
 * Honest limits: Drizzle cannot express GIN-trgm/HNSW/BM25/GENERATED details, so live-only non-btree indexes are
 * reported as informational. "AIO" and bitmap scans are planner/server behavior (io_method, enable_bitmapscan), not
 * schema: they are reported as settings plus EXPLAIN evidence. PostgreSQL has no merkle/bitmap column type; the audit
 * only reports columns whose NAMES suggest hash-chain/merkle roots.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';

dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing (expected in ../.env)');
const outArg = process.argv.indexOf('--out');
const OUT = outArg >= 0 ? process.argv[outArg + 1] : path.resolve(process.cwd(), '..', 'docs', 'reports', 'drizzle-live-parity-20261017.json');

const mod: Record<string, unknown> = await import('../src/lib/server/db/schema.ts');
const declared = (Object.values(mod).filter((v) => is(v as object, PgTable)) as PgTable[]).map((t) => getTableConfig(t));

const clean = (s: string) => s.replace(/"/g, '').replace(/^public\./, '').trim().toLowerCase();
function norm(t: string): string {
	let s = clean(t);
	s = s.replace(/^serial$/, 'integer').replace(/^bigserial$/, 'bigint').replace(/^smallserial$/, 'smallint');
	s = s.replace(/^int$/, 'integer').replace(/^int4$/, 'integer').replace(/^int8$/, 'bigint').replace(/^int2$/, 'smallint');
	s = s.replace(/^varchar/, 'character varying').replace(/^char\b/, 'character').replace(/^float8$/, 'double precision').replace(/^float4$/, 'real');
	s = s.replace(/^timestamp$/, 'timestamp without time zone').replace(/^time$/, 'time without time zone');
	s = s.replace(/^timestamp\((\d)\)$/, 'timestamp($1) without time zone');
	s = s.replace(/^bool$/, 'boolean').replace(/^numeric\(\d+,\s*\d+\)$/, (m) => m.replace(/\s/g, ''));
	return s;
}

const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async <T = any,>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];

const live = await q<{ t: string; c: string; typ: string; nn: boolean; gen: string; ident: string }>(`
  SELECT c.relname t, a.attname c, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull nn, a.attgenerated gen, a.attidentity ident
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped`);
const liveIdx = await q<{ t: string; i: string; am: string; uniq: boolean; def: string }>(`
  SELECT t.relname t, i.relname i, am.amname am, x.indisunique uniq, pg_get_indexdef(i.oid) def
  FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_am am ON am.oid = i.relam JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public'`);

const liveTables = new Map<string, Map<string, { typ: string; nn: boolean; gen: string }>>();
for (const r of live) {
	if (!liveTables.has(r.t)) liveTables.set(r.t, new Map());
	liveTables.get(r.t)!.set(r.c, { typ: r.typ, nn: r.nn, gen: r.gen });
}
const liveIdxByTable = new Map<string, typeof liveIdx>();
for (const r of liveIdx) liveIdxByTable.set(r.t, [...(liveIdxByTable.get(r.t) ?? []), r]);

const declaredNames = new Set(declared.map((d) => d.name));
const report: any = {
	generated: new Date().toISOString(),
	pgVersion: (await q<{ v: string }>('select version() v'))[0].v.split(',')[0],
	counts: { drizzleTables: declared.length, liveTables: liveTables.size },
	tablesDeclaredNotLive: [] as string[],
	tablesLiveNotDeclared: [] as string[],
	columnsMissingLive: [] as unknown[],
	columnsLiveNotDeclared: [] as unknown[],
	typeMismatches: [] as unknown[],
	nullabilityRisks: [] as unknown[],
	declaredIndexesMissingLive: [] as unknown[],
};

for (const d of declared) {
	const lt = liveTables.get(d.name);
	if (!lt) { report.tablesDeclaredNotLive.push(d.name); continue; }
	const seen = new Set<string>();
	for (const col of d.columns) {
		seen.add(col.name);
		const lc = lt.get(col.name);
		if (!lc) { report.columnsMissingLive.push({ table: d.name, column: col.name, drizzle: col.getSQLType() }); continue; }
		if (norm(col.getSQLType()) !== norm(lc.typ)) report.typeMismatches.push({ table: d.name, column: col.name, drizzle: col.getSQLType(), live: lc.typ });
		if (col.notNull && !lc.nn && !col.primary) report.nullabilityRisks.push({ table: d.name, column: col.name, issue: 'declared NOT NULL, live nullable' });
		if (!col.notNull && lc.nn && !col.hasDefault && !col.primary) report.nullabilityRisks.push({ table: d.name, column: col.name, issue: 'declared nullable, live NOT NULL without default (insert may fail)' });
	}
	for (const [cn, lc] of lt) if (!seen.has(cn)) report.columnsLiveNotDeclared.push({ table: d.name, column: cn, live: lc.typ, generated: lc.gen !== '' });
	const liveNames = new Set((liveIdxByTable.get(d.name) ?? []).map((i) => i.i));
	for (const idx of d.indexes) {
		const n = (idx as any).config?.name;
		if (n && !liveNames.has(n)) report.declaredIndexesMissingLive.push({ table: d.name, index: n, using: (idx as any).config?.using ?? 'unknown (Drizzle did not expose the method)' });
	}
}
for (const t of liveTables.keys()) if (!declaredNames.has(t)) report.tablesLiveNotDeclared.push(t);

// Live special-type census + index method census
const bucket = (re: RegExp) => live.filter((r) => re.test(r.typ));
const declCols = new Map<string, string>();
for (const d of declared) for (const c of d.columns) declCols.set(`${d.name}.${c.name}`, c.getSQLType());
const special = (label: string, re: RegExp) => {
	const rows = bucket(re);
	const undeclared = rows.filter((r) => !declCols.has(`${r.t}.${r.c}`)).length;
	return { label, liveColumns: rows.length, tables: new Set(rows.map((r) => r.t)).size, notDeclaredInDrizzle: undeclared };
};
report.specialTypes = [
	special('jsonb', /^jsonb(\[\])?$/), special('bytea', /^bytea(\[\])?$/), special('bit/varbit', /^bit( varying)?(\(|$)/),
	special('vector', /^vector\(/), special('halfvec', /^halfvec\(/), special('sparsevec', /^sparsevec\(/),
	special('tsvector', /^tsvector$/), special('uuid', /^uuid(\[\])?$/), special('text[]', /^text\[\]$/),
];
report.generatedColumnsLive = live.filter((r) => r.gen !== '').map((r) => `${r.t}.${r.c}`);
const methods: Record<string, { count: number; notDeclaredInDrizzle: number }> = {};
for (const i of liveIdx) {
	const decl = declared.find((d) => d.name === i.t)?.indexes.some((x) => (x as any).config?.name === i.i) ?? false;
	methods[i.am] ??= { count: 0, notDeclaredInDrizzle: 0 };
	methods[i.am].count++;
	if (!decl) methods[i.am].notDeclaredInDrizzle++;
}
report.indexMethods = methods;
report.merkleLikeColumns = live.filter((r) => /merkle|hash_chain|root_hash|prev_hash|parent_hash/i.test(r.c)).map((r) => `${r.t}.${r.c} ${r.typ}`);
report.rowStatsNote = 'not computed';

// PG18 I/O settings and bitmap/AIO evidence (settings + EXPLAIN only; AIO/bitmap are planner/server behavior, not schema)
const settings = await q<{ name: string; setting: string }>(`SELECT name, setting FROM pg_settings WHERE name IN
  ('io_method','io_workers','effective_io_concurrency','maintenance_io_concurrency','enable_bitmapscan','enable_indexscan',
   'shared_buffers','work_mem','random_page_cost','jit','default_statistics_target')`);
report.pgSettings = Object.fromEntries(settings.map((s) => [s.name, s.setting]));
report.extensions = (await q<{ extname: string; extversion: string }>('select extname, extversion from pg_extension order by 1')).map((e) => `${e.extname} ${e.extversion}`);
async function explain(label: string, sql: string) {
	try {
		const rows = await q<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS, SETTINGS) ${sql}`);
		const plan = rows.map((r) => r['QUERY PLAN']);
		return { label, nodes: plan.filter((l) => /Scan|Aggregate|Sort|Limit/.test(l)).slice(0, 6).map((l) => l.trim().slice(0, 150)), timing: plan.filter((l) => /Execution Time|Planning Time/.test(l)).map((l) => l.trim()) };
	} catch (e) { return { label, error: String((e as Error).message).slice(0, 200) }; }
}
report.explain = [
	await explain('legal_nodes full-text (GIN tsv)', `SELECT id FROM legal_nodes WHERE tsv @@ plainto_tsquery('english','grand theft property') LIMIT 20`),
	await explain('legal_nodes citation lookup (btree)', `SELECT id FROM legal_nodes WHERE citation_label = 'Cal. Pen. Code § 487'`),
	await explain('legal_chunks vector top-10 (HNSW)', `SELECT id FROM legal_chunks WHERE embedding IS NOT NULL ORDER BY embedding <=> (SELECT embedding FROM legal_chunks WHERE embedding IS NOT NULL LIMIT 1) LIMIT 10`),
];
await pool.end();

report.summary = {
	tablesDeclaredNotLive: report.tablesDeclaredNotLive.length,
	tablesLiveNotDeclared: report.tablesLiveNotDeclared.length,
	columnsMissingLive: report.columnsMissingLive.length,
	columnsLiveNotDeclared: report.columnsLiveNotDeclared.length,
	typeMismatches: report.typeMismatches.length,
	nullabilityRisks: report.nullabilityRisks.length,
	declaredIndexesMissingLive: report.declaredIndexesMissingLive.length,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, pg: report.pgVersion, counts: report.counts, summary: report.summary, indexMethods: report.indexMethods, specialTypes: report.specialTypes, io: { io_method: report.pgSettings.io_method, io_workers: report.pgSettings.io_workers, effective_io_concurrency: report.pgSettings.effective_io_concurrency, enable_bitmapscan: report.pgSettings.enable_bitmapscan }, merkleLike: report.merkleLikeColumns.length }, null, 2));
process.exit(0);
