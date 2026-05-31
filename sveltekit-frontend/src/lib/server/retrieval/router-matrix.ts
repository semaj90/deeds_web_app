/**
 * @fileoverview Router Matrix Definition
 * @module sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts
 * @description Defines the default, hard-coded routing matrix for the QueryRouter4x4 module.
 */

export type SignalType = 'lexical_exact' | 'semantic_concept' | 'graph_dependency' | 'legal_case_context' | 'code_symbol_context' | 'error_trace_context' | 'task_or_feature_context' | 'evidence_source_ref_context';

export type LaneWeight = {
    weight: number;
    lane: string;
};

// The core, non-negotiable routing map.
export const DEFAULT_ROUTER_MATRIX: Record<SignalType, Record<string, LaneWeight>> = {
    // lexical_exact:
    lexical_exact: {
        postgres_jsonb_exact: { weight: 0.8, lane: 'postgres_jsonb_exact' },
        parent_atlas_join: { weight: 0.5, lane: 'parent_atlas_join' },
        qdrant_semantic: { weight: 0.2, lane: 'qdrant_semantic' },
    },
    
    // semantic_concept:
    semantic_concept: {
        qdrant_semantic: { weight: 0.9, lane: 'qdrant_semantic' },
        gemma4_rerank: { weight: 0.7, lane: 'gemma4_rerank' },
        parent_atlas_join: { weight: 0.5, lane: 'parent_atlas_join' },
    },
    
    // graph_dependency:
    graph_dependency: {
        neo4j_graph: { weight: 0.95, lane: 'neo4j_graph' },
        parent_atlas_join: { weight: 0.8, lane: 'parent_atlas_join' },
        qdrant_semantic: { weight: 0.4, lane: 'qdrant_semantic' },
    },
    
    // legal_case_context:
    legal_case_context: {
        ace_nes_packet: { weight: 0.9, lane: 'ace_nes_packet' },
        parent_atlas_join: { weight: 0.7, lane: 'parent_atlas_join' },
        qdrant_semantic: { weight: 0.5, lane: 'qdrant_semantic' },
    },
    
    // code_symbol_context:
    code_symbol_context: {
        parent_atlas_join: { weight: 0.9, lane: 'parent_atlas_join' },
        redis_hot_cache: { weight: 0.7, lane: 'redis_hot_cache' },
        qdrant_semantic: { weight: 0.5, lane: 'qdrant_semantic' },
    },
    
    // error_trace_context:
    error_trace_context: {
        schema_audit: { weight: 1.0, lane: 'schema_audit' },
        parent_atlas_join: { weight: 0.8, lane: 'parent_atlas_join' },
        // ... other error specific mappings
    },
    
    // task_or_feature_context:
    task_or_feature_context: {
        parent_atlas_join: { weight: 1.0, lane: 'parent_atlas_join' },
        redis_hot_cache: { weight: 0.9, lane: 'redis_hot_cache' },
        qdrant_semantic: { weight: 0.6, lane: 'qdrant_semantic' },
    },
    
    // evidence_source_ref_context:
    evidence_source_ref_context: {
        postgres_jsonb_exact: { weight: 0.9, lane: 'postgres_jsonb_exact' },
        parent_atlas_join: { weight: 0.8, lane: 'parent_atlas_join' },
        qdrant_semantic: { weight: 0.5, lane: 'qdrant_semantic' },
    }
};

// Helper function to get the matrix for a given signal
export function getSignalMatrix(signal: SignalType): { [key: string]: LaneWeight } | null {
    return DEFAULT_ROUTER_MATRIX[signal] || null;
}
