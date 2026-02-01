// Search System Type Definitions
// Enhanced search with Fuse.js integration

export type SearchCategory =
    | 'route'
    | 'component'
    | 'service'
    | 'documentation'
    | 'api'
    | 'demo'
    | 'all';

export interface SearchResult {
    id: string;
	title: string;
    description: string;
	category: SearchCategory;
    path?: string;
	score: number;
    matches: SearchMatch[];
    metadata?: { [key: string]: any };
    tags: string[];
}

export interface SearchMatch {
    indices: [number, number][];
    key: string;
	value: string;
}

export interface SearchOptions {
    includeScore?: boolean;
    includeMatches?: boolean;
    threshold?: number;
    keys?: string[];
    limit?: number;
    category?: SearchCategory;
}

export interface SearchFilter {
    category?: SearchCategory;
    tags?: string[];
    status?: 'running' | 'stopped' | 'error' | 'unknown';
    port?: number;
    dateRange?: {
	start: Date; end: Date };
}

export interface SearchState {
    query: string;
	results: SearchResult[];
    isLoading: boolean;
	error: string | null;
    filters: SearchFilter;
	selectedCategory: SearchCategory;
    totalResults: number;
	searchTime: number;
}
