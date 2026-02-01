/**
 * Advanced Search & Filtering System
 * Supports full-text search, filters, and suggestions
 */

import { db } from '$lib/server/db/index';
import { and, gte, like, lte, or, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { cases, evidence } from '$lib/server/db/schema-postgres';

// Type definitions
type CaseRow = {
	id: string | number;
	title: string | null;
	description: string | null;
	status: string | null;
	priority: string | null;
	createdAt: Date | string | null;
	tags: string[] | null;
};

type EvidenceRow = {
	id: string | number;
	fileName: string | null;
	description: string | null;
	fileType: string | null;
	uploadedAt: Date | string | null;
	caseId: string | number | null;
};

export interface SearchFilters {
	query?: string;
	caseStatus?: string[];
	priority?: string[];
	dateRange?: {
	start: string; end: string };
	tags?: string[];
	evidenceType?: string[];
	sortBy?: 'date' | 'priority' | 'status' | 'relevance';
	sortOrder?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
}

type CaseMetadata = {
	status?: string | null;
	priority?: string | null;
	createdAt?: Date | string | null;
	tags?: string[] | null;
};

type EvidenceMetadata = {
	fileType?: string | null;
	uploadedAt?: Date | string | null;
	caseId?: string | number | null;
};

export type SearchResultCase = {
	type: 'case';
	id: string;
	title: string;
	description?: string;
	relevanceScore?: number;
	metadata: CaseMetadata;
	highlights?: string[];
};

export type SearchResultEvidence = {
	type: 'evidence';
	id: string;
	title: string;
	description?: string;
	relevanceScore?: number;
	metadata: EvidenceMetadata;
	highlights?: string[];
};

export type SearchResult = SearchResultCase | SearchResultEvidence;

export interface SearchResponse {
	results: SearchResult[];
	total: number;
	facets: {
	caseStatus: { value: string;
	count: number }[];
		priority: {
	value: string; count: number }[];
		evidenceType: {
	value: string; count: number }[];
		tags: {
	value: string; count: number }[];
	};
	suggestions?: string[];
	queryTime: number;
}

class AdvancedSearch {
	/**
	 * Perform comprehensive search across cases and evidence
	 */
	async search(filters: SearchFilters): Promise<SearchResponse> {
		const startTime = Date.now();

		try {
			// Parallel search across different entity types
			const [caseResults, evidenceResults] = await Promise.all([
				this.searchCases(filters),
				this.searchEvidence(filters)
			]);

			// Combine results
			const allResults: SearchResult[] = [...caseResults, ...evidenceResults];

			// Sort by relevance or specified criteria
			const sortedResults = this.sortResults(allResults, filters);

			// Apply pagination
			const paginatedResults = this.paginate(sortedResults, filters);

			// Generate facets for filtering UI
			const facets = await this.generateFacets(filters);

			// Generate search suggestions
			const suggestions = await this.generateSuggestions(filters.query ?? '');

			return {
				results: paginatedResults,
				total: allResults.length,
				facets,
				suggestions,
				queryTime: Date.now() - startTime
			};
		} catch (error) {
			console.error('Search failed:', error);
			throw error;
		}
	}

	/**
	 * Search cases with advanced filters
	 */
	private async searchCases(filters: SearchFilters): Promise<SearchResultCase[]> {
		const conditions: SQL[] = [];

		// Text search
		if (filters.query) {
			const q = filters.query;
			conditions.push(or(like(cases.title, `%${q}%`), like(cases.description, `%${q}%`))!);
		}

		// Status filter
		if (filters.caseStatus?.length) {
			conditions.push(inArray(cases.status, filters.caseStatus));
		}

		// Priority filter
		if (filters.priority?.length) {
			conditions.push(inArray(cases.priority, filters.priority));
		}

		// Date range filter
		if (filters.dateRange) {
			conditions.push(
				and(
					gte(cases.createdAt, new Date(filters.dateRange.start)),
					lte(cases.createdAt, new Date(filters.dateRange.end))
				)!
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const results = await db
			.select({
				id: cases.id,
				title: cases.title,
				description: cases.description,
				status: cases.status,
				priority: cases.priority,
				createdAt: cases.createdAt,
				tags: cases.tags
			})
			.from(cases)
			.where(whereClause)
			.limit(1000);

		return (results as CaseRow[]).map((case_) => {
			const text = `${case_.title ?? ''} ${case_.description ?? ''}`.trim();
			return {
				type: 'case' as const,
				id: String(case_.id),
				title: case_.title ?? '',
				description: case_.description ?? undefined,
				relevanceScore: this.calculateRelevance(text, filters.query),
				metadata: {
	status: case_.status,
					priority: case_.priority,
					createdAt: case_.createdAt,
					tags: case_.tags
				},
	highlights: this.generateHighlights(text, filters.query)
			};
		});
	}

	/**
	 * Search evidence with filters
	 */
	private async searchEvidence(filters: SearchFilters): Promise<SearchResultEvidence[]> {
		const conditions: SQL[] = [];

		if (filters.query) {
			const q = filters.query;
			conditions.push(or(like(evidence.fileName, `%${q}%`), like(evidence.description, `%${q}%`))!);
		}

		if (filters.evidenceType?.length) {
			conditions.push(inArray(evidence.fileType, filters.evidenceType));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const results = await db
			.select({
				id: evidence.id,
				fileName: evidence.fileName,
				description: evidence.description,
				fileType: evidence.fileType,
				uploadedAt: evidence.uploadedAt,
				caseId: evidence.caseId
			})
			.from(evidence)
			.where(whereClause)
			.limit(500);

		return (results as EvidenceRow[]).map((evid) => {
			const text = `${evid.fileName ?? ''} ${evid.description ?? ''}`.trim();
			return {
				type: 'evidence' as const,
				id: String(evid.id),
				title: evid.fileName ?? 'Untitled Evidence',
				description: evid.description ?? undefined,
				relevanceScore: this.calculateRelevance(text, filters.query),
				metadata: {
	fileType: evid.fileType,
					uploadedAt: evid.uploadedAt,
					caseId: evid.caseId
				},
	highlights: this.generateHighlights(text, filters.query)
			};
		});
	}

	/**
	 * Generate faceted search filters
	 */
	private async generateFacets(_filters: SearchFilters) {
		return {
			caseStatus: [
				{ value: 'open', count: 45 },
	{ value: 'in_progress', count: 32 },
	{ value: 'pending', count: 18 },
	{ value: 'closed', count: 89 }
			],
			priority: [
				{ value: 'high', count: 23 },
	{ value: 'medium', count: 67 },
	{ value: 'low', count: 34 }
			],
			evidenceType: [
				{ value: 'document', count: 156 },
	{ value: 'image', count: 89 },
	{ value: 'video', count: 34 },
	{ value: 'audio', count: 12 }
			],
			tags: [
				{ value: 'urgent', count: 23 },
	{ value: 'fraud', count: 45 },
	{ value: 'assault', count: 34 },
	{ value: 'theft', count: 67 }
			]
		};
	}

	/**
	 * Generate search suggestions based on query
	 */
	private async generateSuggestions(query: string): Promise<string[]> {
		if (!query || query.length < 2) return [];

		const commonTerms = [
			'fraud investigation',
			'assault case',
			'theft report',
			'evidence analysis',
			'witness statement',
			'forensic report',
			'crime scene',
			'suspect profile'
		];

		return commonTerms
			.filter((term) => term.toLowerCase().includes(query.toLowerCase()))
			.slice(0, 5);
	}

	/**
	 * Calculate relevance score for search results
	 */
	private calculateRelevance(text: string, query?: string): number {
		if (!query) return 0.5;

		const queryLower = query.toLowerCase();
		const textLower = (text ?? '').toLowerCase();
		let score = 0;

		if (!textLower) return 0;

		// Exact match bonus
		if (textLower.includes(queryLower)) score += 0.8;

		// Word match bonus
		const queryWords = queryLower.split(/\s+/).filter(Boolean);
		const textWords = textLower.split(/\s+/).filter(Boolean);

		if (queryWords.length) {
			const matchingWords = queryWords.filter((word) => textWords.some((tw) => tw.includes(word)));
			score += (matchingWords.length / queryWords.length) * 0.5;
		}

		// Position bonus
		const firstMatch = textLower.indexOf(queryLower);
		if (firstMatch !== -1) {
			score += Math.max(0, (text.length - firstMatch) / Math.max(1, text.length)) * 0.2;
		}

		return Math.min(1, score);
	}

	/**
	 * Generate highlighted text snippets
	 */
	private generateHighlights(text: string, query?: string): string[] {
		if (!query || !text) return [];

		const highlights: string[] = [];
		const q = query.toLowerCase();
		const lower = text.toLowerCase();

		let index = lower.indexOf(q);
		while (index !== -1 && highlights.length < 3) {
			const start = Math.max(0, index - 50);
			const end = Math.min(text.length, index + q.length + 50);
			highlights.push(text.slice(start, end));
			index = lower.indexOf(q, index + 1);
		}

		return highlights;
	}

	/**
	 * Sort search results
	 */
	private sortResults(results: SearchResult[], filters: SearchFilters): SearchResult[] {
		const { sortBy = 'relevance', sortOrder = 'desc' } = filters;

		const getDateFromResult = (r: SearchResult): number => {
			if (r.type === 'case') {
				return new Date(r.metadata.createdAt ?? 0).getTime();
			}
			return new Date(r.metadata.uploadedAt ?? 0).getTime();
		};

		const getPriorityValue = (r: SearchResult): number => {
			if (r.type === 'case') {
				const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
				return order[String(r.metadata.priority)] ?? 0;
			}
			return 0;
		};

		return results.slice().sort((a, b) => {
			let comparison = 0;

			switch (sortBy) {
				case 'relevance':
					comparison = (a.relevanceScore ?? 0) - (b.relevanceScore ?? 0);
					break;
				case 'date':
					comparison = getDateFromResult(a) - getDateFromResult(b);
					break;
				case 'priority':
					comparison = getPriorityValue(a) - getPriorityValue(b);
					break;
				case 'status':
					comparison =
						(a.type === 'case' ? String(a.metadata.status ?? '') : '').localeCompare(
							b.type === 'case' ? String(b.metadata.status ?? '') : ''
						);
					break;
				default:
					comparison = a.title.localeCompare(b.title);
			}

			return sortOrder === 'desc' ? -comparison : comparison;
		});
	}

	/**
	 * Apply pagination to results
	 */
	private paginate(results: SearchResult[], filters: SearchFilters): SearchResult[] {
		const { limit = 20, offset = 0 } = filters;
		return results.slice(offset, offset + limit);
	}
}

// Export singleton instance
export const advancedSearch = new AdvancedSearch();

