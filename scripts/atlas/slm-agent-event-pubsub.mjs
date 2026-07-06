#!/usr/bin/env node

/**
 * SLM Agent Event Pub/Sub Helper
 *
 * Publish/subscribe layer for small language model (SLM) agent routing
 * across ONNX, .pt adapter, and native inference lanes.
 *
 * Events:
 *   - slm:packet:infer — publish packet for inference
 *   - slm:model:load — publish model (.pt adapter or ONNX) to load
 *   - slm:batch:dispatch — publish batch inference request
 *   - slm:result:ack — acknowledge result received
 *   - slm:error:recovery — error signal for retry/fallback
 *
 * Subscribers:
 *   - ONNX runtime (browser or Node.js)
 *   - PyTorch adapter loader (.pt merge + LoRA)
 *   - Native inference gateway (llama.cpp, TurboQuant)
 *   - Telemetry + observability
 *
 * Transport:
 *   - Redis Pub/Sub for low-latency routing
 *   - RabbitMQ fanout for persistence + worker pooling
 *   - Event namespace: slm:*
 *
 * Usage:
 *   node scripts/atlas/slm-agent-event-pubsub.mjs --listen --models=onnx,pt,native
 *   node scripts/atlas/slm-agent-event-pubsub.mjs --publish --event=packet:infer --payload='...'
 */

import Redis from 'ioredis';
import amqp from 'amqplib';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);

// Redis for real-time pub/sub
const redis = new Redis({
  host: env.REDIS_HOST || '127.0.0.1',
  port: env.REDIS_PORT || 6379,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  SLM Agent Event Pub/Sub                                       ║');
console.log('║  Route inference requests across ONNX / .pt / native lanes    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Event schema definitions
const eventSchemas = {
  'packet:infer': {
    description: 'Request inference on a single packet',
    fields: {
      packet_key: 'string — packet identity',
      embedding_384: 'number[] — 384-dim input vector',
      model: 'string — target model (onnx|pt|native)',
      priority: 'int — queue priority (1-10)',
      timeout_ms: 'int — inference timeout',
    },
  },
  'model:load': {
    description: 'Load or switch SLM model',
    fields: {
      model_type: 'string — onnx|pt|native',
      model_path: 'string — file path or model ID',
      version: 'string — semantic version',
      config: 'object — model config (quantization, etc)',
    },
  },
  'batch:dispatch': {
    description: 'Batch inference for multiple packets',
    fields: {
      batch_id: 'string — batch identifier (ULID)',
      packet_keys: 'string[] — packet identities',
      embeddings_384: 'number[][] — batch vectors',
      model: 'string — target model',
    },
  },
  'result:ack': {
    description: 'Acknowledge inference result received',
    fields: {
      packet_key: 'string — packet identity',
      model: 'string — model used',
      latency_ms: 'number — inference latency',
      cached: 'boolean — was result cached?',
      success: 'boolean — inference succeeded?',
    },
  },
  'error:recovery': {
    description: 'Signal error and request recovery',
    fields: {
      packet_key: 'string — failed packet',
      model: 'string — failed model',
      error: 'string — error message',
      fallback_model: 'string — alternate model to try',
    },
  },
};

async function listen() {
  console.log('🔊 Listener Mode\n');
  console.log('Event Schema:\n');

  Object.entries(eventSchemas).forEach(([name, schema]) => {
    console.log(`${name}:`);
    console.log(`  ${schema.description}`);
    console.log(`  Fields:`);
    Object.entries(schema.fields).forEach(([field, desc]) => {
      console.log(`    - ${field}: ${desc}`);
    });
    console.log();
  });

  console.log('Connecting to Redis...\n');

  try {
    await redis.connect();
    console.log('✅ Connected to Redis\n');

    const channels = [
      'slm:packet:infer',
      'slm:model:load',
      'slm:batch:dispatch',
      'slm:result:ack',
      'slm:error:recovery',
    ];

    const subscriber = new Redis({
      host: env.REDIS_HOST || '127.0.0.1',
      port: env.REDIS_PORT || 6379,
      password: env.REDIS_PASSWORD || undefined,
    });

    console.log(`📡 Subscribing to ${channels.length} channels...\n`);

    subscriber.subscribe(channels, (err, count) => {
      if (err) {
        console.error('❌ Subscribe error:', err);
      } else {
        console.log(`✅ Subscribed to ${count} channels\n`);
      }
    });

    subscriber.on('message', (channel, message) => {
      console.log(`[${new Date().toISOString()}] ${channel}`);
      try {
        const payload = JSON.parse(message);
        console.log(`  Payload: ${JSON.stringify(payload, null, 2).split('\n').join('\n  ')}\n`);
      } catch {
        console.log(`  Raw: ${message}\n`);
      }
    });

    subscriber.on('error', (err) => {
      console.error('❌ Subscriber error:', err);
    });

  } catch (err) {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  }
}

async function publish() {
  console.log('📤 Publisher Mode\n');

  const eventArg = process.argv.find(arg => arg.startsWith('--event='));
  const payloadArg = process.argv.find(arg => arg.startsWith('--payload='));

  if (!eventArg || !payloadArg) {
    console.error('❌ Usage: --event=packet:infer --payload=\'{"packet_key":"...", ...}\'');
    process.exit(1);
  }

  const event = eventArg.split('=')[1];
  const payload = JSON.parse(payloadArg.split('=')[1]);

  console.log(`Event: slm:${event}`);
  console.log(`Payload: ${JSON.stringify(payload, null, 2)}\n`);

  try {
    await redis.connect();

    const channel = `slm:${event}`;
    const message = JSON.stringify(payload);

    const numSubscribers = await redis.publish(channel, message);
    console.log(`✅ Published to ${numSubscribers} subscriber(s)\n`);

    await redis.quit();
  } catch (err) {
    console.error('❌ Publish error:', err.message);
    process.exit(1);
  }
}

async function demo() {
  console.log('🎬 Demo Mode\n');

  try {
    await redis.connect();

    const subscriber = new Redis({
      host: env.REDIS_HOST || '127.0.0.1',
      port: env.REDIS_PORT || 6379,
      password: env.REDIS_PASSWORD || undefined,
    });

    subscriber.subscribe('slm:*', (err) => {
      if (err) {
        console.error('❌ Subscribe error:', err);
        process.exit(1);
      }
    });

    subscriber.on('message', (channel, message) => {
      console.log(`\n[${new Date().toISOString()}] ${channel}`);
      try {
        const payload = JSON.parse(message);
        console.log(`  ${JSON.stringify(payload, null, 2).split('\n').join('\n  ')}`);
      } catch {
        console.log(`  ${message}`);
      }
    });

    console.log('📡 Listening for SLM events...\n');
    console.log('Publishing demo events...\n');

    // Demo: model load
    await redis.publish(
      'slm:model:load',
      JSON.stringify({
        model_type: 'onnx',
        model_path: 'static/models/gemma3-270m.onnx',
        version: '1.0.0',
        config: { quantization: 'q4' },
      })
    );

    // Demo: packet infer
    await new Promise(r => setTimeout(r, 500));
    await redis.publish(
      'slm:packet:infer',
      JSON.stringify({
        packet_key: 'ace:packet:auth:001',
        embedding_384: new Array(384).fill(0.1),
        model: 'onnx',
        priority: 5,
        timeout_ms: 5000,
      })
    );

    // Demo: result ack
    await new Promise(r => setTimeout(r, 500));
    await redis.publish(
      'slm:result:ack',
      JSON.stringify({
        packet_key: 'ace:packet:auth:001',
        model: 'onnx',
        latency_ms: 245,
        cached: false,
        success: true,
      })
    );

    console.log('\n✅ Demo complete. Press Ctrl+C to exit.\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

async function main() {
  if (process.argv.includes('--listen')) {
    await listen();
  } else if (process.argv.includes('--publish')) {
    await publish();
  } else if (process.argv.includes('--demo')) {
    await demo();
  } else {
    console.log('Usage:');
    console.log('  node scripts/atlas/slm-agent-event-pubsub.mjs --listen');
    console.log('  node scripts/atlas/slm-agent-event-pubsub.mjs --publish --event=packet:infer --payload=\'{"packet_key":"..."}\'');
    console.log('  node scripts/atlas/slm-agent-event-pubsub.mjs --demo');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
