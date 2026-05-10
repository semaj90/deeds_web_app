import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

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
    // Simple fast hash for demo; in prod use crypto.createHash('sha256')
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
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
