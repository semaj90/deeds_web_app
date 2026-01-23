export interface EmbeddingInsertInput {
	documentId?: string;
	content?: number[] | string;
	metadata?: unknown;
	model?: string;
	createdAt?: Date;
}

export function prepareEmbeddingInsert(input: EmbeddingInsertInput) {
	return {
		documentId: input.documentId,
		content: Array.isArray(input.content) ? JSON.stringify(input.content) : input.content,
        // If content is vector (number[]), we might want to store it as string for jsonb or similar
        // Adjust based on schema. Assuming flexible input handling.
		metadata: input.metadata ? JSON.stringify(input.metadata) : null,
		model: input.model ?? 'nomic-embed-text',
		createdAt: input.createdAt || new Date()
	};
}

export interface SearchSessionInsertInput {
	query: string;
	results?: any;
	searchType?: string;
	queryEmbedding?: number[];
	resultCount?: number;
}

export function prepareSearchSessionInsert(input: SearchSessionInsertInput) {
	return {
		query: input.query,
		results: input.results ? JSON.stringify(input.results) : null,
		searchType: input.searchType || 'hybrid',
		queryEmbedding: input.queryEmbedding ? JSON.stringify(input.queryEmbedding) : null,
		resultCount: input.resultCount ?? (Array.isArray(input.results) ? input.results.length : 0),
		createdAt: new Date()
	};
}
