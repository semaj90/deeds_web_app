/**
 * RabbitMQ Identity Listener
 * Consumes identity.updated events and triggers dispatcher orchestration
 * Implements retry logic + circuit breaker for resilience
 */

import type { Channel, ConsumeMessage } from 'amqplib';
import type { DispatcherState } from '../langgraph/dispatcher-nodes/types.js';
import { executeDispatcherOrchestration } from './dispatcher-orchestrator.js';
import type { DispatcherOrchestrationContext } from './dispatcher-orchestrator.js';

interface DispatcherEvent {
  event_type: 'identity.updated' | 'identity.quarantine' | 'operator.alert' | 'mirror.synced';
  packet_keys: string[];
  source_ref?: string;
  feature_id?: string;
  timestamp: string;
  [key: string]: unknown;
}

interface ListenerConfig {
  queueName?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

/**
 * Start RabbitMQ identity.updated listener
 * Processes events and triggers dispatcher orchestration
 *
 * @param channel — amqplib Channel
 * @param ctx — Orchestration context (Postgres, Redis, Qdrant, Neo4j)
 * @param config — Listener configuration
 * @returns Listener control object with start/stop methods
 */
export async function startIdentityListener(
  channel: Channel,
  ctx: DispatcherOrchestrationContext,
  config: ListenerConfig = {}
) {
  const {
    queueName = 'dispatcher.identity.updated',
    maxRetries = 3,
    retryDelayMs = 500,
    circuitBreakerThreshold = 10,
    circuitBreakerResetMs = 30000,
  } = config;

  const logger = ctx.logger || console;
  const circuitBreaker: CircuitBreakerState = {
    status: 'closed',
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0,
  };

  let isRunning = false;
  let consumerTag: string | null = null;

  /**
   * Check and update circuit breaker state
   */
  function checkCircuitBreaker(): boolean {
    const now = Date.now();
    const timeSinceLastFailure = now - circuitBreaker.lastFailureTime;

    if (circuitBreaker.status === 'open') {
      // Try to reset after timeout
      if (timeSinceLastFailure > circuitBreakerResetMs) {
        logger.log('[identity-listener] Circuit breaker entering half-open state');
        circuitBreaker.status = 'half-open';
        circuitBreaker.failureCount = 0;
        circuitBreaker.successCount = 0;
        return true;
      }
      return false; // Circuit still open
    }

    // If in half-open or closed state, allow attempts
    return true;
  }

  /**
   * Record success or failure for circuit breaker
   */
  function recordResult(success: boolean): void {
    if (success) {
      circuitBreaker.failureCount = 0;
      circuitBreaker.successCount++;

      if (circuitBreaker.status === 'half-open') {
        logger.log('[identity-listener] Circuit breaker closed (recovered)');
        circuitBreaker.status = 'closed';
        circuitBreaker.successCount = 0;
      }
    } else {
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailureTime = Date.now();

      if (circuitBreaker.failureCount >= circuitBreakerThreshold && circuitBreaker.status !== 'open') {
        logger.error(
          `[identity-listener] Circuit breaker opened (${circuitBreaker.failureCount} failures)`
        );
        circuitBreaker.status = 'open';
      }
    }
  }

  /**
   * Process individual event with retry logic
   */
  async function processEventWithRetry(event: DispatcherEvent, attempt: number = 1): Promise<boolean> {
    // Check circuit breaker before processing
    if (!checkCircuitBreaker()) {
      logger.warn('[identity-listener] Circuit breaker open, rejecting event');
      return false;
    }

    try {
      logger.log(
        `[identity-listener] Processing identity.updated event (${event.packet_keys.length} packets, attempt ${attempt}/${maxRetries})`
      );

      // Build initial dispatcher state from event
      const initialState: DispatcherState = {
        query: `Identity update for ${event.feature_id || 'unknown'}`,
        candidates: event.packet_keys.map((key) => ({
          packet_key: key,
          source_ref: event.source_ref || '',
          feature_id: event.feature_id || '',
          confidence: 0.95,
          summary: '',
        })) as any,
        identity_lane: 'canonical',
        parity_status: 'in_sync',
        dispatch_decision: 'sync_qdrant', // Default decision for identity updates
        dispatch_node: undefined,
        dispatch_tool: undefined,
        dispatch_confidence: 0.9,
        synthesis_path: [],
        tool_calls: [],
        errors: [],
        latency_ms: 0,
        start_time: undefined,
        action: '',
        reason: undefined,
        result: null,
      };

      // Execute orchestration
      const result = await executeDispatcherOrchestration(initialState, ctx);

      if (result.success) {
        logger.log(
          `[identity-listener] Event processed successfully. Mirrors synced: Qdrant=${result.mirror_syncs.qdrant.synced}, Neo4j=${result.mirror_syncs.neo4j.nodes_created}, Events=${result.events_emitted}`
        );
        recordResult(true);
        return true;
      } else {
        logger.warn(`[identity-listener] Event processing had errors: ${result.errors.join(', ')}`);
        recordResult(false);

        // Retry if attempts remaining
        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
          logger.log(`[identity-listener] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return processEventWithRetry(event, attempt + 1);
        }

        return false;
      }
    } catch (err) {
      logger.error(`[identity-listener] Event processing failed (attempt ${attempt}): ${String(err)}`);
      recordResult(false);

      // Retry if attempts remaining
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        logger.log(`[identity-listener] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return processEventWithRetry(event, attempt + 1);
      }

      return false;
    }
  }

  /**
   * Message consumer callback
   */
  async function onMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    try {
      const content = msg.content.toString();
      const event = JSON.parse(content) as DispatcherEvent;

      logger.log(`[identity-listener] Received event: ${event.event_type}`);

      // Process event with retry logic
      const success = await processEventWithRetry(event);

      if (success) {
        // Acknowledge message after successful processing
        channel.ack(msg);
        logger.log('[identity-listener] Message acknowledged');
      } else {
        // Negative acknowledge without requeue (send to dead-letter queue)
        channel.nack(msg, false, false);
        logger.error('[identity-listener] Message rejected (no requeue, will go to DLQ)');
      }
    } catch (err) {
      logger.error(`[identity-listener] Message parsing failed: ${String(err)}`);
      // Negative acknowledge without requeue
      channel.nack(msg, false, false);
    }
  }

  /**
   * Start listening for events
   */
  async function start(): Promise<void> {
    if (isRunning) {
      logger.warn('[identity-listener] Already running');
      return;
    }

    try {
      // Declare queue with dead-letter exchange
      await channel.assertQueue(queueName, { durable: true });

      // Declare dead-letter queue
      const dlqName = `${queueName}.dlq`;
      await channel.assertQueue(dlqName, { durable: true });

      // Set prefetch to 1 (fair dispatch)
      await channel.prefetch(1);

      // Start consuming
      const consumer = await channel.consume(queueName, onMessage, { noAck: false });
      consumerTag = consumer.consumerTag;
      isRunning = true;

      logger.log(`[identity-listener] Started listening on queue: ${queueName}`);
    } catch (err) {
      logger.error(`[identity-listener] Failed to start: ${String(err)}`);
      throw err;
    }
  }

  /**
   * Stop listening for events
   */
  async function stop(): Promise<void> {
    if (!isRunning || !consumerTag) {
      logger.warn('[identity-listener] Not running');
      return;
    }

    try {
      await channel.cancel(consumerTag);
      isRunning = false;
      consumerTag = null;
      logger.log('[identity-listener] Stopped');
    } catch (err) {
      logger.error(`[identity-listener] Failed to stop: ${String(err)}`);
      throw err;
    }
  }

  /**
   * Get listener status
   */
  function status(): {
    running: boolean;
    circuitBreaker: CircuitBreakerState;
  } {
    return {
      running: isRunning,
      circuitBreaker: { ...circuitBreaker },
    };
  }

  return {
    start,
    stop,
    status,
  };
}

/**
 * Validate RabbitMQ listener setup
 */
export async function validateListenerSetup(channel: Channel): Promise<{
  ready: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Declare exchange
    await channel.assertExchange('dispatcher.events', 'topic', { durable: true });

    // Declare main queue
    await channel.assertQueue('dispatcher.identity.updated', { durable: true });

    // Declare dead-letter queue
    await channel.assertQueue('dispatcher.identity.updated.dlq', { durable: true });

    // Bind queue to exchange
    await channel.bindQueue('dispatcher.identity.updated', 'dispatcher.events', 'dispatcher.identity.updated');
  } catch (err) {
    errors.push(`Setup validation failed: ${String(err)}`);
  }

  return {
    ready: errors.length === 0,
    errors,
  };
}
