import pg from 'pg';
const { Pool } = pg;
const p = new Pool({ connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db' });

await p.query(`
  ALTER TABLE citations
    ADD COLUMN IF NOT EXISTS citation_type varchar(100),
    ADD COLUMN IF NOT EXISTS title varchar(500),
    ADD COLUMN IF NOT EXISTS annotation text,
    ADD COLUMN IF NOT EXISTS is_key_authority boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS embedding vector(768)
`);
console.log('OK: 6 columns added to citations');

const r = await p.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'citations' ORDER BY ordinal_position`);
r.rows.forEach(c => console.log(c.column_name.padEnd(25), c.data_type));
await p.end();
