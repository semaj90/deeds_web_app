/**
 * Outbox publisher boot helper.
 *
 * Wire this into hooks.server.ts AFTER RabbitMQ is confirmed active:
 *
 *   import('$lib/server/queue/outbox-boot.js')
 *     .then(({ startOutboxPublisherWithRabbit }) => startOutboxPublisherWithRabbit())
 *     .then(() => console.log('[Boot] Outbox publisher active'))
 *     .catch((err) => console.warn('[Boot] Outbox publisher failed (non-fatal):', err.message));
 *
 * The publisher uses an independent AMQP connection (not the consumer connection)
 * so it doesn't interfere with consumer prefetch counts.
 */

import { startOutboxPublisher } from './outbox.js';

let _stopPublisher: (() => void) | null = null;

export async function startOutboxPublisherWithRabbit(): Promise<void> {
  if (_stopPublisher) return; // already running

  // Dynamically import amqplib to avoid breaking the module graph when
  // RabbitMQ is unavailable (amqplib is an optional peer dep).
  const amqplib = await import('amqplib');
  const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
  const conn = await amqplib.connect(rabbitUrl);
  const ch = await conn.createChannel();

  // Confirm mode: every publish gets an ack from the broker.
  await ch.confirmSelect();

  async function publishFn(exchange: string, routingKey: string, payload: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const ok = ch.publish(exchange, routingKey, payload, {
        persistent: true,
        contentType: 'application/json',
      });
      if (ok) {
        ch.waitForConfirms().then(resolve).catch(reject);
      } else {
        // Channel write buffer full — wait for drain
        ch.once('drain', () => ch.waitForConfirms().then(resolve).catch(reject));
      }
    });
  }

  _stopPublisher = startOutboxPublisher({ publishFn, intervalMs: 1000, batchSize: 50 });

  conn.on('close', () => {
    console.warn('[outbox-boot] AMQP connection closed — publisher stopped');
    _stopPublisher = null;
  });
  conn.on('error', (err: Error) => {
    console.warn('[outbox-boot] AMQP connection error:', err.message);
  });
}

export function stopOutboxPublisher(): void {
  _stopPublisher?.();
  _stopPublisher = null;
}
