/**
 * @fileoverview LangGraph orchestrator for building a Feature Map from codebase structure and metadata.
 * This graph guides the discovery process, ensuring all relevant code, metadata, and relationships are mapped.
 */
import { FeatureMappingState, FeatureMappingStep } from './types';
import { scanDirectoryNode } from './scan-directory-node';
import { metadataDetectionNode } from './metadata-detection-node';
import { schemaUsageNode } from './schema-usage-node';
import { subgraphExpandNode } from './subgraph-expand-node';
import { rerankNode } from './rerank-node';
import { toonContextNode } from './toon-context-node';
import { writeFeatureIndexNode } from './write-feature-index-node';

/**
 * @description Orchestrates the entire feature mapping workflow using LangGraph principles.
 * @param {FeatureMappingState} initialState - The initial state of the mapping process.
 * @returns {Promise<FeatureMappingState>} The final, updated state after graph traversal.
 */
export async function buildFeatureMapGraph(initialState) {
    let state = { ...initialState };

    // Step 1: Scan Directory
    state = await scanDirectoryNode(state);

    // Step 2: Detect Metadata
    state = await metadataDetectionNode(state);

    // Step 3: Retrieve Schema and Usage (Graph Building)
    state = await schemaUsageNode(state);

    // Step 4: Expand Subgraph (Deep dive on relationships)
    state = await subgraphExpandNode(state);

    // Step 5: Rerank Candidates
    state = await rerankNode(state);

    // Step 6: Build TOON Context
    state = await toonContextNode(state);

    // Step 7: Write Feature Index
    state = await writeFeatureIndexNode(state);

    return state;
}