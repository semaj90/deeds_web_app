/**
 * Fuse.js Search Store — Svelte 5 runes
 * Fuzzy search with configurable keys and threshold.
 * Rewritten Session 63
 */
import Fuse from 'fuse.js';

export interface SearchItem {
	id: string;
	title: string;
	body: string;
	tags?: string[];
}

interface SearchResult {
	item: SearchItem;
	score: number;
}

class FuseSearchStore {
	items = $state<SearchItem[]>([]);
	query = $state('');

	private fuse: Fuse<SearchItem> | null = null;
	private readonly options: Fuse.IFuseOptions<SearchItem> = {
		keys: ['title', 'body', 'tags'],
		threshold: 0.34,
		ignoreLocation: true,
		includeScore: true,
		minMatchCharLength: 2
	};

	results = $derived.by(() => {
		// Rebuild Fuse index when items change
		if (this.items.length > 0) {
			this.fuse = new Fuse(this.items, this.options);
		} else {
			this.fuse = null;
		}

		if (!this.fuse || !this.query.trim()) return [] as SearchResult[];

		return this.fuse
			.search(this.query)
			.slice(0, 30)
			.map((r) => ({ item: r.item, score: r.score ?? 0 }));
	});

	setItems(newItems: SearchItem[]): void {
		this.items = newItems;
	}

	setQuery(newQuery: string): void {
		this.query = newQuery;
	}
}

export const searchStore = new FuseSearchStore();
