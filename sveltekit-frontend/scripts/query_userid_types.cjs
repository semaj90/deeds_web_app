const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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
for (const c of candidates) {
  const parsed = readEnvFile(c);
  Object.assign(env, parsed);
}
let DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL || env.DATABASE_URL_MIGRATOR;
if (!DATABASE_URL) {
  console.error('No DATABASE_URL found in env files or process.env. Looked at:', candidates.join(', '));
  process.exit(2);
}
// sanitize quotes and BOM
DATABASE_URL = DATABASE_URL.trim().replace(/^\uFEFF/, '').replace(/^['\"]|['\"]$/g, '');
console.log('Using DATABASE_URL=', DATABASE_URL);
try {
  const parsed = new URL(DATABASE_URL);
  console.log('Parsed host:', parsed.hostname, 'port:', parsed.port || '(default)');
} catch (e) {
  console.warn('Could not parse DATABASE_URL with URL parser:', e.message);
}

(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE column_name = 'user_id' AND table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Query failed:', err.message);
    process.exitCode = 3;
  } finally {
    await client.end().catch(()=>{});
  }
})();
