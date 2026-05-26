export const DOMAIN_CLUSTERS = [
  "bifrost",
  "ace",
  "kag",
  "engram",
  "redis",
  "qdrant",
  "postgres",
  "neo4j",
  "duckdb",
  "mcp",
  "langgraph",
  "gpu",
  "sveltekit",
  "documents-atlas",
  "observability"
] as const;

export const TOPOLOGY_CLASSES = [
  "high_fan_in",
  "cache_heavy",
  "route_service_schema_chain",
  "mcp_tool_neighborhood",
  "retrieval_fallback_chain",
  "dynamic_import_island",
  "test_coverage_island",
  "storage_boundary",
  "inference_boundary"
] as const;