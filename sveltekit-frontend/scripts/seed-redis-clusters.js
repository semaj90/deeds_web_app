import Redis from 'ioredis';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function main() {
    console.log(`Connecting to Redis: ${REDIS_URL}`);
    const redis = new Redis(REDIS_URL);
    
    // Clear existing hot set and metadata
    await redis.del('ace:cluster:hot');
    await redis.del('ace:cluster:tags:__meta');
    
    const clusterKeys = [];
    for (let i = 1; i <= 5; i++) {
        const clusterKey = `cluster:gpu:${i}`;
        clusterKeys.push(clusterKey);
        
        // Add to sorted set
        await redis.zadd('ace:cluster:hot', 1.0 - (i * 0.1), clusterKey);
        
        // Add metadata hash
        const hashKey = `ace:cluster:tags:${clusterKey}`;
        await redis.del(hashKey);
        await redis.hset(hashKey, {
            summary: `This is a mock summary for legal codebase cluster ${i}. It deals with database schema, routing, and user interface templates.`,
            purpose: `Mock cluster ${i} purpose`,
            risk_level: `LOW`,
            mitigation_protocols: JSON.stringify([`Protocol ${i}-A`, `Protocol ${i}-B`]),
            topTags: JSON.stringify([`tag-${i}a`, `tag-${i}b`, `tag-${i}c`]),
            topFiles: JSON.stringify([`file-${i}a.ts`, `file-${i}b.ts`]),
            topoClasses: JSON.stringify([`class-${i}a`, `class-${i}b`]),
            fileCount: `${i * 10}`
        });
        console.log(`Seeded cluster ${clusterKey}`);
    }
    
    // Set static cluster tag manifest metadata
    await redis.set('ace:cluster:tags:__meta', JSON.stringify({ clusterKeys }));
    console.log("Seeded ace:cluster:tags:__meta");
    
    await redis.quit();
    console.log("Done seeding Redis!");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
