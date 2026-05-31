const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function readFile(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : ''; }

const schemaPath = path.join(__dirname, '..', 'drizzle', 'schema.ts');
const schemaSrc = readFile(schemaPath);
const regex = /export\s+const\s+(\w+)\s*=\s*pgTable\(\s*"?([\w_]+)"?\s*,\s*\{([\s\S]*?)\}\s*(?:,|\))/g;
const schemaTables = [];
let m;
while((m = regex.exec(schemaSrc)) !== null){
  const name = m[1];
  const tableName = m[2];
  const body = m[3];
  if(/userId\s*:\s*uuid\(/.test(body)) schemaTables.push({tableVar:name, tableName});
}

// read env like earlier script
function readEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const s = fs.readFileSync(p, 'utf8');
  return s.split('\n').reduce((acc, line) => {
    const m = line.match(/^\s*([A-Za-z_0-9]+)=(.*)$/);
    if (m) acc[m[1]] = m[2].trim();
    return acc;
  }, {});
}
const candidates = [
  path.join(__dirname, '..', '.env.development.local'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env.development'),
  path.join(__dirname, '..', 'ace.env.example'),
];
let env = {};
for (const c of candidates) Object.assign(env, readEnvFile(c));
let DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL || env.DATABASE_URL_MIGRATOR;
if(!DATABASE_URL){ console.error('No DATABASE_URL found.'); process.exit(2); }
DATABASE_URL = DATABASE_URL.trim().replace(/^\uFEFF/, '').replace(/^['\"]|['\"]$/g, '');

async function queryDb(){
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const res = await client.query(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE column_name = 'user_id' AND table_schema = 'public'
    ORDER BY table_name;
  `);
  await client.end();
  return res.rows;
}

(async ()=>{
  try{
    const dbRows = await queryDb();
    const byTable = dbRows.reduce((acc,r)=>{ acc[r.table_name]=r; return acc; }, {});
    const report = {
      generatedAt: (new Date()).toISOString(),
      databaseUrlHost: (()=>{ try{ return new URL(DATABASE_URL).hostname }catch(e){return null} })(),
      schemaDeclaredUuid: schemaTables,
      dbUserIdColumns: dbRows,
      mismatches: schemaTables.map(t=>({
        tableVar: t.tableVar,
        tableName: t.tableName,
        declared: 'uuid',
        actual: byTable[t.tableName] ? byTable[t.tableName].udt_name : null,
        data_type: byTable[t.tableName] ? byTable[t.tableName].data_type : null,
        presentInDb: Boolean(byTable[t.tableName])
      }))
    };
    const outDir = path.join(__dirname, '..', '..', 'memory', 'exports');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'drizzle_userid_audit.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('Wrote report to', outPath);
  }catch(err){
    console.error('Failed:', err.message);
    process.exitCode=3;
  }
})();
