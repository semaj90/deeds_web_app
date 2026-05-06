// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mocks declared before any imports ────────────────────────────────────────

const mockSessionRun = vi.fn();
const mockSessionClose = vi.fn().mockResolvedValue(undefined);
const mockSession = { run: mockSessionRun, close: mockSessionClose };
const mockDriver = { session: vi.fn(() => mockSession) };

vi.mock('../src/lib/server/neo4j-driver.js', () => ({
	getNeo4jDriver: () => mockDriver,
}));

vi.mock('../src/lib/server/vector/qdrant-manager.js', () => ({
	QdrantManager: class {},
}));

vi.mock('../src/lib/server/indexer/karpathy-wiki.js', () => ({
	couchPut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/server/db/client.js', () => ({
	default: {
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: 'snap-1' }]),
				onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
			}),
		}),
	},
}));

vi.mock('$lib/server/db/schema.js', () => ({
	topologySnapshots: {},
	topologyPositions: {},
}));

const mockGetGdsStatus = vi.fn();
vi.mock('../src/lib/server/graph/neo4j-gds.js', () => ({
	getGdsStatus: mockGetGdsStatus,
}));

// ── lazy import ───────────────────────────────────────────────────────────────

let persistKarpathyHook: typeof import('../src/lib/server/indexer/karpathy-persistence.js').persistKarpathyHook;

beforeEach(async () => {
	vi.clearAllMocks();
	mockSessionClose.mockResolvedValue(undefined);
	mockGetGdsStatus.mockResolvedValue({
		apocAvailable: false,
		gdsAvailable: false,
		projectionExists: false,
	});
	// reset session mock to default (success)
	mockSessionRun.mockResolvedValue({ records: [] });

	const mod = await import('../src/lib/server/indexer/karpathy-persistence.js');
	persistKarpathyHook = mod.persistKarpathyHook;
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOutput(edges: Array<{ type: string; source: string; target: string }>) {
	return {
		runId: 'run-test-1',
		neo4jEdges: edges,
		wikiNotes: [],
		libtorchRows: [],
		stats: { filesSeen: 0, chunksCreated: 0 },
	};
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('persistKarpathyHook — Neo4j APOC batch upsert', () => {
	it('uses APOC UNWIND path when apocAvailable=true', async () => {
		mockGetGdsStatus.mockResolvedValue({ apocAvailable: true, gdsAvailable: false, projectionExists: false });

		const edges = [
			{ type: 'IMPORTS', source: 'a.ts', target: 'b.ts' },
			{ type: 'IMPORTS', source: 'b.ts', target: 'c.ts' },
		];
		await persistKarpathyHook(makeOutput(edges));

		// APOC query contains UNWIND and apoc.merge.relationship
		const calls = mockSessionRun.mock.calls;
		const apocCall = calls.find(([q]) => String(q).includes('apoc.merge.relationship'));
		expect(apocCall).toBeDefined();
		// rows parameter should carry both edges in one batch
		expect(apocCall![1].rows).toHaveLength(2);
	});

	it('falls back to serial MERGE when apocAvailable=false', async () => {
		mockGetGdsStatus.mockResolvedValue({ apocAvailable: false, gdsAvailable: false, projectionExists: false });

		const edges = [
			{ type: 'CONTAINS', source: 'dir/', target: 'a.ts' },
		];
		await persistKarpathyHook(makeOutput(edges));

		const calls = mockSessionRun.mock.calls;
		// Serial MERGE uses template literal with edge.type injected
		const serialCall = calls.find(([q]) => String(q).includes('CONTAINS'));
		expect(serialCall).toBeDefined();
		// No UNWIND / apoc call
		const apocCall = calls.find(([q]) => String(q).includes('apoc.merge.relationship'));
		expect(apocCall).toBeUndefined();
	});

	it('groups edges by rel type — separate UNWIND per type', async () => {
		mockGetGdsStatus.mockResolvedValue({ apocAvailable: true, gdsAvailable: false, projectionExists: false });

		const edges = [
			{ type: 'IMPORTS', source: 'a.ts', target: 'b.ts' },
			{ type: 'CONTAINS', source: 'dir/', target: 'a.ts' },
			{ type: 'IMPORTS', source: 'c.ts', target: 'd.ts' },
		];
		await persistKarpathyHook(makeOutput(edges));

		const apocCalls = mockSessionRun.mock.calls.filter(([q]) =>
			String(q).includes('apoc.merge.relationship')
		);
		// 2 distinct types → 2 APOC batches
		expect(apocCalls).toHaveLength(2);
		// Each batch has the correct relType param
		const relTypes = apocCalls.map(([, p]) => p.relType).sort();
		expect(relTypes).toEqual(['CONTAINS', 'IMPORTS']);
	});

	it('chunks large batches at BATCH_SIZE=500 boundary', async () => {
		mockGetGdsStatus.mockResolvedValue({ apocAvailable: true, gdsAvailable: false, projectionExists: false });

		// 501 edges of the same type → should produce 2 APOC calls (500 + 1)
		const edges = Array.from({ length: 501 }, (_, i) => ({
			type: 'IMPORTS',
			source: `src${i}.ts`,
			target: `tgt${i}.ts`,
		}));
		await persistKarpathyHook(makeOutput(edges));

		const apocCalls = mockSessionRun.mock.calls.filter(([q]) =>
			String(q).includes('apoc.merge.relationship')
		);
		expect(apocCalls).toHaveLength(2);
		expect(apocCalls[0][1].rows).toHaveLength(500);
		expect(apocCalls[1][1].rows).toHaveLength(1);
	});

	it('falls back to serial when APOC batch throws', async () => {
		mockGetGdsStatus.mockResolvedValue({ apocAvailable: true, gdsAvailable: false, projectionExists: false });

		// First call (APOC UNWIND) throws; subsequent calls (serial MERGE) succeed
		let callCount = 0;
		mockSessionRun.mockImplementation(async (q: string) => {
			if (String(q).includes('apoc.merge.relationship')) {
				throw new Error('apoc procedure not found');
			}
			callCount++;
			return { records: [] };
		});

		const edges = [{ type: 'IMPORTS', source: 'a.ts', target: 'b.ts' }];
		// should not throw — serial fallback handles it
		await expect(persistKarpathyHook(makeOutput(edges))).resolves.not.toThrow();
		// serial MERGE was called
		expect(callCount).toBeGreaterThan(0);
	});

	it('returns success=true with correct stats', async () => {
		const output = {
			...makeOutput([{ type: 'IMPORTS', source: 'a', target: 'b' }]),
			stats: { filesSeen: 42, chunksCreated: 7 },
		};
		const result = await persistKarpathyHook(output);
		expect(result.success).toBe(true);
		expect(result.stats.filesSeen).toBe(42);
	});

	it('skips Neo4j writes when edge list is empty', async () => {
		await persistKarpathyHook(makeOutput([]));
		const apocCalls = mockSessionRun.mock.calls.filter(([q]) =>
			String(q).includes('apoc.merge.relationship') || String(q).includes('MERGE')
		);
		expect(apocCalls).toHaveLength(0);
	});
});