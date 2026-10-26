import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

/**
 * Dispatcher LangGraph MCP Tools — 9 Tool Schemas
 * Wired into server.ts via spread operator: ...DISPATCHER_TOOLS_SCHEMAS
 */

export const DISPATCHER_TOOLS_SCHEMAS = [
  // 1. identity:quarantine — operator escalation
  {
    name: 'identity:quarantine',
    description: 'Route packets with failed identity validation to operator review queue. Non-blocking.',
    inputSchema: {
      type: 'object',
      properties: {
        packet_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of packet_keys to quarantine',
        },
        reason: {
          type: 'string',
          description: 'Reason for quarantine (validation failure, confidence below threshold, etc.)',
        },
        timestamp: {
          type: 'string',
          description: 'ISO 8601 timestamp',
        },
      },
      required: ['packet_keys', 'reason'],
    },
  },

  // 2. identity:recover — attempt packet recovery
  {
    name: 'identity:recover',
    description:
      'Attempt to recover packet_key for packets with missing canonical identity. ' +
      'Uses byte-span or content hash deterministic recovery (Tier 2 identity lanes).',
    inputSchema: {
      type: 'object',
      properties: {
        packet_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Packet keys to attempt recovery on',
        },
        recovery_method: {
          type: 'string',
          enum: ['deterministic', 'lexical', 'hybrid'],
          description: 'Recovery strategy to use',
        },
        fallback_lane: {
          type: 'string',
          enum: ['recoverable', 'quarantine'],
          description: 'Lane to assign if recovery fails',
        },
      },
      required: ['packet_keys', 'recovery_method'],
    },
  },

  // 3. envelope:validate — Zod re-validation
  {
    name: 'envelope:validate',
    description:
      'Re-validate canonical envelopes against Zod schema. ' +
      'Checks 8 ID fields, source_ref, feature_id, summary presence.',
    inputSchema: {
      type: 'object',
      properties: {
        packet_keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Packet keys to validate',
        },
        strict: {
          type: 'boolean',
          description: 'Hard fail on missing fields (true) or soft warn (false)',
          default: true,
        },
      },
      required: ['packet_keys'],
    },
  },

  // 4. mirror:sync_qdrant — push to Qdrant
  {
    name: 'mirror:sync_qdrant',
    description:
      'Sync canonical packet data to Qdrant payload. Updates points by qdrant_point_id, ' +
      'merging identity_lane, identity_confidence, and directory context.',
    inputSchema: {
      type: 'object',
      properties: {
        packets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              packet_key: { type: 'string' },
              source_ref: { type: 'string' },
              feature_id: { type: 'string' },
              identity_lane: { type: 'string' },
              confidence: { type: 'number' },
              summary: { type: 'string' },
            },
            required: ['packet_key', 'source_ref', 'feature_id'],
          },
          description: 'Packet data to sync',
        },
      },
      required: ['packets'],
    },
  },

  // 5. mirror:sync_neo4j — create/update Neo4j
  {
    name: 'mirror:sync_neo4j',
    description:
      'Create or update Neo4j :CanonicalPacket nodes and relationships. ' +
      'Creates BELONGS_TO_FEATURE, BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY edges.',
    inputSchema: {
      type: 'object',
      properties: {
        packets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              packet_key: { type: 'string' },
              source_ref: { type: 'string' },
              feature_id: { type: 'string' },
              summary: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['packet_key', 'source_ref', 'feature_id'],
          },
          description: 'Packets to sync',
        },
        create_edges: {
          type: 'array',
          items: { type: 'string' },
          description: 'Edge types to create (e.g., BELONGS_TO_FEATURE)',
        },
      },
      required: ['packets'],
    },
  },

  // 6. graph:expand — bounded read-only source neighborhood
  {
    name: 'graph:expand',
    description:
      'Expand a bounded read-only graph neighborhood around source references. Results are advisory until canonical source admission.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceRefs: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 8,
          description: 'Canonical source references or stable file keys used as neighborhood seeds.',
        },
        maxHops: {
          type: 'integer',
          enum: [1, 2],
          description: 'Maximum graph traversal depth.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 40,
          description: 'Maximum neighbors returned.',
        },
      },
      required: ['sourceRefs'],
    },
  },

  {
    name: 'graph:resident_bfs',
    description:
      'Read a bounded neighborhood from an already resident, checksum-qualified RTX graph. Does not load or alter graph residency; results are advisory and noncanonical.',
    inputSchema: {
      type: 'object',
      properties: {
        graphRevision: { type: 'string', minLength: 1 },
        projectionRevision: { type: 'string', minLength: 1 },
        projectionChecksum: { type: 'string', minLength: 1 },
        startNodeKey: { type: 'string', minLength: 1 },
        depthLimit: { type: 'integer', minimum: 0, maximum: 2 },
        expectedArtifactChecksum: { type: 'string', minLength: 1 },
        expectedGraphOrdinalMapChecksum: { type: 'string', minLength: 1 },
      },
      required: [
        'graphRevision', 'projectionRevision', 'projectionChecksum', 'startNodeKey', 'depthLimit',
        'expectedArtifactChecksum', 'expectedGraphOrdinalMapChecksum',
      ],
    },
  },

  {
    name: 'graph:resident_source_ref_bfs',
    description:
      'Resolve an exact sourceRef in an already resident graph using caller-pinned source/workspace revisions, then return bounded noncanonical BFS receipts for every matching graph node. Never loads a graph.',
    inputSchema: {
      type: 'object',
      properties: {
        graphRevision: { type: 'string', minLength: 1 },
        projectionRevision: { type: 'string', minLength: 1 },
        projectionChecksum: { type: 'string', minLength: 1 },
        sourceRef: { type: 'string', minLength: 1 },
        expectedSourceRevision: { type: 'string', minLength: 1 },
        expectedWorkspaceRevision: { type: 'string', minLength: 1 },
        depthLimit: { type: 'integer', minimum: 0, maximum: 2 },
        matchLimit: { type: 'integer', minimum: 1, maximum: 16, default: 16 },
        expectedArtifactChecksum: { type: 'string', minLength: 1 },
        expectedGraphOrdinalMapChecksum: { type: 'string', minLength: 1 },
      },
      required: [
        'graphRevision', 'projectionRevision', 'projectionChecksum', 'sourceRef',
        'expectedSourceRevision', 'expectedWorkspaceRevision', 'depthLimit',
        'expectedArtifactChecksum', 'expectedGraphOrdinalMapChecksum',
      ],
    },
  },

  {
    name: 'graph:community_leiden',
    description:
      'Run diagnostic-only cuGraph Leiden on a caller-supplied, revision-labelled small undirected projection. The receipt hashes the exact input; this tool does not load canonical graph data, write state, or promote communities.',
    inputSchema: {
      type: 'object',
      properties: {
        graphRevision: { type: 'string', minLength: 1 },
        topologyHash: { type: 'string', minLength: 1 },
        projectionRevision: { type: 'string', minLength: 1 },
        nodes: { type: 'array', minItems: 1, maxItems: 512, items: { type: 'object', properties: { nodeId: { type: 'string', minLength: 1 } }, required: ['nodeId'], additionalProperties: false } },
        edges: { type: 'array', maxItems: 4096, items: { type: 'object', properties: { source: { type: 'string', minLength: 1 }, target: { type: 'string', minLength: 1 }, weight: { type: 'number', exclusiveMinimum: 0 } }, required: ['source', 'target', 'weight'], additionalProperties: false } },
        resolution: { type: 'number', exclusiveMinimum: 0, maximum: 10 },
        maxIterations: { type: 'integer', minimum: 1, maximum: 100 },
        randomState: { type: 'integer', minimum: 0, maximum: 2147483647 },
      },
      required: ['graphRevision', 'topologyHash', 'projectionRevision', 'nodes', 'edges'],
      additionalProperties: false,
    },
  },

  // 7. retrieval:rerank — GPU cosine similarity
  {
    name: 'retrieval:rerank',
    description:
      'GPU-accelerated cosine similarity reranking. Reorders candidates by similarity to query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Query text to rerank against',
        },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              packet_key: { type: 'string' },
              feature_id: { type: 'string' },
              summary: { type: 'string' },
            },
          },
          description: 'Candidates to rerank',
        },
        top_k: {
          type: 'number',
          description: 'Number of top results to return',
          default: 10,
        },
        use_gpu: {
          type: 'boolean',
          description: 'Use GPU for computation (true) or CPU (false)',
          default: true,
        },
      },
      required: ['query', 'candidates'],
    },
  },

  // 8. answer:synthesize — Gemma4 generation
  {
    name: 'answer:synthesize',
    description: 'Generate final answer using Gemma4 with ranked candidates as context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Original user query',
        },
        context_packets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              packet_key: { type: 'string' },
              summary: { type: 'string' },
              feature_id: { type: 'string' },
            },
          },
          description: 'Top-K packets for context',
        },
        synthesis_model: {
          type: 'string',
          description: 'Model to use (defaults to the active llama-server model)',
          default: LLM_MODEL_ID,
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum tokens to generate',
          default: 1024,
        },
        temperature: {
          type: 'number',
          description: 'Temperature for generation',
          default: 0.3,
        },
        include_citations: {
          type: 'boolean',
          description: 'Include citations in response',
          default: true,
        },
      },
      required: ['query', 'context_packets'],
    },
  },

  // 9. escalation:route — operator alert
  {
    name: 'escalation:route',
    description:
      'Route unhandled or fallback dispatch decisions to operator alert queue. ' +
      'Non-blocking; creates operator review ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          description: 'The dispatch decision that needs escalation',
        },
        reason: {
          type: 'string',
          description: 'Why escalation is needed',
        },
        query: {
          type: 'string',
          description: 'Original query for context',
        },
        candidate_count: {
          type: 'number',
          description: 'Number of candidates processed',
        },
        synthesis_path: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nodes executed in synthesis path',
        },
        errors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any errors encountered',
        },
        timestamp: {
          type: 'string',
          description: 'ISO 8601 timestamp',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Severity level',
          default: 'medium',
        },
      },
      required: ['decision', 'reason'],
    },
  },
];
