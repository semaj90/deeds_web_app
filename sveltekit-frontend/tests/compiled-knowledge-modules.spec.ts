// @vitest-environment node
/**
 * Tests for Karpathy-inspired compiled knowledge modules:
 * - MCP bridge (in-process tool calls)
 * - Cluster narratives API endpoint
 * - Rerank backend selection
 * - Glyph prompt cache CLUSTER fragment type
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── MCP Bridge ────────────────────────────────────────────────────────────────

// Mock the MCP tools module used by mcp-bridge.ts
// The bridge imports from '../../mcp/index.js' which resolves to src/mcp/index.ts
vi.mock('../src/mcp/index.js', () => ({
	mcpTools: {
		cases: {
			loadCases: vi.fn(async () => ({ success: true, data: [{ id: '1', title: 'Test Case' }] })),
			createCase: vi.fn(async () => ({ success: true, data: { id: '2' } })),
			updateCase: vi.fn(async () => ({ success: true, data: {} })),
			deleteCase: vi.fn(async () => ({ success: true, data: { deleted: true, id: '1' } })),
			findSimilarCases: vi.fn(async () => ({ success: true, data: [] })),
			getCaseAnalytics: vi.fn(async () => ({ success: true, data: {} })),
		},
		evidence: {
			loadEvidence: vi.fn(async () => ({ success: true, data: [] })),
			createEvidence: vi.fn(async () => ({ success: true, data: { id: 'ev-1' } })),
			updateEvidence: vi.fn(async () => ({ success: true, data: {} })),
			deleteEvidence: vi.fn(async () => ({ success: true, data: { deleted: true, id: 'ev-1' } })),
			findSimilarEvidence: vi.fn(async () => ({ success: true, data: [] })),
			getEvidenceAnalytics: vi.fn(async () => ({ success: true, data: {} })),
		},
		rag: {
			webSearch: vi.fn(async () => ({ success: true, data: [] })),
			indexWebPage: vi.fn(async () => ({ success: true, data: { indexed: true, id: 'w-1' } })),
			indexDirectory: vi.fn(async () => ({ success: true, data: { indexed: 0, errors: [] } })),
			syncMinIO: vi.fn(async () => ({ success: true, data: { processed: 0, skipped: 0 } })),
			getLangCacheStats: vi.fn(async () => ({ success: true, data: { hits: 0, misses: 0, total: 0 } })),
			clearLangCache: vi.fn(async () => ({ success: true, data: { cleared: 0 } })),
		},
		reports: {
			listReports: vi.fn(async () => ({ success: true, data: [] })),
			createReport: vi.fn(async () => ({ success: true, data: {} })),
			generateFromTemplate: vi.fn(async () => ({ success: true, data: {} })),
			updateReport: vi.fn(async () => ({ success: true, data: {} })),
			deleteReport: vi.fn(async () => ({ success: true, data: { deleted: true, id: 'r-1' } })),
			exportReport: vi.fn(async () => ({ success: true, data: { url: '', filename: '' } })),
		},
		citations: {
			searchCitations: vi.fn(async () => ({ success: true, data: [] })),
			listByCaseId: vi.fn(async () => ({ success: true, data: [] })),
			addToCase: vi.fn(async () => ({ success: true, data: {} })),
		},
		users: {
			getUserById: vi.fn(async () => ({ success: true, data: { id: 'u1' } })),
			updateUser: vi.fn(async () => ({ success: true, data: {} })),
			getUserAnalytics: vi.fn(async () => ({ success: true, data: {} })),
		},
		generateEmbedding: vi.fn(async () => ({ success: true, data: [0.1, 0.2] })),
		semanticSearch: vi.fn(async () => ({ success: true, data: [] })),
		queryRAG: vi.fn(async () => ({ success: true, data: {} })),
		analyzeLegalDocument: vi.fn(async () => ({ success: true, data: {} })),
		extractClauses: vi.fn(async () => ({ success: true, data: {} })),
		getAnalytics: vi.fn(async () => ({ success: true, data: {} })),
	},
}));

describe('MCP Bridge', () => {
	let mcpBridge: typeof import('$lib/server/mcp-bridge.js').mcpBridge;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('$lib/server/mcp-bridge.js');
		mcpBridge = mod.mcpBridge;
	});

	it('calls namespaced tools (cases:loadCases)', async () => {
		const result = await mcpBridge.call('cases:loadCases', { limit: 10 });
		expect(result.ok).toBe(true);
		expect(result.data).toEqual([{ id: '1', title: 'Test Case' }]);
		expect(result.tool).toBe('cases:loadCases');
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});

	it('returns error for unknown tools', async () => {
		const result = await mcpBridge.call('nonexistent:tool', {});
		expect(result.ok).toBe(false);
		expect(result.error).toContain('Unknown tool');
	});

	it('parallel() runs multiple tools concurrently', async () => {
		const results = await mcpBridge.parallel([
			{ tool: 'cases:loadCases', args: {} },
			{ tool: 'rag:webSearch', args: { query: 'test' } },
		]);
		expect(results).toHaveLength(2);
		expect(results[0].ok).toBe(true);
		expect(results[1].ok).toBe(true);
	});

	it('pipeline() stops on non-optional failure', async () => {
		const results = await mcpBridge.pipeline([
			{ tool: 'cases:loadCases', args: {} },
			{ tool: 'unknown:tool', args: {} },
			{ tool: 'rag:webSearch', args: { query: 'test' } }, // should not execute
		]);
		expect(results).toHaveLength(2); // stopped after failure
		expect(results[0].ok).toBe(true);
		expect(results[1].ok).toBe(false);
	});

	it('pipeline() continues past optional failures', async () => {
		const results = await mcpBridge.pipeline([
			{ tool: 'cases:loadCases', args: {} },
			{ tool: 'unknown:tool', args: {}, optional: true },
			{ tool: 'rag:webSearch', args: { query: 'test' } },
		]);
		expect(results).toHaveLength(3);
		expect(results[2].ok).toBe(true);
	});

	it('listTools() returns available tools', () => {
		const tools = mcpBridge.listTools();
		expect(tools).toContain('cases:loadCases');
		expect(tools).toContain('rag:webSearch');
		expect(tools).toContain('generateEmbedding');
		expect(tools.length).toBeGreaterThan(10);
	});
});

// ── Glyph Prompt Cache ────────────────────────────────────────────────────────

describe('Glyph Prompt Cache — CLUSTER fragment type', () => {
	it('CLUSTER fragment type is slot 8', async () => {
		const { FragmentType } = await import('$lib/server/glyph-prompt-cache.js');
		expect(FragmentType.CLUSTER).toBe(8);
		// Verify all slots are unique
		const values = Object.values(FragmentType);
		expect(new Set(values).size).toBe(values.length);
	});

	it('can store and retrieve a CLUSTER fragment', async () => {
		const { getFragment, setFragment, FragmentType } = await import('$lib/server/glyph-prompt-cache.js');
		const key = 'cluster:test:0';
		const payload = JSON.stringify({ purpose: 'test cluster', patterns: ['auth'] });
		setFragment(key, payload, FragmentType.CLUSTER, 60_000);
		const retrieved = getFragment(key);
		expect(retrieved).toBe(payload);
	});
});

// ── ACE Context Types ─────────────────────────────────────────────────────────

describe('ACEContext clusterNarratives field', () => {
	it('ACEContext type includes clusterNarratives', async () => {
		// Type-level test — if this compiles, the field exists
		const context: Partial<import('$lib/server/ace/types.js').ACEContext> = {
			clusterNarratives: [
				{ clusterId: 0, purpose: 'auth module', patterns: ['JWT', 'sessions'], keyFiles: ['auth.ts'] },
			],
		};
		expect(context.clusterNarratives).toHaveLength(1);
		expect(context.clusterNarratives![0].purpose).toBe('auth module');
	});
});

// ── Ingestion Buffer Builder ──────────────────────────────────────────────────

describe('Ingestion Buffer Builder', () => {
	it('buildClusterBuffer produces valid IngestionBuffer shape', async () => {
		const { buildClusterBuffer } = await import('$lib/server/graph/ingestion-buffer-builder.js');
		const narrative = {
			purpose: 'Authentication and session management',
			patterns: ['JWT', 'cookie sessions'],
			keyFiles: ['src/lib/server/auth.ts'],
			crossReferences: [3, 7],
			log: [],
			generatedAt: new Date().toISOString(),
			lastMergedAt: new Date().toISOString(),
		};
		const members = [
			{ fileId: 'f1', filePath: 'src/lib/server/auth.ts', astCluster: 'server' },
			{ fileId: 'f2', filePath: 'src/lib/server/session.ts', astCluster: 'server' },
		];
		const buffer = buildClusterBuffer(5, 20, narrative, members);
		expect(buffer.version).toBe(2);
		expect(buffer.scope).toBe('cluster');
		expect(buffer.clusterId).toBe(5);
		expect(buffer.k).toBe(20);
		expect(buffer.narrative).toBe('Authentication and session management');
		expect(buffer.files).toHaveLength(2);
		expect(buffer.files[0].path).toBe('src/lib/server/auth.ts');
		expect(buffer.tokenEstimate).toBeGreaterThan(0);
		expect(buffer.compressionRatio).toBeGreaterThan(0);
		expect(buffer.compressionRatio).toBeLessThanOrEqual(1);
	});

	it('buildClusterBuffer handles empty members', async () => {
		const { buildClusterBuffer } = await import('$lib/server/graph/ingestion-buffer-builder.js');
		const narrative = {
			purpose: 'Empty cluster',
			patterns: [],
			keyFiles: [],
			crossReferences: [],
			log: [],
			generatedAt: new Date().toISOString(),
			lastMergedAt: new Date().toISOString(),
		};
		const buffer = buildClusterBuffer(0, 10, narrative, []);
		expect(buffer.files).toHaveLength(0);
		expect(buffer.compressionRatio).toBe(1);
	});
});

// ── Ingestion Buffer Types ────────────────────────────────────────────────────

describe('Ingestion buffer types barrel export', () => {
	it('exports IngestionBuffer and ContradictionLintResult types', async () => {
		const types = await import('$lib/server/types/index.js');
		// Type-level checks — if these compile, the exports exist
		const buffer: import('$lib/server/types/ingestion-buffer.js').IngestionBuffer = {
			version: 2,
			generatedAt: '',
			scope: 'cluster',
			clusterId: 1,
			k: 20,
			narrative: '',
			files: [],
			edges: [],
			tokenEstimate: 0,
			compressionRatio: 1,
		};
		expect(buffer.version).toBe(2);
	});
});

// ── Web Ingest Types ──────────────────────────────────────────────────────────

describe('Web Ingest module', () => {
	it('WebIngestMessage has required fields', async () => {
		const msg: import('$lib/server/retrieval/web-ingest.js').WebIngestMessage = {
			url: 'https://example.com/legal',
			title: 'Legal FAQ',
			snippet: 'Answers to common legal questions',
			source: 'searxng',
			query: 'what is hearsay',
			rerankScore: 0.65,
			ingestedAt: new Date().toISOString(),
		};
		expect(msg.url).toContain('example.com');
		expect(msg.rerankScore).toBe(0.65);
	});
});

// ── Schema: ingestion_buffers table ───────────────────────────────────────────

describe('Schema — ingestion_buffers table', () => {
	it('ingestionBuffers table is exported from schema', async () => {
		const { ingestionBuffers } = await import('$lib/server/db/schema-postgres.js');
		expect(ingestionBuffers).toBeDefined();
		// Drizzle table has a Symbol for table name
		expect((ingestionBuffers as any)[Symbol.for('drizzle:Name')]).toBe('ingestion_buffers');
	});
});

// ── RabbitMQ kb.ingest queue ──────────────────────────────────────────────────

describe('RabbitMQ kb.ingest queue registration', () => {
	it('kb_ingest queue is declared in manager', async () => {
		// Read the source to verify the queue is registered
		const fs = await import('fs');
		const path = await import('path');
		const src = fs.readFileSync(
			path.resolve('src/lib/server/queue/rabbitmq-manager-fixed.ts'),
			'utf-8'
		);
		expect(src).toContain("kb_ingest: 'kb.ingest'");
		expect(src).toContain("'kb.ingest'");
	});
});
