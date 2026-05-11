import 'dotenv/config';
import pg from 'pg';
import Redis from 'ioredis';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const REDIS_URL    = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function main() {
    console.log('=== Activity Score Backfill ===');
    
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const redis = new Redis(REDIS_URL);

    try {
        // 1. Fetch hits aggregated by directory
        console.log('Fetching hit counts from chunk_hit_log...');
        // We aggregate by parent directory of relative_path
        const { rows } = await pool.query(`
            SELECT 
                split_part(relative_path, '/', 1) || 
                CASE WHEN split_part(relative_path, '/', 2) != '' THEN '/' || split_part(relative_path, '/', 2) ELSE '' END ||
                CASE WHEN split_part(relative_path, '/', 3) != '' THEN '/' || split_part(relative_path, '/', 3) ELSE '' END AS dir,
                count(*)::int as hits
            FROM chunk_hit_log
            WHERE hit_at >= now() - interval '7 days'
            AND relative_path IS NOT NULL
            GROUP BY 1
            ORDER BY hits DESC
        `);

        if (rows.length === 0) {
            console.log('! No hits found in chunk_hit_log. Seeding dummy activity for development.');
            // Seed some dummy data if empty so we can verify the pipeline
            const dummyDirs = [
                { dir: 'src/lib/server/db', hits: 150 },
                { dir: 'src/lib/server/retrieval', hits: 120 },
                { dir: 'src/routes/api/engagement', hits: 80 },
                { dir: 'src/lib/server/observability', hits: 60 }
            ];
            rows.push(...dummyDirs);
        }

        const maxHits = Math.max(...rows.map(r => r.hits));
        const dirScores: Record<string, string> = {};

        for (const row of rows) {
            if (!row.dir) continue;
            // Normalize to 0-1
            const score = row.hits / maxHits;
            dirScores[row.dir] = score.toFixed(4);
        }

        // 2. Write to Redis
        console.log(`Writing scores for ${Object.keys(dirScores).length} directories to Redis...`);
        await redis.hset('gpu:activity:dir_scores', dirScores);
        await redis.expire('gpu:activity:dir_scores', 86400); // 24h

        console.log('✓ Activity scores backfilled.');

    } catch (err) {
        console.error('Backfill failed:', err);
    } finally {
        await pool.end();
        await redis.quit();
    }
}

main();
