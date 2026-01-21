/**
 * PostgreSQL pgvector utilities for vector operations
 * Provides vector similarity search and embedding operations
 */

import { db } from './index.js';

// Type definitions
type Row = Record<string, unknown>;

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

export interface PgVectorHealthResult {
	available: boolean;
	version?: string;
	functions: string[];
	error?: string;
}

// Helper functions
function asString(v: unknown): string {
	if (v === null || v === undefined) return '';
	return String(v);
}

function asNumber(v: unknown, fallback = 0): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

function escapeLiteral(val: any): string {
	if (val === null || val === undefined) return 'NULL';
	if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
	if (typeof val === 'number' && Number.isFinite(val)) return String(val);
	if (val instanceof Date) return `'${val.toISOString().replace(/'/g, "''")}'`;
	if (typeof val === 'object') {
		try {
			const s = JSON.stringify(val);
			return `'${s.replace(/'/g, "''")}'`;
		} catch {
			return `'${String(val).replace(/'/g, "''")}'`;
		}
	}
	return `'${String(val).replace(/'/g, "''")}'`;
}

function escapeJSON(obj: any): string {
	if (obj === undefined) return 'NULL';
	try {
		const json = JSON.stringify(obj ?? {});
		return `'${json.replace(/'/g, "''")}'`;
	} catch {
		return `'{}'`;
	}
}

/**
 * Convert JavaScript array to PostgreSQL vector format
 */
export function arrayToVector(embedding: number[]): string {
	if (!Array.isArray(embedding) || embedding.length === 0) {
		throw new Error('Invalid embedding: must be a non-empty array');
	}
	const validEmbedding = embedding.map((val) => (isFinite(val) ? val : 0));
	return `[${validEmbedding.join(',')}]`;
}

/**
 * Convert PostgreSQL vector string to JavaScript array
 */
export function vectorToArray(vectorString: string): number[] {
	if (!vectorString || typeof vectorString !== 'string') {
		return [];
	}
	try {
		const cleaned = vectorString.replace(/^\[|\]$/g, '');
		return cleaned.split(',').map((val) => parseFloat(val.trim()));
	} catch (error) {
		console.warn('Failed to parse vector string:', vectorString);
		return [];
	}
}

/**
 * Initialize pgvector extension and create helper functions
 */
export async function initializePgVector(): Promise<boolean> {
	try {
		// Enable pgvector extension
		await db.execute(`CREATE EXTENSION IF NOT EXISTS vector`);

		// Create cosine similarity function
		await db.execute(`
			CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
			RETURNS float AS $$
			SELECT 1 - (a <=> b);
			$$ LANGUAGE SQL IMMUTABLE STRICT
		`);

		console.log('✅ pgvector utilities initialized successfully');
		return true;
	} catch (error) {
		console.error('❌ Failed to initialize pgvector:', error);
		return false;
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

		const sql = `
			SELECT
				id, content,
				(1 - (embedding <=> '${vectorString}'::vector)) as similarity,
				metadata, created_at
			FROM chat_messages
			WHERE embedding IS NOT NULL
			AND (1 - (embedding <=> '${vectorString}'::vector)) > ${threshold}
			ORDER BY similarity DESC
			LIMIT ${limit}
		`;

		const results = (await db.execute(sql)) as Array<Row>;

		return (results || []).map((row) => ({
			id: asString(row.id),
			content: asString(row.content),
			similarity: asNumber(row.similarity),
			metadata: includeMetadata ? asObject(row.metadata) : undefined,
			documentType: 'chat_message'
		}));
	} catch (error) {
		console.error('Vector search for messages failed:', error);
		return [];
	}
}

/**
 * Search for similar evidence using vector similarity
 */
export async function searchSimilarEvidence(
	queryEmbedding: number[],
	caseId?: string,
	options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
	const { limit = 10, threshold = 0.7, includeMetadata = true } = options;

	try {
		const vectorString = arrayToVector(queryEmbedding);
		const caseFilter = caseId ? `AND case_id = ${escapeLiteral(caseId)}::uuid` : '';

		const sql = `
			SELECT
				id, title, description,
				GREATEST(
					COALESCE(1 - (title_embedding <=> '${vectorString}'::vector), 0),
					COALESCE(1 - (content_embedding <=> '${vectorString}'::vector), 0)
				) as similarity,
				case_id, evidence_type, ai_analysis
			FROM evidence
			WHERE (title_embedding IS NOT NULL OR content_embedding IS NOT NULL)
			${caseFilter}
			AND GREATEST(
				COALESCE(1 - (title_embedding <=> '${vectorString}'::vector), 0),
				COALESCE(1 - (content_embedding <=> '${vectorString}'::vector), 0)
			) > ${threshold}
			ORDER BY similarity DESC
			LIMIT ${limit}
		`;

		const results = (await db.execute(sql)) as Array<Row>;

		return (results || []).map((row) => ({
			id: asString(row.id),
			content: asString(row.description || row.title),
			similarity: asNumber(row.similarity),
			metadata: includeMetadata
				? {
						title: asString(row.title),
						evidenceType: asString(row.evidence_type),
						caseId: asString(row.case_id),
						...asObject(row.ai_analysis)
				  }
				: undefined,
			documentType: 'evidence'
		}));
	} catch (error) {
		console.error('Vector search for evidence failed:', error);
		return [];
	}
}

/**
 * Insert chat message with vector embedding
 */
export async function insertChatMessageWithEmbedding(messageData: {
	id: string;
	sessionId: string;
	role: string;
	content: string;
	embedding: number[];
	metadata?: Record<string, unknown>;
}): Promise<boolean> {
	try {
		const vectorString = arrayToVector(messageData.embedding);

		const sql = `
			INSERT INTO chat_messages (id, session_id, role, content, embedding, metadata)
			VALUES (
				${escapeLiteral(messageData.id)}::uuid,
				${escapeLiteral(messageData.sessionId)}::uuid,
				${escapeLiteral(messageData.role)},
				${escapeLiteral(messageData.content)},
				'${vectorString}'::vector,
				${escapeJSON(messageData.metadata)}::jsonb
			)
		`;

		await db.execute(sql);
		return true;
	} catch (error) {
		console.error('Failed to insert chat message embedding:', error);
		return false;
	}
}

/**
 * Update evidence with embeddings
 */
export async function updateEvidenceEmbeddings(
	evidenceId: string,
	titleEmbedding?: number[],
	contentEmbedding?: number[]
): Promise<boolean> {
	try {
		const updates: string[] = [];

		if (titleEmbedding && titleEmbedding.length > 0) {
			updates.push(`title_embedding = '${arrayToVector(titleEmbedding)}'::vector`);
		}
		if (contentEmbedding && contentEmbedding.length > 0) {
			updates.push(`content_embedding = '${arrayToVector(contentEmbedding)}'::vector`);
		}

		if (updates.length === 0) {
			return false;
		}

		const sql = `
			UPDATE evidence
			SET ${updates.join(', ')}
			WHERE id = ${escapeLiteral(evidenceId)}::uuid
		`;

		await db.execute(sql);
		return true;
	} catch (error) {
		console.error('Failed to update embeddings:', error);
		return false;
	}
}

/**
 * Search across multiple vector tables
 */
export async function searchAcrossAllVectors(
	queryEmbedding: number[],
	options: VectorSearchOptions & {
		includeMessages?: boolean;
		includeEvidence?: boolean;
		caseId?: string;
	} = {}
): Promise<VectorSearchResult[]> {
	const {
		limit = 20,
		threshold = 0.6,
		includeMetadata = true,
		includeMessages = true,
		includeEvidence = true,
		caseId
	} = options;

	const searchPromises: Promise<VectorSearchResult[]>[] = [];

	if (includeMessages) {
		searchPromises.push(
			searchSimilarMessages(queryEmbedding, { limit, threshold, includeMetadata })
		);
	}

	if (includeEvidence) {
		searchPromises.push(
			searchSimilarEvidence(queryEmbedding, caseId, { limit, threshold, includeMetadata })
		);
	}

	try {
		const results = await Promise.all(searchPromises);
		const combined = results.flat();
		return combined.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
	} catch (error) {
		console.error('Batch vector search failed:', error);
		return [];
	}
}

/**
 * Calculate cosine similarity between two vectors (client-side)
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
		const extensionCheck = (await db.execute(`
			SELECT EXISTS (
				SELECT 1 FROM pg_extension WHERE extname = 'vector'
			) as has_vector,
			(SELECT extversion FROM pg_extension WHERE extname = 'vector') as version
		`)) as Array<{ has_vector?: boolean; version?: string }>;

		const first = extensionCheck?.[0];
		if (!first?.has_vector) {
			return {
				available: false,
				functions: [],
				error: 'pgvector extension not installed'
			};
		}

		const functionsCheck = (await db.execute(`
			SELECT routine_name
			FROM information_schema.routines
			WHERE routine_schema = 'public'
			AND routine_name IN ('cosine_similarity', 'search_similar_messages', 'search_similar_evidence')
		`)) as Array<{ routine_name?: string }>;

		const availableFunctions = (functionsCheck || [])
			.map((row) => row?.routine_name ?? '')
			.filter(Boolean);

		return {
			available: true,
			version: first?.version ?? 'unknown',
			functions: availableFunctions
		};
	} catch (error) {
		return {
			available: false,
			functions: [],
			error: (error as Error).message ?? 'Unknown error'
		};
	}
}
