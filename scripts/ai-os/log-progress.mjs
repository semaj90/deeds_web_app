import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __filename = fileURLToPath(import.meta.url);
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true });

export async function logProgress(message, type = 'info', metadata = {}) {
    const logPath = path.resolve('docs/ai-os/agentic-progress-log.ndjson');
    const entry = { timestamp: new Date().toISOString(), type, message, ...metadata };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    
    const mdPath = path.resolve('docs/ai-os/progress-log.md');
    fs.appendFileSync(mdPath, `- **${entry.timestamp}** [${type.toUpperCase()}]: ${message}\n`);

    // Wire up Bifrost caching with strictly enforced TTLs
    try {
        await redis.connect();
        const runId = metadata.runId || Date.now().toString();
        const clusterId = metadata.clusterId || 'default-cluster';
        
        await redis.set(`ace:packet:${runId}`, JSON.stringify(entry), 'EX', 3600); // 1h TTL
        await redis.set(`ace:cluster:${clusterId}`, JSON.stringify(entry), 'EX', 86400); // 24h TTL
        console.log(`[Bifrost] Cached progress packet ${runId}`);
    } catch (err) {
        console.warn('[Bifrost] Redis offline. Caching skipped.', err.message);
    } finally {
        redis.disconnect();
    }
}

if (process.argv[1] === __filename) {
    const msg = process.argv[2] || 'Update';
    logProgress(msg).catch(console.error);
}
