import fs from 'fs';
import pg from 'pg';
const { Client } = pg;

async function run() {
    const file = process.argv[2];
    const sql = fs.readFileSync(file, 'utf8');
    const client = new Client({ connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db' });
    await client.connect();
    console.log(`Executing SQL from ${file}...`);
    await client.query(sql);
    await client.end();
    console.log('Success.');
}
run().catch(console.error);
