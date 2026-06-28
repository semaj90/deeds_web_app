#!/usr/bin/env node
/**
 * Create or verify the Valkey FT index for semantic prompt caching.
 */

import Redis from 'ioredis';

const REDIS_URL =
  process.env.REDIS_URL ??
  `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? 6379}`;

const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';

const INDEX_NAME = 'prompt:sem:idx';
const KEY_PREFIX = 'prompt:sem:v1:';
const DIM = 768;

const dropFirst = process.argv.includes('--drop-first');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRedisStartupError(err) {
  const msg = String(err?.message || err);
  return (
    msg.includes('LOADING') ||
    msg.includes('Connection is closed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Socket closed unexpectedly') ||
    msg.includes('The client is closed')
  );
}

async function waitForValkeyReady(client, retries = 90) {
  for (let i = 1; i <= retries; i++) {
    try {
      const pong = await client.ping();
      const persistence = await client.info('persistence');

      if (pong === 'PONG' && persistence.includes('loading:0')) {
        console.log('✅ Valkey ready');
        return;
      }

      console.log(`⏳ Valkey still loading (${i}/${retries})`);
    } catch (err) {
      if (!isRetryableRedisStartupError(err)) throw err;
      console.log(`⏳ Waiting for Valkey (${i}/${retries}): ${String(err?.message || err)}`);
    }

    await sleep(1000);
  }

  throw new Error(`Valkey did not become ready after ${retries}s`);
}

async function safeQuit(client) {
  try {
    if (client.isOpen) await client.quit();
  } catch {
    try {
      await client.disconnect();
    } catch {
      // ignore shutdown errors
    }
  }
}

const redis = new Redis({
  url: REDIS_URL,
  password: REDIS_PASS,
  connectTimeout: 4000,
  retryStrategy: (retries) => Math.min(retries * 250, 3000),
  lazyConnect: true,
});

redis.on('error', (err) => {
  const msg = String(err?.message || err);
  if (!isRetryableRedisStartupError(err)) {
    console.warn(`[valkey] ${msg}`);
  }
});

try {
  await redis.connect();
  await waitForValkeyReady(redis);

  if (dropFirst) {
    try {
      await redis.call('FT.DROPINDEX', INDEX_NAME);
      console.log(`✅ Dropped existing index ${INDEX_NAME}`);
    } catch (err) {
      const msg = String(err?.message || err);
      if (
        msg.includes('Unknown Index name') ||
        msg.includes('no such index') ||
        msg.includes('index does not exist')
      ) {
        console.log('ℹ️  No existing index to drop');
      } else {
        throw err;
      }
    }
  }

  let indexExists = false;
  try {
    const info = await redis.call('FT.INFO', INDEX_NAME);
    console.log(`✅ Index ${INDEX_NAME} already exists — skipping creation`);

    const numDocs = Array.isArray(info) ? (info[info.indexOf('num_docs') + 1] ?? '?') : '?';

    console.log(`   num_docs: ${numDocs}`);
    indexExists = true;
  } catch (err) {
    const msg = String(err?.message || err);

    if (
      !msg.includes('Unknown Index name') &&
      !msg.includes('no such index') &&
      !msg.includes('index does not exist')
    ) {
      throw err;
    }
    // Index doesn't exist, proceed to create it
  }

  if (!indexExists) {
    await redis.call(
      'FT.CREATE',
      INDEX_NAME,
      'ON',
      'HASH',
      'PREFIX',
      '1',
      KEY_PREFIX,
      'SCHEMA',
      'kind',
      'TAG',
      'tags',
      'TAG',
      'SEPARATOR',
      ',',
      'model',
      'TAG',
      'vec',
      'VECTOR',
      'HNSW',
      '10',
      'TYPE',
      'FLOAT32',
      'DIM',
      String(DIM),
      'DISTANCE_METRIC',
      'COSINE',
      'M',
      '16',
      'EF_CONSTRUCTION',
      '200'
    );

    console.log(`✅ Created index ${INDEX_NAME}`);
    console.log(`   prefix  : ${KEY_PREFIX}`);
    console.log(`   vector  : HNSW FLOAT32 ${DIM}-dim cosine`);
    console.log('   fields  : kind(TAG), tags(TAG), model(TAG), vec(VECTOR)');
  }

  await safeQuit(redis);
} catch (err) {
  console.error(`❌ Failed to create Valkey index: ${String(err?.message || err)}`);
  await safeQuit(redis);
  process.exit(1);
}
