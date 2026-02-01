/**
 * 🧪 Test Setup Utilities
 *
 * Provides setup and teardown utilities for tests:
 * - beforeEach/afterEach hooks
 * - Environment variable mocking
 * - Service initialization
 * - Cleanup utilities
 *
 * Usage:
 *   import { setupTest, cleanupTest } from '$lib/test-utils/setup';
 *
 *   beforeEach(async () => {
 *     await setupTest();
 *   });
 *
 *   afterEach(async () => {
 *     await cleanupTest();
 *   });
 */

import { afterEach, beforeEach, vi } from 'vitest';
import {
    mockFetch,
    mockMinIO,
    mockOllama,
    mockPostgreSQL,
    mockQdrant,
    mockRedis,
    resetAllMocks
} from './mocks.js';

// ═══════════════════════════════════════════════════════════════════════
// Environment Variables
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_TEST_ENV = {
	// Service URLs
	OLLAMA_URL: 'http://localhost:11434',
	QDRANT_URL: 'http://localhost:6333',
	REDIS_URL: 'redis://localhost:6379',
	DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
	MINIO_ENDPOINT: 'localhost',
	MINIO_PORT: '9000',
	MINIO_ACCESS_KEY: 'test_access_key',
	MINIO_SECRET_KEY: 'test_secret_key',

	// MCP Endpoints
	KNOWLEDGE_MCP_URL: 'http://localhost:3004',
	ACE_MCP_URL: 'http://localhost:3002',
	A2A_URL: 'http://localhost:3005',

	// Models
	EMBEDDING_MODEL: 'embeddinggemma:latest',
	OLLAMA_MODEL: 'gemma3-legal:latest',

	// API Keys (fake for testing)
	GEMINI_API_KEY: 'test_gemini_key',
	ANTHROPIC_API_KEY: 'test_anthropic_key',

	// Feature Flags
	ENABLE_CACHING: 'true',
	ENABLE_RETRY: 'true',
	ENABLE_CIRCUIT_BREAKER: 'true',

	// Test Mode
	NODE_ENV: 'test'
};

let originalEnv: Record<string, string | undefined> = {};

/**
 * Setup environment variables for testing
 */
export function setupTestEnv(customEnv: Record<string, string> = {}): void {
	// Save original env
	originalEnv = { ...process.env };

	// Apply test env
    Object.assign(process.env, DEFAULT_TEST_ENV, customEnv);
}

/**
 * Restore original environment variables
 */
export function restoreTestEnv(): void {
	// Restore original env
	Object.keys(DEFAULT_TEST_ENV).forEach(key => {
		if (originalEnv[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = originalEnv[key];
		}
	});
}

// ═══════════════════════════════════════════════════════════════════════
// Mock Service Initialization
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize Qdrant with test collections
 */
export async function initializeQdrantMocks(): Promise<void> {
  // Create codemod_memories collection (used by rag_lookup tool)
  await mockQdrant.createCollection('codemod_memories', {
    vectors: {, size: 384 },
  });

  await mockQdrant.createCollection('error_patterns', {
    vectors: {, size: 384 },
  });

  await mockQdrant.upsert('codemod_memories', {
    points: [
      {
        id: 1,
        vector: Array(384).fill(0.5),
        payload: {, title: 'Svelte 5 Runes',
          content: '$state and $derived are the new reactive primitives',
          url: 'https://svelte.dev/docs/runes',
          tags: ['svelte5', 'runes'],
        }
      },
      {
        id: 2,
        vector: Array(384).fill(0.6),
        payload: {, title: 'Svelte 5 Migration',
          content: 'Replace export let with $props()',
          url: 'https://svelte.dev/docs/migration',
          tags: ['svelte5', 'migration'],
        }
      }],
  });
}

/**
 * Initialize Redis with test data
 */
export async function initializeRedisMocks(): Promise<void> {
  // Seed with sample cache entries
  await mockRedis.set('test:key1', 'value1', { EX: 3600 });
  await mockRedis.set('test:key2', 'value2', { EX: 3600 });
  await mockRedis.set(
    'cache:svelte5',
    JSON.stringify({
      results: ['result1', 'result2'],
      timestamp: Date.now(),
    }),
    { EX: 300 }
  );
}

/**
 * Initialize Ollama with test responses
 */
export async function initializeOllamaMocks(): Promise<void> {
  // Set up common responses
  mockOllama.setResponse(
    'What are Svelte 5 runes?',
    'Svelte 5 runes are reactive primitives like $state, $derived, and $effect.'
  );

  mockOllama.setResponse(
    'How to migrate to Svelte 5?',
    'Replace export let with $props(), onclick with onclick, and $: with $derived.'
  );
}

/**
 * Initialize PostgreSQL with test tables
 */
export async function initializePostgreSQLMocks(): Promise<void> {
  // Seed cases table
  mockPostgreSQL.seedTable('cases', [
    {
      id: 1,
      title: 'Test Case 1',
      status: 'active',
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      title: 'Test Case 2',
      status: 'closed',
      created_at: new Date().toISOString(),
    }]);

  // Seed evidence table
  mockPostgreSQL.seedTable('evidence', [
    {
      id: 1,
      case_id: 1,
      title: 'Evidence 1',
      type: 'document',
      created_at: new Date().toISOString(),
    }]);
}

/**
 * Initialize MinIO with test buckets
 */
export async function initializeMinIOMocks(): Promise<void> {
  // Upload sample objects
  await mockMinIO.putObject('documents', 'test-doc.txt', 'This is a test document', {
    'Content-Type': 'text/plain',
  });

  await mockMinIO.putObject('evidence', 'case-1/evidence-1.pdf', Buffer.from('PDF content'), {
    'Content-Type': 'application/pdf',
  });
}

/**
 * Initialize fetch mocks for HTTP endpoints
 */
export function initializeFetchMocks(): void {
  // Qdrant search endpoint - dynamically query mockQdrant
  mockFetch.setResponse('localhost:6333/collections', {
    status: 200,
    data: {}, // Will be populated dynamically
  });

  mockFetch.setResponse('localhost:3004/invoke', {
    status: 200,
    data: {, result: {
        results: [
          { title: 'Result 1', score: 0.9 },
          { title: 'Result 2', score: 0.8 }
        ],
        synthesized: 'This is a synthesized response',
      },
    },
  });

  mockFetch.setResponse('localhost:3002/function-call', {
    status: 200,
    data: {, errors: [],
      warnings: [],
    },
  });

  mockFetch.setResponse('localhost:3005/a2a/', {
    status: 200,
    data: {, agents: [{ id: 'agent1', name: 'Test Agent 1', capabilities: ['search'] }],
    },
  });

  // /api/embed endpoint (used by EmbeddingService) - returns { embeddings: [[...]] }
  mockFetch.setResponse('localhost:11434/api/embed', {
    status: 200,
    data: {, embeddings: [Array(384).fill(0.5)],
    },
  });

  mockFetch.setResponse('localhost:11434/api/embeddings', {
    status: 200,
    data: {, embedding: Array(384).fill(0.5),
    },
  });

  mockFetch.setResponse('localhost:11434/api/generate', {
    status: 200,
    data: {, response: 'Mock LLM response',
    },
  });

  global.fetch = mockFetch.getMockFetch();
}

// ═══════════════════════════════════════════════════════════════════════
// Main Setup/Cleanup Functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Complete test setup - call in beforeEach
 */
export async function setupTest(options: {
	env?: Record<string, string>,
	skipQdrant?: boolean,
	skipRedis?: boolean;
	skipOllama?: boolean;
	skipPostgreSQL?: boolean;
	skipMinIO?: boolean;
	skipFetch?: boolean;
} = {}): Promise<void> {
	// Setup environment
	setupTestEnv(options.env);

	// Reset all mocks
	resetAllMocks();

	// Initialize services
	if (!options.skipQdrant) await initializeQdrantMocks();
	if (!options.skipRedis) await initializeRedisMocks();
	if (!options.skipOllama) await initializeOllamaMocks();
	if (!options.skipPostgreSQL) await initializePostgreSQLMocks();
	if (!options.skipMinIO) await initializeMinIOMocks();
	if (!options.skipFetch) initializeFetchMocks();

	// Clear all timers
	vi.clearAllTimers();
}

/**
 * Complete test cleanup - call in afterEach
 */
export async function cleanupTest(): Promise<void> {
	// Reset all mocks
	resetAllMocks();

	// Restore environment
	restoreTestEnv();

	// Clear all mocks
	vi.clearAllMocks();

	// Restore fetch if it was mocked
	if (global?.fetch && vi.isMockFunction(global.fetch)) {
		vi.restoreAllMocks();
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Convenience Hooks
// ═══════════════════════════════════════════════════════════════════════

/**
 * Register global beforeEach/afterEach hooks
 *
 * Usage:
 *   import { registerTestHooks } from '$lib/test-utils/setup';
 *   registerTestHooks();
 */
export function registerTestHooks(options?: Parameters<typeof setupTest>[0]): void {
	beforeEach(async () => {
		await setupTest(options);
	});

	afterEach(async () => {
		await cleanupTest();
	});
}

// ═══════════════════════════════════════════════════════════════════════
// Test Data Factories
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create test case data
 */
export function createTestCase(overrides: Partial<any> = {}): any {
	return {
		id: Math.floor(Math.random() * 10000),
		title: 'Test Case',
		description: 'Test case description',
		status: 'active',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
}

/**
 * Create test evidence data
 */
export function createTestEvidence(overrides: Partial<any> = {}): any {
	return {
		id: Math.floor(Math.random() * 10000),
		case_id: 1,
		title: 'Test Evidence',
		type: 'document',
		content: 'Test evidence content',
		created_at: new Date().toISOString(),
		...overrides
	};
}

/**
 * Create test search result
 */
export function createTestSearchResult(overrides: Partial<any> = {}): any {
	return {
		id: Math.floor(Math.random() * 10000),
		title: 'Test Result',
		content: 'Test result content',
		score: 0.85,
		url: 'https://example.com/test',
		tags: ['test'],
		...overrides
	};
}

/**
 * Create test embedding vector
 */
export function createTestEmbedding(dimension: number = 384): number[] {
	return Array.from({ length: dimension }, () => Math.random());
}

// ═══════════════════════════════════════════════════════════════════════
// Assertion Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Assert that a value is a valid embedding vector
 */
export function assertValidEmbedding(embedding: any, expectedDimension: number = 384): void {
	if (!Array.isArray(embedding)) {
		throw new Error('Embedding must be an array');
	}
	if (embedding.length !== expectedDimension) {
		throw new Error(`Embedding dimension mismatch: expected ${ expectedDimension }, got ${embedding.length}`);
	}
	if (!embedding.every(v => typeof v === 'number')) {
		throw new Error('Embedding must contain only numbers');
	}
}

/**
 * Assert that a search result has required fields
 */
export function assertValidSearchResult(result: any): void {
	if (!result.id) throw new Error('Search result missing id');
	if (!result.title) throw new Error('Search result missing title');
	if (typeof result.score !== 'number') throw new Error('Search result missing score');
}

/**
 * Wait for condition to be true
 */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	options: { timeout?: number; interval?: number } = {}
): Promise<void> {
	const { timeout = 5000, interval = 100 } = options;
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		if (await condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, interval));
	}

	throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

// ═══════════════════════════════════════════════════════════════════════
// Re-export Mock Clients for Direct Access
// ═══════════════════════════════════════════════════════════════════════

/**
 * Re-export mock clients so tests can access them directly
 *
 * Usage:
 *   import { mockQdrant, mockRedis } from '$lib/test-utils/setup';
 *   await mockQdrant.upsert('collection', { points: [...] });
 */
export { mockFetch, mockMinIO, mockOllama, mockPostgreSQL, mockQdrant, mockRedis };



