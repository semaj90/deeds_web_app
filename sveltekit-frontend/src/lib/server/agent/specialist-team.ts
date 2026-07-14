export type SpecialistAgentName =
  | 'retrieval_contract'
  | 'ranking'
  | 'identity_promotion'
  | 'semantic_enrichment'
  | 'graph'
  | 'transport'
  | 'validation';

export const SPECIALIST_AGENT_NAMES = [
  'retrieval_contract',
  'ranking',
  'identity_promotion',
  'semantic_enrichment',
  'graph',
  'transport',
  'validation',
] as const satisfies readonly SpecialistAgentName[];

export type SpecialistAgentProfile = {
  displayName: string;
  description: string;
  tools: string[];
  keywords: string[];
  acceptanceGates: string[];
  authorization: {
    readOnly: boolean;
    writeAccess: boolean;
    shellAccess: boolean;
  };
  prompt: string;
};

export const SPECIALIST_AGENT_PROFILES: Record<SpecialistAgentName, SpecialistAgentProfile> = {
  retrieval_contract: {
    displayName: 'Retrieval Contract Agent',
    description: 'Owns retrieval runtime contracts, identity aggregation, and topK behavior.',
    tools: ['search_codebase', 'codebase_search', 'ripgrep_search', 'find_files', 'analyze_file', 'extract_pattern'],
    keywords: ['retrieve', 'retrieval', 'rrf', 'topk', 'fan-out', 'candidate', 'postgres_trigram', 'qdrant', 'search runtime', 'searchruntime'],
    acceptanceGates: [
      'same packet accumulates evidence from multiple lanes',
      'identity normalization happens before RRF',
      'postgres_trigram is not reported as BM25',
      'requested topK is respected',
    ],
    authorization: {
      readOnly: true,
      writeAccess: false,
      shellAccess: false,
    },
    prompt: `You are the Retrieval Contract Agent.
Own retrieval runtime contracts, candidate aggregation, source-label consistency, and topK behavior.
Use the canonical search_codebase tool first, then inspect code paths and tests.
Do not invent alternate retrieval engines. Return compact evidence with source_refs, packet_keys, and lane contributions.`,
  },
  ranking: {
    displayName: 'Ranking Agent',
    description: 'Owns canonical reranking, cache/provenance, and reconstructable rerank evidence.',
    tools: ['search_codebase', 'codebase_search', 'ripgrep_search', 'analyze_file', 'extract_pattern'],
    keywords: ['rank', 'rerank', 'xgboost', 'crossencoder', 'mixedbread', 'bge', 'cache', 'provenance', 'fallback'],
    acceptanceGates: [
      'top-20 input',
      'stable model identity',
      'explicit fallback reason',
      'same candidate identities before/after rerank',
      'reconstructable atlas_packet_metrics run',
    ],
    authorization: {
      readOnly: true,
      writeAccess: false,
      shellAccess: false,
    },
    prompt: `You are the Ranking Agent.
Own canonical reranking, fallback behavior, cache/provenance, and persistable rerank evidence.
Do not change packet identity. Validate candidate identities, stable model versioning, and reconstructable metric rows.`,
  },
  identity_promotion: {
    displayName: 'Packet Identity and Promotion Agent',
    description: 'Owns packet identity, source normalization, summary backfill, and promotion outbox.',
    tools: ['search_codebase', 'codebase_search', 'find_files', 'analyze_file', 'extract_pattern', 'analyze_imports'],
    keywords: ['packet key', 'packet_key', 'source ref', 'source_ref', 'promotion', 'outbox', 'qdrant point', 'summary layer', 'title_id'],
    acceptanceGates: [
      'packet_key comes only from canonical source identity',
      'title_id is enrichment',
      'reranking never changes identity',
      'Postgres commits before Qdrant synchronization',
    ],
    authorization: {
      readOnly: false,
      writeAccess: true,
      shellAccess: false,
    },
    prompt: `You are the Packet Identity and Promotion Agent.
Own canonical packet identity, source_ref normalization, summary-layer backfill, Qdrant point linkage, and promotion/outbox semantics.
Packet identity is immutable. title_id is enrichment only. Verify Postgres truth before any vector mirror sync.`,
  },
  semantic_enrichment: {
    displayName: 'Semantic Enrichment Agent',
    description: 'Owns summary promotion, domain classification, semantic concepts, and embedding/topology metadata.',
    tools: ['search_codebase', 'codebase_search', 'find_files', 'analyze_file', 'summarize', 'rag_search'],
    keywords: ['summary', 'domain', 'concept', 'embeddinggemma', 'kmeans', 'som', 'semantic title', 'title id', 'embedding'],
    acceptanceGates: [
      'summary promotion',
      'title_id',
      'domain classification',
      'semantic concepts',
      'EmbeddingGemma 384',
      'KMeans/SOM enrichment',
    ],
    authorization: {
      readOnly: false,
      writeAccess: true,
      shellAccess: false,
    },
    prompt: `You are the Semantic Enrichment Agent.
Own summary promotion, title_id enrichment, domain classification, semantic concepts, EmbeddingGemma 384, and KMeans/SOM enrichment.
Produce metadata only. Do not emit query-time rerank evidence.`,
  },
  graph: {
    displayName: 'Graph Agent',
    description: 'Owns tree_node_id, graph relationships, PageRank, community IDs, and bounded graph expansion.',
    tools: ['search_codebase', 'codebase_search', 'analyze_imports', 'find_files', 'analyze_file', 'extract_pattern'],
    keywords: ['graph', 'tree_node', 'pagerank', 'neo4j', 'community', 'relationship', 'bounded graph', 'k-hop'],
    acceptanceGates: [
      'tree_node_id',
      'Neo4j relationships',
      'PageRank',
      'community IDs',
      'bounded graph expansion',
    ],
    authorization: {
      readOnly: true,
      writeAccess: false,
      shellAccess: false,
    },
    prompt: `You are the Graph Agent.
Own tree_node_id, Neo4j relationships, PageRank, community IDs, and bounded graph expansion.
Return graph features to HyperRAG but do not rank independently.`,
  },
  transport: {
    displayName: 'Transport Contract Agent',
    description: 'Owns MCP/gRPC/ACP packet schemas and transport mappings.',
    tools: ['search_codebase', 'codebase_search', 'find_files', 'analyze_file', 'analyze_imports', 'extract_pattern'],
    keywords: ['mcp', 'grpc', 'protobuf', 'packet envelope', 'schema', 'zod', 'tool schema', 'hyperrag rpc', 'acp'],
    acceptanceGates: [
      'MCP schemas are serializable JSON Schema',
      'gRPC and MCP preserve packet_key/source_ref',
      'no Zod objects cast with as any',
      'tool outputs use the canonical packet envelope',
    ],
    authorization: {
      readOnly: true,
      writeAccess: false,
      shellAccess: false,
    },
    prompt: `You are the Transport Contract Agent.
Own MCP JSON Schema, gRPC/protobuf mapping, HyperRAG RPC packet envelopes, and ACP tool schemas.
Keep protocols out of business logic. Preserve packet_key and source_ref exactly.`,
  },
  validation: {
    displayName: 'Validation Agent',
    description: 'Owns tests, health checks, identity invariants, aggregation, fallback, and storage reconstruction.',
    tools: ['search_codebase', 'codebase_search', 'ripgrep_search', 'find_files', 'analyze_file', 'system_health', 'extract_pattern'],
    keywords: ['test', 'validation', 'typecheck', 'health', 'smoke', 'evidence', 'reconstruct', 'fallback', 'vitest'],
    acceptanceGates: [
      'typecheck',
      'focused Vitest',
      'live service health',
      'identity invariants',
      'RRF aggregation',
      'rerank fallback',
      'storage reconstruction',
    ],
    authorization: {
      readOnly: true,
      writeAccess: false,
      shellAccess: false,
    },
    prompt: `You are the Validation Agent.
Own tests and evidence only: typecheck, focused Vitest, health checks, invariants, aggregation, fallback, and storage reconstruction.
Do not edit production code unless explicitly delegated.`,
  },
};
