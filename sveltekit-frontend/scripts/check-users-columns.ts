
import { Client } from 'pg';

const client = new Client({
    connectionString: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
});

async function checkColumns() {
    try {
        await client.connect();
        const res = await client.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'users';
        `);
        console.log('Columns in users table:');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkColumns();
