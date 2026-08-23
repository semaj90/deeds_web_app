// =============================================================================
// src/lib/server/cache/timeline-scorer.ts
// =============================================================================
// Handles the unified logic for storing and retrieving timeline-based evidence scoring.
// This pattern is crucial for tracking temporal dependencies in model training/validation.
//
// Key: A combination of file ID and source/context hash, often derived from the timeline's context.
// Value: A structured object containing various temporal metrics (e.g., {early_confidence: 0.8, late_confidence: 0.9, temporal_drift: 0.85}).
// TTL: Depends on the data, but 7 days is a safe default for temporal analysis.
export class TimelineScorer {
    private static readonly KEY_PREFIX = 'timeline:evidence';
    private static readonly TTL_SECONDS = 7 * 24 * 3600; // 7 Days
    private static readonly CACHE_NAME = 'timeline_evidence_cache';

    /**
     * Constructs the fully qualified key for a given source and context.
     * @param {string} fileId - The unique identifier for the source or dataset.
     * @param {string} contextHash - A hash derived from the context or model run.
     * @returns {string} The full Redis key.
     */
    public static buildKey(fileId: string, contextHash: string): string {
        return `${TimelineScorer.KEY_PREFIX}:${fileId}`;
    }

    /**
     * Gets the timeline score object from the cache, handling deserialization.
     * @param {string} key - The full, constructed cache key.
     * @param {RedisClient} client - The connected Redis client.
     * @returns {Promise<{early: number, late: number, temporal_drift: number} | null>} The retrieved score object.
     */
    public static async getScore(key: string, client: RedisClient): Promise<{early: number, late: number, temporal_drift: number} | null> {
        console.log(`[Cache]: Attempting to retrieve timeline evidence score from key: ${key}`);
        const rawData = await client.get(key);

        if (!rawData) {
            return null;
        }

        try {
            const jsonString = rawData.toString();
            const score: { early: number, late: number, temporal_drift: number } = JSON.parse(jsonString);
            return score;
        } catch (e) {
            console.error(`[Cache Error]: Failed to deserialize timeline score for key ${key}. Data was: ${rawData.toString().substring(0, 50)}...`);
            return null;
        }
    }

    /**
     * Sets the timeline score object in the cache, handling serialization.
     * @param {string} key - The fully constructed cache key.
     * @param {{early: number, late: number, temporal_drift: number}} score - The score object to store.
     * @param {RedisClient} client - The connected Redis client.
     * @returns {Promise<void>}
     */
    public static async setScore(key: string, score: { early: number, late: number, temporal_drift: number }, client: RedisClient): Promise<void> {
        // Serialize score object
        const dataToStore = JSON.stringify(score);

        // Use SETEX or SET with EX to manage TTL
        await client.set(key, dataToStore, 'EX', TimelineScorer.TTL_SECONDS.toString());
        console.log(`[Cache]: Successfully set timeline evidence cache key: ${key} with TTL ${TimelineScorer.TTL_SECONDS}s.`);
    }
}
</file_content>
<task_progress>
- [x] Analyze provided Validation Workflow document structure
- [x] Identify relevant existing code/config files within the repo structure
- [x] Propose a structured plan for validating the workflow against the codebase
- [x] Start implementation: Consolidate Redis Caching Utilities (Day 1)
- [x] Implement: Create shared cache API and Embedding Cache logic (Day 1)
- [x] Finalize: IntegrateEmbeddingCache into CacheManager dispatch logic (Day 1)
- [x] Update: Register Authority Scoring Cache in cache-config.ts (Day 1)
- [x] Finalize: Implement AuthorityScorer dispatch logic in CacheManager (Day 1)
- [x] Create: timeline-scorer.ts (Implementation)
- [ ] Update: Register TimelineScorer Cache in cache-config.ts
- [ ] Finalize: Implement TimelineScorer dispatch logic in CacheManager (Day 2)
</task_progress>
</write_to_file>