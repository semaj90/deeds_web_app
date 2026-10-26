export type NesRegistryCardV1 = {
	card_id: string;
	packet_key?: string | null;
	feature_id?: string | null;
	source_ref?: string | null;
	card_path?: string | null;
	directory_path?: string | null;
	som_cluster?: number | null;
	retrieval_temperature?: string | null;
	tags?: string[] | null;
	card_hash?: string | null;
	[key: string]: unknown;
};

export type NesRegistryFiltersV1 = {
	query: string;
	temperature: 'all' | 'hot' | 'warm' | 'cold';
	cluster: number | null;
	page: number;
	pageSize?: number;
};

export function selectNesRegistryPageV1(cards: NesRegistryCardV1[], filters: NesRegistryFiltersV1) {
	const query = filters.query.trim().slice(0, 160).toLocaleLowerCase();
	const matching = cards.filter((card) => {
		const textMatches = !query || [card.card_id, card.source_ref, card.card_path, card.directory_path, ...(card.tags ?? [])]
			.some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(query));
		const temperatureMatches = filters.temperature === 'all' || card.retrieval_temperature === filters.temperature;
		const clusterMatches = filters.cluster === null || card.som_cluster === filters.cluster;
		return textMatches && temperatureMatches && clusterMatches;
	});
	const pageSize = Math.max(1, Math.min(100, Math.trunc(filters.pageSize ?? 50)));
	const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
	const page = Math.max(1, Math.min(pageCount, Math.trunc(filters.page) || 1));
	const start = (page - 1) * pageSize;
	return { cards: matching.slice(start, start + pageSize), resultCount: matching.length, page, pageSize, pageCount };
}

export function resolveNesRegistryCardV1(cards: NesRegistryCardV1[], cardId: string) {
	return cards.find((card) => card.card_id === cardId) ?? null;
}
