import { RedisClient } from '@redis/client';
import { injectEngramPacket } from 'sveltekit-frontend/src/lib/server/db/schema-engram.ts';
import { RedisClientType } from 'redis';

// Assuming a singleton Redis connection pool is available via a service module
const redisClient: RedisClientType = { /* ... connection setup ... */ };

/**
 * @desc Injects a structured, context-aware EngramPacket into the cache layer.
 * This simulates the core MCP injection logic, prioritizing Redis writes for speed.
 * @param {string} runId - The unique ID for the current context run.
 * @param {object} packetData - The data containing summary, contextBlob, and metadata.
 * @returns {Promise<boolean>} True if injection was successful.
 */
export async function engram_ace_packet_inject(runId: string, packetData: { summary: string, contextBlob: string, dimensions: number, sourceFile?: string }): Promise<boolean> {
    try {
        // 1. Write to Redis (Redis-first approach for <10ms latency)
        const redisKey = `ace:packet:${runId}`;
        await redisClient.set(redisKey, JSON.stringify(packetData));

        // 2. Persist to Drizzle Schema (Asynchronous sync job)
        // This call is intentionally fire-and-forget from the MCP perspective
        await db.insert(injectEngramPacket).values({
            id: runId,
            runId: runId,
            summary: packetData.summary,
            contextBlob: packetData.contextBlob,
            embeddingDimensions: packetData.dimensions,
            sourceFile: packetData.sourceFile,
            callingAgent: 'engram-mcp-injector'
        }).onConflictDoNothing();

        return true;
    } catch (error) {
        console.error("Error during engram injection:", error);
        return false;
    }
}