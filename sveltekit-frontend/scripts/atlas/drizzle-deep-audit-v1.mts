// Deep Drizzle <-> live PostgreSQL 18 audit (READ ONLY). Compares every pgTable declaration with the live catalog on column existence,
// type, nullability and defaults. drizzle-kit push is never used; this only reads (BEGIN READ ONLY ... ROLLBACK) and writes a local JSON receipt.
// Refuses to run unless the server fingerprint matches the project database (legal_ai_db / legal_admin / PostgreSQL 18 / pg_search present).
// Usage (from sveltekit-frontend/): npx tsx scripts/atlas/drizzle-deep-audit-v1.mts [--out=../.tmp/atlas/drizzle-deep-audit.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { is } from 'drizzle-orm';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(here, '..', '..');
const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '../.tmp/atlas/drizzle-deep-audit.json';
const dbDir = path.join(FRONTEND, 'src/lib/server/db');
const files = [
  ...fs.readdirSync(dbDir).filter((f) => /^schema.*\.ts$/.test(f)).map((f) => path.join(dbDir, f)),
  ...(fs.existsSync(path.join(dbDir, 'schema')) ? fs.readdirSync(path.join(dbDir, 'schema')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).map((f) => path.join(dbDir, 'schema', f)) : []),
].sort();

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, '')
  .replace(/^serial$/, 'integer').replace(/^bigserial$/, 'bigint').replace(/^smallserial$/, 'smallint')
  .replace(/^varchar/, 'charactervarying').replace(/^char\(/, 'character(').replace(/^int$/, 'integer')
  .replace(/^timestamp$/, 'timestampwithouttimezone').replace(/^timestampwithtimezone$/, 'timestampwithtimezone')
  .replace(/^time$/, 'timewithouttimezone').replace(/^doubleprecision$/, 'doubleprecision');
const normLive = (t: string) => t.toLowerCase().replace(/\s+/g, '');

type Decl = { file: string; exportName: string; table: string; cols: { name: string; sqlType: string; notNull: boolean; sqlDefault: boolean; appDefault: boolean }[] };
const decls: Decl[] = [];
const importErrors: { file: string; error: string }[] = [];
for (const f of files) {
  try {
    const mod = await import(pathToFileURL(f).href);
    for (const [exportName, value] of Object.entries(mod)) {
      if (!is(value as object, PgTable)) continue;
      const cfg = getTableConfig(value as PgTable);
      decls.push({
        file: path.relative(FRONTEND, f).split(path.sep).join('/'), exportName, table: cfg.name,
        cols: cfg.columns.map((c) => ({
          name: c.name, sqlType: c.getSQLType(), notNull: c.notNull,
          sqlDefault: c.default !== undefined || (c as unknown as { generated?: unknown }).generated !== undefined || /serial/i.test(c.getSQLType()),
          appDefault: typeof (c as unknown as { defaultFn?: unknown }).defaultFn === 'function',
        })),
      });
    }
  } catch (e) { importErrors.push({ file: path.relative(FRONTEND, f).split(path.sep).join('/'), error: String((e as Error).message).split('\n')[0].slice(0, 160) }); }
}

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN READ ONLY');
  const fp = (await client.query(`select current_database() db, current_user usr, version() ver, current_setting('server_version_num')::int vnum,
     (select count(*) from pg_extension where extname = 'pg_search')::int pg_search, inet_server_port() port, current_setting('data_directory') datadir`)).rows[0];
  const ok = fp.db === 'legal_ai_db' && fp.usr === 'legal_admin' && fp.vnum >= 180000 && fp.vnum < 190000 && fp.pg_search === 1;
  const fingerprint = { database: fp.db, user: fp.usr, server_version: String(fp.ver).split(' ')[1], pg_search_extension: fp.pg_search === 1, server_port_in_container: fp.port, data_directory: fp.datadir, matches_project_database: ok };
  if (!ok) { console.error('REFUSED: server fingerprint does not match the project database', JSON.stringify(fingerprint)); process.exit(2); }

  const live = (await client.query(`
    select c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull as notnull,
           (d.adbin is not null or a.attidentity <> '' or a.attgenerated <> '') as has_default
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped`)).rows;
  await client.query('ROLLBACK');

  const byTable = new Map<string, Map<string, { typ: string; notnull: boolean; has_default: boolean }>>();
  for (const r of live) { if (!byTable.has(r.tbl)) byTable.set(r.tbl, new Map()); byTable.get(r.tbl)!.set(r.col, { typ: r.typ, notnull: r.notnull, has_default: r.has_default }); }

  const findings: Record<string, unknown>[] = [];
  const add = (kind: string, d: Decl, col: string | null, detail: Record<string, unknown>) => findings.push({ kind, table: d.table, file: d.file, export: d.exportName, column: col, ...detail });
  for (const d of decls) {
    const lt = byTable.get(d.table);
    if (!lt) { add('TABLE_MISSING_LIVE', d, null, {}); continue; }
    const declared = new Set(d.cols.map((c) => c.name));
    for (const c of d.cols) {
      const l = lt.get(c.name);
      if (!l) { add('COLUMN_MISSING_LIVE', d, c.name, { drizzleType: c.sqlType }); continue; }
      if (norm(c.sqlType) !== normLive(l.typ)) add('TYPE_MISMATCH', d, c.name, { drizzle: c.sqlType, live: l.typ });
      if (l.notnull && !l.has_default && !c.notNull) add('WRITE_RISK_LIVE_NOT_NULL_NO_DEFAULT_DRIZZLE_NULLABLE', d, c.name, { live: l.typ });
      if (l.notnull && !l.has_default && c.notNull && c.sqlDefault) add('WRITE_RISK_DRIZZLE_DEFAULT_LIVE_NOT_NULL_NO_DEFAULT', d, c.name, {});
      if (!l.notnull && c.notNull) add('DRIZZLE_NOT_NULL_LIVE_NULLABLE', d, c.name, {});
    }
    for (const col of lt.keys()) if (!declared.has(col)) add('COLUMN_ONLY_LIVE', d, col, {});
  }
  const count = (k: string) => findings.filter((f) => f.kind === k).length;
  const kinds = [...new Set(findings.map((f) => f.kind as string))].sort();
  const summary = {
    declarations: decls.length, distinctDeclaredTables: new Set(decls.map((d) => d.table)).size, liveTables: byTable.size, importErrors: importErrors.length,
    counts: Object.fromEntries(kinds.map((k) => [k, count(k)])),
  };
  const receipt = { schema: 'atlas.drizzle-deep-audit.v1', generatedAt: new Date().toISOString(), readOnly: true, writesPerformed: false, fingerprint, summary, importErrors, findings };
  const outPath = path.resolve(FRONTEND, outArg);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ fingerprint, summary, out: path.relative(FRONTEND, outPath) }, null, 1));
} finally { client.release(); await pool.end(); }
