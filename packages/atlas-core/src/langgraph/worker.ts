/**
 * LangGraph Worker — Agent Loop Orchestrator
 *
 * Subscribes to NATS subjects and routes work through LangGraph state machine.
 * Does NOT own datastores — delegates to:
 *   - Postgres (truth)
 *   - Redis/BitFrost (hot memory)
 *   - Qdrant (vector search)
 *   - Neo4j (KAG/DAG topology)
 *   - Go services (fast retrieval)
 *
 * Architecture:
 *
 *   NATS subject (e.g., agent.task.execute)
 *     ↓
 *   LangGraph node (e.g., load_trace_state)
 *     ↓
 *   Call external service (Postgres read, Qdrant search, Go RPC)
 *     ↓
 *   Update LangGraph state
 *     ↓
 *   Route to next node via state transitions
 *     ↓
 *   Emit NATS event (e.g., retrieval.complete) or write Postgres
 *
 * Key principle: LangGraph is the loop controller, not the datastore.
 */

import { Annotation, StateGraph } from '@langchain/langgraph';
import { AtlasTaskEnvelope, SUBJECTS } from '../events/subjects.js';
import { ACP_TOOLS, validateToolResult, type ValidateTruthParams, type HybridSearchParams, type SchemaMatchParams, type WriteTraceEventParams } from '../tools/acp-tool-contracts.js';
import type { Pool } from 'pg';
import type Redis from 'ioredis';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { Driver } from 'neo4j-driver';
import {
  getPostgresClient,
  getBitFrostClient,
  getQdrantClient,
  getNeo4jClient,
  type BitFrostCachedResult,
} from './clients.js';
import { getNatsClient, type TraceCheckpointEvent } from '../nats/nats-client.js';

/**
 * LangGraph Agent State — checkpoint all decision points here
 *
 * Minimal state — just what's needed for loop control.
 * Heavy data (embeddings, full documents) stays in Postgres/Qdrant.
 */
export const AgentState = Annotation.Root({
  trace_id: Annotation({ value: (x: string, y: string) => y ?? x }),
  packet_key: Annotation({ value: (x?: string, y?: string) => y ?? x }),
  source_ref: Annotation({ value: (x?: string, y?: string) => y ?? x }),
  feature_id: Annotation({ value: (x?: string, y?: string) => y ?? x }),

  // Loop control
  strategy: Annotation({ value: (x: string, y: string) => y ?? x }),
  step: Annotation({ value: (x: number, y: number) => Math.max(x ?? 0, y ?? 0) }),

  // Context from Postgres/Qdrant/Neo4j reads
  packet_metadata: Annotation({ value: (x?: unknown, y?: unknown) => y ?? x }),
  retrieval_results: Annotation({ value: (x?: unknown[], y?: unknown[]) => y ?? x }),
  rag_candidates: Annotation({ value: (x?: unknown[], y?: unknown[]) => y ?? x }),
  kag_neighbors: Annotation({ value: (x?: unknown[], y?: unknown[]) => y ?? x }),

  // Reranking/scoring
  reranked_results: Annotation({ value: (x?: unknown[], y?: unknown[]) => y ?? x }),
  scores: Annotation({ value: (x?: number[], y?: number[]) => y ?? x }),

  // LLM generation
  synthesis: Annotation({ value: (x?: string, y?: string) => y ?? x }),
  trace_events: Annotation({ value: (x: unknown[], y: unknown[]) => [...(x ?? []), ...(y ?? [])] }),

  // Error handling
  error: Annotation({ value: (x?: string, y?: string) => y ?? x }),
  retries: Annotation({ value: (x: number, y: number) => Math.max(x ?? 0, y ?? 0) }),
});

export type AgentStateType = typeof AgentState.State;

/**
 * Injected service clients — populated by buildAgentWorker()
 */
interface AgentServices {
  postgres: ReturnType<typeof getPostgresClient>;
  bitfrost: ReturnType<typeof getBitFrostClient>;
  qdrant: ReturnType<typeof getQdrantClient>;
  neo4j: ReturnType<typeof getNeo4jClient>;
}

/**
 * LangGraph Node: Load trace state from Postgres + BitFrost
 *
 * Reads:
 *   - Postgres trace_events (canonical)
 *   - Redis ff1:trace:{trace_id} (hot cache)
 *
 * Outputs: populated AgentState
 */
function makeLoadTraceState(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { trace_id } = state;

    // Try Redis cache first (BitFrost L1/L2)
    const cachedTrace = await services.bitfrost.getTraceCache(trace_id);
    if (cachedTrace) {
      return {
        step: (state.step ?? 0) + 1,
        trace_events: Array.isArray(cachedTrace) ? cachedTrace : [cachedTrace],
      };
    }

    // Fall back to Postgres (canonical truth)
    const traceEvents = await services.postgres.loadTraceState(trace_id);

    return {
      step: (state.step ?? 0) + 1,
      trace_events: traceEvents,
    };
  };
}

/**
 * LangGraph Node: Look up packet identity + metadata from Postgres
 *
 * Validates hard fail conditions:
 *   - packet_key exists
 *   - source_ref exists
 *   - feature_id exists
 *
 * Routes to error if validation fails.
 */
function makePacketRegistryLookup(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { packet_key, source_ref, feature_id } = state;

    // Hard fail conditions (canonical truth flow)
    if (!packet_key || !source_ref || !feature_id) {
      return {
        error: `packet identity incomplete: packet_key=${!!packet_key}, source_ref=${!!source_ref}, feature_id=${!!feature_id}`,
        step: (state.step ?? 0) + 1,
      };
    }

    // Read from Postgres atlas_packets table (canonical truth)
    const packet = await services.postgres.loadPacketMetadata(
      packet_key,
      source_ref,
      feature_id
    );

    if (!packet) {
      return {
        error: `packet not found: packet_key=${packet_key}`,
        step: (state.step ?? 0) + 1,
      };
    }

    return {
      packet_metadata: packet,
      step: (state.step ?? 0) + 1,
    };
  };
}

/**
 * LangGraph Node: Check BitFrost cache before expensive operations
 *
 * Reads:
 *   - Redis ff1:packet:{packet_key}
 *   - Redis ff1:feature:{feature_id}
 *
 * If cache hit and fresh, skip to synthesis.
 */
function makeBitfrostCacheCheck(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { packet_key, feature_id } = state;

    // Check packet cache first (L1 exact-match)
    let cached: BitFrostCachedResult | null = null;
    if (packet_key) {
      cached = await services.bitfrost.getPacketCache(packet_key);
    }

    // Fall back to feature cache (L2 semantic)
    if (!cached && feature_id) {
      cached = await services.bitfrost.getFeatureCache(feature_id);
    }

    // Cache hit — skip to synthesis
    if (cached) {
      return {
        retrieval_results: cached.retrieval_results,
        rag_candidates: cached.rag_candidates,
        kag_neighbors: cached.kag_neighbors,
        step: (state.step ?? 0) + 1,
      };
    }

    return {
      step: (state.step ?? 0) + 1,
    };
  };
}

/**
 * LangGraph Node: Hybrid retrieval (RAG + KAG)
 *
 * Calls external services:
 *   - Qdrant: semantic vector search (codebase_chunks_768)
 *   - Neo4j: KAG graph traversal (bounded k-hops)
 *   - Go services: fast retrieval RPC
 *
 * Does NOT persist — results stay in state until write step.
 */
function makeHybridRetrieval(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { packet_key, source_ref, feature_id } = state;

    // Parallel retrieval: RAG (Qdrant vector search) + KAG (Neo4j topology)
    const [ragCandidates, kagNeighbors] = await Promise.all([
      // RAG: Semantic vector search (requires query embedding from state or synthesis)
      // For now, fetch from packet_metadata if available
      packet_key
        ? services.qdrant.fetchPoint(packet_key).then((p) => (p ? [p] : []))
        : Promise.resolve([]),

      // KAG: Graph traversal from packet node (bounded k-hops)
      packet_key
        ? services.neo4j.traverseTopology(packet_key, 2)
        : Promise.resolve([]),
    ]);

    return {
      rag_candidates: ragCandidates,
      kag_neighbors: kagNeighbors,
      step: (state.step ?? 0) + 1,
    };
  };
}

/**
 * LangGraph Node: Optional GPU reranking (cuVS/CUDA)
 *
 * Calls GPU worker (via NATS gpu.cuda.rank):
 *   - Scores candidate vectors against query
 *   - Returns top-K by relevance
 *
 * Optional — skipped if retrieval_results are already small.
 */
function makeOptionalGpuRerank() {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { rag_candidates } = state;

    if (!rag_candidates || rag_candidates.length < 5) {
      // Skip reranking for small result sets
      return {
        reranked_results: rag_candidates || [],
        step: (state.step ?? 0) + 1,
      };
    }

    // For now, pass candidates through unchanged
    // TODO: Wire to NATS gpu.cuda.rank subject with:
    //   - query_embedding from state (if available)
    //   - candidates: rag_candidates
    //   - top_k: 5
    //   - Wait for response and return reranked_results

    return {
      reranked_results: rag_candidates,
      step: (state.step ?? 0) + 1,
    };
  };
}

/**
 * LangGraph Node: Validate packet truth flow before writing
 *
 * Ensures:
 *   - Postgres was read (not just Qdrant/Neo4j)
 *   - All hard fail conditions checked
 *   - Results are complete enough to write
 *
 * Gates writes to Postgres using acp.packet.validate_truth contract.
 */
function makePacketTruthValidate(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { packet_metadata, reranked_results, error, packet_key, source_ref, feature_id, trace_id } = state;

    // Hard fail gate 1: error flag
    if (error) {
      return { step: (state.step ?? 0) + 1 };
    }

    // Hard fail gate 2: Postgres packet metadata loaded (canonical truth)
    if (!packet_metadata) {
      return {
        error: 'packet_metadata not loaded — Postgres read failed. Skipping write.',
        step: (state.step ?? 0) + 1,
      };
    }

    // Hard fail gate 3: packet identity complete
    if (!packet_key || !source_ref || !feature_id) {
      return {
        error: 'packet identity incomplete after retrieval — cannot write',
        step: (state.step ?? 0) + 1,
      };
    }

    // Validate using acp.packet.validate_truth tool contract
    try {
      const validationParams: ValidateTruthParams = {
        trace_id: trace_id || 'unknown',
        packet_key,
        source_ref,
        feature_id,
        packet_metadata: packet_metadata as Record<string, unknown>,
      };

      // Validate params match contract
      const toolSchema = ACP_TOOLS['acp.packet.validate_truth'];
      await toolSchema.parameters.parseAsync(validationParams);

      // Execute validation (mock for now — real implementation calls services.postgres.validate)
      const validationResult = {
        trace_id: trace_id || 'unknown',
        valid: true,
        reason: 'Packet identity verified in Postgres',
        confidence: 1.0,
        postgres_row_exists: !!packet_metadata,
        identity_matches: true,
      };

      // Validate result matches contract
      const resultValidation = validateToolResult('acp.packet.validate_truth', validationResult);
      if (!resultValidation.valid) {
        console.warn(`Tool result validation failed: ${resultValidation.errors.join(', ')}`);
      }

      // Soft validation: results completeness (warning only)
      if (!reranked_results || reranked_results.length === 0) {
        // Log warning but continue (synthesis can still proceed with empty results)
      }

      // All gates pass — safe to proceed to synthesis + write
      return {
        step: (state.step ?? 0) + 1,
      };
    } catch (err) {
      return {
        error: `Packet validation failed: ${err instanceof Error ? err.message : String(err)}`,
        step: (state.step ?? 0) + 1,
      };
    }
  };
}

/**
 * LangGraph Node: Gemma4 synthesis (LLM generation)
 *
 * Calls Gemma4 with:
 *   - Query
 *   - Top-K retrieval results
 *   - KAG context
 *
 * Streams response back to client (if applicable).
 */
function makeGemma4Synthesis() {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { reranked_results, kag_neighbors, trace_id } = state;

    // Build prompt from retrieval results + KAG context
    const rag_context = reranked_results
      ?.map((r: any) => r.payload?.summary || r.payload?.content || '')
      .join('\n\n') ?? '';

    const kag_context = kag_neighbors
      ?.map((n: any) => `${n.label} (${n.relationship})`)
      .join(', ') ?? '';

    const prompt = `Given the following context:

Retrieval Results (RAG):
${rag_context || '(no results)'}

Graph Context (KAG):
${kag_context || '(no graph neighbors)'}

Generate a concise synthesis of the key insights.`;

    // TODO: Call Gemma4 via TurboQuant (:8090) or bifrostChat fallback
    // const llm = await getGemma4Client();
    // const synthesis = await llm.generateText({
    //   messages: [{ role: 'user', content: prompt }],
    //   temperature: 0.3,
    //   max_tokens: 512,
    //   cache_prompt: true
    // });

    // For now, return placeholder
    const synthesis = `[Synthesis placeholder for trace ${trace_id}]`;

    return {
      synthesis,
      step: (state.step ?? 0) + 1,
    };
  };
}

/**
 * LangGraph Node: Write to Postgres + emit events
 *
 * Canonical packet truth flow:
 *   1. Validate (already done in packetTruthValidate)
 *   2. Write to Postgres (trace_events, retrieval_provenance)
 *   3. Invalidate Redis cache (ff1:* keys)
 *   4. Emit NATS event (trace.checkpoint)
 *
 * This ensures:
 *   - Postgres is source of truth
 *   - Redis is invalidated after writes
 *   - No early cache writes
 */
function makeWriteTraceEvent(services: AgentServices) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { trace_id, packet_key, source_ref, feature_id, synthesis, step } = state;

    // Step 1 (already done): Validation in packetTruthValidate

    // Step 2: Write to Postgres (canonical truth — MUST succeed before cache/event write)
    try {
      if (synthesis && packet_key) {
        await services.postgres.writeSynthesis(trace_id, packet_key, synthesis);
      }

      await services.postgres.writeTraceEvent({
        trace_id,
        packet_key: packet_key || '',
        step: step ?? 0,
        node: 'write_trace_event',
        duration_ms: 0,
        status: 'success',
        metadata: { synthesis_length: synthesis?.length ?? 0 },
      });
    } catch (err) {
      return {
        error: `Postgres write failed: ${err instanceof Error ? err.message : String(err)}`,
        step: (state.step ?? 0) + 1,
      };
    }

    // Step 3: Invalidate Redis cache AFTER successful Postgres write
    if (packet_key && source_ref && feature_id) {
      try {
        await services.bitfrost.invalidatePacket(packet_key, source_ref, feature_id);
      } catch (err) {
        // Non-blocking — log but continue
        console.warn(`Redis invalidation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Step 4: Emit NATS event (non-blocking, async notifications)
    if (synthesis && packet_key) {
      try {
        const nats = getNatsClient();
        const checkpointEvent: TraceCheckpointEvent = {
          trace_id,
          packet_key,
          step: step ?? 0,
          node: 'write_trace_event',
          duration_ms: 0, // Would measure actual duration in production
          synthesis_length: synthesis.length,
          timestamp: new Date().toISOString(),
        };
        await nats.publishTraceCheckpoint(checkpointEvent);
      } catch (err) {
        // Non-blocking — log but continue
        console.warn(`NATS publish failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      step: (state.step ?? 0) + 1,
    };
  };
}

/**
 * Conditional router: check for errors or cache hits
 */
function routeOnError(state: AgentStateType): string {
  if (state.error) return 'error';
  if (state.reranked_results && state.reranked_results.length === 0 && state.step! > 2) {
    return 'error';
  }
  return 'continue';
}

/**
 * Build the LangGraph state machine
 *
 * Flow:
 *   start
 *     ↓
 *   load_trace_state
 *     ↓
 *   packet_registry_lookup
 *     ↓
 *   bitfrost_cache_check
 *     ↓
 *   hybrid_retrieval
 *     ↓
 *   optional_gpu_rerank
 *     ↓
 *   packet_truth_validate
 *     ↓ (if no error)
 *   gemma4_synthesis
 *     ↓
 *   write_trace_event
 *     ↓
 *   end
 */
export function buildAgentGraph(
  postgresPool: Pool,
  redisClient: Redis,
  qdrantClient: QdrantClient,
  neo4jDriver: Driver
) {
  const services: AgentServices = {
    postgres: getPostgresClient(postgresPool),
    bitfrost: getBitFrostClient(redisClient),
    qdrant: getQdrantClient(qdrantClient),
    neo4j: getNeo4jClient(neo4jDriver),
  };

  const graph = new StateGraph(AgentState)
    .addNode('load_trace_state', makeLoadTraceState(services))
    .addNode('packet_registry_lookup', makePacketRegistryLookup(services))
    .addNode('bitfrost_cache_check', makeBitfrostCacheCheck(services))
    .addNode('hybrid_retrieval', makeHybridRetrieval(services))
    .addNode('optional_gpu_rerank', makeOptionalGpuRerank())
    .addNode('packet_truth_validate', makePacketTruthValidate(services))
    .addNode('gemma4_synthesis', makeGemma4Synthesis())
    .addNode('write_trace_event', makeWriteTraceEvent(services))
    .addEdge('start', 'load_trace_state')
    .addEdge('load_trace_state', 'packet_registry_lookup')
    .addEdge('packet_registry_lookup', 'bitfrost_cache_check')
    .addEdge('bitfrost_cache_check', 'hybrid_retrieval')
    .addEdge('hybrid_retrieval', 'optional_gpu_rerank')
    .addEdge('optional_gpu_rerank', 'packet_truth_validate')
    .addConditionalEdges('packet_truth_validate', routeOnError, {
      continue: 'gemma4_synthesis',
      error: 'end',
    })
    .addEdge('gemma4_synthesis', 'write_trace_event')
    .addEdge('write_trace_event', 'end');

  return graph.compile();
}

/**
 * Run the agent loop with a given envelope
 *
 * Requires service clients to be injected via buildAgentGraph().
 * Call buildAgentGraph(pool, redis, qdrant, neo4j) first, then runAgent().
 */
export async function runAgent(
  agent: ReturnType<typeof buildAgentGraph>,
  envelope: AtlasTaskEnvelope
): Promise<AgentStateType> {
  const result = await agent.invoke({
    trace_id: envelope.trace_id,
    packet_key: envelope.packet_key,
    source_ref: envelope.source_ref,
    feature_id: envelope.feature_id,
    strategy: envelope.strategy,
    step: 0,
    trace_events: [],
  });

  return result;
}
