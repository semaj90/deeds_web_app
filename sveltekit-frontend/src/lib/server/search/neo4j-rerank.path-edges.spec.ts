import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRun = vi.hoisted(() => vi.fn());
const mockClose = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/neo4j-driver.js', () => ({
	getNeo4jDriver: () => ({
		session: () => ({ run: mockRun, close: mockClose }),
	}),
}));

function pathRecord(segments: Array<{ from: string; to: string; relation: string }>) {
	const path = {
		segments: segments.map(({ from, to, relation }) => ({
			start: { properties: { stable_key: from } },
			end: { properties: { stable_key: to } },
			relationship: { type: relation },
		})),
	};
	return { keys: ['p'], get: (key: string) => key === 'p' ? path : undefined };
}

describe('expandNeighbourPathEdges', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockClose.mockResolvedValue(undefined);
	});

	it('preserves actual relationship types and ordered hop positions', async () => {
		mockRun.mockResolvedValueOnce({
			records: [pathRecord([
				{ from: 'file:a.ts', to: 'file:b.ts', relation: 'CALLS' },
				{ from: 'file:b.ts', to: 'file:c.ts', relation: 'USED_CONCEPT' },
			])],
		});

		const { expandNeighbourPathEdges } = await import('./neo4j-rerank.js');
		await expect(expandNeighbourPathEdges('file:a.ts', 2, 9)).resolves.toEqual([
			{ from: 'file:a.ts', to: 'file:b.ts', relation: 'CALLS', hop: 1 },
			{ from: 'file:b.ts', to: 'file:c.ts', relation: 'USED_CONCEPT', hop: 2 },
		]);
		expect(mockRun).toHaveBeenCalledWith(expect.stringContaining('MATCH p='), { k: 'file:a.ts', limit: 9 });
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it('caps caller-provided path limits', async () => {
		mockRun.mockResolvedValueOnce({
			records: [pathRecord([
				{ from: 'file:a.ts', to: 'file:b.ts', relation: 'IMPORTS' },
			])],
		});

		const { expandNeighbourPathEdges } = await import('./neo4j-rerank.js');
		await expect(expandNeighbourPathEdges('file:a.ts', 1, 1000)).resolves.toEqual([
			{ from: 'file:a.ts', to: 'file:b.ts', relation: 'IMPORTS', hop: 1 },
		]);
		expect(mockRun).toHaveBeenCalledWith(expect.any(String), { k: 'file:a.ts', limit: 120 });
	});
});
