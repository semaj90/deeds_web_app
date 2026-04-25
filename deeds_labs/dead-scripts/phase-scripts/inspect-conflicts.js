import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

const candidates = [
    'audit_logs', 'audit_log',
    'canvas_states', 'canvas_state',
    'chat_messages', 'chat_message',
    'evidence_tags', 'citation_tags', 'rag_index_metadata'
];

async function check() {
    try {
        await client.connect();
        console.log('--- Table Inspection ---');
        for (const t of candidates) {
            try {
                const res = await client.query(`SELECT count(*) as count FROM "${t}"`);
                console.log(`Table '${t}': Exists, ${res.rows[0].count} rows.`);
            } catch (e) {
                if (e.code === '42P01') { // undefined_table
                    console.log(`Table '${t}': Does NOT exist.`);
                } else {
                    console.log(`Table '${t}': Error ${e.code} - ${e.message}`);
                }
            }
        }
    } catch (e) {
        console.error('Connection error:', e.message);
    } finally {
        await client.end();
    }
}

check();
