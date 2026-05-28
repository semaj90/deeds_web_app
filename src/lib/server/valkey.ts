import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import process from 'process';
import util from 'util';

const VALKEY_URL = process.env.VALKEY_URL || 'redis://127.0.0.1:6379';
const redis: RedisType = new Redis(VALKEY_URL);

export { redis as valkey };

// Safe JSON helpers: prefer RedisJSON if available, otherwise fallback to SET/GET
export async function jsonSet(key: string, obj: unknown) {
  const payload = JSON.stringify(obj);
  try {
    // try RedisJSON
    return await redis.call('JSON.SET', key, '.', payload);
  } catch (e) {
    // fallback to plain string set
    try {
      return await redis.set(key, payload);
    } catch (err) {
      return Promise.reject(err);
    }
  }
}

export async function jsonGet(key: string) {
  try {
    const r = await redis.call('JSON.GET', key, '.');
    if (r) return JSON.parse(r as string);
  } catch (e) {
    // fallback to GET
    try {
      const s = await redis.get(key);
      if (s) return JSON.parse(s);
      return null;
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return null;
}

// Bloom helpers: safe no-op if module missing
export async function bloomAdd(key: string, item: string) {
  try {
    return await redis.call('BF.ADD', key, item);
  } catch (e) {
    // module not present — return null to indicate no-op
    return null;
  }
}

export async function bloomExists(key: string, item: string) {
  try {
    return await redis.call('BF.EXISTS', key, item);
  } catch (e) {
    return null;
  }
}

// Search helpers: placeholder that reports unavailability unless adapter provided
export function searchSupported() {
  // No built-in vector search unless a Valkey module is installed; detect by probing a silent command
  return false;
}

export async function searchAddVector() {
  throw new Error('Vector search not supported in this Valkey build — install/Search module and update helpers');
}

export async function searchQuery() {
  throw new Error('Vector search not supported in this Valkey build — install/Search module and update helpers');
}

export async function quit() {
  try {
    await redis.quit();
  } catch (e) {
    // ignore
  }
}

export default {
  valkey: redis,
  jsonSet,
  jsonGet,
  bloomAdd,
  bloomExists,
  searchSupported,
  searchAddVector,
  searchQuery,
  quit
};
