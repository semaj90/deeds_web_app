import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
let duckdb; try { duckdb = require('duckdb'); } catch (e) { console.log('NO_DUCKDB_NODE_PKG', e.message.split('\n')[0]); process.exit(0); }
const db = new duckdb.Database(process.argv[2], duckdb.OPEN_READONLY);
const all = (sql) => new Promise((res, rej) => db.all(sql, (e, r) => e ? rej(e) : res(r)));
const tables = await all("select table_name, estimated_size from duckdb_tables() order by estimated_size desc limit 30");
console.log(JSON.stringify(tables, (k, v) => typeof v === 'bigint' ? Number(v) : v));
for (const t of tables.slice(0, 8)) {
  const cols = await all(`select column_name, data_type from duckdb_columns() where table_name='${t.table_name}' limit 40`);
  const n = await all(`select count(*) c from "${t.table_name}"`);
  console.log(t.table_name, Number(n[0].c), cols.map((c) => `${c.column_name}:${c.data_type}`).join(', ').slice(0, 400));
}
