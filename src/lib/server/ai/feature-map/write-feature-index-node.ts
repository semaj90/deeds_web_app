/**
 * @fileoverview Node responsible for persisting the final feature index and cache traces.
 * This writes the structured data to Postgres and Redis.
 */
import { saveFeatureIndexEntry } from '@/lib/server/db/schema-engram';
import { cacheWriteTrace } from '@/lib/server/utils/cache-utils';

/**
 * Persists the feature index and cache traces based on the final state.
 * @param {FeatureMappingState} state - The current state object.
 * @returns {Promise<FeatureMappingState>} The state updated with persistence confirmations.
 */
export async function writeFeatureIndexNode(state) {
    console.log('[WriteNode] Starting persistence process...');
    let success = true;

    // 1. Write Feature Index Entries to Postgres
    try {
        await saveFeatureIndexEntry(state.featureIndexEntries);
        console.log('[WriteNode] Feature index entries written to Postgres.');
    } catch (e) {
        console.error('[WriteNode] Failed to write feature index:', e);
        success = false;
    }

    // 2. Write Cache Traces to Redis
    if (state.cacheTraces) {
        for (const trace of state.cacheTraces) {
            await cacheWriteTrace(trace);
        }
    }

    return {
        ...state,
        outputs: {
            ...state.outputs,
            persistenceSuccess: success
        }
    };
}