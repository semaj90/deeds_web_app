import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db' });
const r = await p.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'citations' ORDER BY ordinal_position");
r.rows.forEach(c => console.log(`${c.column_name.padEnd(30)} ${c.data_type.padEnd(30)} ${c.is_nullable}`));
await p.end();
