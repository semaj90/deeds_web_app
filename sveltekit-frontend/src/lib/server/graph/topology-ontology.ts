export const DOMAIN_CLUSTERS = [
  'bifrost', 'ace', 'kag', 'engram', 'redis', 'qdrant', 'postgres', 'neo4j', 'duckdb', 'mcp', 'langgraph', 'gpu', 'sveltekit'
] as const;

export type DomainCluster = typeof DOMAIN_CLUSTERS[number];

export const TOPOLOGY_CLASSES = [
  'high_fan_in',
  'cache_heavy',
  'route_service_schema_chain',
  'mcp_tool_neighborhood',
  'retrieval_fallback_chain',
  'dynamic_import_island',
  'test_coverage_island'
] as const;

export type TopologyClass = typeof TOPOLOGY_CLASSES[number];

// Helper functions for categorization can be added here
