export const REPAIR_TOOLS_SCHEMAS = [
  {
    name: 'langextract_extract_error_facts',
    description: 'Extract structured error, feature, and docs facts from messy text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        mode: { type: 'string', enum: ['error', 'feature', 'docs', 'playwright'] },
      },
      required: ['text', 'mode'],
    },
  },
  {
    name: 'marco_rerank_chunks',
    description: 'Rerank chunks after retrieval using MarcoReranker logic.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chunkId: { type: 'string' },
              text: { type: 'string' },
              filePath: { type: 'string' },
              qdrantScore: { type: 'number' },
            },
            required: ['chunkId', 'text'],
          },
        },
        limit: { type: 'number' },
      },
      required: ['query', 'candidates', 'limit'],
    },
  },
  {
    name: 'graphrag_expand_context',
    description: 'Expand relationships and explain paths using GraphRAG (Neo4j, CouchDB).',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: { type: 'string' },
        startNode: { type: 'string' },
      },
      required: ['startNode'],
    },
  },
  {
    name: 'hmm_infer_repair_states',
    description: 'Infer missing implementation states and repair order using HMM.',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: { type: 'string' },
        observed: {
          type: 'object',
          additionalProperties: { type: 'boolean' },
        },
        graphFacts: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' },
            minItems: 3,
            maxItems: 3,
          },
        },
      },
      required: ['observed', 'graphFacts'],
    },
  },
  {
    name: 'toposort_repair_plan',
    description: 'Topological sort to order the repair plan based on HMM states.',
    inputSchema: {
      type: 'object',
      properties: {
        missingStates: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['missingStates'],
    },
  },
  {
    name: 'sveltekit_route_audit',
    description: 'Audit a SvelteKit 2 route for existence, Zod schema, and auth guards.',
    inputSchema: {
      type: 'object',
      properties: {
        routePath: { type: 'string' },
      },
      required: ['routePath'],
    },
  },
  {
    name: 'sveltekit_import_boundary_check',
    description: 'Check SvelteKit import boundaries (e.g., $lib/server leaked to client).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'wiki_encyclopedia_search',
    description: 'Topological encyclopedia route that takes a query, searches Karpathy wiki + Qdrant + SOM clusters, returns did-you-mean suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
];

export async function handleRepairToolCall(name: string, args: Record<string, any>) {
  switch (name) {
    case 'langextract_extract_error_facts':
    case 'marco_rerank_chunks':
    case 'graphrag_expand_context':
    case 'hmm_infer_repair_states':
    case 'toposort_repair_plan':
    case 'sveltekit_route_audit':
    case 'sveltekit_import_boundary_check':
    case 'wiki_encyclopedia_search':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, tool: name, note: 'Tool stub created. Implementation pending.' }),
          },
        ],
      };
    default:
      return undefined;
  }
}
