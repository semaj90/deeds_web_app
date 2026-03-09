import { redis } from '$lib/server/redis';
import crypto from 'crypto';

function keyForQuery(query: string, scope: string = 'global'): string {
    const h = crypto.createHash('sha256')
        .update(query + '|' + scope)
        .digest('hex');
    return `cache:search:${scope}:${h}`;
}

export async function getCachedSearch(query: string, scope: string = 'global') {
    const key = keyForQuery(query, scope);
    const raw = await redis.get(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw as string);
        return parsed;
    } catch {
        return null;
    }
}

export async function setCachedSearch(
    query: string, scope: string, payload: unknown, ttlSeconds = 300
) {
    const key = keyForQuery(query, scope);
    await redis.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
}
