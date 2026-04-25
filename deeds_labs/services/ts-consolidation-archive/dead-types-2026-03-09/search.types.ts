/**
 * Search Types — shared between client and server search modules.
 */

export type SearchCategory = 'cases' | 'evidence' | 'citations' | 'statutes' | 'documents' | 'all';

export interface SearchFilter {
	category?: SearchCategory;
	dateFrom?: string;
	dateTo?: string;
	status?: string;
	tags?: string[];
}

export interface SearchOptions {
	query: string;
	filters?: SearchFilter;
	limit?: number;
	offset?: number;
	includeEmbeddings?: boolean;
}

export interface SearchResult {
	id: string;
	title: string;
	snippet: string;
	category: SearchCategory;
	score: number;
	url?: string;
	metadata?: Record<string, unknown>;
}

export type SearchState = 'idle' | 'loading' | 'success' | 'error';
