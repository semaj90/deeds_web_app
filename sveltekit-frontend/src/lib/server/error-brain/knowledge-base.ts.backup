/**
 * Knowledge Base Learning System for Error-Brain
 *
 * Implements vector embeddings and semantic search to learn from:
 * - Previously fixed errors
 * - Applied patches (successful and failed)
 * - Code patterns and their outcomes
 * - Error clustering patterns
 *
 * Uses pgvector for storage and Ollama for embeddings.
 */

import { env } from '$lib/env';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';

// Types
export interface ErrorPattern {
	id: string;
	errorMessage: string;
	errorCode?: string;
	filePath: string;
	lineNumber?: number;
	embedding?: number[];
	fixCount: number;
	successRate: number;
	lastSeen: Date;
	metadata?: Record<string, unknown>;
}

export interface PatchKnowledge {
	id: string;
	patchContent: string;
	targetFile: string;
	errorFixed: string;
	embedding?: number[];
	applied: boolean;
	successful?: boolean;
	timestamp: Date;
	runId: string;
}

export interface KnowledgeSearchResult {
	pattern: ErrorPattern | PatchKnowledge;
	similarity: number;
	relevance: number;
}

export interface LearningContext {
	errorMessage: string;
	errorCode?: string;
	filePath: string;
	codeContext?: string;
}

// Knowledge Base Service
export class KnowledgeBase {
	private ollamaUrl: string;
	private embeddingModel: string;
	private initialized = false;

	constructor() {
		// Use process.env if $lib/env is missing or invalid
		this.ollamaUrl = env?.OLLAMA_URL ?? (process.env.OLLAMA_URL || 'http://localhost:11434');
		this.embeddingModel = 'nomic-embed-text:latest';
	}

	/**
	 * Initialize the knowledge base (create tables, indexes)
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Create error_patterns table with pgvector
			await db.execute(sql`
				CREATE TABLE IF NOT EXISTS error_patterns (
					id TEXT PRIMARY KEY,
					error_message TEXT NOT NULL,
					error_code TEXT,
					file_path TEXT NOT NULL,
					line_number INTEGER,
					embedding vector(768),
					fix_count INTEGER DEFAULT 0,
					success_rate REAL DEFAULT 0.0,
					last_seen TIMESTAMP DEFAULT NOW(),
					metadata JSONB
				)
			`);

			// Create patch_knowledge table
			await db.execute(sql`
				CREATE TABLE IF NOT EXISTS patch_knowledge (
					id TEXT PRIMARY KEY,
					patch_content TEXT NOT NULL,
					target_file TEXT NOT NULL,
					error_fixed TEXT NOT NULL,
					embedding vector(768),
					applied BOOLEAN DEFAULT false,
					successful BOOLEAN,
					timestamp TIMESTAMP DEFAULT NOW(),
					run_id TEXT NOT NULL,
					metadata JSONB
				)
			`);

			// Create vector indexes for fast similarity search
			await db.execute(sql`
				CREATE INDEX IF NOT EXISTS error_patterns_embedding_idx
				ON error_patterns USING ivfflat (embedding vector_cosine_ops)
				WITH (lists = 100)
			`);

			await db.execute(sql`
				CREATE INDEX IF NOT EXISTS patch_knowledge_embedding_idx
				ON patch_knowledge USING ivfflat (embedding vector_cosine_ops)
				WITH (lists = 100)
			`);

			this.initialized = true;
			console.log('✅ Knowledge base initialized');
		} catch (error) {
			console.error('❌ Failed to initialize knowledge base:', error);
			throw error;
		}
	}

	/**
	 * Generate embedding using Ollama
	 */
	private async generateEmbedding(text: string): Promise<number[]> {
		try {
			const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: this.embeddingModel,
					prompt: text
				})
			});

			if (!response.ok) {
				throw new Error(`Ollama embedding failed: ${response.status}`);
			}
			const data = await response.json();
			return data.embedding;
		} catch (error) {
			console.error('Failed to generate embedding:', error);
			throw error;
		}
	}

	/**
	 * Learn from a fixed error
	 */
	async learnFromFix(
		errorMessage: string,
		filePath: string,
		patch: string,
		success: boolean,
		runId: string,
		options?: {
			errorCode?: string;
			lineNumber?: number;
			metadata?: Record<string, unknown>;
		}
	): Promise<void> {
		await this.initialize();

		try {
			// Generate embeddings
			const errorEmbedding = await this.generateEmbedding(`Error: ${errorMessage} in ${filePath}`);
			const patchEmbedding = await this.generateEmbedding(`Patch: ${patch} for ${errorMessage}`);

			// Update or create error pattern
			const patternId = `${options?.errorCode ?? 'unknown'}-${filePath}`;

			// Use sql tag correctly for pg_vector formatting
			const errorVector = sql`'[${sql.raw(errorEmbedding.join(','))}]'::vector`;

			await db.execute(sql`
				INSERT INTO error_patterns (
					id, error_message, error_code, file_path, line_number,
					embedding, fix_count, success_rate, last_seen, metadata
				)
				VALUES (
					${patternId}, ${errorMessage}, ${options?.errorCode ?? null},
					${filePath}, ${options?.lineNumber ?? null}, ${errorVector},
					1, ${success ? 1.0 : 0.0}, NOW(), ${JSON.stringify(options?.metadata ?? {})}
				)
				ON CONFLICT (id) DO UPDATE SET
					fix_count = error_patterns.fix_count + 1,
					success_rate = (error_patterns.success_rate * error_patterns.fix_count + ${success ? 1.0 : 0.0}) / (error_patterns.fix_count + 1),
					last_seen = NOW(),
					metadata = ${JSON.stringify(options?.metadata ?? {})}
			`);

			// Store patch knowledge
			const patchId = `${runId}-${Date.now()}`;
			const patchVector = sql`'[${sql.raw(patchEmbedding.join(','))}]'::vector`;

			await db.execute(sql`
				INSERT INTO patch_knowledge (
					id, patch_content, target_file, error_fixed, embedding,
					applied, successful, timestamp, run_id
				)
				VALUES (
					${patchId}, ${patch}, ${filePath}, ${errorMessage},
					${patchVector},
					true, ${success}, NOW(), ${runId}
				)
			`);

			console.log(`📚 Learned from ${success ? 'successful' : 'failed'} fix: ${errorMessage}`);
		} catch (error) {
			console.error('Failed to learn from fix:', error);
			throw error;
		}
	}

	/**
	 * Search for similar error patterns
	 */
	async searchSimilarErrors(
		context: LearningContext,
		options?: {
			limit?: number;
			minSimilarity?: number;
			includeFailures?: boolean;
		}
	): Promise<KnowledgeSearchResult[]> {
		await this.initialize();

		const limit = options?.limit ?? 10;
		const minSimilarity = options?.minSimilarity ?? 0.7;

		try {
			// Generate query embedding
			const queryText = `Error: ${context.errorMessage} in ${context.filePath}`;
			const queryEmbedding = await this.generateEmbedding(queryText);
			const queryVector = sql`'[${sql.raw(queryEmbedding.join(','))}]'::vector`;

			// Search for similar patterns
			const results = await db.execute(sql`
				SELECT
					id, error_message, error_code, file_path, line_number,
					fix_count, success_rate, last_seen, metadata,
					1 - (embedding <=> ${queryVector}) as similarity
				FROM error_patterns
				WHERE
					1 - (embedding <=> ${queryVector}) > ${minSimilarity}
				ORDER BY similarity DESC
				LIMIT ${limit}
			`);

			return results.map((row: any) => ({
				pattern: {
					id: row.id,
					errorMessage: row.error_message,
					errorCode: row.error_code,
					filePath: row.file_path,
					lineNumber: row.line_number,
					fixCount: row.fix_count,
					successRate: row.success_rate,
					lastSeen: new Date(row.last_seen),
					metadata: row.metadata
				} as ErrorPattern,
				similarity: row.similarity,
				relevance: row.success_rate * row.similarity // Simple relevance score
			}));
		} catch (error) {
			console.error('Failed to search knowledge base:', error);
			return [];
		}
	}
}
