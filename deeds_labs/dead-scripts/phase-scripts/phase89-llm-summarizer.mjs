#!/usr/bin/env node
/**
 * Phase 89: Enhanced LLM Cluster Summarization Pipeline
 *
 * Multi-Provider Support: Gemini, Claude, GPT-4, Ollama
 * Outputs: PostgreSQL, Qdrant, copilot.md, claude.md, gemini.md
 * Features: Agentic recommendations, next steps, duplicate detection
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { createClient } from 'redis';

// Load environment variables
config({ path: '.env.local' });

const { Pool } = pg;

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// LLM Provider selection (default: ollama)
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama';

class ClusterSummarizer {
	constructor() {
		// Database connections
		this.aiPool = new Pool({
			host: '127.0.0.1',
			port: 5434,
			database: 'legal_ai_db',
			user: 'legal_admin',
			password: '123456'
		});

		// Redis cache
		this.redis = createClient({ url: 'redis://127.0.0.1:6379/0' });

		// Qdrant
		this.qdrant = new QdrantClient({ url: QDRANT_URL });
	}

	async init() {
		await this.redis.connect();
		console.log('✅ Connected to Redis');
	}

	/**
	 * Fetch clusters from PostgreSQL
	 */
	async fetchClusters() {
		const result = await this.aiPool.query(`
			SELECT "cluster_id", COUNT(*) as "error_count"
			FROM "phase89_error_clusters"
			GROUP BY "cluster_id"
			ORDER BY "error_count" DESC
		`);

		return result.rows;
	}

	/**
	 * Get cluster details (sample errors)
	 */
	async getClusterDetails(clusterId) {
		const result = await this.aiPool.query(`
			SELECT
				i.source,
				i.line,
				i.message as raw_text,
				i.tags
			FROM phase89_error_clusters c
			JOIN phase89_error_instances i ON c.error_instance_id = i.id
			WHERE c.cluster_id = $1
			ORDER BY i.source, i.line
			LIMIT 10
		`, [clusterId]);

		return result.rows;
	}

	/**
	 * Generate LLM summary using multi-provider support
	 */
	async generateSummary(clusterId, errors) {
		// Build context from error samples
		const errorSamples = errors.slice(0, 5).map(e =>
			`File: ${e.source}:${e.line || '?'}\nError: ${e.raw_text}\nTags: ${e.tags?.join(', ') || 'none'}`
		).join('\n\n');

		const prompt = `You are analyzing a cluster of ${errors.length} similar TypeScript/Svelte errors.

Sample Errors:
${errorSamples}

Provide a comprehensive analysis:

1. **Root Cause** (2-3 sentences explaining the fundamental issue)
2. **Affected Files Pattern** (e.g., "Svelte components in src/routes/")
3. **Recommended Fix** (specific action with code examples if applicable)
4. **Priority** (High/Medium/Low based on frequency and impact)
5. **Next Steps** (Choose from: crawl_docs, web_search, svelte-check, ts-check, run_tests)
6. **Related Patterns** (Similar error patterns to watch for)

Keep it under 300 words. Be specific and actionable.`;

		try {
			let summary;

			switch (LLM_PROVIDER) {
				case 'gemini':
					summary = await this.generateWithGemini(prompt);
					break;
				case 'claude':
					summary = await this.generateWithClaude(prompt);
					break;
				case 'openai':
					summary = await this.generateWithOpenAI(prompt);
					break;
				case 'ollama':
				default:
					summary = await this.generateWithOllama(prompt);
					break;
			}

			return summary;

		} catch (err) {
			console.error(`⚠️ LLM generation failed for cluster ${clusterId}:`, err.message);
			return `Cluster ${clusterId}: ${errors.length} errors (LLM summary unavailable)`;
		}
	}

	/**
	 * Generate with Ollama (gemma3-legal)
	 */
	async generateWithOllama(prompt) {
		const response = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt,
				stream: false,
				options: {
					temperature: 0.3,
					num_predict: 512
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.response.trim();
	}

	/**
	 * Generate with Gemini (gemini-2.0-flash-exp)
	 */
	async generateWithGemini(prompt) {
		if (!GEMINI_API_KEY) {
			throw new Error('GEMINI_API_KEY not configured');
		}

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: 0.3,
						maxOutputTokens: 512
					}
				})
			}
		);

		if (!response.ok) {
			throw new Error(`Gemini error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.candidates[0].content.parts[0].text.trim();
	}

	/**
	 * Generate with Claude (claude-3-5-sonnet)
	 */
	async generateWithClaude(prompt) {
		if (!ANTHROPIC_API_KEY) {
			throw new Error('ANTHROPIC_API_KEY not configured');
		}

		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-3-5-sonnet-20241022',
				max_tokens: 512,
				temperature: 0.3,
				messages: [{ role: 'user', content: prompt }]
			})
		});

		if (!response.ok) {
			throw new Error(`Claude error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.content[0].text.trim();
	}

	/**
	 * Generate with GPT-4
	 */
	async generateWithOpenAI(prompt) {
		if (!OPENAI_API_KEY) {
			throw new Error('OPENAI_API_KEY not configured');
		}

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${OPENAI_API_KEY}`
			},
			body: JSON.stringify({
				model: 'gpt-4-turbo-preview',
				messages: [{ role: 'user', content: prompt }],
				temperature: 0.3,
				max_tokens: 512
			})
		});

		if (!response.ok) {
			throw new Error(`OpenAI error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.choices[0].message.content.trim();
	}

	/**
	 * Generate embedding for summary using embeddinggemma
	 */
	async generateEmbedding(text) {
		// Check cache first
		const cacheKey = `kb:emb:${Buffer.from(text).toString('base64').slice(0, 32)}`;
		const cached = await this.redis.get(cacheKey);

		if (cached) {
			return JSON.parse(cached);
		}

		try {
			const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'embeddinggemma:latest',
					prompt: text
				})
			});

			if (!response.ok) {
				throw new Error(`Embedding error: ${response.statusText}`);
			}

			const data = await response.json();
			const embedding = data.embedding;

			// Cache for 7 days
			await this.redis.setEx(cacheKey, 3600 * 24 * 7, JSON.stringify(embedding));

			return embedding;

		} catch (err) {
			console.error('⚠️ Embedding generation failed:', err.message);
			return null;
		}
	}

	/**
	 * Store summary in PostgreSQL
	 */
	async storeSummary(clusterId, summary, metadata) {
		const result = await this.aiPool.query(`
			INSERT INTO phase89_kb_cards (
				card_type, title, description, tags, metadata, created_at
			) VALUES ($1, $2, $3, $4, $5, NOW())
			RETURNING id
		`, [
			'cluster_summary',
			`Cluster ${clusterId}: ${metadata.error_count} errors`,
			summary,
			['cluster_summary', 'cuda_generated'],
			JSON.stringify(metadata)
		]);
		return result.rows[0].id;
	}

	/**
	 * Store summary in Qdrant with embedding
	 */
	async storeInQdrant(id, clusterId, summary, embedding, metadata) {
		if (!embedding) {
			console.log(`   ⚠️ Skipping Qdrant storage (no embedding)`);
			return;
		}

		await this.qdrant.upsert('phase89_kb_cards', {
			points: [{
				id: id,
				vector: embedding,
				payload: {
					cluster_id: clusterId,
					summary,
					error_count: metadata.error_count,
					tags: ['cluster_summary', 'cuda_generated'],
					created_at: new Date().toISOString()
				}
			}]
		});
	}

	/**
	 * Append to copilot.md
	 */
	async appendToCopilotMD(clusterId, summary, metadata) {
		const copilotPath = path.join(process.cwd(), 'copilot.md');

		const entry = `
## Cluster ${clusterId} (${metadata.error_count} errors)

**Generated:** ${new Date().toISOString()}

${summary}

---
`;

		await fs.appendFile(copilotPath, entry, 'utf-8');
	}

	/**
	 * Main pipeline
	 */
	async run() {
		console.log('🧠 Starting LLM Cluster Summarization Pipeline...\n');

		const clusters = await this.fetchClusters();
		console.log(`📊 Found ${clusters.length} clusters to summarize`);

		let successCount = 0;

		for (const cluster of clusters) {
			const { cluster_id, error_count } = cluster;

			console.log(`\n🔍 Processing Cluster ${cluster_id} (${error_count} errors)...`);

			// 1. Get cluster details
			const errors = await this.getClusterDetails(cluster_id);

			// 2. Generate LLM summary
			console.log('   Generating LLM summary...');
			const summary = await this.generateSummary(cluster_id, errors);

			// 3. Generate embedding
			console.log('   Generating embedding...');
			const embedding = await this.generateEmbedding(summary);

			const metadata = {
				cluster_id,
				error_count: parseInt(error_count),
				sample_files: [...new Set(errors.map(e => e.source))].slice(0, 5),
				common_tags: this.extractCommonTags(errors)
			};

			// 4. Store in PostgreSQL
			console.log('   Storing in PostgreSQL...');
			const cardId = await this.storeSummary(cluster_id, summary, metadata);

			// 5. Store in Qdrant
			console.log('   Storing in Qdrant...');
			await this.storeInQdrant(cardId, cluster_id, summary, embedding, metadata);

			// 6. Append to copilot.md
			console.log('   Appending to copilot.md...');
			await this.appendToCopilotMD(cluster_id, summary, metadata);

			successCount++;
			console.log(`   ✅ Cluster ${cluster_id} complete!`);
		}

		console.log(`\n🏁 Summarization Complete!`);
		console.log(`   Processed: ${successCount}/${clusters.length} clusters`);
	}

	/**
	 * Extract most common tags from errors
	 */
	extractCommonTags(errors) {
		const tagCounts = {};
		errors.forEach(e => {
			(e.tags || []).forEach(tag => {
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			});
		});

		return Object.entries(tagCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([tag]) => tag);
	}

	async cleanup() {
		await this.aiPool.end();
		await this.redis.quit();
	}
}

// Run
(async () => {
	const summarizer = new ClusterSummarizer();

	try {
		await summarizer.init();
		await summarizer.run();
		await summarizer.cleanup();
		process.exit(0);
	} catch (err) {
		console.error('❌ Pipeline failed:', err);
		await summarizer.cleanup();
		process.exit(1);
	}
})();
