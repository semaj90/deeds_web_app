import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { ATLAS_RAPIDS_COMMUNITY_URL: undefined },
}));

import {
	RAPIDS_COMMUNITY_MAX_EDGES,
	RAPIDS_COMMUNITY_MAX_NODES,
	runRapidsCommunityV1,
} from './rapids-community-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('runRapidsCommunityV1', () => {
	it('fails closed without an explicit community service URL', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(runRapidsCommunityV1({
			algorithm: 'leiden',
			graphRevision: 'graph:rev-1',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
			edges: [{ source: 'a', target: 'b', weight: 1 }],
		})).rejects.toThrow('ATLAS_RAPIDS_COMMUNITY_URL_REQUIRED');

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uses an explicit URL instead of assuming the shared 8099 port', async () => {
		const response = {
			schema: 'atlas.community-partition-response.v1',
			algorithm: 'leiden',
			algorithmId: 'cugraph.leiden.26.06',
			backend: 'cugraph',
			backendVersion: '26.06.00',
			graphRevision: 'graph:rev-1',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			projectionSemantics: 'atlas.undirected-weighted-projection.v1',
			parameters: {},
			modularity: 0.25,
		assignments: [
			{ nodeId: 'a', communityOrdinal: 0, communityFingerprint: 'community-a' },
			{ nodeId: 'b', communityOrdinal: 0, communityFingerprint: 'community-a' },
		],
		communities: [{ communityOrdinal: 0, communityFingerprint: 'community-a', memberNodeIds: ['a', 'b'] }],
			inputHash: 'sha256:input',
			outputHash: 'sha256:output',
			durationMs: 1,
		};
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await runRapidsCommunityV1({
			algorithm: 'leiden',
			graphRevision: 'graph:rev-1',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			nodes: [{ nodeId: 'a' }, { nodeId: 'b' }],
			edges: [{ source: 'a', target: 'b', weight: 1 }],
			baseUrl: 'http://127.0.0.1:18199/',
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'http://127.0.0.1:18199/v1/community/leiden',
			expect.objectContaining({ method: 'POST' }),
		);
		expect(result.backend).toBe('cugraph');
	});

	it('rejects oversized graphs before making a request', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const base = {
			algorithm: 'leiden' as const,
			graphRevision: 'graph:rev-1',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			baseUrl: 'http://127.0.0.1:18199',
		};

		await expect(runRapidsCommunityV1({
			...base,
			nodes: new Array(RAPIDS_COMMUNITY_MAX_NODES + 1),
			edges: [],
		})).rejects.toThrow('RAPIDS_COMMUNITY_NODE_COUNT_OUT_OF_BOUNDS');
		await expect(runRapidsCommunityV1({
			...base,
			nodes: [{ nodeId: 'a' }],
			edges: new Array(RAPIDS_COMMUNITY_MAX_EDGES + 1),
		})).rejects.toThrow('RAPIDS_COMMUNITY_EDGE_COUNT_OUT_OF_BOUNDS');

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('rejects response partitions that do not match the input snapshot', async () => {
		const response = {
			schema: 'atlas.community-partition-response.v1',
			algorithm: 'leiden',
			algorithmId: 'cugraph.leiden.26.06',
			backend: 'cugraph',
			backendVersion: '26.06.00',
			graphRevision: 'graph:other',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			projectionSemantics: 'atlas.undirected-weighted-projection.v1',
			parameters: {},
			modularity: 0.25,
			assignments: [{ nodeId: 'a', communityOrdinal: 0, communityFingerprint: 'community-a' }],
			communities: [{ communityOrdinal: 0, communityFingerprint: 'community-a', memberNodeIds: ['a'] }],
			inputHash: 'sha256:input',
			outputHash: 'sha256:output',
			durationMs: 1,
		};
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));

		await expect(runRapidsCommunityV1({
			algorithm: 'leiden',
			graphRevision: 'graph:rev-1',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			nodes: [{ nodeId: 'a' }],
			edges: [],
			baseUrl: 'http://127.0.0.1:18199',
		})).rejects.toThrow('RAPIDS_COMMUNITY_RESPONSE_SNAPSHOT_MISMATCH');
	});

	it('rejects community membership that disagrees with node assignments', async () => {
		const response = {
			schema: 'atlas.community-partition-response.v1',
			algorithm: 'leiden',
			algorithmId: 'cugraph.leiden.26.06',
			backend: 'cugraph',
			backendVersion: '26.06.00',
			graphRevision: 'graph:rev-1',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			projectionSemantics: 'atlas.undirected-weighted-projection.v1',
			parameters: {},
			modularity: 0.25,
			assignments: [{ nodeId: 'a', communityOrdinal: 0, communityFingerprint: 'community-a' }],
			communities: [{ communityOrdinal: 0, communityFingerprint: 'community-a', memberNodeIds: ['b'] }],
			inputHash: 'sha256:input',
			outputHash: 'sha256:output',
			durationMs: 1,
		};
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));

		await expect(runRapidsCommunityV1({
			algorithm: 'leiden',
			graphRevision: 'graph:rev-1',
			topologyHash: 'sha256:topology',
			projectionRevision: 'projection:rev-1',
			nodes: [{ nodeId: 'a' }],
			edges: [],
			baseUrl: 'http://127.0.0.1:18199',
		})).rejects.toThrow('RAPIDS_COMMUNITY_RESPONSE_MEMBERSHIP_MISMATCH');
	});
});
