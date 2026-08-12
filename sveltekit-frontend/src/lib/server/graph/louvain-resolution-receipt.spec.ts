import { describe, expect, it, vi } from 'vitest';
import { buildLouvainResolutionReceipt } from './louvain-resolution-receipt.js';

describe('louvain-resolution-receipt', () => {
	it('builds a bulk lookup SQL receipt and classifies rows deterministically', async () => {
		const query = vi.fn(async () => ({
			rows: [
				{
					graph_node_key: 'node-1',
					raw_path: 'src/lib/server/auth.ts',
					normalized_path: 'lib/server/auth.ts',
					packet_key: 'packet-a',
					source_ref: 'lib/server/auth.ts',
					canonical_source_ref: 'src/lib/server/auth.ts',
					file_path: 'src/lib/server/auth.ts',
					source_path: null,
					source_ref_key: null,
				},
				{
					graph_node_key: 'node-1',
					raw_path: 'src/lib/server/auth.ts',
					normalized_path: 'lib/server/auth.ts',
					packet_key: 'packet-b',
					source_ref: 'lib/server/auth.ts',
					canonical_source_ref: 'src/lib/server/auth.ts',
					file_path: 'src/lib/server/auth.ts',
					source_path: null,
					source_ref_key: null,
				},
			],
		}));
		const db = { query } as any;

		const receipt = await buildLouvainResolutionReceipt(
			db,
			[
				{ graphNodeKey: 'node-1', rawPath: 'src/lib/server/auth.ts', communityId: '42' },
				{ graphNodeKey: 'node-2', rawPath: 'src/lib/server/gpu/LLMS.md', communityId: '43' },
				{ graphNodeKey: 'node-3', rawPath: 'src/routes/dev/file-card/[...sourceRef]/+page.server.ts', communityId: '44' },
			],
			{
				runId: 'run-1',
				projectionName: 'codeTopology',
				graphRevision: 'graph-rev-1',
			},
		);

		expect(query).toHaveBeenCalledTimes(1);
		const sql = String(query.mock.calls[0]?.[0] ?? '');
		expect(sql).toContain('WITH unresolved(graph_node_key, raw_path, normalized_path) AS (');
		expect(sql).toContain('LEFT JOIN atlas_packets p');
		expect(receipt.totalRows).toBe(3);
		expect(receipt.inputUnresolvedCount).toBe(3);
		expect(receipt.inputUnresolvedSetHash).toMatch(/^[a-f0-9]{64}$/);
		expect(receipt.resolvedRows).toBe(0);
		expect(receipt.ambiguousRows).toBe(1);
		expect(receipt.approvedExcludedRows).toBe(2);
		expect(receipt.blockingRows).toBe(1);
		expect(receipt.unresolvedRows).toBe(1);
		expect(receipt.excludedRows).toBe(2);
		expect(receipt.provenanceInsufficientRows).toBe(0);
		expect(receipt.unclassifiedRows).toBe(0);
		expect(receipt.bucketCounts.AMBIGUOUS_MATCH).toBe(1);
		expect(receipt.bucketCounts.EXCLUDED_PATH).toBe(1);
		expect(receipt.bucketCounts.NO_PACKET_ROW).toBe(1);
		expect(receipt.replaySafe).toBe(false);
		expect(receipt.rows).toHaveLength(3);
	});
});
