/**
 * Dispatcher Orchestrator
 * Ties together: Dispatcher decision → LangGraph execution → Mirror worker callbacks
 * Manages the complete 3-tier event pipeline
 */

import { createDispatcherGraph } from '../langgraph/dispatcher-graph.js';
import type { DispatcherState, NodeContext } from '../langgraph/dispatcher-nodes/types.js';
import {
  syncPacketsToQdrant,
  syncPacketsToNeo4j,
  invalidateRedisCache,
  emitDispatcherEvents,
  validateQdrantHealth,
  validateNeo4jHealth,
  validateRedisHealth,
  validateRabbitMQHealth,
} from './index.js';
import { persistDispatcherDecision } from './dispatcher-audit-service.js';

export interface DispatcherOrchestrationContext {
  qdrantBaseUrl: string;
  postgres: any; // Drizzle client
  redis: any; // ioredis client
  neo4jSession: any; // Neo4j session from driver
  rabbitmqChannel: any; // amqplib Channel
  logger?: Console;
}

export interface DispatcherOrchestrationResult {
  success: boolean;
  dispatch_decision: string;
  dispatch_confidence?: number; // 0-1, added by signal extractor
  synthesis_path: string[];
  mirror_syncs: {
    qdrant: { synced: number; failed: number; duration_ms: number };
    neo4j: { nodes_created: number; nodes_updated: number; edges_created: number; duration_ms: number };
    redis: { invalidated: number; key_count: number; duration_ms: number };
  };
  events_emitted: number;
  total_duration_ms: number;
  errors: string[];
}

/**
 * Execute full dispatcher orchestration pipeline
 * Runs LangGraph state machine → triggers mirror workers → emits events
 *
 * @param state — Initial dispatcher state
 * @param ctx — Dispatcher orchestration context with services
 * @returns Full orchestration result with all mirror sync metrics
 */
export async function executeDispatcherOrchestration(
  state: DispatcherState,
  ctx: DispatcherOrchestrationContext
): Promise<DispatcherOrchestrationResult> {
  const startMs = Date.now();
  const errors: string[] = [];
  const logger = ctx.logger || console;

  logger.log('[dispatcher-orchestrator] Starting orchestration pipeline...');

  try {
    // ────────────────────────────────────────────────────────────
    // Step 1: Pre-flight health checks
    // ────────────────────────────────────────────────────────────
    logger.log('[dispatcher-orchestrator] Running pre-flight health checks...');

    const qdrantHealth = await validateQdrantHealth(ctx.qdrantBaseUrl);
    if (!qdrantHealth.healthy) {
      errors.push(`Qdrant health check failed: ${qdrantHealth.error}`);
      logger.warn(`[dispatcher-orchestrator] Qdrant warning: ${qdrantHealth.error}`);
    }

    const neo4jHealth = await validateNeo4jHealth(ctx.neo4jSession);
    if (!neo4jHealth.healthy) {
      errors.push(`Neo4j health check failed: ${neo4jHealth.error}`);
      logger.warn(`[dispatcher-orchestrator] Neo4j warning: ${neo4jHealth.error}`);
    }

    const redisHealth = await validateRedisHealth(ctx.redis);
    if (!redisHealth.healthy) {
      errors.push(`Redis health check failed: ${redisHealth.error}`);
      logger.warn(`[dispatcher-orchestrator] Redis warning: ${redisHealth.error}`);
    }

    const rabbitmqHealth = await validateRabbitMQHealth(ctx.rabbitmqChannel);
    if (!rabbitmqHealth.healthy) {
      errors.push(`RabbitMQ health check failed: ${rabbitmqHealth.error}`);
      logger.warn(`[dispatcher-orchestrator] RabbitMQ warning: ${rabbitmqHealth.error}`);
    }

    // ────────────────────────────────────────────────────────────
    // Step 2: Execute LangGraph state machine
    // ────────────────────────────────────────────────────────────
    logger.log(
      `[dispatcher-orchestrator] Executing LangGraph for decision: ${state.dispatch_decision}`
    );

    const nodeContext: NodeContext = {
      mcpClient: {
        callTool: async (name: string, args: any) => ({
          content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
        }),
      } as any,
      postgres: ctx.postgres,
      redis: ctx.redis,
      qdrant: null,
      neo4j: ctx.neo4jSession,
      logger,
    };

    const graph = createDispatcherGraph(nodeContext);
    const finalState = await graph.invoke(state);

    logger.log(
      `[dispatcher-orchestrator] LangGraph execution complete. Path: ${finalState.synthesis_path.join(' → ')}`
    );

    // ────────────────────────────────────────────────────────────
    // Step 3: Trigger mirror workers based on dispatch decision
    // ────────────────────────────────────────────────────────────
    logger.log('[dispatcher-orchestrator] Triggering mirror worker callbacks...');

    const mirrorSyncs = {
      qdrant: { synced: 0, failed: 0, duration_ms: 0 },
      neo4j: { nodes_created: 0, nodes_updated: 0, edges_created: 0, duration_ms: 0 },
      redis: { invalidated: 0, key_count: 0, duration_ms: 0 },
    };

    // Qdrant sync (if decision is sync_qdrant or synthesize)
    if (['sync_qdrant', 'synthesize'].includes(finalState.dispatch_decision)) {
      logger.log('[dispatcher-orchestrator] Syncing to Qdrant...');
      const qdrantResult = await syncPacketsToQdrant(
        ctx.qdrantBaseUrl,
        finalState.candidates.map((c) => ({
          packet_key: c.packet_key,
          source_ref: c.source_ref || '',
          feature_id: c.feature_id,
          identity_lane: finalState.identity_lane,
          confidence: c.confidence,
          summary: c.summary,
          directory_path: c.directory_path,
          domain_class: c.domain_class,
        }))
      );
      mirrorSyncs.qdrant = {
        synced: qdrantResult.synced,
        failed: qdrantResult.failed,
        duration_ms: qdrantResult.duration_ms,
      };
      logger.log(`[dispatcher-orchestrator] Qdrant sync: ${qdrantResult.synced} synced, ${qdrantResult.failed} failed`);
    }

    // Neo4j sync (if decision is sync_neo4j or synthesize)
    if (['sync_neo4j', 'synthesize'].includes(finalState.dispatch_decision)) {
      logger.log('[dispatcher-orchestrator] Syncing to Neo4j...');
      const neo4jResult = await syncPacketsToNeo4j(
        ctx.neo4jSession,
        finalState.candidates.map((c) => ({
          packet_key: c.packet_key,
          source_ref: c.source_ref || '',
          feature_id: c.feature_id,
          summary: c.summary,
          confidence: c.confidence,
          identity_lane: finalState.identity_lane,
          directory_path: c.directory_path,
        })),
        ['BELONGS_TO_FEATURE', 'BELONGS_TO_CLUSTER', 'SIMILAR_TOPOLOGY']
      );
      mirrorSyncs.neo4j = {
        nodes_created: neo4jResult.nodes_created,
        nodes_updated: neo4jResult.nodes_updated,
        edges_created: neo4jResult.edges_created,
        duration_ms: neo4jResult.duration_ms,
      };
      logger.log(
        `[dispatcher-orchestrator] Neo4j sync: ${neo4jResult.nodes_created} nodes created, ${neo4jResult.edges_created} edges`
      );
    }

    // Redis invalidation (always after mirror syncs)
    if (finalState.candidates.length > 0) {
      logger.log('[dispatcher-orchestrator] Invalidating Redis cache...');
      const redisResult = await invalidateRedisCache(
        ctx.redis,
        finalState.candidates.map((c) => ({
          packet_key: c.packet_key,
          source_ref: c.source_ref || '',
          feature_id: c.feature_id,
        }))
      );
      mirrorSyncs.redis = {
        invalidated: redisResult.invalidated,
        key_count: redisResult.key_count,
        duration_ms: redisResult.duration_ms,
      };
      logger.log(`[dispatcher-orchestrator] Redis invalidation: ${redisResult.invalidated} keys invalidated`);
    }

    // ────────────────────────────────────────────────────────────
    // Step 4: Emit RabbitMQ events
    // ────────────────────────────────────────────────────────────
    logger.log('[dispatcher-orchestrator] Emitting RabbitMQ events...');

    const events = [];

    // Event 1: Identity update (always)
    if (finalState.candidates.length > 0) {
      events.push({
        event_type: 'identity.updated',
        packet_keys: finalState.candidates.map((c) => c.packet_key),
        source_ref: finalState.candidates[0]?.source_ref,
        feature_id: finalState.candidates[0]?.feature_id,
        timestamp: new Date().toISOString(),
      });
    }

    // Event 2: Operator alert (if escalation)
    if (finalState.dispatch_decision === 'escalate') {
      events.push({
        event_type: 'operator.alert',
        packet_keys: finalState.candidates.map((c) => c.packet_key),
        reason: finalState.reason || 'Unhandled dispatch decision',
        severity: 'medium',
        synthesis_path: finalState.synthesis_path,
        errors: finalState.errors,
        timestamp: new Date().toISOString(),
      });
    }

    let eventsEmitted = 0;
    if (events.length > 0) {
      const emitResult = await emitDispatcherEvents(ctx.rabbitmqChannel, events as any);
      eventsEmitted = emitResult.emitted;
      if (emitResult.errors.length > 0) {
        errors.push(...emitResult.errors);
      }
      logger.log(`[dispatcher-orchestrator] RabbitMQ events emitted: ${emitResult.emitted}`);
    }

    // ────────────────────────────────────────────────────────────
    // Persist audit log
    // ────────────────────────────────────────────────────────────
    const totalDurationMs = Date.now() - startMs;
    const orchestrationResult = {
      success: errors.length === 0,
      dispatch_decision: finalState.dispatch_decision,
      synthesis_path: finalState.synthesis_path,
      mirror_syncs: mirrorSyncs,
      events_emitted: eventsEmitted,
      total_duration_ms: totalDurationMs,
      errors,
    };

    try {
      const primaryPacketKey = finalState.candidates[0]?.packet_key || 'unknown';
      await persistDispatcherDecision(ctx.postgres, orchestrationResult, primaryPacketKey);
    } catch (auditErr) {
      logger.error(`[dispatcher-orchestrator] Failed to persist audit log: ${String(auditErr)}`);
      // Non-blocking: don't fail the orchestration if audit fails
    }

    // ────────────────────────────────────────────────────────────
    // Return orchestration result
    // ────────────────────────────────────────────────────────────
    logger.log(
      `[dispatcher-orchestrator] Orchestration complete in ${totalDurationMs}ms. Errors: ${errors.length}`
    );

    return orchestrationResult;
  } catch (err) {
    const errMsg = `Dispatcher orchestration failed: ${String(err)}`;
    errors.push(errMsg);
    logger.error(`[dispatcher-orchestrator] ${errMsg}`);

    return {
      success: false,
      dispatch_decision: state.dispatch_decision,
      synthesis_path: state.synthesis_path,
      mirror_syncs: {
        qdrant: { synced: 0, failed: 0, duration_ms: 0 },
        neo4j: { nodes_created: 0, nodes_updated: 0, edges_created: 0, duration_ms: 0 },
        redis: { invalidated: 0, key_count: 0, duration_ms: 0 },
      },
      events_emitted: 0,
      total_duration_ms: Date.now() - startMs,
      errors,
    };
  }
}
