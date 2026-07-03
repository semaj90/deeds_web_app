#!/usr/bin/env node
/**
 * Safely refill the Phase 7 summary queue only when it is near empty.
 *
 * This avoids blindly re-enqueuing unsummarized rows while many messages are
 * already in RabbitMQ. The producer write path is idempotent, but duplicate
 * queued work still wastes Gemma4 time.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const RABBITMQ_API =
  process.env.RABBITMQ_API || 'http://127.0.0.1:15672/api/queues/%2f/phase7.summarization';
const RABBITMQ_USER = process.env.RABBITMQ_USER || 'guest';
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'guest';
const THRESHOLD = Number(process.env.PHASE7_REFILL_THRESHOLD || 50);
const BATCH = Number(process.env.PHASE7_REFILL_BATCH || 500);
const LIMIT = Number(process.env.PHASE7_REFILL_LIMIT || 2000);
const WATCH = process.argv.includes('--watch');
const INTERVAL_MS = Number(process.env.PHASE7_REFILL_INTERVAL_MS || 60000);

function authHeader() {
  return `Basic ${Buffer.from(`${RABBITMQ_USER}:${RABBITMQ_PASSWORD}`).toString('base64')}`;
}

async function readQueue() {
  const res = await fetch(RABBITMQ_API, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    throw new Error(`RabbitMQ API ${res.status}: ${await res.text()}`);
  }

  const q = await res.json();
  return {
    name: q.name,
    messages: Number(q.messages || 0),
    messagesReady: Number(q.messages_ready || 0),
    messagesUnacknowledged: Number(q.messages_unacknowledged || 0),
    consumers: Number(q.consumers || 0),
  };
}

function runProducer() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'sveltekit-frontend/scripts/atlas/phase7-rabbitmq-summary-queue.mjs',
        '--produce',
        `--batch=${BATCH}`,
        `--limit=${LIMIT}`,
      ],
      {
        cwd: 'C:/Users/james/Videos/deeds-web-app',
        env: process.env,
        stdio: 'inherit',
        shell: false,
      }
    );

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`producer exited ${code}`));
    });
  });
}

async function tick() {
  const queue = await readQueue();
  const shouldRefill = queue.messages <= THRESHOLD;
  console.log(JSON.stringify({ at: new Date().toISOString(), queue, threshold: THRESHOLD, shouldRefill }));

  if (!shouldRefill) return false;

  if (queue.consumers < 1) {
    console.warn('Refill skipped: no active consumers on phase7.summarization.');
    return false;
  }

  await runProducer();
  return true;
}

async function main() {
  do {
    await tick();
    if (!WATCH) break;
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  } while (true);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
