#!/usr/bin/env node
/**
 * Phase 89: ACE RAG+KAG Analyzer
 *
 * Features:
 * - ACE (Adaptive Contextual Engineering) prompting
 * - Cosine similarity ranking for knowledge retrieval
 * - File timeline tracking (indexed/tagged/edited timestamps)
 * - Multi-provider LLM with intelligent fallback
 * - Visual edit log for git diff failures
 *
 * Pipeline:
 * 1. Aggregate knowledge from 21 Qdrant collections
 * 2. Rank by cosine similarity to current error context
 * 3. Inject top-K knowledge into LLM prompt (ACE)
 * 4. Generate analysis with Gemini/Ollama
 * 5. Update file timeline metadata
 * 6. Store results in PostgreSQL + Qdrant + Knowledge base files
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import ollama from 'ollama';
import pg from 'pg';
import { createClient } from 'redis';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;

// =============================================================================
// Configuration
// =============================================================================
const CONFIG = {
	qdrant: { url: process.env.QDRANT_URL || 'http://localhost:6333' },
	postgres: {
		host: '127.0.0.1',
		port: 5434,
		database: 'legal_ai_db',
		user: 'legal_admin',
		password: '123456'
	},
	redis: { url: 'redis://127.0.0.1:6379' },
	ollama: {
		url: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
		embeddingModel: 'embeddinggemma:latest',
		chatModel: 'gemma3-legal:latest'
	},
	gemini: {
		apiKey: process.env.GEMINI_API_KEY || '',
		model: 'gemini-2.0-flash-exp'
	},
	aceConfig: {
		topK: 10, // Top 10 most relevant knowledge chunks
		contextWindow: 8192, // Max tokens for context
		similarityThreshold: 0.7 // Minimum cosine similarity
	}
};

let qdrant, db, redis, genai;

// =============================================================================
// Initialize Services with Retry
// =============================================================================
async function init() {
	console.log('🚀 Phase 89: ACE RAG+KAG Analyzer\n');
	console.log('═'.repeat(60));
	console.log('');

	qdrant = new QdrantClient({ url: CONFIG.qdrant.url });
	db = new Pool(CONFIG.postgres);

	// Connect to Redis with retry
	redis = createClient({ url: CONFIG.redis.url });
	let retries = 3;
	while (retries > 0) {
		try {
			await redis.connect();
			break;
		} catch (err) {
			retries--;
			if (retries === 0) throw err;
			console.log(`⏳ Redis connection failed, retrying... (${retries} left)`);
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	}

	if (CONFIG.gemini.apiKey) {
		genai = new GoogleGenerativeAI(CONFIG.gemini.apiKey);
	}

	console.log('✅ Services connected');
	console.log('   • Qdrant:', CONFIG.qdrant.url);
	console.log('   • PostgreSQL:', `${CONFIG.postgres.host}:${CONFIG.postgres.port}`);
	console.log('   • Redis:', CONFIG.redis.url, '✓');
	console.log('   • Ollama:', CONFIG.ollama.url);
	console.log('   • Gemini:', genai ? 'Configured' : 'Not configured (will use Ollama)');
	console.log('');
}

// =============================================================================
// File Timeline Tracking
// =============================================================================
class FileTimelineTracker {
	constructor() {
		this.timeline = new Map(); // file_path -> { indexed, tagged, edited, analyzed }
	}

	async loadTimeline() {
		// Load from PostgreSQL
		const result = await db.query(`
			CREATE TABLE IF NOT EXISTS phase89_file_timeline (
				file_path TEXT PRIMARY KEY,
				indexed_at TIMESTAMP,
				tagged_at TIMESTAMP,
				edited_at TIMESTAMP,
				analyzed_at TIMESTAMP,
				git_commit TEXT,
				metadata JSONB DEFAULT '{}'::jsonb
			);

			SELECT * FROM phase89_file_timeline;
		`);

		for (const row of result.rows || []) {
			this.timeline.set(row.file_path, {
				indexed: row.indexed_at,
				tagged: row.tagged_at,
				edited: row.edited_at,
				analyzed: row.analyzed_at,
				gitCommit: row.git_commit,
				metadata: row.metadata || {}
			});
		}

		console.log(`📅 Loaded timeline for ${this.timeline.size} files`);
	}

	async recordEvent(filePath, eventType, metadata = {}) {
		const now = new Date().toISOString();
		const existing = this.timeline.get(filePath) || {};

		const updated = {
			...existing,
			[`${eventType}`]: now,
			metadata: { ...existing.metadata, ...metadata }
		};

		this.timeline.set(filePath, updated);

		// Persist to database
		await db.query(
			`INSERT INTO phase89_file_timeline (file_path, ${eventType}_at, metadata)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (file_path) DO UPDATE
			 SET ${eventType}_at = $2, metadata = phase89_file_timeline.metadata || $3`,
			[filePath, now, JSON.stringify(metadata)]
		);
	}

	async generateVisualLog() {
		const log = [];
		log.push('# Phase 89: File Edit Timeline');
		log.push('> Visual log for tracking file changes (fallback when git diff fails)\n');
		log.push('| File | Indexed | Tagged | Edited | Analyzed | Last Event |');
		log.push('|------|---------|--------|--------|----------|------------|');

		for (const [filePath, timeline] of this.timeline.entries()) {
			const lastEvent = Math.max(
				new Date(timeline.indexed || 0),
				new Date(timeline.tagged || 0),
				new Date(timeline.edited || 0),
				new Date(timeline.analyzed || 0)
			);

			log.push(
				`| ${filePath} | ${this.formatDate(timeline.indexed)} | ${this.formatDate(timeline.tagged)} | ${this.formatDate(timeline.edited)} | ${this.formatDate(timeline.analyzed)} | ${this.formatDate(lastEvent)} |`
			);
		}

		const logContent = log.join('\n');
		await fs.writeFile('reports/phase89-file-timeline.md', logContent);
		console.log('📊 Visual timeline saved to reports/phase89-file-timeline.md');
		return logContent;
	}

	formatDate(dateStr) {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
}

// =============================================================================
// ACE Contextual Engineering with Redis Caching
// =============================================================================
class ACEContextualPromptEngineer {
	constructor(qdrantClient, fileTracker) {
		this.qdrant = qdrantClient;
		this.fileTracker = fileTracker;
		this.cacheStats = {
			embeddingHits: 0,
			embeddingMisses: 0,
			knowledgeHits: 0,
			knowledgeMisses: 0,
			gpuTime: [], // Track GPU computation times for variance
			cacheTime: [] // Track cache retrieval times
		};
	}

	/**
	 * Generate embedding for query using Ollama (with Redis caching)
	 */
	async embedQuery(text) {
		// Generate cache key from text hash
		const crypto = await import('crypto');
		const hash = crypto.createHash('sha256').update(text).digest('hex');
		const cacheKey = `ace:embedding:${hash}`;

		// Try Redis cache first
		const cacheStart = performance.now();
		const cached = await redis.get(cacheKey);
		if (cached) {
			const cacheEnd = performance.now();
			this.cacheStats.embeddingHits++;
			this.cacheStats.cacheTime.push(cacheEnd - cacheStart);
			console.log(`   💾 Cache HIT (${(cacheEnd - cacheStart).toFixed(2)}ms)`);
			return JSON.parse(cached);
		}

		// Cache miss - compute with GPU
		const gpuStart = performance.now();
		const response = await ollama.embeddings({
			model: CONFIG.ollama.embeddingModel,
			prompt: text
		});
		const gpuEnd = performance.now();
		this.cacheStats.embeddingMisses++;
		this.cacheStats.gpuTime.push(gpuEnd - gpuStart);

		// Store in Redis (1 hour TTL)
		await redis.setEx(cacheKey, 3600, JSON.stringify(response.embedding));
		console.log(`   🎮 GPU computed (${(gpuEnd - gpuStart).toFixed(2)}ms) → cached`);

		return response.embedding;
	}

	/**
	 * Calculate variance of GPU cache performance
	 */
	calculateVariance(times) {
		if (times.length === 0) return 0;
		const mean = times.reduce((a, b) => a + b, 0) / times.length;
		const variance = times.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / times.length;
		return { mean, variance, stdDev: Math.sqrt(variance) };
	}

	/**
	 * Print cache statistics with variance analysis
	 */
	printCacheStats() {
		const totalEmbeddings = this.cacheStats.embeddingHits + this.cacheStats.embeddingMisses;
		const hitRate = totalEmbeddings > 0
			? ((this.cacheStats.embeddingHits / totalEmbeddings) * 100).toFixed(1)
			: 0;

		const gpuStats = this.calculateVariance(this.cacheStats.gpuTime);
		const cacheStats = this.calculateVariance(this.cacheStats.cacheTime);

		console.log('\n📊 Redis GPU Cache Statistics');
		console.log('━'.repeat(60));
		console.log(`\n🎯 Cache Hit Rate: ${hitRate}%`);
		console.log(`   • Hits: ${this.cacheStats.embeddingHits}`);
		console.log(`   • Misses: ${this.cacheStats.embeddingMisses}`);
		console.log(`   • Total: ${totalEmbeddings}`);

		if (this.cacheStats.gpuTime.length > 0) {
			console.log(`\n🎮 GPU Computation (embeddinggemma:latest)`);
			console.log(`   • Mean: ${gpuStats.mean.toFixed(2)}ms`);
			console.log(`   • Variance: ${gpuStats.variance.toFixed(2)}`);
			console.log(`   • Std Dev: ±${gpuStats.stdDev.toFixed(2)}ms`);
		}

		if (this.cacheStats.cacheTime.length > 0) {
			console.log(`\n💾 Redis Cache Retrieval`);
			console.log(`   • Mean: ${cacheStats.mean.toFixed(2)}ms`);
			console.log(`   • Variance: ${cacheStats.variance.toFixed(2)}`);
			console.log(`   • Std Dev: ±${cacheStats.stdDev.toFixed(2)}ms`);
		}

		if (this.cacheStats.gpuTime.length > 0 && this.cacheStats.cacheTime.length > 0) {
			const speedup = (gpuStats.mean / cacheStats.mean).toFixed(1);
			console.log(`\n⚡ Cache Speedup: ${speedup}x faster`);
		}

		console.log('\n━'.repeat(60) + '\n');
	}

	/**
	 * Retrieve top-K relevant knowledge chunks via cosine similarity
	 */
	async retrieveRelevantKnowledge(queryEmbedding, topK = 10) {
		console.log(`\n🔍 Retrieving top-${topK} knowledge chunks via cosine similarity...\n`);

		const collections = await this.qdrant.getCollections();
		const allResults = [];

		for (const collection of collections.collections) {
			const name = collection.name;

			try {
				const searchResults = await this.qdrant.search(name, {
					vector: queryEmbedding,
					limit: topK,
					with_payload: true,
					with_vector: false,
					score_threshold: CONFIG.aceConfig.similarityThreshold
				});

				for (const result of searchResults) {
					allResults.push({
						collection: name,
						score: result.score,
						payload: result.payload
					});
				}
			} catch (err) {
				console.warn(`  ⚠️  ${name}: ${err.message}`);
			}
		}

		// Sort by cosine similarity (descending)
		allResults.sort((a, b) => b.score - a.score);

		const topResults = allResults.slice(0, topK);

		console.log('📊 Top Knowledge Chunks:');
		topResults.forEach((r, i) => {
			console.log(`  ${i + 1}. [${r.collection}] Score: ${r.score.toFixed(3)}`);
			if (r.payload.file_path) console.log(`     File: ${r.payload.file_path}`);
			if (r.payload.message) console.log(`     Preview: ${r.payload.message.slice(0, 80)}...`);
		});
		console.log('');

		return topResults;
	}

	/**
	 * Build ACE prompt with injected context
	 */
	buildACEPrompt(query, knowledgeChunks, copilotContext, claudeContext, llmsContext, svelteContext, sveltekitContext) {
		const contextSections = [];

		// 1. PRIORITY: LLMs.txt Framework Context (Svelte 5 + SvelteKit 2)
		if (llmsContext) {
			contextSections.push('## 📚 Framework Reference (llms.txt)\n');
			contextSections.push(llmsContext.slice(0, 8000)); // 8KB for runes/routing patterns
			contextSections.push('');
		}

		// 2. Svelte 5 Official Documentation
		if (svelteContext) {
			contextSections.push('## 📖 Svelte 5 Documentation\n');
			contextSections.push(svelteContext.slice(0, 12000)); // 12KB for component syntax
			contextSections.push('');
		}

		// 3. SvelteKit 2 Official Documentation
		if (sveltekitContext) {
			contextSections.push('## 🛠️ SvelteKit 2 Documentation\n');
			contextSections.push(sveltekitContext.slice(0, 12000)); // 12KB for routing/SSR
			contextSections.push('');
		}

		// 4. Ranked knowledge from Qdrant (cosine similarity sorted)
		contextSections.push('## 🔍 Relevant Knowledge (Ranked by Cosine Similarity)\n');
		knowledgeChunks.forEach((chunk, i) => {
			contextSections.push(`### Rank ${i + 1} (Score: ${chunk.score.toFixed(3)}) - ${chunk.collection}`);
			contextSections.push(JSON.stringify(chunk.payload, null, 2).slice(0, 500));
			contextSections.push('');
		});

		// 5. copilot.md context
		if (copilotContext) {
			contextSections.push('## 🤖 Copilot Context\n');
			contextSections.push(copilotContext.slice(0, 2000));
			contextSections.push('');
		}

		// 6. claude.md context
		if (claudeContext) {
			contextSections.push('## 🧠 Claude Context\n');
			contextSections.push(claudeContext.slice(0, 1000));
			contextSections.push('');
		}

		const fullContext = contextSections.join('\n');

		const acePrompt = `You are an expert TypeScript/Svelte 5/SvelteKit 2 error analyst with access to:
- Complete Svelte 5 Runes documentation (llms.txt)
- Official Svelte 5 API docs (svelte.txt)
- Official SvelteKit 2 routing/SSR docs (sveltekit.txt)
- Historical error patterns from RAG+KAG database

# CONTEXT (Retrieved via RAG+KAG with Cosine Similarity Ranking)
${fullContext}

# USER QUERY
${query}

# INSTRUCTIONS
1. **FIRST**: Check llms.txt for Svelte 5 runes syntax ($state, $derived, $props, $effect)
2. **SECOND**: Reference svelte.txt and sveltekit.txt for framework-specific patterns
3. **THIRD**: Use ranked knowledge chunks (highest similarity = most relevant)
4. Identify error patterns and root causes using framework documentation
5. Provide actionable fixes that follow Svelte 5 best practices
6. Suggest AutoGen/CrewAI tool calls if automation is possible
7. Note any file timestamps from the knowledge base

# RESPONSE FORMAT (JSON)
\`\`\`json
{
  "analysis": "Detailed analysis using the provided context",
  "errorPattern": "short_identifier",
  "rootCause": "2-3 sentence explanation",
  "recommendations": [
    {"action": "specific fix", "priority": "high|medium|low", "files": ["path/to/file.ts"]}
  ],
  "toolCalls": [
    {"tool": "web_search|fix_errors|crawl_docs", "args": {}, "reason": "why this tool"}
  ],
  "fileTimeline": [
    {"file": "path/to/file.ts", "lastIndexed": "timestamp", "lastEdited": "timestamp"}
  ],
  "nextSteps": ["Step 1", "Step 2", "Step 3"]
}
\`\`\`

Return ONLY the JSON, no additional text.`;

		return acePrompt;
	}
}

// =============================================================================
// Multi-Provider LLM with Fallback
// =============================================================================
async function generateWithLLM(prompt) {
	// Try Gemini first
	if (genai) {
		try {
			console.log('🤖 Generating analysis with Gemini...');
			const model = genai.getGenerativeModel({ model: CONFIG.gemini.model });
			const result = await model.generateContent(prompt);
			const response = result.response.text();

			console.log('✅ Gemini analysis complete\n');
			return { provider: 'gemini', response };
		} catch (error) {
			console.warn(`⚠️  Gemini failed: ${error.message}`);
			console.log('🔄 Falling back to Ollama...\n');
		}
	}

	// Fallback to Ollama
	try {
		console.log('🦙 Generating analysis with Ollama (gemma3-legal)...');
		const response = await fetch(`${CONFIG.ollama.url}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.ollama.chatModel,
				prompt: prompt,
				stream: false,
				options: {
					temperature: 0.3,
					num_predict: 1024
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		console.log('✅ Ollama analysis complete\n');
		return { provider: 'ollama', response: data.response };
	} catch (error) {
		console.error('❌ All LLM providers failed:', error.message);
		return { provider: 'none', response: null, error: error.message };
	}
}

// =============================================================================
// Main Analysis Pipeline
// =============================================================================
async function runACEAnalysis(query) {
	console.log('\n🎯 Starting ACE RAG+KAG Analysis...\n');
	console.log(`Query: "${query}"\n`);
	console.log('═'.repeat(60));

	// 1. Initialize file tracker
	const fileTracker = new FileTimelineTracker();
	await fileTracker.loadTimeline();

	// 2. Initialize ACE engine
	const ace = new ACEContextualPromptEngineer(qdrant, fileTracker);

	// 3. Load knowledge base files (Priority: Framework docs → Historical context)
	console.log('\n📚 Loading documentation contexts...\n');

	let llmsContext = '';
	let svelteContext = '';
	let sveltekitContext = '';
	let copilotContext = '';
	let claudeContext = '';

	// PRIORITY 1: Load LLMs.txt (Svelte 5 Runes + SvelteKit 2 quick reference)
	try {
		llmsContext = await fs.readFile('llms.txt', 'utf-8');
		console.log(`📖 Loaded llms.txt (${(llmsContext.length / 1024).toFixed(1)} KB) - Svelte 5 + SvelteKit 2`);
	} catch {
		console.warn('⚠️  llms.txt not found');
	}

	// PRIORITY 2: Load Svelte 5 official documentation
	try {
		svelteContext = await fs.readFile('data/svelte-docs/svelte.txt', 'utf-8');
		console.log(`📘 Loaded svelte.txt (${(svelteContext.length / 1024).toFixed(1)} KB) - Official Svelte 5 docs`);
	} catch {
		console.warn('⚠️  data/svelte-docs/svelte.txt not found');
	}

	// PRIORITY 3: Load SvelteKit 2 official documentation
	try {
		sveltekitContext = await fs.readFile('data/svelte-docs/sveltekit.txt', 'utf-8');
		console.log(`📗 Loaded sveltekit.txt (${(sveltekitContext.length / 1024).toFixed(1)} KB) - Official SvelteKit 2 docs`);
	} catch {
		console.warn('⚠️  data/svelte-docs/sveltekit.txt not found');
	}

	// PRIORITY 4: Load historical context files
	try {
		copilotContext = await fs.readFile('copilot.md', 'utf-8');
		console.log(`🤖 Loaded copilot.md (${(copilotContext.length / 1024).toFixed(1)} KB) - Historical fixes`);
	} catch {
		console.warn('⚠️  copilot.md not found');
	}

	try {
		claudeContext = await fs.readFile('claude.md', 'utf-8');
		console.log(`🧠 Loaded claude.md (${(claudeContext.length / 1024).toFixed(1)} KB) - Analysis notes`);
	} catch {
		console.warn('⚠️  claude.md not found');
	}

	const totalDocsKB = (llmsContext.length + svelteContext.length + sveltekitContext.length +
	                     copilotContext.length + claudeContext.length) / 1024;
	console.log(`\n✅ Total documentation loaded: ${totalDocsKB.toFixed(1)} KB`);

	// 4. Generate query embedding
	console.log('\n🔢 Generating query embedding...');
	const queryEmbedding = await ace.embedQuery(query);
	console.log(`✅ Embedding generated (${queryEmbedding.length} dimensions)`);

	// 5. Retrieve top-K knowledge via cosine similarity
	const knowledgeChunks = await ace.retrieveRelevantKnowledge(
		queryEmbedding,
		CONFIG.aceConfig.topK
	);

	// 6. Build ACE prompt with injected context (Framework docs → RAG → Historical)
	console.log('\n🔧 Building ACE contextual prompt with documentation hierarchy...');
	const acePrompt = ace.buildACEPrompt(
		query,
		knowledgeChunks,
		copilotContext,
		claudeContext,
		llmsContext,
		svelteContext,
		sveltekitContext
	);
	console.log(`✅ Prompt built (${acePrompt.length} chars, ~${Math.ceil(acePrompt.length / 4)} tokens)`);
	console.log('   Priority: llms.txt → svelte.txt → sveltekit.txt → RAG → copilot.md → claude.md\n');

	// 7. Generate analysis with LLM
	const { provider, response, error } = await generateWithLLM(acePrompt);

	if (error) {
		console.error('❌ Analysis failed:', error);
		return null;
	}

	// 8. Parse JSON response
	let analysis;
	try {
		const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/{[\s\S]*}/);
		if (jsonMatch) {
			const jsonStr = jsonMatch[1] || jsonMatch[0];
			analysis = JSON.parse(jsonStr);
		} else {
			throw new Error('No JSON found in response');
		}
	} catch (parseError) {
		console.warn('⚠️  Could not parse JSON, using raw response');
		analysis = { rawResponse: response };
	}

	// 9. Update file timeline for mentioned files
	if (analysis.recommendations) {
		for (const rec of analysis.recommendations) {
			for (const file of rec.files || []) {
				await fileTracker.recordEvent(file, 'analyzed', {
					query,
					provider,
					recommendation: rec.action
				});
			}
		}
	}

	// 10. Generate visual timeline
	await fileTracker.generateVisualLog();

	// 11. Save results
	const results = {
		metadata: {
			query,
			timestamp: new Date().toISOString(),
			provider,
			topKnowledgeChunks: knowledgeChunks.length,
			aceConfig: CONFIG.aceConfig
		},
		knowledgeChunks: knowledgeChunks.map((c) => ({
			collection: c.collection,
			score: c.score,
			payload: c.payload
		})),
		analysis
	};

	await fs.writeFile('reports/phase89-ace-analysis.json', JSON.stringify(results, null, 2));
	console.log('💾 Results saved to reports/phase89-ace-analysis.json');

	// 12. Print cache statistics with variance
	ace.printCacheStats();

	// 13. Save Gemma3 analysis to reports
	const gemmaAnalysis = {
		timestamp: new Date().toISOString(),
		query,
		provider,
		model: provider === 'ollama' ? CONFIG.ollama.chatModel : CONFIG.gemini.model,
		analysis: response,
		cacheStats: {
			embeddingHitRate: ((ace.cacheStats.embeddingHits / (ace.cacheStats.embeddingHits + ace.cacheStats.embeddingMisses)) * 100).toFixed(1),
			gpuStats: ace.calculateVariance(ace.cacheStats.gpuTime),
			cacheStats: ace.calculateVariance(ace.cacheStats.cacheTime)
		}
	};

	await fs.writeFile(
		`reports/phase89-gemma3-analysis-${Date.now()}.json`,
		JSON.stringify(gemmaAnalysis, null, 2)
	);
	console.log('💾 Gemma3 analysis saved to reports/phase89-gemma3-analysis-*.json');

	// 14. Update copilot.md with analysis
	const updateBlock = `
## Phase 89: ACE Analysis - ${new Date().toLocaleString()}

**Query**: ${query}
**Provider**: ${provider} (${gemmaAnalysis.model})
**Top Knowledge Score**: ${knowledgeChunks[0]?.score.toFixed(3) || 'N/A'}
**Cache Hit Rate**: ${gemmaAnalysis.cacheStats.embeddingHitRate}%

${analysis.analysis || analysis.rawResponse?.slice(0, 500) || 'No analysis'}

---
`;

	try {
		const existingCopilot = await fs.readFile('copilot.md', 'utf-8');
		await fs.writeFile('copilot.md', existingCopilot + '\n' + updateBlock);
		console.log('📝 Updated copilot.md with analysis');
	} catch {
		await fs.writeFile('copilot.md', updateBlock);
		console.log('📝 Created copilot.md with analysis');
	}

	return results;
}

// =============================================================================
// CLI
// =============================================================================
async function main() {
	await init();

	const query = process.argv[2] || 'Analyze all TypeScript errors in phase89_code_units collection';

	const results = await runACEAnalysis(query);

	if (results) {
		console.log('\n✅ ACE RAG+KAG Analysis Complete!\n');
		console.log('📊 Summary:');
		console.log(`   • Provider: ${results.metadata.provider}`);
		console.log(`   • Knowledge chunks: ${results.metadata.topKnowledgeChunks}`);
		console.log(`   • Top similarity: ${results.knowledgeChunks[0]?.score.toFixed(3) || 'N/A'}`);
		console.log('');
		console.log('📁 Output Files:');
		console.log('   • reports/phase89-ace-analysis.json (full analysis)');
		console.log('   • reports/phase89-file-timeline.md (visual edit log)');
		console.log('   • copilot.md (updated with analysis)');
		console.log('');
	}

	await redis.disconnect();
	await db.end();
	process.exit(0);
}

main().catch((error) => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});
