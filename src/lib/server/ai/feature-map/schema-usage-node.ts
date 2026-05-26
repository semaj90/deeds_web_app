/**
 * @fileoverview Node responsible for analyzing schema and usage to build metadata context.
 * This node utilizes db.table_inspect and trace.kag_search to understand JSONB usage.
 */
import { db, schemaInspect } from '@/lib/server/db/client';
import { traceKagSearch } from '@/lib/server/utils/trace-kag-search';

/**
 * Processes the schema and usage context to build feature map references.
 * @param {FeatureMappingState} state - The current state object.
 * @returns {Promise<FeatureMappingState>} The state updated with schema and graph references.
 */
export async function schemaUsageNode(state) {
    console.log('[SchemaNode] Starting schema and usage analysis...');
    
    // 1. Inspect core tables for JSONB usage
    const schemaData = await schemaInspect('user_profiles', 'metadata_jsonb_field'); // Example table/field
    
    // 2. Search code for usage sites referencing the schema
    const usageHits = await traceKagSearch('jsonb metadata read/write', state.rootDir);

    // 3. Build graph relationships based on findings
    const graphRefs = buildGraphRelationships(usageHits, schemaData);

    return {
        ...state,
        schemaRefs: [...(state.schemaRefs || []), ...schemaData],
        graphRefs: graphRefs,
    };
}

/**
 * Helper to build graph relationships from usage hits.
 * @param {Array<object>} usageHits - Results from traceKagSearch.
 * @param {object} schemaData - Results from schemaInspect.
 * @returns {Array<{source: string, target: string, relation: string}>} Array of graph references.
 */
function buildGraphRelationships(usageHits, schemaData) {
    // Logic to determine relationships (e.g., service A calls function B, which touches JSONB field X)
    console.log('[SchemaNode] Building graph relationships...');
    return [{
        source: 'service_call',
        target: 'user_profiles',
        relation: 'reads_metadata'
    }];
}