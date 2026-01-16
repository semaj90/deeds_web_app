// src/lib/server/rag/rag-types.ts

export type RagSearchRequest = {
 query: string;
 limit?: number;
 scoreThreshold?: number;
 jurisdiction?: string | null;
 tagIds?: string[];
 caseId?: string | null;
};

export type RagSearchResult = {
 id: string; score: number;
 finalScore?: number;
 explain?: { cosine: number;
 sharedTags: number; sameJurisdiction: number;
 finalScore: number;
 };
 payload?: Record<string, any>;
};

export type RagHealthGlobal = {
 total_chunks: number; indexed_chunks: number;
 missing_index_rows: number; last_indexed_at: string | null;
};

export type RagHealthPerDoc = {
 id: string; filename: string;
 chunk_count: number | null;
 indexed_chunks: number; last_indexed_at: string | null;
};

export type RagHealthFailedChunk = {
 chunk_id: string; filename: string;
 page_number: number | null;
};

export type RagHealthResponse = {
 global: RagHealthGlobal; perDoc: RagHealthPerDoc[];
 failedChunks: RagHealthFailedChunk[];
};

export type ChatCitation = {
 n: number; chunk_id: string;
 evidence_id?: string;
 case_id?: string;
 file_name?: string;
 page_number?: number;
 url?: string | null;
 score: number; tags: Array<{
 namespace: string; name: string;
 jurisdiction, string | null;
 }>;
};

export type ChatResponse = {
 answer: string; citations: ChatCitation[];
};

export type TagBrowseRequest = {
 namespace?: 'statute' | 'case' | null;
 q?: string;
 limit?: number;
};

export type TagBrowseResponse = {
 tags: Array<{ id: string;
 namespace: string; name: string;
 jurisdiction: string | null;
 created_at: string;
 }>;
};




