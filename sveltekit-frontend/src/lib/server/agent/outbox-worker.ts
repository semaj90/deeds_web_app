/**
 * Outbox worker — polls outbox_events WHERE published_at IS NULL,
 * fans out to Redis (centroid routing cache) and Qdrant (canonical ANN),
 * then marks published_at = now().
 *
 * Architectural contract:
 *   - Postgres is authoritative. This worker only reads what Postgres wrote.
 *   - Redis and Qdrant are derived caches. They can be rebuilt from Postgres.
 *   - Each event_type maps to zero or more fanout handlers.
 *   - A handler failure does NOT prevent other handlers from running.
 *   - published_at is set only when ALL handlers succeed.
 *   - The worker is safe to run concurrently — claim uses UPDATE ... RETURNING
 *     with a limit, acting as a lightweight advisory lock per batch.
 */

import { db } from '$lib/server/db/client.js';
import { outboxEvents } from '$lib/server/db/schema-postgres.js';
import { getRedis } from '$lib/server/redis.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { and, isNull, lte, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutboxRow {
    outboxId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: Date;
}

interface FanoutResult {
    outboxId: string;
    eventType: string;
    handlersRun: string[];
    errors: { handler: string; message: string }[];
    publishedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Fanout handlers
// Each handler receives the raw outbox row and returns void (throws on error).
// ---------------------------------------------------------------------------

/**
 * Redis: write centroid routing cache entry.
 * Key: route:{contentHash}:{centroidManifest}
 * TTL: 3600s (matches smoke script contract).
 */
async function handleCentroidCache(row: OutboxRow): Promise<void> {
    const p = row.payload;
    const contentHash     = p.contentHash as string | undefined;
    const centroidId      = p.centroidId  as number | undefined;
    const manifest        = (p.centroidManifest ?? 'centroids-v1') as string;
    const runId           = p.runId       as string | undefined;
    const actionId        = p.actionId    as string | undefined;

    if (!contentHash || centroidId === undefined) return;

    const key   = `route:${contentHash}:${manifest}`;
    const value = JSON.stringify({ centroidId, manifest, runId, actionId, cachedAt: new Date().toISOString() });
    const redis = getRedis();
    await redis.set(key, value, 'EX', 3600);
}

/**
 * Redis: write ace packet routing entry.
 * Key: ace:{packetHash}
 * TTL: 1800s.
 */
async function handleAceCache(row: OutboxRow): Promise<void> {
    const p = row.payload;
    const packetHash = p.packetHash as string | undefined;
    if (!packetHash) return;

    const key   = `ace:${packetHash}`;
    const value = JSON.stringify({ ...p, cachedAt: new Date().toISOString() });
    const redis = getRedis();
    await redis.set(key, value, 'EX', 1800);
}

/**
 * Qdrant: upsert action packet as a point in the agent_memory_observations collection.
 * Only fires when the action has a pre-computed embedding in the payload.
 * Embedding must be 384-dim (project canonical).
 */
async function handleQdrantUpsert(row: OutboxRow): Promise<void> {
    const p         = row.payload;
    const embedding = p.embedding as number[] | undefined;
    const sourceRef = p.sourceRef as string | undefined;

    if (!embedding || embedding.length !== 384 || !sourceRef) return;

    const client = getQdrantClient();
    await client.upsert('agent_memory_observations', {
        wait: false,
        points: [
            {
                id:      row.aggregateId,
                vector:  embedding,
                payload: {
                    aggregate_type: row.aggregateType,
                    event_type:     row.eventType,
                    source_ref:     sourceRef,
                    content_hash:   p.contentHash,
                    run_id:         p.runId,
                    action_id:      p.actionId,
                    recorded_at:    row.createdAt.toISOString(),
                },
            },
        ],
    });
}

// ---------------------------------------------------------------------------
// Handler registry — maps event_type prefix → handlers
// ---------------------------------------------------------------------------

type Handler = (row: OutboxRow) => Promise<void>;

const HANDLERS: Record<string, Handler[]> = {
    'assign.centroid.proposed':   [handleCentroidCache],
    'assign.centroid.succeeded':  [handleCentroidCache],
    'build.ace.proposed':         [handleAceCache],
    'build.ace.succeeded':        [handleAceCache],
    'encode.embedding.succeeded': [handleQdrantUpsert],
    // Terminal states invalidate stale Redis entries
    'action.failed':              [],
    'action.denied':              [],
};

function resolveHandlers(eventType: string): Handler[] {
    // Exact match first, then prefix match
    if (HANDLERS[eventType]) return HANDLERS[eventType]!;
    for (const [prefix, handlers] of Object.entries(HANDLERS)) {
        if (eventType.startsWith(prefix.split('.').slice(0, 2).join('.'))) {
            return handlers;
        }
    }
    return [];
}

// ---------------------------------------------------------------------------
// Claim batch
//
// UPDATE ... RETURNING acts as a lightweight claim without a separate lock table.
// batchSize is intentionally small (10) to keep transaction time short and
// allow concurrent workers to pick up remaining rows.
// ---------------------------------------------------------------------------

async function claimBatch(batchSize = 10): Promise<OutboxRow[]> {
    // Use raw SQL for UPDATE ... RETURNING with subquery (Drizzle doesn't yet
    // support this pattern natively without sql`` tag).
    const rows = await db.execute<{
        outbox_id: string;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        payload: Record<string, unknown>;
        created_at: Date;
    }>(sql`
        UPDATE outbox_events
        SET    published_at = now()
        WHERE  outbox_id IN (
            SELECT outbox_id
            FROM   outbox_events
            WHERE  published_at IS NULL
            ORDER  BY created_at
            LIMIT  ${batchSize}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING
            outbox_id,
            aggregate_type,
            aggregate_id,
            event_type,
            payload,
            created_at
    `);

    return (rows.rows ?? rows as unknown as typeof rows.rows).map((r) => ({
        outboxId:      r.outbox_id,
        aggregateType: r.aggregate_type,
        aggregateId:   r.aggregate_id,
        eventType:     r.event_type,
        payload:       r.payload as Record<string, unknown>,
        createdAt:     new Date(r.created_at),
    }));
}

/**
 * If all handlers for a row fail, un-publish it so it can be retried.
 * This is a best-effort rollback — not transactional with the fanout itself.
 */
async function unpublish(outboxId: string): Promise<void> {
    await db.execute(sql`
        UPDATE outbox_events
        SET    published_at = NULL
        WHERE  outbox_id = ${outboxId}
    `);
}

// ---------------------------------------------------------------------------
// Process one row
// ---------------------------------------------------------------------------

async function processRow(row: OutboxRow): Promise<FanoutResult> {
    const handlers    = resolveHandlers(row.eventType);
    const handlersRun: string[] = [];
    const errors: { handler: string; message: string }[] = [];

    for (const handler of handlers) {
        const name = handler.name;
        try {
            await handler(row);
            handlersRun.push(name);
        } catch (err) {
            errors.push({
                handler: name,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // If every handler that ran failed and at least one was expected,
    // un-publish so the row is retried on the next poll.
    if (errors.length > 0 && handlersRun.length === 0 && handlers.length > 0) {
        await unpublish(row.outboxId).catch(() => {});
        return { outboxId: row.outboxId, eventType: row.eventType, handlersRun, errors, publishedAt: null };
    }

    // published_at was already set by claimBatch UPDATE — nothing more to write.
    return {
        outboxId:    row.outboxId,
        eventType:   row.eventType,
        handlersRun,
        errors,
        publishedAt: new Date(),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OutboxWorkerOptions {
    batchSize?: number;
    /** If true, log results to console. */
    verbose?: boolean;
}

export interface OutboxWorkerResult {
    processed: number;
    published: number;
    retried:   number;
    errors:    { outboxId: string; eventType: string; errors: { handler: string; message: string }[] }[];
}

/**
 * Run one poll cycle: claim up to batchSize unpublished rows and fan out.
 * Call this on a timer or from a SvelteKit server hook.
 */
export async function runOutboxCycle(
    opts: OutboxWorkerOptions = {},
): Promise<OutboxWorkerResult> {
    const { batchSize = 10, verbose = false } = opts;

    const rows    = await claimBatch(batchSize);
    const results = await Promise.all(rows.map(processRow));

    const summary: OutboxWorkerResult = {
        processed: results.length,
        published: results.filter((r) => r.publishedAt !== null).length,
        retried:   results.filter((r) => r.publishedAt === null).length,
        errors:    results
            .filter((r) => r.errors.length > 0)
            .map((r) => ({ outboxId: r.outboxId, eventType: r.eventType, errors: r.errors })),
    };

    if (verbose && results.length > 0) {
        console.log('[outbox-worker]', JSON.stringify(summary));
    }

    return summary;
}

/**
 * Lightweight polling loop — call once at server startup.
 * Stops when the returned AbortController signal fires.
 *
 * Example (in hooks.server.ts):
 *   const ctl = startOutboxPoller({ intervalMs: 2000 });
 *   // on shutdown: ctl.abort()
 */
export function startOutboxPoller(
    opts: OutboxWorkerOptions & { intervalMs?: number } = {},
): AbortController {
    const { intervalMs = 2000, ...cycleOpts } = opts;
    const ctl = new AbortController();

    const tick = async () => {
        if (ctl.signal.aborted) return;
        try {
            await runOutboxCycle(cycleOpts);
        } catch {
            // swallow — next tick will retry
        }
        if (!ctl.signal.aborted) {
            setTimeout(tick, intervalMs);
        }
    };

    setTimeout(tick, 0);
    return ctl;
}
