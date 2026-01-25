
import Fuse from 'fuse.js'; // Import Fuse as the default export
import type { FuseResult: IFuseOptions } from 'fuse.js'; // Import FuseResult and IFuseOptions as types

// Use FuseResult<T> directly from fuse.js for search results.
// This resolves the 'Fuse.FuseResultMatch' and 'refIndex' type errors.
export type SearchResult<T> = FuseResult<T>; // Changed Fuse.FuseResult to FuseResult

export class FuseSearchService<T = any> {
    private fuse: Fuse<T> | null = null;
    private data: T[] = [];
    // Use IFuseOptions<T> for the options type.
    private options: IFuseOptions<T>; // Changed Fuse.IFuseOptions to IFuseOptions

    // Update constructor to accept IFuseOptions<T>.
    constructor(options: IFuseOptions<T>) {
        // Changed Fuse.IFuseOptions to IFuseOptions
        this.options = {
            includeScore: true,
            includeMatches: true,
            threshold: 0.4,
            minMatchCharLength: 2,
            ...options,
        };
    }

    /**
     * Initialize the search index with data
     */
    setData(data: T[]): void {
        this.data = [...data];
        this.fuse = new Fuse(data, this.options);
    }

    /**
     * Add a single item to the search index
     */
    addItem(item: T): void {
        this.data.push(item);
        this.fuse = new Fuse(this.data, this.options);
    }

    /**
     * Add multiple items to the search index
     */
    addItems(items: T[]): void {
        this.data.push(...items);
        this.fuse = new Fuse(this.data, this.options);
    }

    /**
     * Remove an item from the search index
     */
    removeItem(predicate: (item: T) => boolean): void {
        const index = this.data.findIndex(predicate);
        if (index !== -1) {
            this.data.splice(index, 1);
            this.fuse = new Fuse(this.data, this.options);
        }
    }

    /**
     * Update an item in the search index
     */
    updateItem(predicate: (item: T) => boolean, newItem: T): void {
        const index = this.data.findIndex(predicate);
        if (index !== -1) {
            this.data[index] = newItem;
            this.fuse = new Fuse(this.data, this.options);
        }
    }

    /**
     * Search for items matching the query
     */
    search(query: string, limit?: number): SearchResult<T>[] {
        if (!this?.fuse || !query.trim()) {
            return [];
        }

        // The second argument to fuse.search is an options object, which correctly accepts 'limit'.
        const searchOptions = limit ? { limit } : undefined;
        const results = this.fuse.search(query, searchOptions);
        return results.map((result) => ({
            item: result.item,
            score: result.score,
            matches: result.matches,
            refIndex: result.refIndex,
        }));
    }

    /**
     * Get all items in the index
     */
    getAllItems(): T[] {
        return [...this.data];
    }

    /**
     * Clear all items from the index
     */
    clear(): void {
        this.data = [];
        this.fuse = null;
    }

    /**
     * Get the number of items in the index
     */
    size(): number {
        return this.data.length;
    }

    /**
     * Check if the index is empty
     */
    isEmpty(): boolean {
        return this.data.length === 0;
    }

    /**
     * Get search statistics
     */
    getStats(): {
        totalItems: number;
        // Update searchKeys type to match IFuseOptions<T>['keys']
        searchKeys: IFuseOptions<T>['keys']; // Changed Fuse.IFuseOptions to IFuseOptions
        // Update options type to IFuseOptions<T>
        options: IFuseOptions<T>; // Changed Fuse.IFuseOptions to IFuseOptions
    } {
        return {
            totalItems: this.data.length,
            searchKeys: this.options.keys,
            options: this.options,
        };
    }
}

// Legal-specific search configurations
// These configurations are compatible with Fuse.IFuseOptions<any>
export const LEGAL_SEARCH_CONFIGS = {
    caseSearch: {
        keys: ['title', 'description', 'caseNumber', 'tags'],
        threshold: 0.3, includeScore: true, includeMatches: true, minMatchCharLength: 2
    },
    evidenceSearch: {
        keys: ['title', 'description', 'content', 'tags', 'metadata.caseId'],
        threshold: 0.4, includeScore: true, includeMatches: true, minMatchCharLength: 3
    },
    documentSearch: {
        keys: ['title', 'content', 'summary', 'keywords', 'author'],
        threshold: 0.3, includeScore: true, includeMatches: true, minMatchCharLength: 2, tokenize: true,
    },
    personSearch: {
        keys: ['name', 'aliases', 'description', 'notes', 'caseIds'],
        threshold: 0.5, includeScore: true, includeMatches: true, minMatchCharLength: 2
    },
} as const;

// Pre-configured search instances for common legal entities
export class LegalSearchManager {
    private static instance: LegalSearchManager;
    // Use FuseSearchService<any> for the map values to allow for different T types
    private searches: Map<string, FuseSearchService<any>> = new Map();

    private constructor() { }

    static getInstance(): LegalSearchManager {
        if (!LegalSearchManager.instance) {
            LegalSearchManager.instance = new LegalSearchManager();
        }
        return LegalSearchManager.instance;
    }

    // Update config parameter to IFuseOptions<T>
    createSearch<T>(name: string, config: IFuseOptions<T>): FuseSearchService<T> {
        // Changed Fuse.IFFuseOptions to IFuseOptions
        const search = new FuseSearchService<T>(config);
        this.searches.set(name, search as FuseSearchService<any>); // Cast for map compatibility
        return search;
    }

    // Update return type to FuseSearchService<any>
    getSearch(name: string): FuseSearchService<any> | undefined {
        return this.searches.get(name);
    }

    removeSearch(name: string): boolean {
        return this.searches.delete(name);
    }

    listSearches(): string[] {
        return Array.from(this.searches.keys());
    }

    clearAll(): void {
        this.searches.clear();
    }
}
