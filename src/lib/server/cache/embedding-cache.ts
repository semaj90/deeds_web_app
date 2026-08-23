// =============================================================================
// src/lib/server/cache/embedding-cache.ts
// =============================================================================
// Handles the unified logic for storing and retrieving embedding vectors.
// This pattern consolidates multiple disparate storage mechanisms into one source of truth.
//
// Key: The embedding hash or identifier.
// Value: A serialized vector (e.g., JSON string or ArrayBuffer/Uint8Array representation).
// TTL: Typically 7 days for vectors, as embeddings are derived and stale data is common.
export class EmbeddingCache {
    private static readonly KEY_PREFIX = 'embed:v2';
    private static readonly TTL_SECONDS = 7 * 24 * 3600; // 7 Days
    private static readonly CACHE_NAME = 'embedding_cache';

    /**
     * Constructs the fully qualified key for a given model and embedding identifier.
     * @param {string} modelName - The model used (e.g., 'embeddinggemma:latest').
     * @param {string} identifier - A unique hash or ID derived from the content/source.
     * @returns {string} The full Redis key.
     */
    public static buildKey(modelName: string, identifier: string): string {
        return `${EmbeddingCache.KEY_PREFIX}:${modelName}:${identifier}`;
    }

    /**
     * Gets the embedding vector from the cache, handles serialization/deserialization.
     * @param {string} key - The full, constructed cache key.
     * @param {RedisClient} client - The connected Redis client.
     * @returns {Promise<Float32Array | null>} The retrieved vector.
     */
    public static async getEmbedding(key: string, client: RedisClient): Promise<Float32Array | null> {
        // Implementation relies on client.get() and subsequent deserialization logic
        console.log(`[Cache]: Attempting to retrieve embedding from key: ${key}`);
        const rawData = await client.get(key);

        if (!rawData) {
            return null;
        }

        // Assuming data stored is a JSON string representation of the vector
        // In a real scenario, this would involve deserializing the specific binary/JSON format.
        try {
            const jsonString = rawData.toString();
            // Placeholder: Deserialize logic goes here.
            // For safety, we assume the raw data needs parsing.
            const data = JSON.parse(jsonString);
            return new Float32Array(data.data); // Mocking successful conversion
        } catch (e) {
            console.error(`[Cache Error]: Failed to deserialize embedding for key ${key}. Data was: ${rawData.toString().substring(0, 50)}...`);
            return null;
        }
    }

    /**
     * Sets an embedding vector in the cache, handling serialization.
     * @param {string} key - The fully constructed cache key.
     * @param {Float32Array} vector - The vector data to store.
     * @param {RedisClient} client - The connected Redis client.
     * @returns {Promise<void>}
     */
    public static async setEmbedding(key: string, vector: Float32Array, client: RedisClient): Promise<void> {
        // Serialize vector for storage, ensuring it's JSON-safe.
        const dataToStore = JSON.stringify({ data: Array.from(vector) });

        // Use SETEX or SET with EX to manage TTL
        await client.set(key, dataToStore, 'EX', EmbeddingCache.TTL_SECONDS.toString());
        console.log(`[Cache]: Successfully set embedding cache key: ${key} with TTL ${EmbeddingCache.TTL_SECONDS}s.`);
    }
}

// NOTE: Placeholder for RedisClient type definition
declare class RedisClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ex: string): Promise<void>;
    setex(key: string, ex: string, value: string): Promise<void>;
}