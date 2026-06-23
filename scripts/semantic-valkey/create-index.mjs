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

  // 3. Attempt to get index info
  try {
    const info = await redisClient.sendCommand(['FT.INFO', indexName]);
    console.log(`✅ Index ${indexName} already exists — skipping creation`);

    const infoArr = info;
    const numDocs = Array.isArray(infoArr)
      ? infoArr[infoArr.indexOf('num_docs') + 1] ?? '?'
      : '?';

    console.log(`   num_docs: ${numDocs}`);
    await redisClient.quit();
    process.exit(0);
  } catch (err) {
    const msg = String(err?.message || err);
    // Re-throw if the error is NOT related to the loading state
    if (msg.includes('LOADING')) {
      // This is expected, so we just log and continue the process
      console.log('Index creation skipped: Redis is still loading.');
    } else {
      throw err; // Re-throw unexpected errors
    }
  }
}

// Example usage:
// runIndexCreation(redisClient, 'my_index');