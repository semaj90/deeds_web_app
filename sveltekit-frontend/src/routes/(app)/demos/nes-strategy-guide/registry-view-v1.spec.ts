import { describe, expect, it } from 'vitest';
import { resolveNesRegistryCardV1, selectNesRegistryPageV1, type NesRegistryCardV1 } from './registry-view-v1.js';

const cards: NesRegistryCardV1[] = Array.from({ length: 121 }, (_, index) => ({
	card_id: `card-${String(index).padStart(3, '0')}`,
	packet_key: null,
	source_ref: `src/group-${index % 2}/file-${index}.ts`,
	som_cluster: index % 4,
	retrieval_temperature: index % 2 ? 'cold' : 'warm',
	tags: [`topic-${index % 3}`]
}));

describe('NES registry view helpers', () => {
	it('paginates a complete registry deterministically', () => {
		const first = selectNesRegistryPageV1(cards, { query: '', temperature: 'all', cluster: null, page: 1 });
		const last = selectNesRegistryPageV1(cards, { query: '', temperature: 'all', cluster: null, page: 3 });
		expect(first.resultCount).toBe(121);
		expect(first.cards).toHaveLength(50);
		expect(last.cards).toHaveLength(21);
		expect(last.pageCount).toBe(3);
	});

	it('filters by source, tag, temperature, and cluster before pagination', () => {
		const result = selectNesRegistryPageV1(cards, {
			query: 'topic-1', temperature: 'cold', cluster: 1, page: 1
		});
		expect(result.cards.every((card) => card.tags?.includes('topic-1') && card.retrieval_temperature === 'cold' && card.som_cluster === 1)).toBe(true);
	});

	it('clamps invalid pages and resolves IDs exactly', () => {
		const page = selectNesRegistryPageV1(cards, { query: '', temperature: 'all', cluster: null, page: 99 });
		expect(page.page).toBe(page.pageCount);
		expect(resolveNesRegistryCardV1(cards, 'card-001')?.card_id).toBe('card-001');
		expect(resolveNesRegistryCardV1(cards, 'CARD-001')).toBeNull();
	});
});
