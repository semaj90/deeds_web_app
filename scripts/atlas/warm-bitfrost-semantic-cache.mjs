/**
 * @fileoverview Populates the L2 semantic cache (Bitfrost) with fresh data chunks,
 * generating necessary embeddings and tagging them with the current global graph version.
 * This must be run after a major schema change or significant data source update.
 */

import { getGraphVersion } from './version_manager'; // Assuming this path
// Placeholder for actual clients
const REDIS_CLIENT = require('redis'); 
const BIFROST_CLIENT = require('./bifrost_client'); 
const EMBEDDING_SERVICE = require('./embedding_service');

/**
 * @typedef {object} SourceChunk
 * @property {string} text - The raw text content of the chunk.
 * @property {string} sourceRef - The file path or unique identifier for the chunk's origin.
 * @property {string} conceptId - The primary concept ID associated with this data.
 */

/**
 * Processes a list of SourceChunks, generates embeddings, and writes them to Bitfrost.
 * This function is responsible for populating the L2 cache layer.
 * @param {SourceChunk[]} chunks - Array of source data chunks.
 * @param {RedisClient} redisClient - Connected Redis client instance.
 */
export async function warmBitfrostSemanticCache(chunks, redisClient) {
    console.log("--- Starting Bitfrost Semantic Cache Warming ---");

    // 1. Get the current global version to tag all new data points
    const graphVersion = await getGraphVersion(redisClient);
    console.log(`[INFO] Using Graph Version: ${graphVersion} for cache population.`);

    if (!chunks || chunks.length === 0) {
        console.warn("[WARN] No source chunks provided to warm the Bitfrost cache.");
        return;
    }

    // 2. Generate embeddings for all chunk texts
    const textsToEmbed = chunks.map(c => c.text);
    console.log(`[STEP 1/3] Generating ${textsToEmbed.length} embeddings...`);
    const embeddings = await EMBEDDING_SERVICE.embed(textsToEmbed);

    // 3. Write to Bitfrost (L2 Cache)
    console.log("[STEP 2/3] Writing chunks and metadata to Bitfrost...");
    await BIFROST_CLIENT.upsert({
        embeddings: embeddings,
        metadata: chunks.map(c => ({
            sourceRef: c.sourceRef,
            conceptId: c.conceptId,
            graphVersion: graphVersion, // Crucial for dependency tracking
            // Add other metadata like chunk_id, etc.
        })),
        key: "semantic_cache"
    });

    console.log("[STEP 3/3] Updating Redis LRU to point to the new Bitfrost cache...");
    await redisClient.set("atlas:lru:bitfrost_cache", JSON.stringify({
        version: graphVersion,
        timestamp: Date.now()
    }));

    console.log("[SUCCESS] Bitfrost semantic cache warmed and versioned.");
}