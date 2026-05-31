import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import crypto from 'crypto';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
let __dirname = '';
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch (e) {}

let native: any = null;
try {
  if (__dirname) {
    const nativePath = path.resolve(__dirname, '../../../../simd-bridge/rust-simdjson/target/release/simd_bridge_rs.node');
    native = require(nativePath);
  }
} catch (e: any) {
  console.warn('[bifrost-cache] Native Rust bridge load failed, using JS fallback:', e.message);
}

/**
 * BifrostCacheManager
 * 
 * Manages KV-cache prefix tokens for the Bifrost gateway.
 * Based on 'PagedAttention' and 'Prefix Caching' patterns from vLLM/llama.cpp.
 */
export class BifrostCacheManager {
  private static PREFIX_KEY = 'bifrost:kv:prefix:';
  private static TTL = 3600 * 4; // 4 hour cache for hot prefixes

  /**
   * Get a cached KV-prefix token if available.
   * Useful for sharing system prompts across sessions.
   */
  static async getPrefixToken(content: string): Promise<string | null> {
    const hash = this.hashContent(content);
    const redis = getRedis();
    return await redis.get(this.PREFIX_KEY + hash);
  }

  /**
   * Register a new KV-prefix token after a prefill.
   */
  static async registerPrefix(content: string, token: string): Promise<void> {
    const hash = this.hashContent(content);
    const redis = getRedis();
    await redis.set(this.PREFIX_KEY + hash, token, 'EX', this.TTL);
  }

  /**
   * Generate a stable hash for a prompt prefix.
   */
  private static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get a cached KAG context packet from the Bifrost (Redis) hot-path.
   */
  static async getKagContext(cacheKey: string): Promise<any | null> {
    const redis = getRedis();
    const raw = await redis.get(`bifrost:kag:${cacheKey}`);
    if (!raw) return null;
    try {
      if (native && (typeof native.parseFast === 'function' || typeof native.parse_fast === 'function')) {
        const fn = native.parseFast || native.parse_fast;
        const parsedStr = fn(raw);
        return JSON.parse(parsedStr);
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Register a KAG context packet in the Bifrost hot-path.
   */
  static async registerKagContext(cacheKey: string, packet: any): Promise<void> {
    const redis = getRedis();
    await redis.set(`bifrost:kag:${cacheKey}`, JSON.stringify(packet), 'EX', this.TTL);
  }

  /**
   * Optimize a message list by identifying shareable prefixes.
   */
  static async optimizeMessages(messages: any[]): Promise<{ optimized: any[], cacheToken?: string }> {
    if (messages.length === 0) return { optimized: messages };
    
    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    if (systemPrompt) {
      const token = await this.getPrefixToken(systemPrompt);
      if (token) {
        return {
          optimized: messages.filter(m => m.role !== 'system'),
          cacheToken: token
        };
      }
    }
    
    return { optimized: messages };
  }
}
