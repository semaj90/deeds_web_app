// src/lib/types/vector-meta.ts

export interface VectorMeta {
  id: string; // UUID or hash-based identifier
  content: string; // Original text content
  embedding: number[]; // 768-dim vector from embeddinggemma
  metadata: {
    source: 'codemod' | 'web_crawl' | 'documentation' | 'error_log';
    timestamp: string; // ISO 8601
    language: string; // 'typescript', 'javascript', 'svelte', etc.
    error_code?: string; // TS1005, etc.
    error_message?: string; // Full error message
    fix_applied?: string; // Description of the fix
    url?: string; // For web crawls
    file_path?: string; // Relative path for codemods
    line_number?: number; // For error location
    ast_features?: Record<string, any>; // Language extraction results
    tags: string[]; // ['async', 'import', 'type-error', etc.]
    confidence: number; // 0-1 similarity score
    version: string; // Schema version for migrations
  };
}

// Shared schema for pgvector and Qdrant
export const VECTOR_META_SCHEMA = {
  id: 'string',
  content: 'text',
  embedding: 'vector(768)', // pgvector syntax
  metadata: 'jsonb', // PostgreSQL jsonb
  // Qdrant equivalent would be payload fields
};

// Collection names
export const COLLECTIONS = {
  CODEMOD_MEMORIES: 'codemod_memories',
  WEB_DOCS: 'web_documentation',
  ERROR_LOGS: 'error_logs',
} as const;