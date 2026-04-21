import { db } from './src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

async function test() {
    try {
        const r = await db.execute(sql\
            SELECT
                (SELECT COUNT(*) FROM cluster_summaries) AS total_summaries,
                (SELECT COUNT(summary_embedding) FROM cluster_summaries) AS with_embedding,
                (SELECT COUNT(*) FROM legal_chunks) AS legal_chunks,
                (SELECT COUNT(*) FROM canonical_chunks) AS canon_chunks
        \);
        console.log(r);
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}
test();
