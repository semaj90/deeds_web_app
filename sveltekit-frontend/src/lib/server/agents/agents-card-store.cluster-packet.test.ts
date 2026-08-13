import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const redisMock = {
	get: vi.fn(async (key: string) => store.get(key) ?? null),
	setex: vi.fn(async (key: string, _ttl: number, value: string) => {
		store.set(key, value);
		return 'OK';
	}),
	mget: vi.fn(async (keys: string[]) => keys.map((key) => store.get(key) ?? null)),
};

vi.mock('$lib/server/redis', () => ({
	getRedis: () => redisMock,
}));

import {
	cardIdForDir,
	computeCardContentHash,
	readCardFromRedis,
	writeCardToRedis,
} from './agents-card-store.js';

function makeCard(summary = 'canonical packet summary') {
	return {
		id: cardIdForDir('src/app'),
		dirPath: 'src/app',
		title: 'App',
		summary,
		staticImports: ['svelte'],
		dynamicImports: [],
		pathAliases: ['$lib'],
		featureKeys: ['cluster:0'],
		routeSurfaces: ['src/app/+page.svelte'],
		schemaTables: [],
		qdrantTags: ['cluster:0'],
		clusterPacket: {
			packetKey: 'sha256:abc',
			clusterSummaryKey: 'cluster:summary:0',
			summary,
			topFiles: ['src/a.ts', 'src/b.ts'],
			authorityScore: 0.91,
			pageRankTop5: [{ filePath: 'src/a.ts', pageRank: 0.9, karpathyBlend: 0.7 }],
			representationId: 'semantic_768',
			representationRevision: 1,
			centroidKey: 'gpu:autoencoder:centroids_64',
			graphRevision: 'graph-rev',
		},
		auditStatus: 'SHIPPED' as const,
		recommendations: [],
		activityScore: 0,
		lastIndexedAt: '2026-08-13T00:00:00.000Z',
		contentHash: '',
		gates: {},
	};
}

describe('agents-card-store clusterPacket round trip', () => {
	beforeEach(() => {
		store.clear();
		redisMock.get.mockClear();
		redisMock.setex.mockClear();
		redisMock.mget.mockClear();
	});

	it('includes clusterPacket in the content hash', () => {
		const a = makeCard('summary a');
		const b = makeCard('summary b');
		expect(computeCardContentHash(a)).not.toBe(computeCardContentHash(b));
	});

	it('round-trips the clusterPacket block through Redis', async () => {
		const card = makeCard();
		card.contentHash = computeCardContentHash(card);

		const wrote = await writeCardToRedis(card);
		expect(wrote).toBe(true);

		const read = await readCardFromRedis(card.dirPath);
		expect(read).not.toBeNull();
		expect(read?.clusterPacket).toEqual(card.clusterPacket);
		expect(read?.contentHash).toBe(card.contentHash);
	});
});
