import { DOMAIN_CLUSTERS, TOPOLOGY_CLASSES } from './topology-ontology';

/**
 * Calculates the high-level topology and domain clustering summary
 * based on deep graph relations.
 * @param {Array<Object>} relations - The set of graph relations to process.
 * @returns {Object} The structured cluster summary.
 */
export function deriveGraphAndClusters(relations: any[]) {
    const domainClusters: Record<string, any[]> = {};
    const topologyClusters: Record<string, any[]> = {};
    const hotNodes = new Set<string>();
    const cacheHeavyNodes = new Set<string>();
    const dynamicIslands = new Set<string>();
    const domainClustersSets: Record<string, { nodes: Set<string>; edges: Set<string> }> = {};

    // 1. Assign domainCluster and topologyClass to each edge relation
    const clusteredRelations = relations.map(rel => {
        const domain = getDomainFromRelation(rel.from || rel.source || "");
        const topology = getTopologyFromRelation(rel.from || rel.source || "", rel.to || rel.target || "");

        return {
            ...rel,
            domainCluster: domain || "unknown",
            topologyClass: topology || "general"
        };
    });

    // 2. Group and calculate metrics
    for (const rel of clusteredRelations) {
        // Group by domainCluster
        if (!domainClusters[rel.domainCluster]) {
            domainClusters[rel.domainCluster] = [];
        }
        domainClusters[rel.domainCluster].push(rel);

        // Group by topologyClass
        if (!topologyClusters[rel.topologyClass]) {
            topologyClusters[rel.topologyClass] = [];
        }
        topologyClusters[rel.topologyClass].push(rel);

        // Build sets for persistence
        if (!domainClustersSets[rel.domainCluster]) {
            domainClustersSets[rel.domainCluster] = { nodes: new Set(), edges: new Set() };
        }
        domainClustersSets[rel.domainCluster].nodes.add(rel.from || rel.source);
        domainClustersSets[rel.domainCluster].edges.add(rel.to || rel.target);

        // Assess metrics
        if (rel.confidence >= 0.9) {
            hotNodes.add(rel.from || rel.source);
            hotNodes.add(rel.to || rel.target);
        }
        if (rel.topologyClass === "cache_heavy") {
            cacheHeavyNodes.add(rel.from || rel.source);
            cacheHeavyNodes.add(rel.to || rel.target);
        }
        if (rel.topologyClass === "dynamic_import_island") {
            dynamicIslands.add(rel.from || rel.source);
            dynamicIslands.add(rel.to || rel.target);
        }
    }

    return {
        graphEdges: clusteredRelations,
        domainClusters: domainClustersSets, // set-based for persistence backwards compatibility
        domainClustersList: domainClusters, // array-based
        topologyClusters: topologyClusters,
        hotNodes: Array.from(hotNodes),
        cacheHeavyNodes: Array.from(cacheHeavyNodes),
        dynamicIslands: Array.from(dynamicIslands)
    };
}

/** Helper to determine domain from relation source string */
function getDomainFromRelation(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('bifrost')) return 'bifrost';
  if (s.includes('ace')) return 'ace';
  if (s.includes('kag')) return 'kag';
  if (s.includes('engram')) return 'engram';
  if (s.includes('redis')) return 'redis';
  if (s.includes('qdrant')) return 'qdrant';
  if (s.includes('postgres') || s.includes('drizzle')) return 'postgres';
  if (s.includes('neo4j')) return 'neo4j';
  if (s.includes('duckdb')) return 'duckdb';
  if (s.includes('mcp')) return 'mcp';
  if (s.includes('langgraph')) return 'langgraph';
  if (s.includes('gpu') || s.includes('cuda')) return 'gpu';
  if (s.includes('svelte') || s.includes('routes') || s.includes('frontend')) return 'sveltekit';
  if (s.includes('documents') || s.includes('atlas')) return 'documents-atlas';
  if (s.includes('obs') || s.includes('trace') || s.includes('log')) return 'observability';
  return 'kag';
}

/** Helper to determine topology from relation source/target */
function getTopologyFromRelation(source: string, target: string): string {
  const s = source.toLowerCase();
  const t = target.toLowerCase();

  if (s.includes('cache') || t.includes('cache') || s.includes('redis') || t.includes('redis')) {
    return 'cache_heavy';
  }
  if (s.includes('mcp') || t.includes('mcp') || s.includes('tool') || t.includes('tool')) {
    return 'mcp_tool_neighborhood';
  }
  if (s.includes('fallback') || t.includes('fallback')) {
    return 'retrieval_fallback_chain';
  }
  if (s.includes('dynamic') || t.includes('dynamic')) {
    return 'dynamic_import_island';
  }
  if (s.includes('test') || t.includes('test') || s.includes('spec') || t.includes('spec')) {
    return 'test_coverage_island';
  }
  if (s.includes('db') || t.includes('db') || s.includes('schema') || t.includes('schema') || s.includes('drizzle') || t.includes('drizzle')) {
    return 'route_service_schema_chain';
  }
  if (s.includes('gpu') || t.includes('gpu') || s.includes('cuda') || t.includes('cuda')) {
    return 'inference_boundary';
  }
  return 'route_service_schema_chain';
}