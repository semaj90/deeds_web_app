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

function resolveRabbitMqUrl() {
  const configured = process.env.RABBITMQ_URL;
  if (configured && !/guest:guest@/i.test(configured)) return configured;

  try {
    const { spawnSync } = createRequire(import.meta.url)('node:child_process');
    const inspected = spawnSync('docker', ['inspect', 'legal-ai-rabbitmq', '--format', '{{json .Config.Env}}'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const env = JSON.parse(String(inspected.stdout || '[]'));
    const user = env.find((value) => String(value).startsWith('RABBITMQ_DEFAULT_USER='))?.split('=').slice(1).join('=');
    const pass = env.find((value) => String(value).startsWith('RABBITMQ_DEFAULT_PASS='))?.split('=').slice(1).join('=');
    const vhost = env.find((value) => String(value).startsWith('RABBITMQ_DEFAULT_VHOST='))?.split('=').slice(1).join('=') ?? '/';
    if (user && pass) {
      const encodedVhost = vhost === '/' ? '' : `/${encodeURIComponent(vhost)}`;
      return `amqp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@localhost:5672${encodedVhost}`;
    }
  } catch {
    // Fall through to env/default.
  }

  return configured ?? 'amqp://legal_admin:secret123@localhost:5672';
}

const RABBITMQ_URL = resolveRabbitMqUrl();

// Queues declared by rabbitmq-manager-fixed.ts.
// TTL/DLX args match assertMainQueue() in rabbitmq-manager-fixed.ts.
// Omitting any arg causes a 406 PRECONDITION_FAILED on already-declared queues.
const QUEUE_TTL = 300000;
const MEDIA_QUEUE_TTL = 3_600_000;
const DLX = 'dlx.dead-letter';
const QUEUES = [
  'cache.invalidate',
  'document.embed',
  'chat.document.embed',
  'evidence.process',
  'vector.index',
  'chat.context',
  'analytics.track',
  'codebase.index',
  'ace.evaluate',
  'error.embed',
  'synthesis.generate',
  'knowledge.backfill',
  'audio.process',
  'glyph.tile.rebuild',
  'qlora.distill',
  'media.download',
  'media.transcribe',
  'cards.refresh',
  'repair.workflow.run',
  'inference.log.flush',
];

// Exchanges
const EXCHANGES = [
  { name: 'cache.invalidation',    type: 'topic' },
  { name: 'document.processing',   type: 'topic' },
  { name: 'vector.updates',        type: 'topic' },
  { name: 'analytics.events',      type: 'topic' },
  { name: 'codebase.indexing',     type: 'topic' },
  { name: 'audio.processing',      type: 'topic' },
  { name: 'media.processing',      type: 'topic' },
  { name: 'legal.media',           type: 'topic' },
  { name: DLX,                     type: 'topic' },
];

// Queue → exchange bindings (mirrors bindQueues() in rabbitmq-manager-fixed.ts)
const BINDINGS = [
  { queue: 'cache.invalidate',  exchange: 'cache.invalidation',  key: '*.invalidate'      },
  { queue: 'document.embed',    exchange: 'document.processing', key: 'document.embed'    },
  { queue: 'chat.document.embed', exchange: 'document.processing', key: 'document.chat.embed' },
  { queue: 'evidence.process',  exchange: 'document.processing', key: 'evidence.*'        },
  { queue: 'vector.index',      exchange: 'vector.updates',      key: 'vector.index.*'    },
  { queue: 'chat.context',      exchange: 'vector.updates',      key: 'chat.context.*'    },
  { queue: 'analytics.track',   exchange: 'analytics.events',    key: 'analytics.*'       },
  { queue: 'codebase.index',    exchange: 'codebase.indexing',   key: 'codebase.index.*'  },
  { queue: 'media.download',    exchange: 'legal.media',         key: 'media.*'           },
  { queue: 'media.transcribe',  exchange: 'legal.media',         key: 'media.*'           },
  { queue: 'ace.evaluate',      exchange: 'document.processing', key: 'ace.evaluate'      },
  { queue: 'error.embed',       exchange: 'document.processing', key: 'error.embed'       },
  { queue: 'synthesis.generate', exchange: 'document.processing', key: 'synthesis.generate' },
  { queue: 'knowledge.backfill', exchange: 'document.processing', key: 'knowledge.backfill' },
  { queue: 'audio.process',     exchange: 'audio.processing',    key: 'audio.process'     },
  { queue: 'glyph.tile.rebuild', exchange: 'document.processing', key: 'glyph.tile.rebuild' },
  { queue: 'cards.refresh',     exchange: 'document.processing', key: 'cards.refresh'     },
  { queue: 'repair.workflow.run', exchange: 'document.processing', key: 'repair.workflow.run' },
  { queue: 'inference.log.flush', exchange: 'analytics.events',  key: 'inference.log.flush' },
];

function queueOptions(queue) {
  const isMediaQueue = queue === 'media.download' || queue === 'media.transcribe';
  return {
    durable: true,
    arguments: {
      'x-message-ttl': isMediaQueue ? MEDIA_QUEUE_TTL : QUEUE_TTL,
      'x-dead-letter-exchange': DLX,
      'x-dead-letter-routing-key': queue,
    },
  };
}

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

  // Assert DLQs first, mirroring rabbitmq-manager-fixed.ts setupInfrastructure().
  console.log('\n  Dead-letter queues:');
  for (const q of QUEUES) {
    const dlqName = `${q}.dlq`;
    await channel.assertQueue(dlqName, { durable: true });
    await channel.bindQueue(dlqName, DLX, q);
    console.log(`    ✅ ${dlqName}`);
  }

  // Assert queues (TTL + DLX args match rabbitmq-manager-fixed.ts assertMainQueue)
  console.log('\n  Queues:');
  for (const q of QUEUES) {
    const info = await channel.assertQueue(q, queueOptions(q));
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
  console.log(`  ${QUEUES.length} queues + ${QUEUES.length} DLQs + ${EXCHANGES.length} exchanges declared.`);
  console.log('  Verify: docker exec b19c2ffc2b28_legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers\n');
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
