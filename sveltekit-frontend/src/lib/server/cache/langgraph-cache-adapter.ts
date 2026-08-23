import { getValkeyClient } from './valkey-client.js';

/**
 * LangGraph cache boundary. This adapter owns only rebuildable cache values;
 * it is not a workflow checkpoint, receipt, or canonical truth store.
 */
export interface LangGraphCacheAdapter {
  get(key: string): Promise<string | null>;
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export function getLangGraphCacheAdapter(): LangGraphCacheAdapter {
  const client = getValkeyClient();
  return {
    get: (key) => client.get(key),
    async setJson(key, value, ttlSeconds) {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    },
  };
}
