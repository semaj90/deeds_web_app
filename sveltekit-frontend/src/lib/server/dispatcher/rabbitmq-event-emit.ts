/**
 * RabbitMQ Event Emission Service
 * Publishes dispatcher events to queues for async processing
 * Supports operator escalation, packet updates, and mirror syncs
 */

import type { Channel } from 'amqplib';

interface DispatcherEvent {
  event_type: 'identity.quarantine' | 'identity.updated' | 'operator.alert' | 'mirror.synced';
  packet_keys: string[];
  source_ref?: string;
  feature_id?: string;
  reason?: string;
  severity?: 'low' | 'medium' | 'high';
  synthesis_path?: string[];
  errors?: string[];
  timestamp: string;
}

interface EventEmissionResult {
  emitted: number;
  failed: number;
  exchanges: string[];
  routing_keys: string[];
  duration_ms: number;
  errors: string[];
}

/**
 * Emit dispatcher events to RabbitMQ
 * Routes events to appropriate exchanges based on event_type
 *
 * @param channel — amqplib Channel
 * @param events — Events to emit
 * @returns Emission result with counts and errors
 */
export async function emitDispatcherEvents(
  channel: Channel,
  events: DispatcherEvent[]
): Promise<EventEmissionResult> {
  const startMs = Date.now();
  let emitted = 0;
  let failed = 0;
  const exchanges = new Set<string>();
  const routingKeys = new Set<string>();
  const errors: string[] = [];

  try {
    // Declare exchanges if not already declared
    await channel.assertExchange('dispatcher.events', 'topic', { durable: true });
    await channel.assertExchange('operator.alerts', 'direct', { durable: true });

    for (const event of events) {
      let exchange = 'dispatcher.events';
      let routingKey = `dispatcher.${event.event_type}`;

      // Route operator alerts separately
      if (event.event_type === 'operator.alert') {
        exchange = 'operator.alerts';
        routingKey = `severity.${event.severity || 'medium'}`;
      }

      exchanges.add(exchange);
      routingKeys.add(routingKey);

      try {
        const message = Buffer.from(JSON.stringify(event));
        const published = channel.publish(exchange, routingKey, message, {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
          headers: {
            'x-event-type': event.event_type,
            'x-packet-count': String(event.packet_keys.length),
          },
        });

        if (published) {
          emitted++;
          console.log(
            `[rabbitmq-emit] Published ${event.event_type} to ${exchange}/${routingKey} (${event.packet_keys.length} packets)`
          );
        } else {
          failed++;
          const errMsg = `Channel.publish returned false for ${event.event_type}`;
          errors.push(errMsg);
          console.error(`[rabbitmq-emit] ${errMsg}`);
        }
      } catch (err) {
        failed++;
        const errMsg = `Event emission failed: ${String(err)}`;
        errors.push(errMsg);
        console.error(`[rabbitmq-emit] ${errMsg}`);
      }
    }

    // Confirm all messages
    await channel.waitForConfirms();
    console.log(`[rabbitmq-emit] All ${emitted} messages confirmed`);
  } catch (err) {
    const errMsg = `RabbitMQ event emission failed: ${String(err)}`;
    errors.push(errMsg);
    console.error(`[rabbitmq-emit] ${errMsg}`);
  }

  const durationMs = Date.now() - startMs;
  return {
    emitted,
    failed,
    exchanges: Array.from(exchanges),
    routing_keys: Array.from(routingKeys),
    duration_ms: durationMs,
    errors,
  };
}

/**
 * Emit operator escalation event
 * Routes to operator.alerts exchange with severity level
 */
export async function emitOperatorEscalation(
  channel: Channel,
  escalation: {
    decision: string;
    reason: string;
    query?: string;
    candidate_count?: number;
    synthesis_path?: string[];
    errors?: string[];
    severity?: 'low' | 'medium' | 'high';
  }
): Promise<{ emitted: boolean; error?: string }> {
  try {
    const event: DispatcherEvent = {
      event_type: 'operator.alert',
      packet_keys: [],
      reason: escalation.reason,
      severity: escalation.severity || 'medium',
      synthesis_path: escalation.synthesis_path || [],
      errors: escalation.errors || [],
      timestamp: new Date().toISOString(),
    };

    const result = await emitDispatcherEvents(channel, [event]);
    return {
      emitted: result.emitted > 0,
      error: result.errors[0],
    };
  } catch (err) {
    return {
      emitted: false,
      error: String(err),
    };
  }
}

/**
 * Emit packet identity update event
 * Triggers identity.updated listener for mirror worker processing
 */
export async function emitIdentityUpdate(
  channel: Channel,
  updates: Array<{
    packet_key: string;
    source_ref: string;
    feature_id: string;
    identity_lane: string;
    confidence: number;
  }>
): Promise<{ emitted: boolean; error?: string }> {
  try {
    const event: DispatcherEvent = {
      event_type: 'identity.updated',
      packet_keys: updates.map((u) => u.packet_key),
      source_ref: updates[0]?.source_ref,
      feature_id: updates[0]?.feature_id,
      timestamp: new Date().toISOString(),
    };

    const result = await emitDispatcherEvents(channel, [event]);
    return {
      emitted: result.emitted > 0,
      error: result.errors[0],
    };
  } catch (err) {
    return {
      emitted: false,
      error: String(err),
    };
  }
}

/**
 * Emit mirror sync completion event
 * Signals that Qdrant/Neo4j/Redis sync has completed
 */
export async function emitMirrorSyncCompleted(
  channel: Channel,
  syncData: {
    mirror_type: 'qdrant' | 'neo4j' | 'redis';
    packet_count: number;
    success_count: number;
    error_count: number;
  }
): Promise<{ emitted: boolean; error?: string }> {
  try {
    const event: DispatcherEvent = {
      event_type: 'mirror.synced',
      packet_keys: [],
      reason: `${syncData.mirror_type} sync completed: ${syncData.success_count}/${syncData.packet_count} packets`,
      timestamp: new Date().toISOString(),
    };

    const result = await emitDispatcherEvents(channel, [event]);
    return {
      emitted: result.emitted > 0,
      error: result.errors[0],
    };
  } catch (err) {
    return {
      emitted: false,
      error: String(err),
    };
  }
}

/**
 * Validate RabbitMQ connectivity and queue health
 */
export async function validateRabbitMQHealth(
  channel: Channel
): Promise<{
  healthy: boolean;
  queues_declared: number;
  error?: string;
}> {
  try {
    // Check connectivity by asserting an exchange
    await channel.assertExchange('dispatcher.events', 'topic', { durable: true });

    // Declare common queues
    const queueNames = [
      'dispatcher.identity.quarantine',
      'dispatcher.identity.recovered',
      'dispatcher.operator.alerts',
      'mirror.qdrant.sync',
      'mirror.neo4j.sync',
      'mirror.redis.invalidate',
    ];

    for (const queueName of queueNames) {
      await channel.assertQueue(queueName, { durable: true });
    }

    return {
      healthy: true,
      queues_declared: queueNames.length,
    };
  } catch (err) {
    return {
      healthy: false,
      queues_declared: 0,
      error: String(err),
    };
  }
}
