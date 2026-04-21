import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { isRerankerReady } from '$lib/server/retrieval/triton-reranker.js';

export const GET: RequestHandler = async () => {
    const start = performance.now();
    const stats: Record<string, any> = {
        timestamp: new Date().toISOString(),
        services: {},
        collections: {},
        queues: {},
    };

    // 1. Qdrant Health
    try {
        const collectionsRes = await fetch(`${ENV.QDRANT_URL}/collections`, { signal: AbortSignal.timeout(2000) });
        if (collectionsRes.ok) {
            const data = await collectionsRes.json();
            const names = data.result.collections.map((c: any) => c.name);
            stats.services.qdrant = 'OK';

            // Stats for key collections
            for (const name of ['knowledge_base', 'codebase_chunks_768', 'legal_corpus_768']) {
                if (names.includes(name)) {
                    const colRes = await fetch(`${ENV.QDRANT_URL}/collections/${name}`, { signal: AbortSignal.timeout(2000) });
                    const colData = await colRes.json();
                    stats.collections[name] = {
                        status: colData.result.status,
                        points: colData.result.points_count,
                        vectors: colData.result.vectors_count,
                        segments: colData.result.segments_count,
                    };
                }
            }
        } else {
            stats.services.qdrant = `Error (${collectionsRes.status})`;
        }
    } catch (err) {
        stats.services.qdrant = `Unreachable: ${(err as Error).message}`;
    }

    // 2. Redis Health
    try {
        const redis = getRedis();
        const info = await redis.ping();
        stats.services.redis = info === 'PONG' ? 'OK' : 'FAIL';
    } catch (err) {
        stats.services.redis = `Error: ${(err as Error).message}`;
    }

    // 3. RabbitMQ Health
    try {
        if (rabbitmq && (rabbitmq as any).isReady()) {
            stats.services.rabbitmq = 'OK';
            // Placeholder for actual queue monitoring if management plugin is available
            // In dev, we just check connection.
        } else {
            stats.services.rabbitmq = 'Disconnected';
        }
    } catch {
        stats.services.rabbitmq = 'Error';
    }

    // 4. Ollama Heartbeat
    try {
        const modelsRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (modelsRes.ok) {
            const data = await modelsRes.json();
            const models = data.models.map((m: any) => m.name);
            stats.services.ollama = 'OK';
            stats.models = {
                chat: models.includes(ENV.OLLAMA_CHAT_MODEL) ? 'Available' : 'Missing',
                embed: models.includes(ENV.OLLAMA_EMBED_MODEL) ? 'Available' : 'Missing',
                rerank: models.includes('gemma4-legal:latest') ? 'Available' : 'Missing',
            };
        } else {
            stats.services.ollama = `Error (${modelsRes.status})`;
        }
    } catch (err) {
        stats.services.ollama = `Unreachable: ${(err as Error).message}`;
    }

    // 5. Triton Reranker (PHASE 11)
    try {
        const ready = await isRerankerReady();
        stats.services.triton_reranker = ready ? 'OK' : 'Not Ready';
    } catch {
        stats.services.triton_reranker = 'Unreachable';
    }

    stats.latencyMs = Math.round(performance.now() - start);
    return json(stats);
};
