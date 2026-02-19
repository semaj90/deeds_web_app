import fs from "fs";
import { createInterface } from "readline";
import { createReadStream } from "fs";

// Optional Redis chunking. Works even if Redis is not configured.
let redis = null;
const REDIS_URL = process.env.REDIS_URL;
const STREAM = process.env.REDIS_STREAM || "svelte:errors";
const BATCH_SIZE = Number(process.env.CHUNK_SIZE || 1000);
const LOG_PATH = process.argv[2] || "svelte-check.log";

async function getRedis() {
  if (!REDIS_URL) return null;
  const { createClient } = await import("redis");
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  return client;
}

async function main() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error(`Log file not found: ${LOG_PATH}`);
    process.exit(1);
  }

  redis = await getRedis().catch(() => null);

  const rl = createInterface({ input: createReadStream(LOG_PATH, { encoding: "utf8" }) });

  let batch = [];
  let batches = 0;

  function flushSync() {
    if (batch.length === 0) return;
    const key = `svelte:errors:batch:${Date.now()}:${batches}`;
    const payload = JSON.stringify(batch);
    if (redis) {
      // Store as a simple key with TTL 7 days
      redis.set(key, payload, { EX: 60 * 60 * 24 * 7 }).catch(() => {});
      // Also append pointer to a list for discovery
      redis.rPush("svelte:errors:batches", key).catch(() => {});
    }
    // Always write a local snapshot as well
    fs.writeFileSync(`svelte-check-errors-index/batch-${String(batches).padStart(5, "0")}.json`, payload);
    batches++;
    batch = [];
  }

  for await (const line of rl) {
    if (!/\berror\b|\bwarning\b/i.test(line)) continue;
    batch.push(line);
    if (batch.length >= BATCH_SIZE) flushSync();
  }
  flushSync();

  if (redis) await redis.quit();
  console.log(`Chunked into ${batches} batch file(s). Redis ${REDIS_URL ? 'OK' : 'OFF'}.`);
}

main();

