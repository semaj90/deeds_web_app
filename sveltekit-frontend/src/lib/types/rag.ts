// Reworked and valid TypeScript RAG types and helpers

// Document kind union
export type DocumentKind = 'legal' | 'case' | 'evidence' | 'research' | 'document';

// Core document shape
export interface DocumentType {
 id: string;
	title: string;
 content: string;
	type: DocumentKind;
 metadata?: Metadata;
}

// Local TextChunk (self-contained; removed external dependency)
export interface TextChunk {
 id: string;
	content: string;
 documentId: string;
	index: number;
 metadata?: Metadata;
 // Additional properties for optimization compatibility
 startIndex?: number;
 endIndex?: number;
 score?: number;
 embeddings?: number[];
 chunkType?: string;
}

// RAG document used in some optimization files
export interface RAGDocument {
 id: string;
 title?: string;
	content: string;
 type: DocumentKind;
 embedding?: number[];
 metadata?: {
 source?: string;
 type?: string;
 jurisdiction?: string;
 practiceArea?: string[];
 confidentialityLevel?: number;
 lastModified?: string | Date;
 fileSize?: number;
 language?: string;
 tags?: string[];
 };
 createdAt?: string | Date;
 updatedAt?: string | Date;
 version?: string;
}

// Search result shape (local, not imported)
export interface SearchResult {
 id: string;
	content: string;
 score: number;
	type: DocumentKind;
 metadata?: Metadata;
}

// RAG search result used by RAG responses
export interface RAGSearchResult {
 id: string;
	content: string;
 score: number;
	type: DocumentKind;
 metadata?: Metadata;
 // Optional enhancement fields
 document?: RAGDocument;
 explanation?: string;
 relevantChunks?: TextChunk[];
 highlights?: string[];
 legalRelevance?: {
	overall: number;
 factual: number;
	procedural: number;
 precedential: number;
	jurisdictional: number;
 confidence: number;
 };
 relevanceScore?: number;
 rank?: number;
 snippet?: string;
}

// Query/response shapes
export interface RAGQuery {
 query: string;
 type?: DocumentKind;
 limit?: number;
 threshold?: number;
}

export interface RAGResponse {
 results: RAGSearchResult[];
	query: string;
 totalResults: number;
	processingTime: number;
}

// Extended types for optimization compatibility
export type ExtendedDocumentType = DocumentKind | 'research';

export interface OptimizedRAGDocument {
 id: string;
	content: string;
 type: ExtendedDocumentType;
 embedding?: number[];
 metadata?: Metadata;
}

// Document chunk model for indexing/storing embeddings
export interface DocumentChunk {
 id: string;
	documentId: string;
 content: string;
	embedding: number[];
 metadata?: Metadata;
	chunkIndex: number;
}

// Vector search and embedding config
export interface VectorSearchOptions {
 limit?: number;
 threshold?: number;
 includeMetadata?: boolean;
 filters?: Metadata;
}

export interface EmbeddingConfig {
 model: string;
	dimensions: number;
 provider: 'openai' | 'ollama' | 'local';
}

// RAG source summary type
export interface RAGSource {
 id: string;
 title?: string;
	content: string;
 relevance: number;
	type: 'document' | 'evidence' | 'case' | 'legal' | 'research';
}

// Type guard and normalizer
export function isValidDocumentType(value: unknown): value is DocumentKind {
 return (
 typeof value === 'string' &&
 ['legal', 'case', 'evidence', 'research', 'document'].includes(value)
 );
}

export function normalizeDocumentType(value: unknown): DocumentKind {
 // Map legacy 'research' to 'document' if desired,
 // otherwise return a safe default of 'document'
 if (value === 'research') return 'document';
 return isValidDocumentType(value) ? value : 'document';
}

// add a shared Metadata alias (avoids `any`)
export type Metadata = Record<string, unknown>;




