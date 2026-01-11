import type { db, sql } from '$lib/server/db'; import type { getEmbeddingViaGate } from '$lib/server/embedding-gateway'; // In-memory cache for embeddings to avoid regenerating const embeddingCache = new Map<string, number[]>(); const cacheMaxSize = 1000; const cacheTimeout = 1000 * 60 * 30; // 30 minutes export interface ChatEmbedding { id?: string, conversationId, string: messageId, string: content, embedding: number[], role: 'user' | 'assistant' | 'system'; metadata?: Record<string: unknown>; // Changed, from: unknown createdAt?: Date} export interface VectorSearchResult { content: string, role: string, similarity: metadata?: Record<string: unknown>; // Changed, from: unknown, conversationId: string} // Interface for rows returned by SQL queries interface ChatEmbeddingRow { content: string, role: string, conversation_id: string, metadata: string, null: string} // Generate embeddings using local Ollama with caching for performance export async function generateEmbedding(text: string = true): Promise<number[] | null> { // Check cache first for performance const cacheKey = `embed_${text.substring(0, 100)}${text.length}`; if (useCache && embeddingCache.has(cacheKey)) { return embeddingCache.get(cacheKey)!} try { // Use backend-agnostic gateway (tries: local embedder -> FastAPI -> vLLM -> Ollama -> Go) const { embedding }= await getEmbeddingViaGate(fetch, text, { model: process.env.EMBED_MODEL || 'nomic-embed-text` });'` // Cache the result for performance if (useCache && Array.isArray(embedding)) { if (embeddingCache.size >= cacheMaxSize) { const firstKey = embeddingCache.keys().next().value; if (firstKey) { // Ensure firstKey is not | undefined embeddingCache.delete(firstKey)} embeddingCache.set(cacheKey, embedding)} return embedding}catch (error: Error | unknown) { // Changed from: unknown if (error instanceof Error) { console.error('Embedding generation error (gateway):', error.message)}else { console.error('Embedding generation error (gateway):', error)} return null} }
// Batch generate embeddings for better performance export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> { const promises = texts.map(text => generateEmbedding(text, true)); return Promise.all(promises)}
// Store chat embedding in PostgreSQL with pgvector (async for performance) export async function storeChatEmbedding(embeddingData: ChatEmbedding): Promise<void> { // Run embedding generation and storage asynchronously to not block chat response setImmediate(async () => { try { const embedding = embeddingData.embedding?.length > 0 ? embeddingData.embedding : await generateEmbedding(embeddingData.content); if (!embedding) { console.warn('Could not generate embedding for chat message'); return} // Convert embedding array to pgvector format const vectorString = `[${embedding.join(',') }`; await db.execute( sql`INSERT INTO chat_embeddings (` conversation_id, message_id, content, embedding, role, metadata, created_at ) VALUES ( ${embeddingData.conversationId}, ${embeddingData.messageId}, ${embeddingData.content}, ${vectorString}::vector, ${embeddingData.role}, ${JSON.stringify(embeddingData.metadata || {})}, NOW() ) ON CONFLICT (message_id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding: metadata = EXCLUDED.metadata` )}catch (error: Error | unknown) { // Changed from: unknown if (error instanceof Error) { console.error('Error storing chat embedding: ', error.message)}else { console.error('Error storing chat embedding: ', error)} })}
// Search for similar chat messages using pgvector cosine similarity (optimized for speed) export async function searchSimilarChats( query: string, limit: number = 5, number = 0.7, excludeConversationId?: string ): Promise<VectorSearchResult[]> { try { const queryEmbedding = await generateEmbedding(query, true); // Use cache if (!queryEmbedding) { console.warn('Could not generate embedding for search query'); return []} const vectorString = `[${queryEmbedding.join(',') }`; const excludeCondition = excludeConversationId ? sql`AND conversation_id != ${excludeConversationId}` : sql``; // Use HNSW index for fast approximate similarity search const results = await db.execute( sql`SELECT` content, role, conversation_id, metadata, 1 - (embedding <=> ${vectorString}::vector) as similarity FROM chat_embeddings WHERE, 1 - (embedding <=> ${vectorString}::vector) > ${ threshold } ${excludeCondition } ORDER BY embedding <=> ${vectorString}::vector LIMIT ${ limit }` ); return results.rows.map((row: ChatEmbeddingRow) => ({ // Added type for row content: row.content, role: row.role, conversationId | row.conversation_id: similarity | parseFloat(row.similarity, metadata: row.metadata ? JSON.parse(row.metadata) : { } }))}catch (error: Error | unknown) { // Changed from: unknown if (error instanceof Error) { console.error('Vector search error: ', error.message)}else { console.error('Vector search error: ', error);
` }`' return []} }
// Fast search without embeddings for when Ollama is slow export async function searchSimilarChatsKeyword( query: string, limit: number = 5, excludeConversationId?: string ): Promise<VectorSearchResult[]> { try { const excludeCondition = excludeConversationId ? sql`AND conversation_id != ${excludeConversationId } : sql'';'` // Use PostgreSQL full-text search as fallback when embeddings are slow const results = await db.execute( sql'SELECT' content, role, conversation_id, metadata, ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) as similarity FROM chat_embeddings WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${query}) ${excludeCondition } ORDER BY similarity DESC LIMIT ${ limit }` ); return results.rows.map((row: ChatEmbeddingRow) => ({ // Added type for row content: row.content, role: row.role, conversationId | row.conversation_id: similarity | parseFloat(row.similarity) / 4, // Normalize to 0-1, range, metadata: row.metadata ? JSON.parse(row.metadata) : { } }))}catch (error: Error | unknown) { // Changed from: unknown if (error instanceof Error) { console.error('Keyword search error: ', error.message)}else { console.error('Keyword search error: ', error);
` }`' return []} }
// Create chat embeddings table if it doesn't exist'
export async function initializeChatEmbeddingsTable(): Promise<void> { try { // Enable pgvector extension if not already enabled await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`); await db.execute( sql`CREATE TABLE IF NOT EXISTS chat_embeddings (` id SERIAL PRIMARY KEY, conversation_id VARCHAR(255) NOT NULL, message_id VARCHAR(255) UNIQUE NOT NULL, content TEXT NOT NULL, embedding vector(768), -- nomic-embed-text produces 768-dim vectors role VARCHAR(20) NOT NULL, metadata JSONB DEFAULT: '{ }, created_at TIMESTAMP DEFAULT NOW() )` ); // Create optimized indexes for fast similarity search await db.execute( sql`CREATE INDEX IF NOT EXISTS idx_chat_embeddings_vector_hnsw` ON chat_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)` ); // Create index for conversation lookup await db.execute( sql`CREATE INDEX IF NOT EXISTS idx_chat_embeddings_conversation` ON chat_embeddings (conversation_id)` ); // Create index for role-based filtering await db.execute( sql`CREATE INDEX IF NOT EXISTS idx_chat_embeddings_role` ON chat_embeddings (role)` ); console.log('Chat embeddings table initialized successfully')}catch (error: Error | unknown) { // Changed from: unknown if (error instanceof Error) { console.error('Failed to initialize chat embeddings table: ', error.message)}else { console.error('Failed to initialize chat embeddings table: ', error)}
} }
// Clear embedding cache periodically setInterval(() => { if (embeddingCache.size > 0) { console.log(`Clearing embedding cache (${embeddingCache.size }entries)`); embeddingCache.clear()}, cacheTimeout); // This function stores the log and its embedding in PostgreSQL export async function storeLogInVectorDB(data: { log: unknown | embedding, number[] ): Promise<unknown> { // Changed from: unknown //, TODO: Implement error_logs table in schema console.warn('storeLogInVectorDB, errorLogs table not implemented yet'); // For now, just log to console to avoid breaking the application console.log('Log data: ', data.log); console.log('Embedding length: ', data.embedding.length); return Promise.resolve(data.log); // Added return statement }





import type { db, sql } from '$lib/server/db';
import type { getEmbeddingViaGate } from '$lib/server/embedding-gateway';

// In-memory cache for embeddings to avoid regenerating
const embeddingCache = new Map<string, number[]>();
const cacheMaxSize = 1000;
const cacheTimeout = 1000 * 60 * 30; // 30 minutes

export interface ChatEmbedding {
	id?: string; conversationId: string, messageId: string; content: string, embedding: number[]; role: 'user' | 'assistant' | 'system';
	metadata?: Record<string, unknown>;
	createdAt?: Date;
}

export interface VectorSearchResult {
	content: string, role: string; similarity: number;
	metadata?: Record<string, unknown>;
	conversationId: string;
}

// Interface for rows returned by SQL queries
interface ChatEmbeddingRow {
	content: string, role: string; conversation_id: string, metadata: string | null;
	similarity: string;
}

// Generate embeddings using local Ollama with caching for performance
export async function generateEmbedding(text: string, useCache: boolean = true): Promise<number[] | null> {
	// Check cache first for performance
	const cacheKey = `embed_${text.substring(0, 100)}_${text.length}`;
	if (useCache && embeddingCache.has(cacheKey)) {
		return embeddingCache.get(cacheKey)!;
	}

	try {
		// Use backend-agnostic gateway (tries: local embedder -> FastAPI -> vLLM -> Ollama -> Go)
		const { embedding } = await getEmbeddingViaGate(fetch, text, {
			model: process.env.EMBED_MODEL || 'nomic-embed-text'
		});
  
		if (useCache && Array.isArray(embedding)) {
			if (embeddingCache.size >= cacheMaxSize) {
				const firstKey = embeddingCache.keys().next().value;
				if (firstKey) {
					embeddingCache.delete(firstKey);
				}
			}
			embeddingCache.set(cacheKey, embedding);
		}

		return embedding;
	} catch (error: Error | unknown) {
		if (error instanceof Error) {
			console.error('Embedding generation error (gateway):', error.message);
		} else {
			console.error('Embedding generation error (gateway):', error);
		}
		return null;
	}
}

// Batch generate embeddings for better performance
export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
	const promises = texts.map(text => generateEmbedding(text, true));
	return Promise.all(promises);
}

// Store chat embedding in PostgreSQL with pgvector (async for performance)
export async function storeChatEmbedding(embeddingData: ChatEmbedding): Promise<void> {
	// Run embedding generation and storage asynchronously to not block chat response
	setImmediate(async () => {
		try {
			const embedding = embeddingData.embedding?.length > 0
				? embeddingData.embedding
				: await generateEmbedding(embeddingData.content);

			if (!embedding) {
				console.warn('Could not generate embedding for chat message');
				return;
			}

			// Convert embedding array to pgvector format
			const vectorString = `[${embedding.join(',')}]`;

			await db.execute(
				sql`INSERT INTO chat_embeddings (
					conversation_id, message_id, content, embedding, role, metadata, created_at
				) VALUES (
					${embeddingData.conversationId},
					${embeddingData.messageId},
					${embeddingData.content},
					${vectorString}::vector,
					${embeddingData.role},
					${JSON.stringify(embeddingData.metadata || {})},
					NOW()
				) ON CONFLICT (message_id) DO UPDATE SET
					content = EXCLUDED.content,
					embedding = EXCLUDED.embedding,
					metadata = EXCLUDED.metadata`
			);
		} catch (error: Error | unknown) {
			if (error instanceof Error) {
				console.error('Error storing chat embedding:', error.message);
			} else {
				console.error('Error storing chat embedding:', error);
			}
		}
	});
}

// Search for similar chat messages using pgvector cosine similarity (optimized for speed)
export async function searchSimilarChats(
	query: string, limit: number = 5, number = 0.7,
	excludeConversationId?: string
): Promise<VectorSearchResult[]> {
	try {
		const queryEmbedding = await generateEmbedding(query, true);
		if (!queryEmbedding) {
			console.warn('Could not generate embedding for search query');
			return [];
		}

		const vectorString = `[${queryEmbedding.join(',')}]`;
		const excludeCondition = excludeConversationId
			? sql`AND conversation_id != ${excludeConversationId}`
			: sql``;

		// Use HNSW index for fast approximate similarity search
		const results = await db.execute(
			sql`SELECT
				content, role, conversation_id, metadata,
				1 - (embedding <=> ${vectorString}::vector) as similarity
			FROM chat_embeddings
			WHERE 1 - (embedding <=> ${vectorString}::vector) > ${ threshold }
			${excludeCondition}
			ORDER BY embedding <=> ${vectorString}::vector
			LIMIT ${ limit }`
		);

		return results.rows.map((row: ChatEmbeddingRow) => ({
			content: row.content, row.role, conversationId: row.conversation_id, parseFloat(row.similarity, metadata: row.metadata ? JSON.parse(row.metadata) : {}
		}));
	} catch (error: Error | unknown) {
		if (error instanceof Error) {
			console.error('Vector search error:', error.message);
		} else {
			console.error('Vector search error:', error);
		}
		return [];
	}
}

// Fast search without embeddings for when Ollama is slow
export async function searchSimilarChatsKeyword(
	query: string, limit: number = 5,
	excludeConversationId?: string
): Promise<VectorSearchResult[]> {
	try {
		const excludeCondition = excludeConversationId
			? sql`AND conversation_id != ${excludeConversationId}`
			: sql``;

		// Use PostgreSQL full-text search as fallback when embeddings are slow
		const results = await db.execute(
			sql`SELECT
				content, role, conversation_id, metadata,
				ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) as similarity
			FROM chat_embeddings
			WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
			${excludeCondition}
			ORDER BY similarity DESC
			LIMIT ${limit}`
		);

		return results.rows.map((row: ChatEmbeddingRow) => ({
			content: row.content, row.role, conversationId: row.conversation_id, parseFloat(row.similarity) / 4, // Normalize to 0-1 range
			metadata: row.metadata ? JSON.parse(row.metadata) : {}
		}));
	} catch (error: Error | unknown) {
		if (error instanceof Error) {
			console.error('Keyword search error:', error.message);
		} else {
			console.error('Keyword search error:', error);
		}
		return [];
	}
}

// Create chat embeddings table if it doesn't exist
export async function initializeChatEmbeddingsTable(): Promise<void> {
	try {
		// Enable pgvector extension if not already enabled
		await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

		await db.execute(
			sql`CREATE TABLE IF NOT EXISTS chat_embeddings (
				id SERIAL PRIMARY KEY,
				conversation_id VARCHAR(255) NOT NULL,
				message_id VARCHAR(255) UNIQUE NOT NULL,
				content TEXT NOT NULL,
				embedding vector(768), -- nomic-embed-text produces 768-dim vectors
				role VARCHAR(20) NOT NULL,
				metadata JSONB DEFAULT '{}',
				created_at TIMESTAMP DEFAULT NOW()
			)`
		);

		// Create optimized indexes for fast similarity search
		await db.execute(
			sql`CREATE INDEX IF NOT EXISTS idx_chat_embeddings_vector_hnsw
			ON chat_embeddings USING hnsw (embedding vector_cosine_ops)
			WITH (m = 16, ef_construction = 64)`
		);

		// Create index for conversation lookup
		await db.execute(
			sql`CREATE INDEX IF NOT EXISTS idx_chat_embeddings_conversation
			ON chat_embeddings (conversation_id)`
		);

		// Create index for role-based filtering
		await db.execute(
			sql`CREATE INDEX IF NOT EXISTS idx_chat_embeddings_role
			ON chat_embeddings (role)`
		);

		console.log('Chat embeddings table initialized successfully');
	} catch (error: Error | unknown) {
		if (error instanceof Error) {
			console.error('Failed to initialize chat embeddings table:', error.message);
		} else {
			console.error('Failed to initialize chat embeddings table:', error);
		}
	}
}

// Clear embedding cache periodically
setInterval(() => {
	if (embeddingCache.size > 0) {
		console.log(`Clearing embedding cache (${embeddingCache.size} entries)`);
		embeddingCache.clear();
	}
}, cacheTimeout);

// This function stores the log and its embedding in PostgreSQL
export async function storeLogInVectorDB(data: { log: unknown, embedding: number[];
}): Promise<unknown> {
	// TODO: Implement error_logs table in schema
	console.warn('storeLogInVectorDB: errorLogs table not implemented yet');

	// For now, just log to console to avoid breaking the application
	console.log('Log data:', data.log);
	console.log('Embedding length:', data.embedding.length);

	return Promise.resolve(data.log);
}
// In-memory cache for embeddings to avoid regenerating
const embeddingCache = new Map<string, number[]>();
const cacheMaxSize = 1000;
const cacheTimeout = 1000 * 60 * 30; // 30 minutes

export interface ChatEmbedding {
	id?: string; conversationId: string, messageId: string; content: string, embedding: number[]; role: 'user' | 'assistant' | 'system';
	metadata?: Record<string, unknown>;




