/**
 * src/lib/server/retrieval/query-profile-router.ts
 * 
 * Maps user queries to search profiles and topological cluster priors.
 */

export type SearchProfile =
  | 'ace_cache'
  | 'agent_workflow'
  | 'legal_analysis'
  | 'evidence_upload'
  | 'langextract'
  | 'gpu_topology'
  | 'db_schema'
  | 'auth'
  | 'general';

export const CLUSTER_ALIASES: Record<string, { alias: string; topic: string }> = {
  '72': { alias: 'ace_context', topic: 'ACE context assembly and retrieval policy' },
  '73': { alias: 'retrieval_graph', topic: 'retrieval ranking, graph context, legal PageRank' },
  '94': { alias: 'redis_cache', topic: 'cache services, Redis, ACE packets' },
  '32': { alias: 'langextract_services', topic: 'LangExtract extraction services and tooling' },
  '47': { alias: 'legal_corpus_routes', topic: 'legal corpus, statutes, citations' },
  '92': { alias: 'evidence_upload_ui', topic: 'evidence upload UI and upload components' },
  '82': { alias: 'grpc_mcp_tools', topic: 'gRPC, MCP tool clients, internal tool routing' },
  '20': { alias: 'webgpu_similarity', topic: 'WebGPU similarity and GPU graph operations' },
  '23': { alias: 'webgpu_similarity', topic: 'WebGPU similarity and GPU graph operations' },
  '80': { alias: 'webgpu_similarity', topic: 'WebGPU similarity and GPU graph operations' },
  '55': { alias: 'db_schema', topic: 'database schema and table definitions' },
  '95': { alias: 'db_schema', topic: 'database schema and table definitions' },
  '91': { alias: 'db_schema', topic: 'database schema and table definitions' },
  '88': { alias: 'db_schema', topic: 'database schema and table definitions' },
  '48': { alias: 'db_schema', topic: 'database schema and table definitions' },
};

export const PROFILE_CLUSTER_PRIORS: Record<SearchProfile, string[]> = {
  ace_cache: ['72', '94', '25', '22'],
  agent_workflow: ['72', '82', '44', '69'],
  legal_analysis: ['47', '35', '21', '18'],
  evidence_upload: ['92', '86', '29', '96'],
  langextract: ['32'],
  gpu_topology: ['20', '23', '80', '57'],
  db_schema: ['55', '95', '91', '88', '48'],
  auth: ['90', '29', '9'],
  general: []
};

export function getClusterAlias(clusterId: number | string): string | null {
  return CLUSTER_ALIASES[String(clusterId)]?.alias ?? null;
}

export function getProfileClusterAliases(profile: SearchProfile): string[] {
  return PROFILE_CLUSTER_PRIORS[profile]
    .map((id) => getClusterAlias(id))
    .filter((alias): alias is string => Boolean(alias));
}

export class QueryProfileRouter {
  /**
   * Identifies the most likely search profile based on query keywords.
   */
  public static route(query: string): SearchProfile {
    const q = query.toLowerCase();

    if (q.includes('ace') || q.includes('context') || q.includes('cache') || q.includes('redis')) {
      return 'ace_cache';
    }
    if (q.includes('legal') || q.includes('corpus') || q.includes('statute') || q.includes('citation')) {
      return 'legal_analysis';
    }
    if (q.includes('langextract') || q.includes('extraction') || q.includes('docling')) {
      return 'langextract';
    }
    if (q.includes('upload') || q.includes('evidence') || q.includes('seaweed') || q.includes('minio')) {
      return 'evidence_upload';
    }
    if (q.includes('gpu') || q.includes('webgpu') || q.includes('manifold') || q.includes('topology')) {
      return 'gpu_topology';
    }
    if (q.includes('db') || q.includes('schema') || q.includes('drizzle') || q.includes('postgres') || q.includes('migration')) {
      return 'db_schema';
    }
    if (q.includes('auth') || q.includes('login') || q.includes('user') || q.includes('session')) {
      return 'auth';
    }
    if (q.includes('agent') || q.includes('workflow') || q.includes('tool') || q.includes('grpc')) {
      return 'agent_workflow';
    }

    return 'general';
  }

  /**
   * Returns the cluster IDs for a given profile.
   */
  public static getPriors(profile: SearchProfile): number[] {
    return (PROFILE_CLUSTER_PRIORS[profile] || []).map(id => parseInt(id, 10));
  }

  public static getAliases(profile: SearchProfile): string[] {
    return getProfileClusterAliases(profile);
  }
}
