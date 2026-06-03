import { getValkeyClient } from '../cache/valkey-client.js';
import { ENV } from '../env.server.js';
const redis = getValkeyClient();
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

export type AcceleratorCapabilities = {
  simdJson: boolean;
  qdrant: boolean;
  redis: boolean;
  postgres: boolean;
  cuvs: boolean;
};

async function canLoadSimdJson(): Promise<boolean> {
  try {
    // Attempt dynamic import of simdjson; return true if it works
    const simdjson = await import('simdjson');
    return !!simdjson;
  } catch (err) {
    return false;
  }
}

async function canPing(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function canPingRedis(): Promise<boolean> {
  try {
    const res = await redis.ping();
    return res === 'PONG';
  } catch (err) {
    return false;
  }
}

async function canPingPostgres(): Promise<boolean> {
  try {
    const res = await db.execute(sql`SELECT 1`);
    return !!res;
  } catch (err) {
    return false;
  }
}

export async function detectAccelerators(): Promise<AcceleratorCapabilities> {
  return {
    simdJson: await canLoadSimdJson(),
    qdrant: await canPing(`${ENV.QDRANT_URL}/collections`),
    redis: await canPingRedis(),
    postgres: await canPingPostgres(),
    cuvs: false,
  };
}
