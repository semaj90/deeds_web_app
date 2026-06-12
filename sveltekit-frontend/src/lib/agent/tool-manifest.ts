/**
 * Tool manifest that Gemma4 reads to understand available capabilities.
 * Never exposes raw large JSON or system details.
 * Only bounded, read-only operations with strict argument contracts.
 */

export const TOOL_MANIFEST = [
  {
    name: 'topology.status',
    description: 'Check local Windows/WSL2/Docker service topology (docker, wsl2, ports, gpu, redis, qdrant, neo4j, postgres).',
    input_schema: {
      type: 'object',
      properties: {
        include: {
          type: 'array',
          items: {
            enum: ['docker', 'wsl2', 'ports', 'gpu', 'redis', 'qdrant', 'neo4j', 'postgres'],
          },
          description: 'Services to check (e.g., ["docker", "gpu", "qdrant"])',
        },
      },
      required: ['include'],
    },
  },
  {
    name: 'packet.search',
    description:
      'Search NES/CHR97/ACE packets by query or feature_id. Returns bounded summaries only, never raw large JSON.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (concept name, feature, etc.)',
        },
        feature_id: {
          type: 'string',
          description: 'Optional feature_id filter',
        },
        limit: {
          type: 'number',
          default: 8,
          description: 'Max results (default 8, max 32)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'startup.briefing',
    description:
      'Read the current read-only startup briefing generated from Graphify/readiness passes. Returns a short human briefing, recommendations, warnings, and system status only.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'concept.stats',
    description: 'Get aggregate statistics on concept frequency, retrieval strategy distribution, and community tags.',
    input_schema: {
      type: 'object',
      properties: {
        concept_id: {
          type: 'string',
          description: 'Optional concept_id to narrow stats',
        },
        include_tags: {
          type: 'boolean',
          default: false,
          description: 'Include community_id and retrieval_strategy distribution',
        },
      },
      required: [],
    },
  },
  {
    name: 'graph.nearest',
    description: 'Find nearest concept neighbors in Neo4j topology (1-hop and 2-hop).',
    input_schema: {
      type: 'object',
      properties: {
        concept_id: {
          type: 'string',
          description: 'Starting concept',
        },
        hops: {
          type: 'number',
          enum: [1, 2],
          default: 1,
          description: 'Search depth',
        },
        limit: {
          type: 'number',
          default: 10,
          description: 'Max neighbors returned',
        },
      },
      required: ['concept_id'],
    },
  },
  {
    name: 'cache.peek',
    description: 'Check Redis/Valkey cache status without loading values. Returns key count and TTL summaries only.',
    input_schema: {
      type: 'object',
      properties: {
        prefix: {
          type: 'string',
          description: 'Cache key prefix (e.g., "gpu:karpathy", "ace:topo")',
        },
      },
      required: ['prefix'],
    },
  },
];

export type ToolName = typeof TOOL_MANIFEST[number]['name'];
