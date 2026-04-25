#!/usr/bin/env node
/**
 * Phase 89: Learning Pipeline Integration
 *
 * Combines:
 * - Adaptive chunking (preserves embeddings)
 * - Error pattern learning
 * - Knowledge base feedback loop
 * - Gemma3-legal contextual engineering
 */

import fs from 'fs/promises';
import pg from 'pg';
import { AdaptiveChunker, CONFIG, KnowledgeBaseUpdater, LearningPatternExtractor } from './phase89-adaptive-chunker.mjs';

const { Pool } = pg;

// ============================================================
// Database Connection
// ============================================================
const pgPool = new Pool({
	host: process.env.PGHOST || CONFIG.postgres.host,
	port: parseInt(process.env.PGPORT || CONFIG.postgres.port),
	database: process.env.PGDATABASE || CONFIG.postgres.database,
	user: process.env.PGUSER || CONFIG.postgres.user,
	password: process.env.PGPASSWORD || CONFIG.postgres.password
});

// ============================================================
// Embedding Cache Manager
// ============================================================
class EmbeddingCacheManager {
	constructor() {
		this.cache = new Map();
		this.hits = 0;
		this.misses = 0;
	}

	/**
	 * Load existing embeddings from PostgreSQL to avoid re-embedding
	 */
	async loadExistingEmbeddings() {
		console.log('📥 Loading existing embeddings from PostgreSQL...');

		const result = await pgPool.query(`
			SELECT
				content_hash,
				embedding,
				created_at,
				metadata
			FROM raw_error_embeddings
			WHERE embedding IS NOT NULL
			ORDER BY created_at DESC
		`);

		for (const row of result.rows) {
			this.cache.set(row.content_hash, {
				embedding: row.embedding,
				timestamp: row.created_at,
				metadata: row.metadata
			});
		}

		console.log(`   ✅ Loaded ${this.cache.size} existing embeddings\n`);
		return this.cache.size;
	}

	/**
	 * Check if embedding exists for content hash
	 */
	hasEmbedding(hash) {
		return this.cache.has(hash);
	}

	/**
	 * Get embedding by content hash
	 */
	getEmbedding(hash) {
		const cached = this.cache.get(hash);
		if (cached) {
			this.hits++;
			return cached.embedding;
		}
		this.misses++;
		return null;
	}

	/**
	 * Store new embedding
	 */
	async storeEmbedding(hash, embedding, metadata) {
		this.cache.set(hash, { embedding, timestamp: new Date(), metadata });

		// Persist to PostgreSQL
		await pgPool.query(`
			INSERT INTO raw_error_embeddings (content_hash, embedding, metadata, source, created_at)
			VALUES ($1, $2, $3, 'phase89_adaptive', NOW())
			ON CONFLICT (content_hash) DO UPDATE
			SET embedding = EXCLUDED.embedding,
			    metadata = EXCLUDED.metadata,
			    updated_at = NOW()
		`, [hash, JSON.stringify(embedding), JSON.stringify(metadata)]);
	}

	getStats() {
		return {
			totalCached: this.cache.size,
			hits: this.hits,
			misses: this.misses,
			hitRate: this.hits / Math.max(1, this.hits + this.misses)
		};
	}
}

// ============================================================
// Error Pattern Collector
// ============================================================
class ErrorPatternCollector {
	/**
	 * Collect error fixing patterns from git history
	 */
	async collectFromGitHistory(filePath) {
		// This would parse git diff to find fixes
		// For now, returns mock data structure
		return [];
	}

	/**
	 * Collect patterns from TypeScript error logs
	 */
	async collectFromErrorLogs() {
		console.log('📊 Collecting error patterns from logs...');

		const result = await pgPool.query(`
			SELECT
				error_code,
				error_message,
				file_path,
				line_number,
				count(*) as occurrences
			FROM raw_error_embeddings
			WHERE error_code IS NOT NULL
			GROUP BY error_code, error_message, file_path, line_number
			HAVING count(*) > 1
			ORDER BY count(*) DESC
			LIMIT 100
		`);

		console.log(`   Found ${result.rows.length} recurring error patterns\n`);
		return result.rows;
	}

	/**
	 * Match errors to successful fixes
	 */
	async findSuccessfulFixes(errorPattern) {
		// Query for errors that were later resolved
		const result = await pgPool.query(`
			SELECT
				e1.file_path,
				e1.error_code,
				e1.error_message,
				e1.metadata as before_metadata,
				e2.metadata as after_metadata
			FROM raw_error_embeddings e1
			LEFT JOIN raw_error_embeddings e2
				ON e1.file_path = e2.file_path
				AND e1.error_code = e2.error_code
				AND e2.created_at > e1.created_at
			WHERE e1.error_code = $1
			AND e2.embedding IS NOT NULL
			LIMIT 50
		`, [errorPattern.error_code]);

		return result.rows;
	}
}

// ============================================================
// Contextual Engineering with Gemma3-Legal
// ============================================================
class ContextualEngineer {
	/**
	 * Generate fix suggestions using gemma3-legal with learned patterns
	 */
	async generateFixSuggestion(error, similarPatterns, codeContext) {
		const prompt = this.buildContextualPrompt(error, similarPatterns, codeContext);

		console.log(`🤖 Generating fix with gemma3-legal...`);

		const response = await fetch(`${CONFIG.ollama.url}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.ollama.contextModel,
				prompt,
				stream: false,
				options: {
					temperature: 0.3, // Lower for more deterministic fixes
					top_p: 0.9,
					num_predict: 500
				}
			})
		});

		const data = await response.json();
		return this.parseFixSuggestion(data.response);
	}

	buildContextualPrompt(error, patterns, context) {
		let prompt = `You are a TypeScript error fixing expert. Fix the following error:\n\n`;
		prompt += `Error Code: ${error.error_code}\n`;
		prompt += `Error Message: ${error.error_message}\n`;
		prompt += `File: ${error.file_path}:${error.line_number}\n\n`;

		if (patterns.length > 0) {
			prompt += `Similar errors were previously fixed using these patterns:\n\n`;
			for (const pattern of patterns.slice(0, 3)) {
				prompt += `Pattern ${pattern.metadata.applications}x:\n`;
				prompt += `Before: ${pattern.fix.example.before}\n`;
				prompt += `After: ${pattern.fix.example.after}\n`;
				prompt += `Explanation: ${pattern.fix.example.explanation}\n\n`;
			}
		}

		prompt += `\nCode Context:\n\`\`\`typescript\n${context}\n\`\`\`\n\n`;
		prompt += `Provide ONLY the fixed code without explanations.\n`;

		return prompt;
	}

	parseFixSuggestion(response) {
		// Extract code from response
		const codeMatch = response.match(/```(?:typescript|ts)?\n([\s\S]+?)```/);
		return codeMatch ? codeMatch[1].trim() : response.trim();
	}
}

// ============================================================
// Main Learning Pipeline
// ============================================================
class LearningPipeline {
	constructor() {
		this.embedCache = new EmbeddingCacheManager();
		this.chunker = new AdaptiveChunker();
		this.learner = new LearningPatternExtractor();
		this.kbUpdater = new KnowledgeBaseUpdater();
		this.errorCollector = new ErrorPatternCollector();
		this.engineer = new ContextualEngineer();
	}

	async initialize() {
		console.log('🚀 Initializing Learning Pipeline\n');
		await this.embedCache.loadExistingEmbeddings();
	}

	/**
	 * Process file with adaptive chunking + embedding cache
	 */
	async processFile(filePath, content) {
		console.log(`📁 Processing: ${filePath}`);

		// Create adaptive chunks
		const chunks = await this.chunker.createAdaptiveChunks(filePath, content);
		console.log(`   Created ${chunks.length} adaptive chunks`);

		const results = {
			total: chunks.length,
			cached: 0,
			newEmbeddings: 0,
			stored: 0
		};

		for (const chunk of chunks) {
			// Check cache first
			let embedding = this.embedCache.getEmbedding(chunk.hash);

			if (embedding) {
				results.cached++;
				console.log(`   ✓ Chunk ${chunk.index}: Using cached embedding`);
			} else {
				// Generate new embedding
				try {
					embedding = await this.generateEmbedding(chunk.content);
					await this.embedCache.storeEmbedding(chunk.hash, embedding, chunk.metadata);
					results.newEmbeddings++;
					console.log(`   → Chunk ${chunk.index}: Generated new embedding`);
				} catch (error) {
					console.log(`   ✗ Chunk ${chunk.index}: ${error.message}`);
					continue;
				}
			}

			// Store in Qdrant
			const stored = await this.storeInQdrant(chunk, embedding);
			if (stored) results.stored++;
		}

		const stats = this.embedCache.getStats();
		console.log(`\n   📊 Stats: ${results.cached} cached, ${results.newEmbeddings} new, ${results.stored} stored`);
		console.log(`   💾 Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%\n`);

		return results;
	}

	/**
	 * Run the complete agentic learning loop
	 */
	async runAgenticLearning() {
		console.log('🤖 Starting Agentic Learning Loop\n');

		// 1. Collect recurring error patterns
		const patterns = await this.errorCollector.collectFromErrorLogs();

		for (const pattern of patterns) {
			console.log(`\n🔍 Analyzing pattern: ${pattern.error_code} (${pattern.occurrences} occurrences)`);

			// 2. Find successful fixes for this pattern
			const fixes = await this.errorCollector.findSuccessfulFixes(pattern);

			if (fixes.length > 0) {
				console.log(`   ✅ Found ${fixes.length} successful fixes to learn from`);

				// 3. Extract learning patterns
				const learnedPatterns = [];
				for (const fix of fixes) {
					const learned = await this.learner.extractPattern({
						errorCode: fix.error_code,
						errorMessage: fix.error_message,
						filePath: fix.file_path,
						originalCode: fix.before_metadata?.raw_text || '',
						fixedCode: fix.after_metadata?.raw_text || '',
						success: true
					});
					if (learned) learnedPatterns.push(learned);
				}

				// 4. Generate KB document
				if (learnedPatterns.length > 0) {
					const kbDoc = await this.kbUpdater.createKBDocument(learnedPatterns, pattern.error_code);
					console.log(`   📖 Generated KB document for ${pattern.error_code}`);

					// 5. Update Knowledge Base (RAG + KAG)
					const kbPath = `kb/phase89/learned-patterns-${pattern.error_code}.md`;
					await fs.mkdir('kb/phase89', { recursive: true });
					await fs.writeFile(kbPath, kbDoc.content);

					// Also update Qdrant learning collection
					const embedding = await this.generateEmbedding(kbDoc.content);
					await this.kbUpdater.updateQdrantKB(kbDoc, embedding);

					console.log(`   ✅ Knowledge Base updated: ${kbPath}`);
				}
			} else {
				console.log(`   ℹ️ No successful fixes found yet for this pattern. Generating proactive fix suggestion...`);

				// Proactive fix generation using gemma3-legal
				const sampleError = {
					error_code: pattern.error_code,
					error_message: pattern.error_message,
					file_path: pattern.file_path,
					line_number: pattern.line_number
				};

				const content = await fs.readFile(pattern.file_path, 'utf-8');
				const suggestion = await this.engineer.generateFixSuggestion(sampleError, [], content);

				console.log(`   💡 Proactive suggestion generated for ${pattern.error_code}`);
			}
		}

		console.log('\n✅ Agentic Learning Loop Complete\n');
	}

	async generateEmbedding(text) {
		const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
			method: 'POST',
			body: JSON.stringify({ model: CONFIG.ollama.embeddingModel, prompt: text })
		});
		const data = await response.json();
		return data.embedding;
	}

	async storeInQdrant(chunk, embedding) {
		// Implementation for Qdrant storage
		return true;
	}

	/**
	 * Learn from error patterns and update KB
	 */
	async learnAndUpdateKB() {
		console.log('📚 Starting learning phase...\n');

		// Collect recurring error patterns
		const patterns = await this.errorCollector.collectFromErrorLogs();

		const learnedPatterns = [];

		for (const errorPattern of patterns.slice(0, 10)) {
			console.log(`   Analyzing: ${errorPattern.error_code} (${errorPattern.occurrences}x)`);

			// Find successful fixes
			const fixes = await this.errorCollector.findSuccessfulFixes(errorPattern);

			for (const fix of fixes) {
				const pattern = await this.learner.extractPattern({
					errorCode: fix.error_code,
					errorMessage: fix.error_message,
					filePath: fix.file_path,
					lineNumber: 0,
					originalCode: fix.before_metadata?.code || '',
					fixedCode: fix.after_metadata?.code || '',
					context: '',
					success: true
				});

				if (pattern) {
					learnedPatterns.push(pattern);
				}
			}
		}

		console.log(`\n   ✅ Learned ${learnedPatterns.length} patterns\n`);

		// Group by error code and generate KB documents
		const grouped = this.groupByErrorCode(learnedPatterns);

		for (const [errorCode, patterns] of Object.entries(grouped)) {
			const kbDoc = await this.kbUpdater.createKBDocument(patterns, errorCode);

			// Save to file
			const kbPath = `kb/phase89/learned-patterns-${errorCode}.md`;
			await fs.mkdir('kb/phase89', { recursive: true });
			await fs.writeFile(kbPath, kbDoc.content);
			console.log(`   📖 Saved: ${kbPath}`);

			// Embed and store in Qdrant learning collection
			const embedding = await this.generateEmbedding(kbDoc.content);
			await this.kbUpdater.updateQdrantKB(kbDoc, embedding);
		}

		return grouped;
	}

	groupByErrorCode(patterns) {
		const groups = {};
		for (const pattern of patterns) {
			if (!groups[pattern.errorCode]) {
				groups[pattern.errorCode] = [];
			}
			groups[pattern.errorCode].push(pattern);
		}
		return groups;
	}
}

// ============================================================
// CLI Interface
// ============================================================
async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	const pipeline = new LearningPipeline();
	await pipeline.initialize();

	switch (command) {
		case '--process-file': {
			const filePath = args[1];
			if (!filePath) {
				console.error('Usage: --process-file <path>');
				process.exit(1);
			}
			const content = await fs.readFile(filePath, 'utf-8');
			await pipeline.processFile(filePath, content);
			break;
		}

		case '--learn': {
			await pipeline.runAgenticLearning();
			break;
		}

		case '--full-pipeline': {
			console.log('🔄 Running full learning pipeline\n');

			// 1. Learn from errors
			await pipeline.runAgenticLearning();

			// 2. Show cache stats
			const stats = pipeline.embedCache.getStats();
			console.log('📊 Final Cache Stats:');
			console.log(`   Total embeddings: ${stats.totalCached}`);
			console.log(`   Cache hits: ${stats.hits}`);
			console.log(`   Cache misses: ${stats.misses}`);
			console.log(`   Hit rate: ${(stats.hitRate * 100).toFixed(1)}%\n`);

			break;
		}

		default:
			console.log('Usage:');
			console.log('  --process-file <path>  Process single file with adaptive chunking');
			console.log('  --learn                Learn from error patterns and update KB');
			console.log('  --full-pipeline        Run complete learning pipeline');
	}

	await pgPool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}

export { ContextualEngineer, EmbeddingCacheManager, ErrorPatternCollector, LearningPipeline };

