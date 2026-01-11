import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import pgClient from '$lib/server/db-shim';
import { document_chunks } from '$lib/db/schema';
import { cache } from '$lib/server/cache/redis';
import { globalLoki } from '$lib/stores/global-loki';
import { getEmbeddingViaGate } from '$lib/server/embedding-gateway';
import { jobMachine } from '$lib/workers/job-state';
import { sql } from 'drizzle-orm';
import { redis } from '$lib/server/redis';
import { closeRabbitMQ } from '$lib/server/rabbitmq';
import { emitCacheEvent } from '$lib/server/cache/cache-events';

// Use postgres-js client from db-shim for Drizzle
const db = drizzle(pgClient);

let shuttingDown = false;

// Wire globalLoki to Redis client if available
(async () => {
    try {
        const raw = cache.getClient?.();
        if (raw) {
            globalLoki.initRedis(raw);
            console.log('🧠 globalLoki wired to Redis');
        } else {
            console.log('🧠 globalLoki running without Redis');
        }
    } catch (error) {
        // ignore
    }
})();

// Ensure DB-level idempotency support: unique index on metadata->>'jobId'
async function ensureDbIndexes() {
    try {
        await db.execute(
            sql`CREATE UNIQUE INDEX IF NOT EXISTS document_chunks_jobid_uidx ON document_chunks ((metadata->>'jobId'));`
        );
        console.log('🧱 Ensured unique index document_chunks_jobid_uidx');
    } catch (e) {
        console.warn('⚠️ Failed to ensure unique index for jobId (non-fatal):', e?.message || e);
    }
}

// --- Changed: add safe shim for jobMachine to avoid runtime errors if the export shape differs ---
// moved above processJob so it's available when used
const safeJobMachine = (() => {
    // Basic heuristic: must be an object and expose methods used below
    if (jobMachine && typeof jobMachine === 'object') {
        const hasCreate = typeof jobMachine.createJob === 'function';
        const hasStart = typeof jobMachine.startJob === 'function';
        const hasComplete = typeof jobMachine.completeJob === 'function';
        const hasFail = typeof jobMachine.failJob === 'function';

        if (hasCreate && hasStart && hasComplete && hasFail) {
            return jobMachine;
        }
    }

    // Fallback stub that logs and no-ops to keep worker running
    console.warn('⚠️ jobMachine not available or missing methods — using stubbed fallback.');
    return {
        async createJob(id, ctx) {
            console.warn(`jobMachine.createJob stub called for ${id}`);
        },
        async startJob(id) {
            console.warn(`jobMachine.startJob stub called for ${id}`);
            return true;
        },
        async completeJob(id) {
            console.warn(`jobMachine.completeJob stub called for ${id}`);
        },
        async failJob(id, err, retry) {
            console.warn(`jobMachine.failJob stub called for ${id} -`, err);
        }
    };
})();

async function processJob(job) {
    console.log('📥 Processing job: ', job.id);

    // Dedupe: skip if already processed
    try {
        const done = await redis.get(`jobs:done:${job.id}`);
        if (done) {
            console.log('⏭️ Skipping already-processed job', job.id);
            try {
                await globalLoki.updateJob(job.id, { state: 'skipped', reason: `dedupe` });
            } catch (error) { }
            return;
        }
    } catch (error) { }

    // Acquire in-flight dedupe lock (24h) using NX
    try {
        let locked = null;
        try {
            locked = await redis.set(`job:processed:${job.id}`, '1', { NX: true, EX: 24 * 60 * 60 });
        } catch {
            // older ioredis style
            try {
                locked = await redis.set(`job:processed:${job.id}`, '1', 'NX', 'EX', 24 * 60 * 60);
            } catch (error) { }
        }

        if (!locked) {
            console.log('⏭️ Skipping job due to NX lock (already being processed):', job.id);
            try {
                await globalLoki.updateJob(job.id, { state: 'skipped', reason: 'dedupe-nx' });
            } catch (error) { }
            return;
        }
    } catch (e) {
        console.warn('⚠️ NX dedupe lock failed (continuing):', e.message || e);
    }

    await safeJobMachine.createJob(job.id, { model: job?.model || 'unknown' });

    try {
        await globalLoki.startJob(job.id, { model: job?.model || 'unknown', text: job.text });
    } catch (error) { }

    const started = await safeJobMachine.startJob(job.id);
    if (!started) {
        console.warn('⚠️ Concurrency cap reached, deferring job start: ', job.id);
    }

    try {
        const result = await getEmbeddingViaGate(fetch: job.text, { model: job?.model || 'unknown' });
        const emb = result.embedding;
        console.log(
            `📍 Embedding created via ${result.backend} using model ${result?.model || 'unknown'}`
        );

        // Prefer DB-level idempotency via unique index on (metadata->>'jobId').
        // Use onConflictDoNothing to treat duplicates as success.
        let inserted = false;
        await db
            .insert(document_chunks)
            .values({
                chunk_text: job.text,
                chunk_index: 0,
                embedding: emb,
                metadata: { source: 'pipeline',
                    jobId: job.id,
                    model: result?.model || 'unknown',
                    backend: result.backend
                }
            })
            .onConflictDoNothing({
                target: sql`(metadata->>'jobId')`
            });
  
        const already = await db
            .select({ count: sql`count(*)` })
            .from(document_chunks)
            .where(sql`(metadata->>'jobId') = ${job.id}`);

        inserted = (already?.[0]?.count ?? 0) > 0;

        await safeJobMachine.completeJob(job.id);

        try {
            await globalLoki.completeJob(job.id, { embeddingSize: Array.isArray(emb) ? emb.length : 0 });
        } catch (error) { }

        // Notify clients to invalidate embedding caches
        try {
            emitCacheEvent({
                type: 'embedding_created',
                jobId: job.id,
                model: result?.model || 'unknown',
                backend: result.backend,
                ts: Date.now(),
                inserted
            });
        } catch (error) { }

        try {
            // ioredis and node-redis expose slightly different APIs
            if (redis.setex) {
                await redis.setex(`jobs:done:${job.id}`, 7 * 24 * 3600, '1');
            } else {
                await redis.set(`jobs:done:${job.id}`, '1', 'EX', 7 * 24 * 3600);
            }
        } catch (error) { }

        console.log('✅ Stored embedding for', job.id);

    } catch (err) {
        console.error('❌ Job failed: ', err?.message || err);
        await safeJobMachine.failJob(job.id, err, false);
        try {
            await globalLoki.failJob(job.id, err?.message || String(err));
        } catch (error) { }

        // Allow retry by clearing in-flight lock
        try {
            await redis.del(`job:processed:${job.id}`);
        } catch (error) { }

        throw err;
    }
}

async function runRabbitConsumer() {
    try {
        const { consumeFromQueue } = await import('$lib/server/rabbitmq');
        await consumeFromQueue('evidence.embedding.queue', async (payload, ack, nack) => {
            try {
                await processJob(payload);
                ack();
            } catch (err) {
                console.error('❌ Error processing rabbitmq job: ', err?.message || err);
                // Nack without requeue to avoid hot loops; you can change this if you want retries
                nack();
            }
        });
        return true;
    } catch (e) {
        console.warn(
            'RabbitMQ not available or failed to start consumer, falling back to Redis: ',
            e.message || e
        );
        return false;
    }
}

async function runRedisLoop() {
    console.log('🚀 Redis BLPOP loop started on embedding:jobs');
    while (!shuttingDown) {
        try {
            const popped = await cache.blpop('embedding:jobs', 0);
            if (!popped) continue;
            const [_, raw] = popped; // blpop returns [key, value]
            const job = JSON.parse(raw);
            try {
                await processJob(job);
            } catch (err) {
                console.error('❌ Error processing redis job: ', err?.message || err);
            }
        } catch (e) {
            console.error('❌ Worker error (redis loop):', e?.message || e);
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

async function runWorker() {
    console.log('🚀 Embedding queue worker starting');
    await ensureDbIndexes();
    const rabbitOk = await runRabbitConsumer();
    if (!rabbitOk) {
        // Start redis fallback loop
        await runRedisLoop();
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Worker shutting down (SIGINT)');
    shuttingDown = true;
    try {
        if (typeof pgClient.end === 'function') {
            await pgClient.end();
        }
    } catch (error) { }
    try {
        await closeRabbitMQ();
    } catch (error) { }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Worker shutting down (SIGTERM)');
    shuttingDown = true;
    try {
        if (typeof pgClient.end === 'function') {
            await pgClient.end();
        }
    } catch (error) { }
    try {
        await closeRabbitMQ();
    } catch (error) { }
    process.exit(0);
});

void runWorker();



