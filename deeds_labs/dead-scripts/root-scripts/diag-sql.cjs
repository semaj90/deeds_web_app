const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db'
});

async function diag() {
    try {
        console.log("Testing full vector query with non-zero vector...");
        // Non-zero 768 vector
        const vec = '[' + new Array(768).fill(0.1).join(',') + ']';
        
        const res = await pool.query(
            `SELECT 
                lc.id, 
                1 - (lc.embedding <=> $1::vector) as sim
             FROM legal_chunks lc 
             WHERE lc.embedding IS NOT NULL
             LIMIT 1`,
            [vec]
        );
        console.log("Vector Query success! Result:", res.rows[0]);

        console.log("Testing fallback text search...");
        const textRes = await pool.query(
            `SELECT 
                lc.id, 
                ts_rank(lc.tsv, plainto_tsquery('english', $1)) AS sim
             FROM legal_chunks lc
             WHERE lc.tsv @@ plainto_tsquery('english', $1)
             LIMIT 1`,
            ['eminent domain']
        );
        console.log("Text Query success! Result:", textRes.rows[0]);

    } catch (err) {
        console.error("DIAGNOSTIC FAILED:", err.message);
        console.error(err.stack);
    } finally {
        await pool.end();
    }
}

diag();
