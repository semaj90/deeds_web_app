import pg from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: '.env' });
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

async function main() {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await pool.query('SELECT id, title, corpus_type, source_hash, processing_status, page_count FROM library_documents');
    console.log('Library Documents:', JSON.stringify(res.rows, null, 2));
    await pool.end();
}
main().catch(console.error);
