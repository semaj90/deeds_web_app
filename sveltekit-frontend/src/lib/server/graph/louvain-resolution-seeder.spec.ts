import { describe, expect, it, vi } from 'vitest';
import { prepareLouvainResolutionSeeds } from './louvain-resolution-seeder.js';

describe('louvain-resolution-seeder', () => {
	it('dedupes resolved packet keys and preserves unresolved Louvain seeds', async () => {
		const query = vi.fn(async (sql: string) => {
			const text = String(sql).replace(/\s+/g, ' ').trim();
			if (text.includes('FROM atlas_packets')) {
				return {
					rows: [
						{
							source_ref: 'lib/server/auth.ts',
							canonical_source_ref: 'src/lib/server/auth.ts',
							file_path: 'src/lib/server/auth.ts',
							source_path: null,
							source_ref_key: null,
							packet_key: 'packet-a',
						},
					],
				};
			}
			return { rows: [] };
		});
		const db = { query } as any;

		const plan = await prepareLouvainResolutionSeeds(
			db,
			[
				{ graphNodeKey: 'node-1', rawPath: 'src/lib/server/auth.ts', communityId: '42' },
				{ graphNodeKey: 'node-2', rawPath: 'sveltekit-frontend/src/lib/server/auth.ts', communityId: '43' },
				{ graphNodeKey: 'node-3', rawPath: 'src/routes/dev/file-card/[...sourceRef]/+page.server.ts', communityId: '44' },
				{ graphNodeKey: 'node-4', rawPath: 'src/lib/server/gpu/LLMS.md', communityId: '45' },
			],
			'graph-rev-1',
		);

		expect(query).toHaveBeenCalledTimes(1);
		expect(plan.resolvedRows).toBe(2);
		expect(plan.assignmentRows).toEqual([{ packet_key: 'packet-a', community_id: '42' }]);
		expect(plan.unresolvedRows).toBe(1);
		expect(plan.unresolvedSeeds).toEqual([
			{
				graphNodeKey: 'node-3',
				rawPath: 'src/routes/dev/file-card/[...sourceRef]/+page.server.ts',
				normalizedPath: 'routes/dev/file-card/[...sourceRef]/+page.server.ts',
				communityId: '44',
				graphRevision: 'graph-rev-1',
			},
		]);
		expect(plan.excludedRows).toBe(1);
	});
});
