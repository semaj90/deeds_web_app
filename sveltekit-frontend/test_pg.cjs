const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
async function run() {
    try {
        const r = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM cluster_summaries) AS c_total,
                (SELECT COUNT(summary_embedding) FROM cluster_summaries) AS c_with_emb,
                (SELECT COUNT(*) FROM legal_chunks) AS lc_count,
                (SELECT COUNT(*) FROM canonical_chunks) AS cc_count
        `);
        console.log(r.rows);
    } finally {
        pool.end();
    }
}
run();
