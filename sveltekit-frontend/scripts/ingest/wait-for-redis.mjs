#!/usr/bin/env node

import { createClient } from 'redis';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../atlas/load-atlas-env.mjs';
import { resolveRedisUrl } from '../../../scripts/atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const argv = new Set(process.argv.slice(2));
const ALLOW_OFFLINE = argv.has('--allow-offline');
const TIMEOUT_MS = Number.parseInt(process.env.REDIS_WAIT_TIMEOUT_MS ?? '30000', 10);
const POLL_MS = Number.parseInt(process.env.REDIS_WAIT_INTERVAL_MS ?? '1000', 10);

function buildRedisUrl() {
  return resolveRedisUrl(process.env);
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url;
  }
}

async function main() {
  loadAtlasEnv(ROOT);

  const redisUrl = buildRedisUrl();
  const startedAt = Date.now();
  const client = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: () => false,
      connectTimeout: Math.min(5000, Math.max(1000, POLL_MS)),
    },
  });

  let lastError = null;
  client.on('error', (error) => {
    lastError = error instanceof Error ? error.message : String(error);
  });

  try {
    while (Date.now() - startedAt < TIMEOUT_MS) {
      if (!client.isOpen) {
        try {
          await client.connect();
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          await delay(POLL_MS);
          continue;
        }
      }

      try {
        const pong = await client.ping();
        if (pong === 'PONG') {
          console.log(JSON.stringify({
            ok: true,
            allowOffline: false,
            redisUrl: redactUrl(redisUrl),
            waitedMs: Date.now() - startedAt,
            host: process.env.REDIS_HOST ?? null,
            port: process.env.REDIS_PORT ?? null,
            passwordSet: Boolean(process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD || process.env.REDIS_URL),
          }, null, 2));
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      await delay(POLL_MS);
    }

    console.log(JSON.stringify({
      ok: ALLOW_OFFLINE,
      allowOffline: ALLOW_OFFLINE,
      redisUrl: redactUrl(redisUrl),
      waitedMs: Date.now() - startedAt,
      timeoutMs: TIMEOUT_MS,
      lastError,
      host: process.env.REDIS_HOST ?? null,
      port: process.env.REDIS_PORT ?? null,
      passwordSet: Boolean(process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD || process.env.REDIS_URL),
    }, null, 2));

    if (!ALLOW_OFFLINE) {
      throw new Error(`Redis unavailable after ${TIMEOUT_MS}ms`);
    }
  } finally {
    await client.quit().catch(() => client.disconnect().catch(() => {}));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
