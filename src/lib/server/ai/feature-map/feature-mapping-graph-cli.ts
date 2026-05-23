/**
 * @fileoverview CLI entry point to run the entire feature mapping graph workflow.
 * This script orchestrates the entire process for end-to-end testing.
 */
import { buildFeatureMapGraph } from '@/lib/server/ai/feature-map/feature-mapping-graph';
import { getFeatureMappingState } from '@/lib/server/ai/feature-map/types';

/**
 * Runs the full feature mapping graph pipeline.
 * @param {string} rootDir - The root directory to analyze.
 * @returns {Promise<string>} A summary of the execution.
 */
export async function runFeatureMappingGraph(rootDir) {
    console.log('--- Starting Feature Mapping Graph Run ---');
    
    // 1. Initialize State
    const initialState = {
        runId: Date.now().toString(),
        rootDir: rootDir,
        files: [],
        detected: [],
        schemaRefs: [],
        graphRefs: [],
        selectedCards: [],
        toonPacket: undefined,
        outputs: {
            featureIndexEntries: [],
            documentAtlasEntries: [],
            cacheTraces: [],
            persistenceSuccess: false
        }
    };

    // 2. Build the graph
    const finalState = await buildFeatureMapGraph(initialState);

    // 3. Log the outcome
    return `Feature Map Graph execution finished. Final State: ${JSON.stringify(finalState.outputs)}`;
}