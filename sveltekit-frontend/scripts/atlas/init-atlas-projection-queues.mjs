#!/usr/bin/env node
/**
 * init-atlas-projection-queues — One-time topology setup for Atlas projection pipeline.
 *
 * Creates:
 *   exchange  atlas.projection  (direct, durable)
 *   queue     atlas.qdrant.project       (main work queue, dead-letters to atlas.projection/dead)
 *   queue     atlas.qdrant.project.retry (30s TTL, re-routes to project)
 *   queue     atlas.qdrant.project.dead  (dead letter sink)
 *
 * Safe to re-run (assertExchange/assertQueue are idempotent).
 *
 * Usage:
 *   node scripts/atlas/init-atlas-projection-queues.mjs
 */

import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL
  ?? `amqp://${process.env.RABBITMQ_USER ?? 'guest'}:${process.env.RABBITMQ_PASSWORD ?? 'guest'}@${process.env.RABBITMQ_HOST ?? 'localhost'}:${process.env.RABBITMQ_PORT ?? '5672'}`;

const EXCHANGE    = 'atlas.projection';
const QUEUE       = 'atlas.qdrant.project';
const RETRY_QUEUE = 'atlas.qdrant.project.retry';
const DEAD_QUEUE  = 'atlas.qdrant.project.dead';

console.log('=== Atlas Projection Queue Init ===');
console.log(`Exchange  : ${EXCHANGE}`);
console.log(`Queue     : ${QUEUE}`);
console.log(`Retry     : ${RETRY_QUEUE} (30s TTL → ${QUEUE})`);
console.log(`Dead      : ${DEAD_QUEUE}`);
console.log('');

const connection = await amqp.connect(RABBITMQ_URL);
const channel    = await connection.createChannel();

// Exchange
await channel.assertExchange(EXCHANGE, 'direct', { durable: true });

// Main work queue
await channel.assertQueue(QUEUE, {
  durable: true,
  arguments: {
    'x-dead-letter-exchange':    EXCHANGE,
    'x-dead-letter-routing-key': 'dead',
  },
});
await channel.bindQueue(QUEUE, EXCHANGE, 'project');

// Retry queue — messages live 30s then re-route to main queue
await channel.assertQueue(RETRY_QUEUE, {
  durable: true,
  arguments: {
    'x-message-ttl':             30_000,
    'x-dead-letter-exchange':    EXCHANGE,
    'x-dead-letter-routing-key': 'project',
  },
});
await channel.bindQueue(RETRY_QUEUE, EXCHANGE, 'retry');

// Dead letter sink
await channel.assertQueue(DEAD_QUEUE, { durable: true });
await channel.bindQueue(DEAD_QUEUE, EXCHANGE, 'dead');

const { messageCount: mainCount }  = await channel.checkQueue(QUEUE);
const { messageCount: retryCount } = await channel.checkQueue(RETRY_QUEUE);
const { messageCount: deadCount }  = await channel.checkQueue(DEAD_QUEUE);

console.log('Queue state:');
console.log(`  ${QUEUE}       : ${mainCount} messages`);
console.log(`  ${RETRY_QUEUE} : ${retryCount} messages`);
console.log(`  ${DEAD_QUEUE}  : ${deadCount} messages`);
console.log('');
console.log('✅ Atlas projection queue topology ready');

await channel.close();
await connection.close();
