import type { SkillRecipe } from './registry.js';

export const GRAPH_SKILLS: Record<string, SkillRecipe> = {
  deep_import_graph_expand: {
    id: 'deep_import_graph_expand',
    family: 'Graph',
    description: 'Expand codebase import graph using Redis cache',
    tools: [{ name: 'search:redis' }]
  },
  neo4j_expand_neighborhood: {
    id: 'neo4j_expand_neighborhood',
    family: 'Graph',
    description: 'Neo4j graph expansion around chunks, clusters, evidence, cases, claims, entities. Returns compact graph JSON with triples. Redis-cached (10 min TTL).',
    tools: [{
      name: 'graph:neo4j_cached',
      args: (input) => ({
        filePaths: input.filePaths ?? [],
        maxHops:   input.maxHops  ?? 2,
        limit:     input.limit    ?? 20,
        ttlSec:    input.ttlSec   ?? 600,
      }),
    }]
  },
  find_missing_edges: {
    id: 'find_missing_edges',
    family: 'Graph',
    description: 'Detect missing relationships in the knowledge graph',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  export_graph_jsonl: {
    id: 'export_graph_jsonl',
    family: 'Graph',
    description: 'Export graph nodes/relationships to Neo4j JSONL',
    tools: [{ name: 'graph:export_jsonl' }]
  },
  materialize_cluster_edges: {
    id: 'materialize_cluster_edges',
    family: 'Graph',
    description: 'Write edges from CouchDB/Redis to Neo4j',
    tools: [{ name: 'graph:materialize' }]
  },
  graph_health_check: {
    id: 'graph_health_check',
    family: 'Graph',
    description: 'Verify connectivity and consistency of Neo4j/CouchDB',
    tools: [{ name: 'diagnostics:health' }]
  },
  visualize_entity_map: {
    id: 'visualize_entity_map',
    family: 'Graph',
    description: 'Generate visualization-ready JSON for an entity neighborhood',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  shortest_path_search: {
    id: 'shortest_path_search',
    family: 'Graph',
    description: 'Find the shortest connection path between two graph entities',
    tools: [{ name: 'search:graph' }]
  },
  cluster_cohesion_audit: {
    id: 'cluster_cohesion_audit',
    family: 'Graph',
    description: 'Audit the relationship strength within a topological cluster',
    tools: [{ name: 'search:couchdb' }, { name: 'search:graph' }]
  },
  detect_orphan_nodes: {
    id: 'detect_orphan_nodes',
    family: 'Graph',
    description: 'Find nodes in the knowledge graph with no active relationships',
    tools: [{ name: 'search:graph' }]
  },
  prune_stale_edges: {
    id: 'prune_stale_edges',
    family: 'Graph',
    description: 'Identify and flag edges pointing to non-existent files or deleted evidence',
    tools: [{ name: 'search:graph' }, { name: 'shell:run' }]
  },
  batch_triple_extraction: {
    id: 'batch_triple_extraction',
    family: 'Graph',
    description: 'Extract semantic triples from multiple documents and queue for materialization',
    tools: [{ name: 'batch:run', args: (input) => ({ tool: 'extract:metadata', items: input.docs }) }]
  },
  identify_influence_nodes: {
    id: 'identify_influence_nodes',
    family: 'Graph',
    description: 'Calculate node centrality to identify critical codebase or legal entities',
    tools: [{ name: 'search:graph' }]
  },
  graph_schema_validator: {
    id: 'graph_schema_validator',
    family: 'Graph',
    description: 'Ensure graph nodes and relationships conform to the Deeds platform schema',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  generate_graph_summary: {
    id: 'generate_graph_summary',
    family: 'Graph',
    description: 'Use LLM to synthesize a narrative description of a graph neighborhood',
    tools: [{ name: 'graph:neo4j_cached' }, { name: 'llm:generate' }]
  },
  discover_community_clusters: {
    id: 'discover_community_clusters',
    family: 'Graph',
    description: 'Execute community detection algorithms to find hidden topical clusters',
    tools: [{ name: 'search:graph' }]
  },
  detect_structural_isomorphisms: {
    id: 'detect_structural_isomorphisms',
    family: 'Graph',
    description: 'Find similar structural patterns across different graph neighborhoods',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  graph_temporal_audit: {
    id: 'graph_temporal_audit',
    family: 'Graph',
    description: 'Analyze how relationships have evolved over time in the knowledge graph',
    tools: [{ name: 'search:sql' }, { name: 'search:graph' }]
  },
  bridge_node_discovery: {
    id: 'bridge_node_discovery',
    family: 'Graph',
    description: 'Identify nodes that act as critical bridges between disparate clusters',
    tools: [{ name: 'search:graph' }]
  },
  graph_density_analysis: {
    id: 'graph_density_analysis',
    family: 'Graph',
    description: 'Measure relationship density to identify underdeveloped knowledge areas',
    tools: [{ name: 'search:graph' }]
  },
  automated_schema_inference: {
    id: 'automated_schema_inference',
    family: 'Graph',
    description: 'Infer potential new node/relationship types based on unstructured data',
    tools: [{ name: 'llm:generate' }, { name: 'search:vector' }]
  },
  entity_resolution_audit: {
    id: 'entity_resolution_audit',
    family: 'Graph',
    description: 'Audit the graph for duplicate entities that require merging',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  knowledge_graph_completeness_score: {
    id: 'knowledge_graph_completeness_score',
    family: 'Graph',
    description: 'Calculate a completeness score for a specific graph domain',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  pathway_feasibility_check: {
    id: 'pathway_feasibility_check',
    family: 'Graph',
    description: 'Verify if a proposed relationship path is logically feasible',
    tools: [{ name: 'llm:generate' }]
  },
  graph_backed_recommendation: {
    id: 'graph_backed_recommendation',
    family: 'Graph',
    description: 'Generate context-aware recommendations based on graph proximity',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  },
  identify_weak_links: {
    id: 'identify_weak_links',
    family: 'Graph',
    description: 'Identify relationships with low evidence support in the graph',
    tools: [{ name: 'search:graph' }, { name: 'llm:generate' }]
  }
};
