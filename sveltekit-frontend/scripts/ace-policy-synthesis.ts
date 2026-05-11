import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const REDIS_URL    = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const WEIGHTS_PATH = path.resolve(process.cwd(), 'src/lib/server/config/rerank-weights.json');

async function main() {
    console.log('=== ACE Policy Synthesis Loop ===');
    
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const redis = new Redis(REDIS_URL);

    try {
        // 1. Fetch recent hits with signals
        console.log('Fetching recent retrieval hits...');
        const { rows: hits } = await pool.query(`
            SELECT h.id, h.run_id, h.file_path, h.final_score, h.rank, h.metadata, r.query
            FROM ace_retrieval_hits h
            JOIN ace_retrieval_runs r ON h.run_id = r.id
            WHERE h.created_at >= now() - interval '7 days'
            AND h.metadata->>'signals' IS NOT NULL
        `);

        if (hits.length === 0) {
            console.log('! No recent hits with signal data found. Run some retrieval tasks first.');
            return;
        }

        console.log(`Analyzing ${hits.length} hits...`);

        // 2. Fetch Karpathy authority scores from Redis
        const karpathyScores = await redis.hgetall('gpu:karpathy:scores');
        const authorityMap = new Map();
        for (const [key, val] of Object.entries(karpathyScores)) {
            try {
                authorityMap.set(key, JSON.parse(val).blend);
            } catch { /* skip */ }
        }

        // 3. Synthesis: Compute correlations
        // We want to find which component (gemma, marco, lang, wiki) best predicts
        // if a hit is from a "High Authority" file (blend > 0.7).
        
        const signalStats = {
            gemma: { sum: 0, count: 0, correlation: 0 },
            marco: { sum: 0, count: 0, correlation: 0 },
            lang:  { sum: 0, count: 0, correlation: 0 },
            wiki:  { sum: 0, count: 0, correlation: 0 },
            activity: { sum: 0, count: 0, correlation: 0 }
        };

        let totalHighAuthHits = 0;

        for (const hit of hits) {
            const signals = hit.metadata.signals;
            const authority = authorityMap.get(hit.file_path) || 0;
            const isHighAuth = authority > 0.7;
            
            if (isHighAuth) totalHighAuthHits++;

            if (signals.gemmaScore !== undefined) {
                signalStats.gemma.sum += signals.gemmaScore;
                signalStats.gemma.count++;
                if (isHighAuth) signalStats.gemma.correlation += signals.gemmaScore;
            }
            if (signals.marcoScore !== undefined) {
                signalStats.marco.sum += signals.marcoScore;
                signalStats.marco.count++;
                if (isHighAuth) signalStats.marco.correlation += signals.marcoScore;
            }
            if (signals.langScore !== undefined) {
                signalStats.lang.sum += signals.langScore;
                signalStats.lang.count++;
                if (isHighAuth) signalStats.lang.correlation += signals.langScore;
            }
            if (signals.wikiScore !== undefined) {
                signalStats.wiki.sum += signals.wikiScore;
                signalStats.wiki.count++;
                if (isHighAuth) signalStats.wiki.correlation += signals.wikiScore;
            }
            if (signals.activityScore !== undefined) {
                signalStats.activity.sum += signals.activityScore;
                signalStats.activity.count++;
                if (isHighAuth) signalStats.activity.correlation += signals.activityScore;
            }
        }

        console.log(`High Authority Hits: ${totalHighAuthHits}`);

        // 4. Recommend Weights
        // Basic heuristic: weights proportional to authority-correlation
        const rawWeights = {
            gemma: signalStats.gemma.correlation / (signalStats.gemma.count || 1),
            marco: signalStats.marco.correlation / (signalStats.marco.count || 1),
            lang:  signalStats.lang.correlation  / (signalStats.lang.count || 1),
            wiki:  signalStats.wiki.correlation  / (signalStats.wiki.count || 1),
            activity: signalStats.activity.correlation / (signalStats.activity.count || 1)
        };

        const totalRaw = rawWeights.gemma + rawWeights.marco + rawWeights.lang + rawWeights.wiki + rawWeights.activity;
        const recommendedWeights = {
            gemma: Math.round((rawWeights.gemma / totalRaw) * 100) / 100,
            marco: Math.round((rawWeights.marco / totalRaw) * 100) / 100,
            lang:  Math.round((rawWeights.lang / totalRaw) * 100) / 100,
            wiki:  Math.round((rawWeights.wiki / totalRaw) * 100) / 100,
            activity: Math.round((rawWeights.activity / totalRaw) * 100) / 100
        };

        // Ensure they sum to 1.0 (adjust gemma for rounding)
        const currentSum = recommendedWeights.gemma + recommendedWeights.marco + recommendedWeights.lang + recommendedWeights.wiki + recommendedWeights.activity;
        recommendedWeights.gemma += Math.round((1.0 - currentSum) * 100) / 100;

        console.log('Recommended Weights:', recommendedWeights);

        // 5. Save to config
        const configDir = path.dirname(WEIGHTS_PATH);
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        
        fs.writeFileSync(WEIGHTS_PATH, JSON.stringify(recommendedWeights, null, 2));
        console.log(`✓ Weights updated at ${WEIGHTS_PATH}`);

    } catch (err) {
        console.error('Synthesis failed:', err);
    } finally {
        await pool.end();
        await redis.quit();
    }
}

main();
