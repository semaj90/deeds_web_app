import { db, closeConnections } from './src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { pgRows } from './src/lib/server/db/client.js';

async function test() {
    try {
        const r = await db.execute(sql`
            SELECT
                (SELECT COUNT(*) FROM cluster_summaries) AS c_total,
                (SELECT COUNT(summary_embedding) FROM cluster_summaries) AS c_with_emb,
                (SELECT COUNT(*) FROM legal_chunks) AS lc_count,
                (SELECT COUNT(*) FROM canonical_chunks) AS cc_count
        `);
        console.log("Raw Exec Result:", r);
        console.log("pgRows Result:", pgRows(r));
    } catch (e) {
        console.error('Error:', e);
    }
    await closeConnections();
}
test();
