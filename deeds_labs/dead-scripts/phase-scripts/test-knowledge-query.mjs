#!/usr/bin/env node
/**
 * Test Knowledge Base Query
 * Demonstrates querying with semantic search, doc_id deduplication, and Redis caching
 */

import chalk from 'chalk';
import crypto from 'crypto';
import Redis from 'ioredis';

// Parse CLI args - preserve $state, $derived, $effect etc.
const args = process.argv.slice(2);

// DEBUG: Print raw argv to catch quoting issues
if (process.env.DEBUG_QUERY) {
	console.log(chalk.gray('🐛 DEBUG - Raw argv:'), JSON.stringify(process.argv, null, 2));
	console.log(chalk.gray('🐛 DEBUG - Parsed args:'), JSON.stringify(args, null, 2));
}

// Fix: Don't sanitize query - preserve $, ., -, (), / etc.
// Use robust Unicode-aware regex to strip only truly unsafe chars
const queryRaw = args.filter(a => !a.startsWith('--')).join(' ') || 'Svelte 5 runes';
const query = queryRaw.replace(/[^\p{L}\p{N}\s\.\$\-_\(\)\/:]/gu, '');

const collection = process.env.QDRANT_COLLECTION || args.find(a => a.startsWith('--collection='))?.split('=')[1] || 'knowledge_base';
const topK = parseInt(args.find(a => a.startsWith('--topK='))?.split('=')[1] || '50');
const source = args.find(a => a.startsWith('--source='))?.split('=')[1]; // local|web|any
const useCache = !args.includes('--no-cache'); // Default to using cache

const CONFIG = {
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		embeddingModel: process.env.OLLAMA_EMBED_MODEL || 'embeddinggemma:latest'
	},
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection,
		topK,
		scoreThreshold: 0.5
	},
	redis: {
		url: process.env.REDIS_URL || 'redis://localhost:6379'
	}
};

// Redis connection
let redis = null;
let cacheAvailable = false;

if (useCache) {
	try {
		redis = new Redis(CONFIG.redis.url, {
			retryStrategy: () => null, // Don't retry on connection failure
			maxRetriesPerRequest: 1,
			connectTimeout: 2000
		});

		await redis.ping();
		cacheAvailable = true;
		console.log(chalk.green('💾 Redis cache enabled\n'));
	} catch (error) {
		console.log(chalk.yellow('⚠️  Redis unavailable, proceeding without cache\n'));
		redis = null;
		cacheAvailable = false;
	}
}

// Cache key helpers
function getEmbeddingCacheKey(text, model) {
	const hash = crypto.createHash('sha256').update(`${model}:${text}`).digest('hex');
	return `emb:${model}:${hash.substring(0, 16)}`;
}

function getSearchCacheKey(collection, queryHash, filters) {
	const filterHash = filters
		? crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex').substring(0, 8)
		: 'none';
	return `search:${collection}:${queryHash}:${filterHash}`;
}

async function recordCacheMetric(type, cacheType) {
	if (!cacheAvailable) return;

	try {
		const key = `metrics:cache:${cacheType}`;
		const field = type === 'hit' ? 'hits' : 'misses';
		await redis.hincrby(key, field, 1);
		await redis.expire(key, 3600);
	} catch (error) {
		// Ignore metrics failures
	}
}

/**
 * Generate embedding using Ollama with Redis caching
 */
async function generateEmbedding(text) {
	// Check cache first
	if (cacheAvailable) {
		const cacheKey = getEmbeddingCacheKey(text, CONFIG.ollama.embeddingModel);
		try {
			const cached = await redis.get(cacheKey);
			if (cached) {
				await recordCacheMetric('hit', 'embeddings');
				console.log(chalk.gray('   ✅ Embedding retrieved from cache'));
				return JSON.parse(cached);
			}
			await recordCacheMetric('miss', 'embeddings');
		} catch (error) {
			console.log(chalk.yellow('   ⚠️  Cache read failed, generating new embedding'));
		}
	}

	const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: CONFIG.ollama.embeddingModel,
			prompt: text
		})
	});

	if (!response.ok) {
		throw new Error(`Embedding error: ${response.statusText}`);
	}

	const data = await response.json();
	const embedding = data.embedding;

	// Cache the embedding
	if (cacheAvailable) {
		try {
			const cacheKey = getEmbeddingCacheKey(text, CONFIG.ollama.embeddingModel);
			await redis.setex(cacheKey, 3600, JSON.stringify(embedding)); // 1 hour TTL
		} catch (error) {
			console.log(chalk.yellow('   ⚠️  Failed to cache embedding'));
		}
	}

	return embedding;
}

/**
 * Query Qdrant knowledge base with Redis caching
 */
async function queryKnowledgeBase(query) {
	console.log(chalk.cyan(`\n🔍 Querying: "${query}"\n`));

	try {
		// Check search result cache first
		const queryHash = crypto.createHash('md5').update(query).digest('hex').substring(0, 12);
		const searchCacheKey = getSearchCacheKey(CONFIG.qdrant.collection, queryHash);

		if (cacheAvailable) {
			try {
				const cached = await redis.get(searchCacheKey);
				if (cached) {
					await recordCacheMetric('hit', 'search');
					const results = JSON.parse(cached);
					console.log(chalk.green(`   ✅ ${results.length} results retrieved from cache\n`));

					// Display results
					results.forEach((result, idx) => {
						const p = result.payload;
						console.log(chalk.bold(`${idx + 1}. ${p.file || p.title}`));
						if (p.section) console.log(chalk.gray(`   📖 Section: ${p.section}`));
						if (p.url) console.log(chalk.gray(`   📄 ${p.url}`));
						if (p.source) console.log(chalk.gray(`   🏷️  Source: ${p.source}`));
						console.log(chalk.yellow(`   📊 Score: ${(result.score * 100).toFixed(1)}%`));
						if (p.content) {
							const preview = p.content.substring(0, 150);
							console.log(chalk.gray(`   ${preview}${p.content.length > 150 ? '...' : ''}\n`));
						}
					});

					return { results, cached: true };
				}
				await recordCacheMetric('miss', 'search');
			} catch (error) {
				console.log(chalk.yellow('   ⚠️  Cache read failed, querying Qdrant'));
			}
		}

		// Generate embedding (may be cached)
		console.log(chalk.gray('   Generating embedding...'));
		const embedding = await generateEmbedding(query);

		// Search Qdrant
		console.log(chalk.gray('   Searching Qdrant...'));
		const searchUrl = `${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points/search`;
		const response = await fetch(searchUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: embedding,
				limit: CONFIG.qdrant.topK,
				score_threshold: CONFIG.qdrant.scoreThreshold,
				with_payload: true
			})
		});

		if (!response.ok) {
			throw new Error(`Qdrant search failed: ${response.statusText}`);
		}

		const data = await response.json();
		const rawResults = data.result || [];

		console.log(chalk.gray(`   Found ${rawResults.length} raw results, deduplicating...\n`));

		// DEDUPLICATE by composite key: source|doc_id|section to prevent duplicates
		const seen = new Set();
		const deduped = [];

		for (const result of rawResults) {
			const p = result.payload;
			// Use hash if available for stricter content-based dedupe, fallback to doc_id+section
			const key = p.hash || `${p.doc_id || p.file}|${p.section}`;

			if (seen.has(key)) continue;
			seen.add(key);

			// RERANKING: Boost score for exact keyword matches in title/content
			let boost = 0;
			const qLower = query.toLowerCase();
			if (p.title?.toLowerCase().includes(qLower)) boost += 0.1;
			if (p.section?.toLowerCase().includes(qLower)) boost += 0.05;
			// Boost for Svelte 5 runes if query asks for them
			if (query.includes('$') && (p.content?.includes('$state') || p.content?.includes('$derived'))) boost += 0.05;

			result.score += boost;
			deduped.push(result);
		}

		const results = deduped
			.sort((a, b) => b.score - a.score)
			.slice(0, 5); // Top 5 unique documents

		console.log(chalk.green(`   ✅ ${results.length} unique documents\n`));

		// Cache the results
		if (cacheAvailable) {
			try {
				await redis.setex(searchCacheKey, 1800, JSON.stringify(results)); // 30 min TTL
			} catch (error) {
				console.log(chalk.yellow('   ⚠️  Failed to cache search results'));
			}
		}

		// Display results
		results.forEach((result, idx) => {
			const p = result.payload;
			console.log(chalk.bold(`${idx + 1}. ${p.file || p.title}`));
			if (p.section) console.log(chalk.gray(`   📖 Section: ${p.section}`));
			if (p.url) console.log(chalk.gray(`   📄 ${p.url}`));
			if (p.source) console.log(chalk.gray(`   🏷️  Source: ${p.source}`));
			console.log(chalk.yellow(`   📊 Score: ${(result.score * 100).toFixed(1)}%`));
			const content = p.content || p.summary || p.text || '';
			console.log(chalk.white(`   📝 ${content.substring(0, 200).replace(/\n/g, ' ')}...`));
			console.log();
		});

		return { results, cached: false };

	} catch (error) {
		console.error(chalk.red(`   ❌ Query failed: ${error.message}`));
		return { results: [], cached: false };
	}
}

/**
 * Main
 */
async function main() {
	console.log(chalk.bold.cyan('\n🧠 Phase 76: Knowledge Base Query Test\n'));
	console.log(chalk.gray(`Collection: ${CONFIG.qdrant.collection}`));
	console.log(chalk.gray(`Query: "${query}"`));
	console.log(chalk.gray(`Top-K: ${topK} (before deduplication)`));
	if (source) console.log(chalk.gray(`Source Filter: ${source}`));
	console.log();

	const { results, cached } = await queryKnowledgeBase(query);

	// Display cache statistics
	if (cacheAvailable) {
		console.log(chalk.cyan('\n📊 Cache Statistics:\n'));

		try {
			const embStats = await redis.hgetall('metrics:cache:embeddings');
			const searchStats = await redis.hgetall('metrics:cache:search');

			const embHits = parseInt(embStats.hits || '0');
			const embMisses = parseInt(embStats.misses || '0');
			const embTotal = embHits + embMisses;

			const searchHits = parseInt(searchStats.hits || '0');
			const searchMisses = parseInt(searchStats.misses || '0');
			const searchTotal = searchHits + searchMisses;

			console.log(chalk.gray('Embeddings:'));
			console.log(chalk.gray(`  Hits: ${embHits}, Misses: ${embMisses}, Total: ${embTotal}`));
			console.log(chalk.gray(`  Hit Rate: ${embTotal > 0 ? ((embHits / embTotal) * 100).toFixed(2) : '0.00'}%`));

			console.log();

			console.log(chalk.gray('Search Results:'));
			console.log(chalk.gray(`  Hits: ${searchHits}, Misses: ${searchMisses}, Total: ${searchTotal}`));
			console.log(chalk.gray(`  Hit Rate: ${searchTotal > 0 ? ((searchHits / searchTotal) * 100).toFixed(2) : '0.00'}%`));

			console.log();
		} catch (error) {
			console.log(chalk.yellow('⚠️  Failed to retrieve cache statistics'));
		}
	}

	console.log(chalk.green('✅ Query test complete!\n'));

	// Cleanup
	if (redis) {
		await redis.quit();
	}
}

main().catch(error => {
	console.error(chalk.red('Fatal error:'), error);
	if (redis) redis.quit();
	process.exit(1);
});
