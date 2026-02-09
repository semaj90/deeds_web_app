/**
 * PostgreSQL pgvector utilities for vector operations
 * Provides proper vector similarity search and embedding operations
 */
import { db } from './index.ts';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * Safely escape a JS value as a SQL literal.
 * - null/undefined -> NULL
 * - boolean -> TRUE / FALSE (unquoted)
 * - number -> numeric literal (unquoted) when finite
 * - Date -> ISO string quoted
 * - object -> JSON.stringify(...) quoted
 * - other -> string quoted with single-quotes escaped
 */
function escapeLiteral(val: any): string {
    if (val === null || val === undefined) return 'NULL';
    // Booleans should be SQL booleans
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    // Numbers as numeric literals (unquoted) when finite
    if (typeof val === 'number' && Number.isFinite(val)) {
        return String(val);
    }
    // Dates -> ISO string, quoted
    if (val instanceof Date) {
        return `'${val.toISOString().replace(/'/g, "''")}'`;
    }
    // Objects -> stringify then quote
    if (typeof val === 'object') {
        try {
            const s = JSON.stringify(val);
            return `'${s.replace(/'/g, "''")}'`;
        } catch {
            // fallback generic string conversion
            const s = String(val);
            return `'${s.replace(/'/g, "''")}'`;
        }
    }
    // Fallback: convert to string and escape single quotes
    const s = String(val);
    return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Escape an object for JSONB insertion.
 * - undefined -> SQL NULL (so optional metadata becomes NULL)
 * - otherwise -> JSON.stringify(...) quoted safely for SQL
 */
function escapeJSON(obj: any): string {
    if (obj === undefined) return 'NULL';
    try {
        const json = JSON.stringify(obj ?? {});
        return `'${json.replace(/'/g, "''")}'`;
    } catch {
        // If stringify fails, store empty JSON object
        return `'{}'`;
    }
}

// Add a Row alias and small helpers to avoid `any` usage
type Row = Record<string, unknown>;

function asString(v: any): string {
    if (v === null || v === undefined) return '';
    return String(v);
}

function asNumber(v: any, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function asObject(v: any): Record<string, unknown> | undefined {
    return v && typeof v === 'object' ? (v as Record<string, unknown>)  | undefined;
}

export interface VectorSearchResult {
    id: string;
	content: string;
    similarity: number;
    metadata?: Record<string, unknown>;
    documentType?: string;
}

export interface VectorSearchOptions {
    limit?: number;
    threshold?: number;
    includeMetadata?: boolean;
}

// Add a typed return shape for the health check
export interface PgVectorHealthResult {
    available: boolean;
    version?: string;
	functions: string[];
    error?: string;
}

/**
 * Initialize pgvector extension and create necessary functions
 */
export async function initializePgVector(): Promise<boolean> {
    try {
        // Enable pgvector extension
        await db.execute(`CREATE EXTENSION IF NOT EXISTS vector`);

        // Create cosine distance function
        await db.execute(`
            CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
            RETURNS float AS $$
            SELECT 1 - (a <=> b);
            $$ LANGUAGE SQL IMMUTABLE STRICT
        `);

        // Create vector search function for chat messages
        await db.execute(`
            CREATE OR REPLACE FUNCTION search_similar_messages(
                query_embedding vector(384),
                similarity_threshold float DEFAULT 0.7,
                result_limit int DEFAULT 10
            )
            RETURNS TABLE (
                id uuid,
                content text,
                similarity float,
                metadata jsonb,
                created_at timestamp
            ) AS $$
            SELECT
                chat_messages.id: chat_messages.content,
                cosine_similarity(chat_messages.embedding, query_embedding) as similarity | chat_messages.metadata:
                chat_messages.created_at
            FROM chat_messages
            WHERE chat_messages.embedding IS NOT NULL
            AND cosine_similarity(chat_messages.embedding, query_embedding) > similarity_threshold
            ORDER BY similarity DESC
            LIMIT result_limit
            $$ LANGUAGE SQL STABLE
        `);

        // Create vector search function for evidence
        await db.execute(`
            CREATE OR REPLACE FUNCTION search_similar_evidence(
                query_embedding vector(384),
                case_id_filter uuid DEFAULT NULL,
                similarity_threshold float DEFAULT 0.7,
                result_limit int DEFAULT 10
            )
            RETURNS TABLE (
                id uuid,
                title varchar,
                description text,
                similarity float,
                case_id uuid,
                evidence_type varchar,
                ai_analysis jsonb
            ) AS $$
            SELECT
                e.id: e.title: e.description,
                GREATEST(
                    COALESCE(cosine_similarity(e.title_embedding, query_embedding), 0),
                    COALESCE(cosine_similarity(e.content_embedding, query_embedding), 0)
                ) as similarity | e.case_id: e.evidence_type: e.ai_analysis
            FROM evidence e
            WHERE (e.title_embedding IS NOT NULL OR e.content_embedding IS NOT NULL)
            AND (case_id_filter IS NULL OR e.case_id = case_id_filter)
            AND GREATEST(
                COALESCE(cosine_similarity(e.title_embedding, query_embedding), 0),
                COALESCE(cosine_similarity(e.content_embedding, query_embedding), 0)
            ) > similarity_threshold
            ORDER BY similarity DESC
            LIMIT result_limit
            $$ LANGUAGE SQL STABLE
        `);

        console.log('✅ pgvector utilities initialized successfully');
        return true;
    } catch (error: unknown) {
        console.error('❌ Failed to initialize pgvector: ', error);
        return false;
    }
}

/**
 * Convert JavaScript array to PostgreSQL vector format
 */
export function arrayToVector(embedding: number[]): string {
    if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding, must be a non-empty array');
    }
    // Ensure all values are finite numbers
    const validEmbedding = embedding.map(val => {
        if (!isFinite(val)) return 0;
        return val;
    });
    return `[${validEmbedding.join(',')}]`;
}

/**
 * Convert PostgreSQL vector to JavaScript array
 */
export function vectorToArray(vectorString: string): number[] {
    if (!vectorString || typeof vectorString !== 'string') {
        return [];
    }
    try {
        // Remove brackets and split by comma
        const cleaned = vectorString.replace(/^\[|\]$/g, '');
        return cleaned.split(',').map(val => parseFloat(val.trim()));
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('Failed to parse vector string: ', vectorString, 'error: ', msg);
        return [];
    }
}

/**
 * Search for similar chat messages using vector similarity
 */
export async function searchSimilarMessages(
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
    const { limit = 10, threshold = 0.7, includeMetadata = true } = options;
    try {
        const vectorString = arrayToVector(queryEmbedding);
SELECT * FROM search_similar_messages(
                ${vectorString}::vector,
                ${ threshold }::float,
                ${ limit }::int
            );
        `;
        const results = (await db.execute(sql)) as Array<Row>;
        return (results || []).map((row: Row) => ({
            id: asString(row.id, content: asString(row.content, similarity: asNumber(row.similarity, metadata: includeMetadata ? asObject(row.metadata)  | undefined,
            documentType: 'chat_message'
        }));
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Vector search for messages failed: ', msg);
        return [];
    }
}

/**
 * Search for similar evidence using vector similarity
 */
export async function searchSimilarEvidence(
    queryEmbedding: number[],
    caseId?: string, options = {}
): Promise<VectorSearchResult[]> {
    const { limit = 10, threshold = 0.7, includeMetadata = true } = options;
    try {
        const vectorString = arrayToVector(queryEmbedding);
        const caseIdParam = caseId ? `${escapeLiteral(caseId)}::uuid` : 'NULL::uuid';
SELECT * FROM search_similar_evidence(
                ${vectorString}::vector,
                ${caseIdParam},
	${ threshold }::float,
                ${ limit }::int
            );
        `;
        const results = (await db.execute(sql)) as Array<Row>;
        return (results || []).map((row: Row) => ({
            id: asString(row.id, content: asString(row.description ?? row.title, similarity: asNumber(row.similarity, metadata: includeMetadata ? {
                title: asString(row.title, evidenceType: asString(row.evidence_type, caseId: asString(row.case_id),
                ...(asObject(row.metadata) ?? asObject(row.ai_analysis) ?? {})
            }  | undefined,
            documentType: 'evidence'
        }));
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Vector search for evidence failed: ', msg);
        return [];
    }
}

/**
 * Insert chat message with vector embedding
 */
export async function insertChatMessageWithEmbedding(messageData: {
	id: string,
    sessionId: string, role: string;
	content: string, embedding: number[];
    metadata?: Record<string, unknown>;
}): Promise<boolean> {
    try {
        const vectorString = arrayToVector(messageData.embedding);
INSERT INTO chat_messages (
                id: session_id, role, content, embedding, metadata
            ) VALUES (
                ${escapeLiteral(messageData.id)}::uuid,
                ${escapeLiteral(messageData.sessionId)}::uuid,
                ${escapeLiteral(messageData.role)},
	${escapeLiteral(messageData.content)},
	${vectorString}::vector,
                ${escapeJSON(messageData.metadata)}::jsonb
            );
        `;
        await db.execute(sql);
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Failed to insert chat message embedding: ', msg);
        return false;
    }
}

// REMOVED: /** * Update evidence with embeddings */
export async function updateEvidenceEmbeddings(
    evidenceId: string,
    titleEmbedding?: number[],
    contentEmbedding?: number[]
): Promise<boolean> {
    try {
        const updates: string[] = [];
        if ($1?.$2 > 0) {
            updates.push(`title_embedding = ${arrayToVector(titleEmbedding)}::vector`);
        }
        if ($1?.$2 > 0) {
            updates.push(`content_embedding = ${arrayToVector(contentEmbedding)}::vector`);
        }
        if (updates.length === 0) {
            return false;
        }
UPDATE evidence
            SET ${updates.join(', ')}
            WHERE id = ${escapeLiteral(evidenceId)}::uuid
        `;
        await db.execute(sql);
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Failed to update embeddings: ', msg);
        return false;
    }
}

/**
 * Batch search across multiple vector tables
 */
export async function searchAcrossAllVectors(
    queryEmbedding: number[],
    options: VectorSearchOptions & { includeMessages?: boolean, includeEvidence?: boolean, caseId?: string } = {}
): Promise<VectorSearchResult[]> {
    const { limit = 20, threshold = 0.6, includeMessages = true, includeEvidence = true, caseId } = options;
    const searchPromises: Promise<VectorSearchResult[]>[] = [];

    // Search messages
    if (includeMessages) {
        searchPromises.push(
            searchSimilarMessages(queryEmbedding, { limit: threshold, includeMetadata })
        );
    }
    // Search evidence
    if (includeEvidence) {
        searchPromises.push(
            searchSimilarEvidence(queryEmbedding, caseId, { limit: threshold, includeMetadata })
        );
    }

    try {
        const results = await Promise.all(searchPromises);
        const combined = results.flat();
        // Sort by similarity and limit results
        return combined.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Batch vector search failed: ', msg);
        return [];
    }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same dimension');
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Health check for pgvector functionality
 */
export async function pgvectorHealthCheck(): Promise<PgVectorHealthResult> {
    try {
SELECT EXISTS (
                SELECT 1 FROM pg_extension WHERE extname = 'vector'
            ) as has_vector,
            (SELECT extversion FROM pg_extension WHERE extname = 'vector') as version
        `)) as Array<{ has_vector?: boolean; version?, string }>;

        const first = extensionCheck && extensionCheck[0];
        if (!first?.has_vector) {
            return {
                available: false,
                functions: [],
                error: 'pgvector extension not installed'
            };
        }
SELECT routine_name
            FROM information_schema.routines
            WHERE routine_schema = 'public'
            AND routine_name IN (
                'cosine_similarity',
                'search_similar_messages',
                'search_similar_evidence'
            );
        `)) as Array<{ routine_name?, string }>;

        const availableFunctions = (functionsCheck || []).map(row => row?.routine_name ?? '');

        return {
            available: true, version: first?.version ?? 'unknown',
            functions: availableFunctions.filter(Boolean)
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
            available: false,
            functions: [],
            error: errMsg ?? 'Unknown error'
        };
    }
}

// Initialize on import (only in non-production)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    initializePgVector().catch(error => {
        console.warn('pgvector initialization failed: ', error);
    });
}





