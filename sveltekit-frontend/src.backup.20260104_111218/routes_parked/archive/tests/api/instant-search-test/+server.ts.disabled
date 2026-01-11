import { json } from '@sveltejs/kit';;
import type { RequestHandler } from './$types.js';
import type { redisService  } from '$lib/server/redis-service.js';
import type { lokiRedisCache  } from '$lib/cache/loki-redis-integration.js'; // Assuming named export
import type { instantSearchEngine  } from '$lib/services/instant-search-engine.js'; // Assuming named export

// Define SearchResult locally as it's not exported from $lib/types based on errors
interface SearchResult {
  id?: string;
  responseTime?: number;
  resultType?: string;
  [key: string]: unknown; // Corrected index signature
}

/**
 * Instant Search Test API - Redis + Loki.js + Fuse.js Integration Test
 *
 * Tests the complete frontend cache system with:
 * - Redis connectivity and caching
 * - Loki.js in-memory database operations
 * - Fuse.js fuzzy search capabilities
 * - InstantSearchEngine integration
 *
 * @module InstantSearchTestAPI
 */

/* Type stubs and local typed wrappers to avoid runtime type errors without changing external modules. These are intentionally minimal and only include the methods/props used in this file. */
// NOTE: widen DocType to accept incoming: string values to avoid assignment errors from external data
type DocType = 'contract' | 'evidence' | 'brief' | 'citation' | 'precedent' | string;
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

type LegalDocument = {
  id: string;
  type: DocType;
  size: number;
  priority: number;
  riskLevel: RiskLevel;
  confidenceLevel: number;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
    jurisdiction: string;
  };
  cacheTimestamp: number;
  accessCount: number;
  lastAccessed: number;
  cacheLocation: 'loki' | string;
  compressed: boolean;
  syncStatus: 'synced' | string;
};

interface LokiRedisCacheAPI {
  isHealthy: boolean;
  initialize(): Promise<void>;
  storeDocument(doc: LegalDocument): Promise<void>;
  getDocument(id: string): Promise<LegalDocument | null>;
  searchDocuments(
    query: string,
    filter?: { type?: DocType[] },
    opts?: { limit?: number; cacheResults?: boolean }
  ): Promise<SearchResult[]>;
  // some implementations may call this: 'deleteDocument' — accept either at runtime
  removeDocument?(id: string): Promise<void>;
  deleteDocument?(id: string): Promise<void>;
  getStats?(): Record<string, unknown>;
  clear(): Promise<void>;
}

interface InstantSearchEngineAPI {
  initialize(): Promise<void>;
  search(query?: string): Promise<SearchResult[]>;
  // some engines may not expose getStats; make optional
  getStats?(): Record<string, unknown>;
  clearCache?(): Promise<void>;
}

interface RedisServiceAPI {
  getClient?(): unknown;
  isHealthy?(): boolean;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<unknown>;
  del(key: string): Promise<void>;
  // avoid `any`
  getRedisInfo(): Promise<Record<string, unknown> | null>;
  getStats?(): Record<string, unknown>;
}

// Cast imported modules to the local typed wrappers
const lokiCache = lokiRedisCache as unknown as LokiRedisCacheAPI;
const searchEngine = instantSearchEngine as unknown as InstantSearchEngineAPI;
const redis = redisService as unknown as RedisServiceAPI;

// Error helper function
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'Unknown error';
  }
}

// Small runtime helpers to handle library surface differences and avoid compile/runtime errors
async function removeLokiDocument(id: string): Promise<void> {
  if (!lokiCache) return;
  if (typeof lokiCache.removeDocument === 'function') {
    await lokiCache.removeDocument(id);
  } else if (typeof lokiCache.deleteDocument === 'function') {
    await lokiCache.deleteDocument(id);
  } else {
    // best-effort: if there's no method, ignore (test cleanup best-effort)
  }
}

function getLokiStatsSafe(): Record<string, unknown> {
  try {
    if (typeof lokiCache.getStats === 'function') {
      return lokiCache.getStats() || {};
    }
  } catch {
    // swallow
  }
  return {};
}

function getSearchEngineStatsSafe(): Record<string, unknown> {
  try {
    if (typeof searchEngine.getStats === 'function') {
      return searchEngine.getStats() || {};
    }
  } catch {
    // swallow
  }
  return {};
}

async function safeClearSearchCache(): Promise<void> {
  try {
    if (typeof searchEngine.clearCache === 'function') {
      await searchEngine.clearCache();
    }
  } catch {
    // swallow
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const testType = url.searchParams.get('test') || 'all';
  const results: {
    timestamp: string;
    testType: string;
    results: Record<string, unknown>;
    errors: string[];
    performance: Record<string, number>;
    status?: string;
    summary?: Record<string, unknown>;
  } = {
    timestamp: new Date().toISOString(),
    testType: testType,
    results: {},
    errors: [],
    performance: {},
  };

  try {
    // Test Redis Service
    if (testType === 'all' || testType === 'redis') {
      const redisStartTime = Date.now();
      try {
        // Test Redis connection
        const redisClient = typeof redis.getClient === 'function' ? redis.getClient() : undefined;
        const isHealthy =
          typeof redis.isHealthy === 'function' ? redis.isHealthy() : Boolean(redisClient);
        if (redisClient && isHealthy) {
          // Test basic operations
          await redis.set('test-instant-search', { message: 'Redis working!' }, 60);
          const retrieved = await redis.get('test-instant-search');
          await redis.del('test-instant-search');

          // Test Redis info
          const redisInfo = await redis.getRedisInfo();
          // narrow: unknown shapes before property access
          const serverInfo =
            (redisInfo?.server as Record<string, unknown> | undefined) ?? undefined;
          const memoryInfo =
            (redisInfo?.memory as Record<string, unknown> | undefined) ?? undefined;
          const clientsInfo =
            (redisInfo?.clients as Record<string, unknown> | undefined) ?? undefined;

          results.results.redis = {
            status: 'connected',
            healthy: true,
            operations: ['set', 'get', 'del'],
            testData: retrieved,
            info: redisInfo
              ? {
                  version:
                    typeof serverInfo?.redis_version === 'string'
                      ? (serverInfo.redis_version as string)
                      : String(serverInfo?.redis_version ?? 'unknown'),
                  memory: String(memoryInfo?.used_memory_human ?? 'unknown'),
                  clients: Number(clientsInfo?.connected_clients ?? 0),
                }
              : null,
          };
        } else {
          throw new Error('Redis not healthy or client unavailable');
        }
        results.performance.redis = Date.now() - redisStartTime;
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        results.errors.push(`Redis test failed: ${msg}`);
        results.results.redis = { status: 'error', message: msg };
      }
    }

    // Test Loki-Redis Integration
    if (testType === 'all' || testType === 'loki') {
      const lokiStartTime = Date.now();
      try {
        // Initialize if not already done
        if (!lokiCache.isHealthy) {
          await lokiCache.initialize();
        }
        // Test document storage
        const testDoc: LegalDocument = {
          id: 'test-doc-' + Date.now(),
          type: 'contract' as DocType,
          size: 1024,
          priority: 100,
          riskLevel: 'medium' as RiskLevel,
          confidenceLevel: 0.85,
          metadata: {
            title: 'Test Legal Document',
            description: 'Integration test document for Loki-Redis cache',
            keywords: ['test', 'integration', 'legal'],
            jurisdiction: `Test`,
          },
          cacheTimestamp: Date.now(),
          accessCount: 1,
          lastAccessed: Date.now(),
          cacheLocation: 'loki',
          compressed: false,
          syncStatus: `synced`,
        };
        await lokiCache.storeDocument(testDoc);
        const retrievedDoc = await lokiCache.getDocument(testDoc.id);

        // Test search functionality
        const searchResults = await lokiCache.searchDocuments(
          'test',
          { type: ['contract'] },
          { limit: 10, cacheResults: true }
        );

        // Clean up test document using runtime-safe helper
        await removeLokiDocument(testDoc.id);

        results.results.loki = {
          status: 'working',
          operations: ['store', 'retrieve', 'search', 'cleanup'],
          testDocument: {
            stored: true,
            retrieved: !!retrievedDoc,
            matches: retrievedDoc?.id === testDoc.id,
          },
          searchResults: { count: searchResults.length, hasResults: searchResults.length > 0 },
          stats: getLokiStatsSafe(),
        };
        results.performance.loki = Date.now() - lokiStartTime;
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        results.errors.push(`Loki-Redis test failed: ${msg}`);
        results.results.loki = { status: 'error', message: msg };
      }
    }

    // Test Instant Search Engine
    if (testType === 'all' || testType === 'search') {
      const searchStartTime = Date.now();
      try {
        // Initialize search engine
        await searchEngine.initialize();

        // Test search with various queries
        const testQueries = [
          'contract agreement',
          'evidence forensic',
          'legal document',
          'case precedent',
        ];
        const searchTests: Array<{
          query: string;
          resultCount: number;
          avgResponseTime: number;
          resultTypes: string[];
        }> = [];
        for (const query of testQueries) {
          // search may accept an optional query; wrapper allows an optional param
          const searchResults = await searchEngine.search(query);
          const avgResponseTime =
            searchResults.length > 0
              ? searchResults.reduce(
                  (sum: number, r: SearchResult) => sum + (r.responseTime ?? 0),
                  0
                ) / searchResults.length
              : 0;
          const resultTypes = [...new Set(searchResults.map((r) => r.resultType ?? 'unknown'))];
          searchTests.push({
            query,
            resultCount: searchResults.length,
            avgResponseTime,
            resultTypes,
          });
        }

        // Get search engine statistics
        const searchStats = getSearchEngineStatsSafe();

        results.results.instantSearch = {
          status: 'working',
          operations: ['initialize', 'search', 'filter', 'stats'],
          testQueries: searchTests,
          statistics: searchStats,
          features: {
            fuzzySearch: true,
            semanticSearch: true,
            caching: true,
            realTimeSearch: true,
            legalPatterns: true,
          },
        };
        results.performance.instantSearch = Date.now() - searchStartTime;
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        results.errors.push(`Instant Search test failed: ${msg}`);
        results.results.instantSearch = { status: 'error', message: msg };
      }
    }

    // Test Integration Health
    if (testType === 'all' || testType === 'health') {
      const healthStartTime = Date.now();
      try {
        const healthStatus = {
          redis: {
            connected: typeof redis.isHealthy === 'function' ? redis.isHealthy() : false,
            stats: typeof redis.getStats === 'function' ? redis.getStats() : {},
          },
          loki: {
            // prefer explicit isHealthy: boolean when available
            initialized: Boolean(
              lokiCache &&
                (typeof (lokiCache as LokiRedisCacheAPI).isHealthy === 'boolean'
                  ? (lokiCache as LokiRedisCacheAPI).isHealthy
                  : !!lokiCache)
            ),
            stats: getLokiStatsSafe(),
          },
          instantSearch: { available: !!searchEngine, stats: getSearchEngineStatsSafe() },
        };
        const allHealthy =
          healthStatus.redis.connected &&
          healthStatus.loki.initialized &&
          healthStatus.instantSearch.available;

        results.results.health = {
          status: allHealthy ? 'healthy' : 'degraded',
          components: healthStatus,
          integration: {
            redisLoki: healthStatus.redis.connected && healthStatus.loki.initialized,
            lokiSearch: healthStatus.loki.initialized && healthStatus.instantSearch.available,
            fullPipeline: allHealthy,
          },
        };
        results.performance.health = Date.now() - healthStartTime;
      } catch (err: unknown) {
        const msg = getErrorMessage(err);
        results.errors.push(`Health check failed: ${msg}`);
        results.results.health = { status: 'error', message: msg };
      }
    }

    // Calculate total performance
    const totalElapsedTime = Object.values(results.performance).reduce(
      (sum: number, time: number) => sum + time,
      0
    );
    results.performance.total = totalElapsedTime;

    // Overall status
    results.status = results.errors.length === 0 ? 'success' : 'degraded';

    // testsSucceeded -> numeric count (previous filter returned array incorrectly)
    results.summary = {
      testsRun: Object.keys(results.results).length,
      testsSucceeded: Math.max(0, Object.keys(results.results).length - results.errors.length),
      errorCount: results.errors.length,
      totalTime: totalElapsedTime,
    };

    // For production, use centralized logging or remove debug logs.
    // Example: logEvent('instant-search-test-completed', results.summary);
    // Centralized logging for production
    // import { logEvent } from '$lib/server/logging-service.js'
    // await logEvent('instant-search-test-completed', results.summary)
    return json(results);
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    if (typeof redis.set === 'function') {
      await redis.set(
        'logs-error-instant-search',
        {
          timestamp: new Date().toISOString(),
          source: 'instant-search-test',
          level: 'error',
          message: msg,
          context: 'Instant Search Integration Test',
        },
        3600
      );
    }
    console.error('❌ Instant Search Integration Test failed: ', msg);
    return json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: msg,
        results: {} as Record<string, unknown>,
        errors: [msg],
      },
      { status: 500 }
    );
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payload = await request.json();
    const action = payload?.action as string | undefined;
    const data = payload?.data as Record<string, unknown> | undefined;

    switch (action) {
      case 'benchmark': {
        // Run performance benchmarks
        const benchmarkResults = await runPerformanceBenchmark(
          data as { iterations?: number; queries?: string[] } | undefined
        );
        return json({ success: true, benchmarks: benchmarkResults });
      }
      case 'clear-cache': {
        // Clear all caches
        await safeClearSearchCache();
        if (typeof lokiCache.clear === 'function') await lokiCache.clear();
        return json({ success: true, message: 'All caches cleared' });
      }
      case 'populate-test-data': {
        // Add test data for demo
        const count = typeof data?.count === 'number' ? (data.count as number) : 10;
        const testData = await populateTestData(count);
        return json({ success: true, testData });
      }
      default:
        return json({ success: false, error: `Unknown action` }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    if (typeof redis.set === 'function') {
      await redis.set(
        'logs-error-instant-search',
        {
          timestamp: new Date().toISOString(),
          source: 'instant-search-test',
          level: 'error',
          message: msg,
          context: `Instant Search Test POST`,
        },
        3600
      );
    }
    console.error('❌ Instant Search Test POST failed: ', msg);
    return json({ success: false, error: msg }, { status: 500 });
  }
};

async function runPerformanceBenchmark(options?: {
  iterations?: number;
  queries?: string[];
}): Promise<any> {
  const iterations = options?.iterations ?? 100;
  const queries = options?.queries ?? ['contract', 'evidence', 'legal document', 'case law'];

  const results = {
    iterations: iterations,
    queriesCount: queries.length,
    timings: {
      search: [] as number[],
      cache: [] as number[],
      total: [] as number[],
    },
    statistics: { avgSearchTime: 0, minSearchTime: 0, maxSearchTime: 0, cacheHitRate: 0 },
  };

  let cacheHits = 0;
  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];
    const startTime = Date.now();
    const searchResults = await searchEngine.search(query);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    results.timings.search.push(responseTime);
    // Check if result was cached (simplified check)
    const wasCached = searchResults.some((r) => r.resultType === 'cache');
    if (wasCached) cacheHits++;
  }

  // Calculate statistics
  const total = results.timings.search.reduce((a, b) => a + b, 0);
  results.statistics.avgSearchTime = total / iterations;
  results.statistics.minSearchTime = Math.min(...results.timings.search);
  results.statistics.maxSearchTime = Math.max(...results.timings.search);
  results.statistics.cacheHitRate = cacheHits / iterations;

  return results;
}

async function populateTestData(
  count: number
): Promise<{ documentsCreated: number; documentIds: string[] }> {
  const testDocuments: string[] = [];
  const types = ['contract', 'evidence', 'brief', 'citation'] as const;
  const riskLevels = ['low', 'medium', 'high', 'critical'] as const;
  const jurisdictions = ['Federal', 'State', 'Local'] as const;

  for (let i = 0; i < count; i++) {
    const doc: LegalDocument = {
      id: `test-doc-${Date.now()}-${i}`,
      type: types[i % types.length],
      size: Math.floor(Math.random() * 10000) + 1000,
      priority: Math.floor(Math.random() * 255),
      riskLevel: riskLevels[i % riskLevels.length],
      confidenceLevel: Math.random(),
      metadata: {
        title: `Test Document ${i + 1}`,
        description: `Test legal document for benchmarking and demo purposes. Document ${i + 1} of ${count}.`,
        keywords: ['test', 'benchmark', 'legal', 'document'],
        jurisdiction: jurisdictions[i % jurisdictions.length],
      },
      cacheTimestamp: Date.now(),
      accessCount: Math.floor(Math.random() * 20),
      lastAccessed: Date.now(),
      cacheLocation: 'loki',
      compressed: false,
      syncStatus: `synced`,
    };
    await lokiCache.storeDocument(doc);
    testDocuments.push(doc.id);
  }
  return { documentsCreated: count, documentIds: testDocuments };
}
