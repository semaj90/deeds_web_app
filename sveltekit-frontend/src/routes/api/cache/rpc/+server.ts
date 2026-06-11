/**
 * POST /api/cache/rpc
 *
 * JSON-RPC 2.0 gateway over Valkey (RESP/TCP internally).
 * Translates method calls to ioredis commands — Valkey stays RESP over TCP.
 * Caddy/HTTP3 at the edge; this service speaks JSON-RPC over HTTP/2.
 *
 * Supported methods:
 *   cache.hget    { key, field }            → string | null
 *   cache.hset    { key, field, value }      → "OK"
 *   cache.hmget   { key, fields[] }          → Record<field, string|null>
 *   cache.hmset   { key, data: Record }      → "OK"
 *   cache.get     { key }                    → string | null
 *   cache.set     { key, value, ttl? }       → "OK"
 *   cache.del     { key }                    → number
 *   cache.exists  { key }                    → boolean
 *   cache.expire  { key, ttl }               → boolean
 *   cache.keys    { pattern }                → string[]   (caution: O(n))
 *   semantic.put  { key, field, value, ttl? }→ "OK"  (alias for hset + expire)
 *   semantic.get  { key, field }             → string | null
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getRedis } from "$lib/server/redis.js";
import { requireUser } from "$lib/server/auth-utils.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id: string | number | null;
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", result, id };
}

function err(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", error: { code, message, data }, id };
}

function requireParams(params: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  for (const k of keys) {
    if (!params || params[k] === undefined || params[k] === null) return k;
  }
  return null;
}

import { z } from 'zod';

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1),
  params: z.any().optional(),
  id: z.any().optional(),
});

export const POST: RequestHandler = async (event) => {
  requireUser(event);
  const { request } = event;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(err(null, -32700, "Parse error", "Malformed JSON"), { status: 400 });
  }

  const parsed = JsonRpcRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(err(body?.id ?? null, -32600, "Invalid Request", parsed.error.format()), { status: 400 });
  }

  const id     = body.id ?? null;
  const p      = (body.params ?? {}) as Record<string, unknown>;
  const method = body.method;

  const redis = getRedis();

  try {
    switch (method) {

      case "cache.get": {
        const missing = requireParams(p, "key");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        const val = await redis.get(String(p.key));
        return json(ok(id, val));
      }

      case "cache.set": {
        const missing = requireParams(p, "key", "value");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        if (p.ttl) {
          await redis.setex(String(p.key), Number(p.ttl), String(p.value));
        } else {
          await redis.set(String(p.key), String(p.value));
        }
        return json(ok(id, "OK"));
      }

      case "cache.del": {
        const missing = requireParams(p, "key");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        const n = await redis.del(String(p.key));
        return json(ok(id, n));
      }

      case "cache.exists": {
        const missing = requireParams(p, "key");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        const n = await redis.exists(String(p.key));
        return json(ok(id, n > 0));
      }

      case "cache.expire": {
        const missing = requireParams(p, "key", "ttl");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        const r = await redis.expire(String(p.key), Number(p.ttl));
        return json(ok(id, r === 1));
      }

      case "cache.hget":
      case "semantic.get": {
        const missing = requireParams(p, "key", "field");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        const val = await redis.hget(String(p.key), String(p.field));
        return json(ok(id, val));
      }

      case "cache.hset":
      case "semantic.put": {
        const missing = requireParams(p, "key", "field", "value");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        await redis.hset(String(p.key), String(p.field), String(p.value));
        if (p.ttl) await redis.expire(String(p.key), Number(p.ttl));
        return json(ok(id, "OK"));
      }

      case "cache.hmget": {
        const missing = requireParams(p, "key", "fields");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        const fields = p.fields as string[];
        if (!Array.isArray(fields)) return json(err(id, -32602, "params.fields must be array"));
        const vals = await redis.hmget(String(p.key), ...fields);
        const result: Record<string, string | null> = {};
        fields.forEach((f, i) => { result[f] = vals[i] ?? null; });
        return json(ok(id, result));
      }

      case "cache.hmset": {
        const missing = requireParams(p, "key", "data");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        const data = p.data as Record<string, string>;
        if (typeof data !== "object" || Array.isArray(data)) {
          return json(err(id, -32602, "params.data must be object"));
        }
        await redis.hmset(String(p.key), data);
        if (p.ttl) await redis.expire(String(p.key), Number(p.ttl));
        return json(ok(id, "OK"));
      }

      case "cache.keys": {
        const missing = requireParams(p, "pattern");
        if (missing) return json(err(id, -32602, `Missing param: ${missing}`));
        // Restrict to safe patterns — no full keyspace scans
        const pattern = String(p.pattern);
        if (pattern === "*") return json(err(id, -32602, "Wildcard * pattern not allowed — be specific"));
        const keys = await redis.keys(pattern);
        return json(ok(id, keys));
      }

      default:
        return json(err(id, -32601, `Method not found: ${method}`), { status: 404 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(err(id, -32603, "Internal error", msg), { status: 500 });
  }
};
