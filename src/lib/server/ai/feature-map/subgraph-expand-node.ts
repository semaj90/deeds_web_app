/**
 * @fileoverview Node responsible for deep-diving into graph structures to find related components.
 * This node expands the context graph beyond immediate dependencies.
 */
import { graphExpandNeighborhood } from '@/lib/server/utils/graph-utils';

/**
 * Expands the context graph by exploring neighbors of currently detected components.
 * @param {FeatureMappingState} state - The current state object.
 * @returns {Promise<FeatureMappingState>} The state updated with expanded graph references.
 */
export async function subgraphExpandNode(state) {
    console.log('[SubgraphNode] Starting subgraph expansion...');
    const graphRefs = state.graphRefs || [];
    
    // Use the existing graph expansion tool to simulate deep traversal
    const expandedGraph = await graphExpandNeighborhood(graphRefs, 2);

    return {
        ...state,
        graphRefs: [...graphRefs, ...expandedGraph],
    };
}