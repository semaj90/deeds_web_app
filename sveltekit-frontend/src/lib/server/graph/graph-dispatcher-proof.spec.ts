import { describe, expect, it, vi } from 'vitest';
import { buildGraphDispatcherProofSnapshot, buildLouvainPersistenceReceipt } from './graph-dispatcher-proof.js';

function createDbMock(resultMap: Record<string, unknown[]>): any {
	return {
		query: vi.fn(async (sql: string, params?: unknown[]) => {
			const text = String(sql).replace(/\s+/g, ' ').trim();
			if (text.includes("FROM graph_analysis_runs") && text.includes("algorithm = 'louvain'")) {
				return { rows: resultMap.run ?? [] };
			}
			if (text.includes('FROM graph_communities')) {
				return { rows: resultMap.communities ?? [] };
			}
			if (text.includes('FROM graph_community_assignments')) {
				return { rows: resultMap.assignments ?? [] };
			}
			return { rows: [] };
		}),
	};
}

describe('graph dispatcher proof', () => {
	it('builds a replay-safe Louvain receipt when the live rows reconcile', async () => {
		const db = createDbMock({
			run: [{ run_id: 'run-1', projection_name: 'codeTopology', graph_revision: 'graph-rev-1', metrics: { assignments: 3, unresolvedPacketKeys: 0 } }],
			communities: [{ community_count: 2, member_count: 3 }],
			assignments: [{ assignment_count: 3, distinct_packets: 3 }],
		});

		const receipt = await buildLouvainPersistenceReceipt(db);

		expect(receipt).not.toBeNull();
		expect(receipt?.replaySafe).toBe(true);
		expect(receipt?.atlasPacketsMutated).toBe(false);
		expect(receipt?.assignmentCount).toBe(3);
		expect(receipt?.communityCount).toBe(2);
	});

	it('returns an open gap when no Louvain receipt exists', async () => {
		const db = createDbMock({ run: [] });

		const snapshot = await buildGraphDispatcherProofSnapshot(db);

		expect(snapshot.registry.completeness.exactMatch).toBe(true);
		expect(snapshot.louvainReceipt).toBeNull();
		expect(snapshot.openGaps).toContain('no succeeded Louvain run found');
	});
});
