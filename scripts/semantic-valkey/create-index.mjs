import { createClient } from 'redis';

// Function to wait for Redis to finish loading the dataset
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
      const msg = String(err?.message || err);

      if (
        msg.includes('LOADING') ||
        msg.includes('Connection is closed') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('Socket closed unexpectedly')
      ) {
        console.log(`⏳ Waiting for Valkey (${i}/${retries}): ${msg}`);
        await sleep(1000);
        continue;
      }

      throw err;
    }

    await sleep(1000);
  }

  throw new Error('Valkey did not become ready before timeout');
}

// Simple sleep utility
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Main Index Creation Logic ---

async function runIndexCreation(redisClient, indexName) {
  // 1. Setup error handling: Log all errors unless they are the loading state
  redisClient.on('error', (err) => {
    const msg = String(err?.message || err);
    if (!msg.includes('LOADING')) console.warn(`[valkey] ${msg}`);
  });

  // 2. Connect and wait for readiness
  await redisClient.connect();
  await waitForValkeyReady(redisClient);

  // 3. Attempt to get index info (or create if missing)
  try {
    const info = await redisClient.sendCommand(['FT.INFO', indexName]);
    console.log(`✅ Index ${indexName} already exists`);

    const infoArr = info;
    const numDocs = Array.isArray(infoArr)
      ? infoArr[infoArr.indexOf('num_docs') + 1] ?? '?'
      : '?';

    console.log(`   num_docs: ${numDocs}`);
    await redisClient.quit();
    process.exit(0);
  } catch (err) {
    const msg = String(err?.message || err);

    // If index doesn't exist (expected), create it
    if (msg.includes('not found') || msg.includes('Unknown command')) {
      console.log(`⏳ Index ${indexName} not found, creating...`);
      try {
        // Create simple semantic index for embeddings (768-dim vectors)
        await redisClient.sendCommand([
          'FT.CREATE',
          indexName,
          'ON', 'HASH',
          'SCHEMA',
          'embedding', 'VECTOR', 'FLOAT32', '768',
          'packet_key', 'TAG',
          'source_ref', 'TAG',
          'feature_id', 'TAG'
        ]);
        console.log(`✅ Created index ${indexName}`);
        await redisClient.quit();
        process.exit(0);
      } catch (createErr) {
        console.error('❌ Failed to create index:', createErr.message);
        throw createErr;
      }
    } else if (msg.includes('LOADING')) {
      console.log('Index check skipped: Redis is still loading.');
    } else {
      throw err; // Re-throw other unexpected errors
    }
  }
}

// --- Main Entry Point ---

async function main() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || 'redis';

  const client = createClient({
    host,
    port,
    password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  client.on('error', (err) => {
    const msg = String(err?.message || err);
    if (!msg.includes('LOADING')) {
      console.error(`[valkey] Error: ${msg}`);
    }
  });

  try {
    await runIndexCreation(client, 'semantic_index');
    console.log('✅ Valkey index creation completed');
  } catch (err) {
    console.error('❌ Failed to create Valkey index:', err.message);
    await client.quit().catch(() => {});
    process.exit(1);
  }
}

main();