/**
 * @fileoverview Node responsible for analyzing file content for usage patterns related to JSONB metadata.
 * This simulates deep semantic analysis of metadata usage across the codebase.
 */
import { traceKagSearch } from '@/lib/server/utils/trace-kag-search';

/**
 * Analyzes file contents to detect usage patterns of JSONB metadata.
 * @param {FeatureMappingState} state - The current state object.
 * @returns {Promise<FeatureMappingState>} The state updated with usage hits.
 */
export async function metadataDetectionNode(state) {
    console.log('[MetaNode] Starting metadata usage detection...');
    const { runId, rootDir, files } = state;

    const usageHits = [];
    for (const file of files) {
        // Simulate deep AST/Semantic analysis here
        // In reality, this would call a specialized analyzer to look for:
        // 1. Direct usage of db.select().where('metadata_column', 'jsonb_field')
        // 2. Usage of custom serialization helpers that handle JSONB types.
        
        const usage = await traceKagSearch(`JSONB usage in ${file}`, rootDir);
        
        if (usage && usage.hits.length > 0) {
            usageHits.push({
                path: file,
                usages: usage.hits,
                analysis: `Found ${usage.hits.length} instances of JSONB metadata usage.`,
                source: 'MetadataAnalyzer'
            });
        }
    }

    return {
        ...state,
        usageHits: usageHits,
    };
}