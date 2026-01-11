import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const config = {
    user: 'legal_admin',
    password: '123456',
    host: 'localhost',
    port: 5432,
    database: 'legal_ai_db',
};

const pool = new Pool(config);

function parseTsErrorLine(line) {
    // Regex to match: src/file.ts(1,1): error TS1234: Message
    // Adjusted to handle relative paths and various formats
    const regex = /^(?<file>.+\.(ts|tsx|js|jsx|svelte))\((?<line>\d+),(?<col>\d+)\):\s+(?<severity>error|warning)\s+(?<code>[A-Z]+\d+):\s+(?<msg>.+)$/;
    const match = line.match(regex);
    if (!match || !match.groups) return null;
    return {
        file: match.groups.file.trim(),
        message: match.groups.msg.trim(),
        full: line.trim()
    };
}

async function main() {
    console.log('Connecting to DB...');
    const client = await pool.connect();

    try {
        const logPath = path.join('logs', 'tsc.log');
        console.log(`Reading ${logPath}...`);

        if (!fs.existsSync(logPath)) {
            console.error('Log file not found!');
            return;
        }

        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split(/\r?\n/);

        console.log(`Found ${lines.length} lines. Parsing...`);

        const errors = [];
        for (const line of lines) {
            const parsed = parseTsErrorLine(line);
            if (parsed) {
                errors.push(parsed);
            }
        }

        console.log(`Parsed ${errors.length} errors.`);

        if (errors.length === 0) {
            console.log('No errors to insert.');
            return;
        }

        // CREATE TABLE if not exists
        try {
             await client.query('CREATE EXTENSION IF NOT EXISTS vector');
        } catch (e) {
            console.log('Vector extension creation failed (might need superuser), proceeding assuming it exists or not needed for table creation if we use generic type or if it fails later.');
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS raw_error_embeddings (
                id SERIAL PRIMARY KEY,
                source TEXT NOT NULL,
                raw_text TEXT NOT NULL,
                embedding VECTOR(768)  -- embeddinggemma:latest uses 768 dimensions
            );
        `);

        console.log('Truncating raw_error_embeddings...');
        await client.query('TRUNCATE TABLE raw_error_embeddings');

        console.log('Inserting errors...');

        // Batch insert
        const batchSize = 1000;
        for (let i = 0; i < errors.length; i += batchSize) {
            const batch = errors.slice(i, i + batchSize);
            const values = [];
            const placeholders = [];

            batch.forEach((err, idx) => {
                const offset = idx * 2;
                placeholders.push(`($${offset + 1}, $${offset + 2}, NULL)`);
                values.push(err.file, err.full);
            });

            const query = `
                INSERT INTO raw_error_embeddings (source, raw_text, embedding)
                VALUES ${placeholders.join(', ')}
            `;
            await client.query(query, values);
            process.stdout.write(`\rInserted ${Math.min(i + batchSize, errors.length)} / ${errors.length}`);
        }

        console.log('\nDone!');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
