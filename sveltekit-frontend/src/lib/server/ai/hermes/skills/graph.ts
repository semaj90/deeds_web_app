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
  }
};
