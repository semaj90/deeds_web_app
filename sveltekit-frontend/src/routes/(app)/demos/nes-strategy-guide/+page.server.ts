import type { PageServerLoad } from './$types.js';
import { selectNesRegistryPageV1, type NesRegistryCardV1 } from './registry-view-v1.js';
import { readNesChrom97RegistryV1 } from '$lib/server/cartridge/neschrom97-upsert-receipt-v1.js';

function readRegistry() {
	try {
		const registry = readNesChrom97RegistryV1();
		if (registry) return { ...registry, available: true as const, cards: registry.cards as NesRegistryCardV1[] };
	} catch (error) {
		console.warn('[nes-strategy-guide] Could not read registry JSON:', error);
	}

	return { available: false as const, metadata: null, cards: [] as NesRegistryCardV1[], registryDigest: null };
}

function parseCluster(value: string | null) {
	if (!value || value === 'all') return null;
	if (!/^\d{1,4}$/.test(value)) return null;
	return Number(value);
}

export const load: PageServerLoad = async ({ url }) => {
	const registry = readRegistry();
	const requestedTemperature = url.searchParams.get('temperature') ?? 'all';
	const temperature = ['hot', 'warm', 'cold'].includes(requestedTemperature)
		? requestedTemperature as 'hot' | 'warm' | 'cold'
		: 'all';
	const query = (url.searchParams.get('q') ?? '').slice(0, 160);
	const selectedCluster = parseCluster(url.searchParams.get('cluster'));
	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const clusters = [...new Set(registry.cards.map((card) => card.som_cluster).filter((value): value is number => typeof value === 'number'))].sort((a, b) => a - b);
	const selection = selectNesRegistryPageV1(registry.cards, { query, temperature, cluster: selectedCluster, page, pageSize: 50 });
	return {
		registryAvailable: registry.available,
		metadata: registry.metadata,
		registryDigest: registry.registryDigest,
		cards: selection.cards,
		totalCards: registry.cards.length,
		resultCount: selection.resultCount,
		page: selection.page,
		pageSize: selection.pageSize,
		pageCount: selection.pageCount,
		query,
		temperature,
		cluster: selectedCluster === null ? 'all' : String(selectedCluster),
		clusters,
		canonicalAuthority: false
	};
};
