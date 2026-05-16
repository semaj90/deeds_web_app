export type EngramStoreName = 'qdrant' | 'neo4j' | 'couchdb' | 'redis' | 'postgres' | 'engram';

export interface EngramMemory {
  id?: string;
  repo?: string;
  workspace?: string;
  path?: string;
  featureKey?: string;
  clusterId?: string | number | null;
  summary?: string;
  content?: string;
  stores?: EngramStoreName[];
  tags?: string[];
  graphNodeIds?: string[];
  engramRefs?: string[];
  createdAt?: string;
  updatedAt?: string;
  score?: number;
}

export interface EngramPluginAdapter {
  health(): Promise<{ ok: boolean; source: string; warning?: string }>;

  writeMemory(memory: EngramMemory): Promise<{
    ok: boolean;
    id?: string;
    warning?: string;
  }>;

  searchMemories(query: string, opts?: {
    featureKeys?: string[];
    clusters?: string[];
    limit?: number;
  }): Promise<EngramMemory[]>;
}

export function createNoopEngramPluginAdapter(source = 'noop'): EngramPluginAdapter {
  return {
    async health() {
      return { ok: true, source, warning: 'Engram adapter is inactive' };
    },
    async writeMemory() {
      return { ok: true, warning: 'Engram adapter is inactive' };
    },
    async searchMemories() {
      return [];
    },
  };
}
