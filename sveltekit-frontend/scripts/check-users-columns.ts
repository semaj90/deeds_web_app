
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
        const names = res.rows.map(r => r.column_name);
        console.log('Has name:', names.includes('name'));
        console.log('Has full_name:', names.includes('full_name'));
        console.log('Has first_name:', names.includes('first_name'));
        console.log('ALL COLUMNS:', names.join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkColumns();
