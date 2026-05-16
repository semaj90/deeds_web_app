import { getRedis } from '$lib/server/redis.js';
import { hashQuery, recordEngramTransition, getDidYouMeanFromEngram } from '$lib/server/ai/engram-memory.js';

export type EngramWorkflowMemory = {
  memoryType: 'retrieval_lesson' | 'debug_lesson' | 'workflow_lesson';
  summary: string;
  featureKeys: string[];
  clusters: string[];
  taskKeys?: string[];
  sourceRefs: string[];
  accepted: boolean;
  testsPassed: boolean;
  reward: number;
  trust: 'low_hint';
};

export type EngramRoutingHint = {
  queryHash: string;
  didYouMean?: string;
  priorQueries: string[];
  bmuHints: string[];
  clusterHints: string[];
  workflowMemories: EngramWorkflowMemory[];
  source: 'local-engram';
  trust: 'low_hint';
};

export interface LocalEngramMemoryAdapter {
  getRoutingHints(query: string): Promise<EngramRoutingHint>;
  recordTransition(input: {
    previousQuery?: string;
    currentQuery: string;
    somRow?: number;
    somCol?: number;
    clusterId?: string;
  }): Promise<void>;
  recordWorkflowMemory(memory: EngramWorkflowMemory): Promise<void>;
}

export class LocalEngramMemoryAdapterImpl implements LocalEngramMemoryAdapter {
  private static instance: LocalEngramMemoryAdapterImpl;

  private constructor() {}

  public static getInstance(): LocalEngramMemoryAdapterImpl {
    if (!LocalEngramMemoryAdapterImpl.instance) {
      LocalEngramMemoryAdapterImpl.instance = new LocalEngramMemoryAdapterImpl();
    }
    return LocalEngramMemoryAdapterImpl.instance;
  }

  async getRoutingHints(query: string): Promise<EngramRoutingHint> {
    const redis = getRedis();
    if (!redis) {
      console.warn('[LocalEngramMemoryAdapter] Redis unavailable, returning empty hints');
      return this.emptyHints(query);
    }

    const queryHash = hashQuery(query);
    
    // 1. Get Did-You-Mean suggestions (Bigram/BMU)
    const suggestions = await getDidYouMeanFromEngram(redis, query, 5).catch(() => []);
    
    // 2. Get BMU hint
    const bmuKey = await redis.get(`ace:engram:query-bmu:${queryHash}`).catch(() => null);
    
    // 3. Get Hot Workflow Memories (Validated lessons)
    // In this phase, we look for memories tagged with current query context or generic hot lessons
    const workflowJson = await redis.get(`ace:engram:workflow:hot:${queryHash}`).catch(() => null);
    const workflowMemories: EngramWorkflowMemory[] = workflowJson ? JSON.parse(workflowJson) : [];

    return {
      queryHash,
      didYouMean: suggestions[0]?.suggestion,
      priorQueries: suggestions.slice(0, 3).map(s => s.suggestion),
      bmuHints: bmuKey ? [bmuKey] : [],
      clusterHints: [], 
      workflowMemories,
      source: 'local-engram',
      trust: 'low_hint'
    };
  }

  private emptyHints(query: string): EngramRoutingHint {
    return {
      queryHash: hashQuery(query),
      didYouMean: undefined,
      priorQueries: [],
      bmuHints: [],
      clusterHints: [],
      workflowMemories: [],
      source: 'local-engram',
      trust: 'low_hint'
    };
  }

  async recordTransition(input: {
    previousQuery?: string;
    currentQuery: string;
    somRow?: number;
    somCol?: number;
    clusterId?: string;
  }): Promise<void> {
    const redis = getRedis();
    
    // We reuse the existing recordEngramTransition logic
    await recordEngramTransition(redis, {
      previousQuery: input.previousQuery,
      currentQuery: input.currentQuery,
      somRow: input.somRow,
      somCol: input.somCol
    }).catch(err => {
      console.error('[LocalEngramMemoryAdapter] recordTransition failed:', err);
    });
  }

  private sanitizeMemory(memory: EngramWorkflowMemory): boolean {
    const forbiddenFields = [
      'hiddenThoughts',
      'chainOfThought',
      'reasoning_content',
      'reasoningContent',
      'kv_cache',
      'kvCache',
      'tensor',
      'cudaPointer',
      'rope',
      'rawThoughts',
      'scratchpad'
    ];

    // Check memory object keys and content string
    const keys = Object.keys(memory);
    const hasForbiddenField = keys.some(key => forbiddenFields.includes(key));
    const hasForbiddenContent = forbiddenFields.some(field => 
      memory.summary.toLowerCase().includes(field.toLowerCase())
    );

    if (hasForbiddenField || hasForbiddenContent) {
      console.warn(`[LocalEngramMemoryAdapter] REJECTED memory card: Contains forbidden thinking-token or raw tensor fields.`);
      return false;
    }

    return true;
  }

  async recordWorkflowMemory(memory: EngramWorkflowMemory): Promise<void> {
    if (!this.sanitizeMemory(memory)) {
      return;
    }

    const redis = getRedis();
    if (!redis) return;

    // Hot storage for validated lessons
    // Keyed by a hash of the summary or a specific task key
    const lessonKey = `ace:engram:workflow:hot:${hashQuery(memory.summary)}`;
    await redis.set(lessonKey, JSON.stringify([memory]), 'EX', 86400 * 7); // 1 week
  }
}

export const engramAdapter = LocalEngramMemoryAdapterImpl.getInstance();
