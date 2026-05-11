import 'dotenv/config';
import pg from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const REDIS_URL    = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function main() {
    console.log('=== Seeding ACE Retrieval Hits and Authority Scores ===');
    
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const redis = new Redis(REDIS_URL);

    try {
        // 1. Create a few runs
        const runs = [
            { id: uuidv4(), query: 'How to implement auth guards in SvelteKit?', intent: 'code_help' },
            { id: uuidv4(), query: 'Explain the tiered cache system', intent: 'documentation' },
            { id: uuidv4(), query: 'What are the current G4 compliance gaps?', intent: 'audit' }
        ];

        for (const run of runs) {
            await pool.query(
                'INSERT INTO ace_retrieval_runs (id, query, intent) VALUES ($1, $2, $3)',
                [run.id, run.query, run.intent]
            );
        }

        // 2. Add Karpathy authority scores to Redis
        console.log('Seeding Karpathy scores to Redis...');
        const files = [
            { path: 'src/lib/server/db/schema-ace.ts', auth: 0.9 },
            { path: 'src/lib/server/retrieval/rerank-decision-tree.ts', auth: 0.85 },
            { path: 'src/routes/api/test/cache-demo/+server.ts', auth: 0.4 },
            { path: 'sveltekit-frontend/AGENTS.md', auth: 0.95 }
        ];
        const authorityData: Record<string, string> = {};
        for (const f of files) {
            authorityData[f.path] = JSON.stringify({ blend: f.auth, pr: 0.5, attn: 0.5, authority: f.auth });
        }
        await redis.hset('gpu:karpathy:scores', authorityData);

        // 3. Add hits with signals
        // We'll add some "High Authority" hits and some others
        for (const run of runs) {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                // Randomish signals
                const signals = {
                    gemmaScore: Math.random() * 0.5 + (f.auth * 0.5), // Correlated with authority
                    marcoScore: Math.random(),
                    langScore: Math.random(),
                    wikiScore: Math.random() * 0.3 + (f.auth * 0.7), // Strongly correlated
                    activityScore: Math.random()
                };

                await pool.query(
                    `INSERT INTO ace_retrieval_hits (run_id, stable_key, file_path, source, final_score, rank, metadata) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        run.id, 
                        f.path,
                        f.path, 
                        'vector', 
                        signals.gemmaScore * 0.4 + signals.wikiScore * 0.6, 
                        i + 1, 
                        JSON.stringify({ signals })
                    ]
                );
            }
        }

        console.log('✓ Seeded 3 runs and 12 hits.');

    } catch (err) {
        console.error('Seeding failed:', err);
    } finally {
        await pool.end();
        await redis.quit();
    }
}

main();
