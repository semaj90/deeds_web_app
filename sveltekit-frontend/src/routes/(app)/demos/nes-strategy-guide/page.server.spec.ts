import { beforeEach, describe, expect, it, vi } from 'vitest';

const registryReader = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/cartridge/neschrom97-upsert-receipt-v1.js', () => ({
	readNesChrom97RegistryV1: registryReader
}));

import { load } from './+page.server.js';

function loadPage(search = '') {
	return load({ url: new URL(`http://localhost/demos/nes-strategy-guide${search}`) } as Parameters<typeof load>[0]);
}

describe('NES strategy guide page data', () => {
	beforeEach(() => registryReader.mockReset());

	it('does not invent registry metrics when the registry is unavailable', async () => {
		registryReader.mockReturnValue(null);

		const result = await loadPage();

		expect(result.registryAvailable).toBe(false);
		expect(result.metadata).toBeNull();
		expect(result.registryDigest).toBeNull();
		expect(result.totalCards).toBe(0);
		expect(result.cards).toEqual([]);
	});

	it('uses the loaded registry count and preserves its digest', async () => {
		registryReader.mockReturnValue({
			metadata: { card_store_size: 1, mapped_count: 1, unmapped_count: 0, duplicate_cards: 0 },
			cards: [{ card_id: 'card-1', source_ref: 'src/example.ts' }],
			registryDigest: 'sha256:registry'
		});

		const result = await loadPage();

		expect(result.registryAvailable).toBe(true);
		expect(result.totalCards).toBe(1);
		expect(result.registryDigest).toBe('sha256:registry');
		expect(result.cards.map((card) => card.card_id)).toEqual(['card-1']);
	});
});
