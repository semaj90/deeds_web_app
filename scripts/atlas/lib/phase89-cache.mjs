// sveltekit-frontend/scripts/lib/phase89-cache.mjs
import crypto from "node:crypto";

export function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function redisFromEnv() {
  const url = process.env.REDIS_URL || process.env.KP_REDIS_URL || "redis://127.0.0.1:6379";
  return createClient({ url });
}

export async function getJson(rds, key) {
  const v = await rds.get(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

export async function setJson(rds, key, obj, ttlSec = null) {
  const v = JSON.stringify(obj);
  if (ttlSec) return rds.setEx(key, ttlSec, v);
  return rds.set(key, v);
}

// For compatibility with your existing code
export function hashContent(content) {
  return sha256(content).substring(0, 16);
}

// Import createClient from redis
import { createClient } from "redis";
