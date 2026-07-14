// @ts-nocheck — MCP schema generation uses Zod .toJSON() which is loosely typed in v1
/**
 * ACP/MCP Integration — Dispatcher Tools as ACP-Registered Tools
 *
 * Wires the 9 dispatcher MCP tools (identity:recover, envelope:validate, etc.)
 * into the ACP tool registry so they are discoverable via A2A and accessible
 * through both MCP stdio transport and gRPC service boundaries.
 *
 * Architecture:
 *   MCP Tool Def → Zod Schema → ACP Registry Entry → Tool Discovery
 *   MCP server.ts → executes via ToolCallingService gRPC
 */

import { z } from 'zod';
import type { ACPToolRegistryEntry } from './acp-grpc-quic-bridge.js';
import { acpToolRegistry } from './acp-grpc-quic-bridge.js';

// ─────────────────────────────────────────────────────────────────────
// Dispatcher Tool Schemas (Zod, for validation)
// ─────────────────────────────────────────────────────────────────────

const DispatcherToolSchemas = {
  identityRecover: z.object({
    packet_key: z.string().describe('Packet identity key'),
    source_ref: z.string().optional().describe('Source file reference'),
  }),
  envelopeValidate: z.object({
    packet_key: z.string().describe('Packet to validate'),
    validate_8_id_fields: z.boolean().default(true).describe('Check all 8 canonical ID fields'),
  }),
  mirrorSyncQdrant: z.object({
    packet_key: z.string(),
    embedding_vec: z.array(z.number()).optional(),
  }),
  mirrorSyncNeo4j: z.object({
    packet_key: z.string(),
    create_edges: z.boolean().default(true),
  }),
  graphExpand: z.object({
    feature_id: z.string(),
    max_depth: z.number().default(2),
  }),
  retrievalRerank: z.object({
    candidates: z.array(z.object({ id: z.string(), score: z.number() })),
  }),
  answerSynthesize: z.object({
    query: z.string(),
    context_packets: z.array(z.string()),
  }),
  escalationRoute: z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  identityQuarantine: z.object({
    packet_key: z.string(),
    reason: z.string().optional(),
  }),
};

// ─────────────────────────────────────────────────────────────────────
// Register Dispatcher Tools as ACP Tools
// ─────────────────────────────────────────────────────────────────────

export function registerDispatcherToolsAsACP(): void {
  const tools: ACPToolRegistryEntry[] = [
    {
      id: 'identity:recover',
      name: 'Identity Recover',
      description: 'Classify packet identity lane (canonical/recoverable/quarantine)',
      serviceId: 'toolCalling',
      proto: 'tool_calling.proto',
      methods: ['ExecuteTool'],
      inputSchema: DispatcherToolSchemas.identityRecover.describe(
        'Packet identity classification for recovery'
      ).toJSON(),
      outputSchema: z
        .object({
          identity_lane: z.enum(['canonical', 'recoverable', 'quarantine']),
          confidence: z.number().min(0).max(1),
          metrics: z.record(z.any()),
        })
        .toJSON(),
      tags: ['dispatcher', 'identity', 'critical', 'packet-lifecycle'],
      quicOptional: false,
    },
    {
      id: 'envelope:validate',
      name: 'Envelope Validate',
      description: 'Validate canonical envelope (8 ID fields: packet_id, title_id, tree_node_id, concept_ids, etc.)',
      serviceId: 'toolCalling',
      proto: 'tool_calling.proto',
      methods: ['ExecuteTool'],
      inputSchema: DispatcherToolSchemas.envelopeValidate.toJSON(),
      outputSchema: z
        .object({
          is_valid: z.boolean(),
          fields_checked: z.number(),
          missing_fields: z.array(z.string()),
          confidence: z.number(),
        })
        .toJSON(),
      tags: ['dispatcher', 'validation', 'envelope', 'schema-enforcement'],
      quicOptional: false,
    },
    {
      id: 'mirror:sync_qdrant',
      name: 'Mirror Sync Qdrant',
      description: 'Synchronize packet to Qdrant vector index (mirror)',
      serviceId: 'retrieval',
      proto: 'retrieval.proto',
      methods: ['Search'],
      inputSchema: DispatcherToolSchemas.mirrorSyncQdrant.toJSON(),
      outputSchema: z
        .object({
          qdrant_point_id: z.string(),
          synced_at: z.string(),
          collection: z.string(),
        })
        .toJSON(),
      tags: ['dispatcher', 'mirror', 'search-index', 'qdrant', 'vector-db'],
      quicOptional: true,
    },
    {
      id: 'mirror:sync_neo4j',
      name: 'Mirror Sync Neo4j',
      description: 'Synchronize packet topology to Neo4j graph database',
      serviceId: 'codeIntel',
      proto: 'codeintel.proto',
      methods: ['TraverseGraph'],
      inputSchema: DispatcherToolSchemas.mirrorSyncNeo4j.toJSON(),
      outputSchema: z
        .object({
          neo4j_node_id: z.string(),
          edges_created: z.number(),
          synced_at: z.string(),
        })
        .toJSON(),
      tags: ['dispatcher', 'mirror', 'topology', 'neo4j', 'graph'],
      quicOptional: true,
    },
    {
      id: 'graph:expand',
      name: 'Graph Expand',
      description: 'Expand Neo4j neighborhood (read-only, traversal)',
      serviceId: 'codeIntel',
      proto: 'codeintel.proto',
      methods: ['TraverseGraph'],
      inputSchema: DispatcherToolSchemas.graphExpand.toJSON(),
      outputSchema: z
        .object({
          neighbors: z.array(z.object({ id: z.string(), relationship: z.string() })),
          total_edges: z.number(),
        })
        .toJSON(),
      tags: ['dispatcher', 'graph', 'traversal', 'read-only'],
      quicOptional: true,
    },
    {
      id: 'retrieval:rerank',
      name: 'Retrieval Rerank',
      description: 'Rerank candidates by similarity (ranking-only, no writes)',
      serviceId: 'retrieval',
      proto: 'retrieval.proto',
      methods: ['Rerank'],
      inputSchema: DispatcherToolSchemas.retrievalRerank.toJSON(),
      outputSchema: z
        .object({
          ranked: z.array(z.object({ id: z.string(), new_score: z.number() })),
          rerank_time_ms: z.number(),
        })
        .toJSON(),
      tags: ['dispatcher', 'ranking', 'read-only', 'retrieval'],
      quicOptional: true,
    },
    {
      id: 'answer:synthesize',
      name: 'Answer Synthesize',
      description: 'Generate LLM answer from context (Gemma4 generation)',
      serviceId: 'chatAssistant',
      proto: 'chat_assistant.proto',
      methods: ['Chat'],
      inputSchema: DispatcherToolSchemas.answerSynthesize.toJSON(),
      outputSchema: z
        .object({
          answer: z.string(),
          model: z.string(),
          tokens_generated: z.number(),
        })
        .toJSON(),
      tags: ['dispatcher', 'synthesis', 'llm', 'generation'],
      quicOptional: true,
    },
    {
      id: 'escalation:route',
      name: 'Escalation Route',
      description: 'Route packet to escalation queue by severity (stateless)',
      serviceId: 'toolCalling',
      proto: 'tool_calling.proto',
      methods: ['ExecuteTool'],
      inputSchema: DispatcherToolSchemas.escalationRoute.toJSON(),
      outputSchema: z
        .object({
          queue: z.string(),
          routed_at: z.string(),
        })
        .toJSON(),
      tags: ['dispatcher', 'routing', 'stateless'],
      quicOptional: true,
    },
    {
      id: 'identity:quarantine',
      name: 'Identity Quarantine',
      description: 'Quarantine packet (set lane=quarantine, confidence=0)',
      serviceId: 'toolCalling',
      proto: 'tool_calling.proto',
      methods: ['ExecuteTool'],
      inputSchema: DispatcherToolSchemas.identityQuarantine.toJSON(),
      outputSchema: z
        .object({
          packet_key: z.string(),
          identity_lane: z.literal('quarantine'),
          confidence: z.literal(0),
        })
        .toJSON(),
      tags: ['dispatcher', 'identity', 'quarantine', 'critical'],
      quicOptional: false,
    },
  ];

  tools.forEach((tool) => acpToolRegistry.registerTool(tool));
}

// ─────────────────────────────────────────────────────────────────────
// ACP/MCP Tool Invocation Adapter
// ─────────────────────────────────────────────────────────────────────

export interface ACPToolInvocation {
  toolId: string;
  args: Record<string, any>;
  quicPreferred?: boolean;
  timeout?: number;
}

export interface ACPToolResult {
  toolId: string;
  success: boolean;
  result?: any;
  error?: string;
  metrics?: {
    execution_ms: number;
    grpc_used?: boolean;
    quic_used?: boolean;
  };
}

/**
 * Execute an ACP-registered tool via MCP dispatcher tools.
 * Routes to the appropriate tool implementation based on tool ID.
 */
export async function executeACPTool(invocation: ACPToolInvocation): Promise<ACPToolResult> {
  const { toolId, args } = invocation;
  const startTime = Date.now();

  try {
    const tool = acpToolRegistry.getTool(toolId);
    if (!tool) {
      return {
        toolId,
        success: false,
        error: `Tool not found: ${toolId}`,
        metrics: { execution_ms: Date.now() - startTime },
      };
    }

    // Dispatch to real MCP tool implementation
    // This would call into the actual dispatcher tool implementations
    const result = await dispatchToMCPTool(toolId, args);

    return {
      toolId,
      success: true,
      result,
      metrics: {
        execution_ms: Date.now() - startTime,
        grpc_used: false, // Would be true if gRPC transport was used
        quic_used: false, // Would be true if QUIC negotiation succeeded
      },
    };
  } catch (err) {
    return {
      toolId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      metrics: { execution_ms: Date.now() - startTime },
    };
  }
}

/**
 * Internal dispatcher to MCP tool implementations.
 * Maps ACP tool IDs to actual TypeScript implementations.
 */
async function dispatchToMCPTool(toolId: string, args: Record<string, any>): Promise<any> {
  // Dynamic imports to avoid circular dependencies
  const {
    toolIdentityRecover,
    toolEnvelopeValidate,
    toolMirrorSyncQdrant,
    toolMirrorSyncNeo4j,
    toolGraphExpand,
    toolRetrievalRerank,
    toolAnswerSynthesize,
    toolEscalationRoute,
    toolIdentityQuarantine,
  } = await import('$lib/server/dispatch/mcp-tool-implementations.js');

  const handlers: Record<string, (args: any) => Promise<any>> = {
    'identity:recover': toolIdentityRecover,
    'envelope:validate': toolEnvelopeValidate,
    'mirror:sync_qdrant': toolMirrorSyncQdrant,
    'mirror:sync_neo4j': toolMirrorSyncNeo4j,
    'graph:expand': toolGraphExpand,
    'retrieval:rerank': toolRetrievalRerank,
    'answer:synthesize': toolAnswerSynthesize,
    'escalation:route': toolEscalationRoute,
    'identity:quarantine': toolIdentityQuarantine,
  };

  const handler = handlers[toolId];
  if (!handler) {
    throw new Error(`No handler registered for tool: ${toolId}`);
  }

  return handler(args);
}
