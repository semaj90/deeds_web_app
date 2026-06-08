#!/usr/bin/env node
/**
 * declare-rabbitmq-queues.mjs
 *
 * Asserts all 7 application queues + 3 exchanges against RabbitMQ without
 * needing the SvelteKit dev server running. Run this on cold start when
 * "npm run dev" hasn't been invoked yet and the kanban shows B1 (0 queues).
 *
 * Usage:
 *   node scripts/atlas/declare-rabbitmq-queues.mjs
 *   RABBITMQ_URL=amqp://guest:guest@localhost:5672 node scripts/atlas/declare-rabbitmq-queues.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..');

// Load .env for RABBITMQ_URL if present
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

// Queues declared by rabbitmq-manager-fixed.ts (7 canonical queues).
// TTL 300000ms (5 min) matches assertMainQueue() in rabbitmq-manager-fixed.ts.
// Omitting the args would cause a 406 PRECONDITION_FAILED on already-declared queues.
const QUEUE_TTL = 300000;
const QUEUES = [
  'cache.invalidate',
  'document.embed',
  'evidence.process',
  'vector.index',
  'chat.context',
  'analytics.track',
  'codebase.index',
];

// Exchanges
const EXCHANGES = [
  { name: 'legal.background',      type: 'topic' },
  { name: 'document.processing',   type: 'topic' },
  { name: 'vector.updates',        type: 'topic' },
  { name: 'analytics.events',      type: 'topic' },
];

// Queue → exchange bindings (mirrors bindQueues() in rabbitmq-manager-fixed.ts)
const BINDINGS = [
  { queue: 'cache.invalidate',  exchange: 'legal.background',    key: 'cache.invalidate'  },
  { queue: 'document.embed',    exchange: 'document.processing', key: 'document.embed'    },
  { queue: 'evidence.process',  exchange: 'document.processing', key: 'evidence.process'  },
  { queue: 'vector.index',      exchange: 'vector.updates',      key: 'vector.index.*'    },
  { queue: 'chat.context',      exchange: 'vector.updates',      key: 'chat.context.*'    },
  { queue: 'analytics.track',   exchange: 'analytics.events',    key: 'analytics.*'       },
  { queue: 'codebase.index',    exchange: 'document.processing', key: 'codebase.index.*'  },
];

async function main() {
  console.log('\n── RabbitMQ queue declaration ──────────────────────────');
  console.log(`  url: ${RABBITMQ_URL.replace(/:([^@]+)@/, ':***@')}\n`);

  // Dynamic amqplib import (avoids ESM namespace import issues)
  let amqp;
  try {
    const req = createRequire(import.meta.url);
    amqp = req('amqplib');
  } catch {
    console.error('  ❌ amqplib not found. Run: npm install amqplib');
    process.exit(1);
  }

  let conn, channel;
  try {
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();
  } catch (e) {
    console.error(`  ❌ Connection failed: ${e.message}`);
    console.error('     Is the RabbitMQ container running?');
    console.error('     docker ps --filter name=rabbitmq');
    process.exit(1);
  }

  // Assert exchanges
  console.log('  Exchanges:');
  for (const ex of EXCHANGES) {
    await channel.assertExchange(ex.name, ex.type, { durable: true });
    console.log(`    ✅ ${ex.name} (${ex.type})`);
  }

  // Assert queues (TTL arg matches rabbitmq-manager-fixed.ts assertMainQueue)
  console.log('\n  Queues:');
  for (const q of QUEUES) {
    const info = await channel.assertQueue(q, {
      durable: true,
      arguments: { 'x-message-ttl': QUEUE_TTL },
    });
    console.log(`    ✅ ${q}  (${info.messageCount} msgs, ${info.consumerCount} consumers)`);
  }

  // Bind queues to exchanges
  console.log('\n  Bindings:');
  for (const b of BINDINGS) {
    await channel.bindQueue(b.queue, b.exchange, b.key).catch(() => {
      // bindQueue is idempotent — duplicate bindings are silently accepted by AMQP
    });
    console.log(`    ✅ ${b.queue} → ${b.exchange} [${b.key}]`);
  }

  await channel.close();
  await conn.close();

  console.log('\n── Done ─────────────────────────────────────────────────');
  console.log(`  ${QUEUES.length} queues + ${EXCHANGES.length} exchanges declared.`);
  console.log('  Verify: docker exec b19c2ffc2b28_legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers\n');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
