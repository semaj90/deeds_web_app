import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const client = new Client({
    connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db'
});

async function run() {
    await client.connect();
    const sql = fs.readFileSync('./create_metadata_spine.sql', 'utf8');
    await client.query(sql);
    console.log('Tables created successfully!');
    await client.end();
}

run().catch(console.error);
