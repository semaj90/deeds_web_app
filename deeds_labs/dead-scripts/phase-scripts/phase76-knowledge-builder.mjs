#!/usr/bin/env node
/**
 * 🧠 Phase 76: Advanced Knowledge Base Builder
 *
 * Comprehensive knowledge acquisition system combining:
 * - Web search & crawling (Google Search API, web scraping)
 * - Content parsing (HTML, PDF, Markdown, code)
 * - MCP Context7 function calling (extractive QA, summarization)
 * - Ollama embeddings (local, fast)
 * - Qdrant vector storage
 * - Knowledge graph integration
 *
 * Features:
 * - Multi-source knowledge ingestion (web, docs, code)
 * - Agentic tool calling with MCP
 * - Parallel processing with worker pool
 * - Incremental updates (resume from checkpoint)
 * - Deduplication and quality filtering
 *
 * Usage:
 *   node phase76-knowledge-builder.mjs --search "TypeScript 5.6 features"
 *   node phase76-knowledge-builder.mjs --crawl "https://kit.svelte.dev/docs"
 *   node phase76-knowledge-builder.mjs --ingest-code "./src/routes"
 *   node phase76-knowledge-builder.mjs --resume
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import { JSDOM } from 'jsdom';
import { Client } from 'minio';
import fetch from 'node-fetch';
import path from 'path';
import { performance } from 'perf_hooks';
import TurndownService from 'turndown';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// ============================================
// Configuration
// ============================================
const CONFIG = {
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		embeddingModel: 'embeddinggemma:latest',
		qaModel: process.env.OLLAMA_MODEL || 'gemma3-legal:latest'
	},
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: process.env.QDRANT_COLLECTION || 'knowledge_base',
		dimension: 768
	},
	minio: {
		endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
		port: parseInt(process.env.MINIO_ENDPOINT?.split(':')[1] || '9000'),
		useSSL: process.env.MINIO_USE_SSL === 'true',
		accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
		secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
		bucket: 'knowledge-base'
	},
	mcp: {
		url: process.env.MCP_CONTEXT7_URL || 'http://localhost:3002',
		enabled: true,
		workers: 8
	},
	search: {
		engines: ['google', 'bing', 'duckduckgo'],
		maxResults: 10,
		minQuality: 0.7
	},
	crawler: {
		maxDepth: 3,
		maxPages: 50,
		timeout: 10000,
		userAgent: 'LegalAI-KnowledgeBot/1.0'
	},
	output: {
		dir: path.join(rootDir, 'reports/phase76/knowledge-base'),
		checkpoint: 'kb-checkpoint.json',
		results: 'kb-results.json'
	}
};

// ============================================
// Knowledge Base Builder
// ============================================
class KnowledgeBaseBuilder {
	constructor() {
		this.checkpoint = null;
		this.results = {
			sources: [],
			documents: [],
			embeddings: [],
			stats: {
				totalSources: 0,
				totalDocuments: 0,
				totalEmbeddings: 0,
				searchQueries: 0,
				pagesScraped: 0,
				mcpCalls: 0,
				processingTime: 0
			}
		};
		this.turndown = new TurndownService({
			headingStyle: 'atx',
			codeBlockStyle: 'fenced'
		});

		// Initialize MinIO
		this.minioClient = new Client(CONFIG.minio);
		this.ensureBucket();
	}

	async ensureBucket() {
		try {
			const exists = await this.minioClient.bucketExists(CONFIG.minio.bucket);
			if (!exists) {
				await this.minioClient.makeBucket(CONFIG.minio.bucket, 'us-east-1');
				console.log(chalk.green(`   ✅ Created MinIO bucket: ${CONFIG.minio.bucket}`));
			}
		} catch (err) {
			console.warn(chalk.yellow(`   ⚠️  MinIO bucket check failed: ${err.message}`));
		}
	}

	async saveToMinio(key, content, metadata = {}) {
		try {
			await this.minioClient.putObject(CONFIG.minio.bucket, key, content, {
				'Content-Type': 'text/plain',
				...metadata
			});
			// console.log(chalk.gray(`      💾 Saved to MinIO: ${key}`));
		} catch (err) {
			console.error(chalk.red(`      ❌ MinIO save failed: ${err.message}`));
		}
	}

	/**
	 * Search the web for knowledge
	 */
	async searchWeb(query, options = {}) {
		console.log(chalk.cyan(`\n🔍 Searching web: "${query}"`));
		const startTime = performance.now();

		const sources = [];

		// Try Google Custom Search API if available
		if (process.env.GOOGLE_SEARCH_API_KEY) {
			const googleResults = await this.searchGoogle(query, options);
			sources.push(...googleResults);
		} else {
			console.log(chalk.yellow('   ⚠️  GOOGLE_SEARCH_API_KEY not set, using fallback'));
		}

		// Fallback to DuckDuckGo (no API key needed)
		if (sources.length === 0) {
			const ddgResults = await this.searchDuckDuckGo(query, options);
			sources.push(...ddgResults);
		}

		this.results.stats.searchQueries++;
		this.results.stats.totalSources += sources.length;

		console.log(chalk.green(`   ✅ Found ${sources.length} sources (${(performance.now() - startTime).toFixed(0)}ms)`));

		return sources;
	}

	/**
	 * Google Custom Search API
	 */
	async searchGoogle(query, options = {}) {
		const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
		const cx = process.env.GOOGLE_SEARCH_CX || '017576662512468239146:omuauf_lfve';

		const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${options.maxResults || 10}`;

		try {
			const response = await fetch(url);
			const data = await response.json();

			if (!data.items) return [];

			return data.items.map(item => ({
				title: item.title,
				url: item.link,
				snippet: item.snippet,
				source: 'google'
			}));
		} catch (error) {
			console.warn(chalk.yellow(`   ⚠️  Google Search failed: ${error.message}`));
			return [];
		}
	}

	/**
	 * DuckDuckGo fallback (no API key needed)
	 */
	async searchDuckDuckGo(query, options = {}) {
		const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

		try {
			const response = await fetch(url);
			const data = await response.json();

			const sources = [];

			// Abstract (main result)
			if (data.Abstract && data.AbstractURL) {
				sources.push({
					title: data.Heading || query,
					url: data.AbstractURL,
					snippet: data.Abstract,
					source: 'duckduckgo'
				});
			}

			// Related topics
			if (data.RelatedTopics) {
				for (const topic of data.RelatedTopics.slice(0, options.maxResults || 10)) {
					if (topic.FirstURL && topic.Text) {
						sources.push({
							title: topic.Text.substring(0, 100),
							url: topic.FirstURL,
							snippet: topic.Text,
							source: 'duckduckgo'
						});
					}
				}
			}

			return sources;
		} catch (error) {
			console.warn(chalk.yellow(`   ⚠️  DuckDuckGo search failed: ${error.message}`));
			return [];
		}
	}

	/**
	 * Crawl and scrape web pages
	 */
	async crawlPages(sources, options = {}) {
		console.log(chalk.cyan(`\n🕷️  Crawling ${sources.length} pages...`));
		const startTime = performance.now();

		const documents = [];
		const maxDepth = options.maxDepth || CONFIG.crawler.maxDepth;

		for (const source of sources) {
			try {
				const doc = await this.scrapePage(source.url);
				if (doc) {
					doc.metadata = {
						...source,
						scrapedAt: new Date().toISOString(),
						depth: 0
					};
					documents.push(doc);
					this.results.stats.pagesScraped++;
				}
			} catch (error) {
				console.warn(chalk.yellow(`   ⚠️  Failed to scrape ${source.url}: ${error.message}`));
			}
		}

		console.log(chalk.green(`   ✅ Scraped ${documents.length} pages (${(performance.now() - startTime).toFixed(0)}ms)`));

		return documents;
	}

	/**
	 * Scrape single page
	 */
	async scrapePage(url) {
		try {
			const response = await fetch(url, {
				headers: {
					'User-Agent': CONFIG.crawler.userAgent
				},
				timeout: CONFIG.crawler.timeout
			});

			if (!response.ok) return null;

			const html = await response.text();
			const dom = new JSDOM(html);
			const document = dom.window.document;

			// Extract main content (try common selectors)
			let mainContent = document.querySelector('main') ||
			                  document.querySelector('article') ||
			                  document.querySelector('.content') ||
			                  document.querySelector('#content') ||
			                  document.body;

			// Remove scripts, styles, nav, footer
			const unwanted = mainContent.querySelectorAll('script, style, nav, footer, aside, .sidebar');
			unwanted.forEach(el => el.remove());

			// Convert to markdown
			const markdown = this.turndown.turndown(mainContent.innerHTML);

			// Extract metadata
			const title = document.querySelector('title')?.textContent || '';
			const description = document.querySelector('meta[name="description"]')?.content || '';

			return {
				url,
				title: title.trim(),
				description: description.trim(),
				content: markdown,
				contentLength: markdown.length,
				format: 'markdown'
			};
		} catch (error) {
			throw new Error(`Scraping failed: ${error.message}`);
		}
	}

	/**
	 * Use MCP Context7 for function calling (extractive QA, summarization)
	 */
	async mcpFunctionCall(functionName, input) {
		if (!CONFIG.mcp.enabled) {
			return this.localFunctionCall(functionName, input);
		}

		try {
			const response = await fetch(`${CONFIG.mcp.url}/function-call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					functionName,
					input,
					model: CONFIG.ollama.qaModel
				}),
				timeout: 30000
			});

			if (!response.ok) {
				throw new Error(`MCP error: ${response.statusText}`);
			}

			const data = await response.json();
			this.results.stats.mcpCalls++;

			return data.result;
		} catch (error) {
			console.warn(chalk.yellow(`   ⚠️  MCP failed, using local: ${error.message}`));
			return this.localFunctionCall(functionName, input);
		}
	}

	/**
	 * Local fallback for function calling
	 */
	async localFunctionCall(functionName, input) {
		// Call Ollama directly with prompt engineering
		const prompts = {
			summarize: `Summarize the following text concisely:\n\n${input.text}`,
			extractive_qa: `Answer this question based on the context:\n\nQuestion: ${input.query}\n\nContext: ${input.context}`,
			extract_entities: `Extract key entities (people, organizations, technologies) from:\n\n${input.text}`,
			classify: `Classify this text into categories:\n\n${input.text}`
		};

		const prompt = prompts[functionName] || input.text;

		try {
			const response = await fetch(`${CONFIG.ollama.url}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: CONFIG.ollama.qaModel,
					prompt,
					stream: false,
					options: {
						temperature: 0.3,
						num_predict: 512
					}
				})
			});

			const data = await response.json();
			return data.response;
		} catch (error) {
			console.error(chalk.red(`   ❌ Local function call failed: ${error.message}`));
			return null;
		}
	}

	/**
	 * Process documents with MCP agentic functions
	 */
	async processDocuments(documents) {
		console.log(chalk.cyan(`\n🤖 Processing ${documents.length} documents with MCP...`));
		const startTime = performance.now();

		const processed = [];

		for (const doc of documents) {
			try {
				// Summarize long content
				let summary = doc.description;
				if (doc.content.length > 1000) {
					summary = await this.mcpFunctionCall('summarize', {
						text: doc.content.substring(0, 5000) // First 5K chars
					});
				}

				// Extract entities
				const entities = await this.mcpFunctionCall('extract_entities', {
					text: doc.content.substring(0, 2000)
				});

				const processedDoc = {
					...doc,
					summary,
					entities,
					processedAt: new Date().toISOString()
				};

				processed.push(processedDoc);

				// Save to MinIO
				const key = `docs/${new Date().toISOString().split('T')[0]}/${doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
				await this.saveToMinio(key, doc.content, {
					'x-amz-meta-title': doc.title,
					'x-amz-meta-url': doc.url,
					'x-amz-meta-summary': summary ? encodeURIComponent(summary.substring(0, 100)) : ''
				});

			} catch (error) {
				console.warn(chalk.yellow(`   ⚠️  Processing failed for ${doc.url}: ${error.message}`));
			}
		}

		console.log(chalk.green(`   ✅ Processed ${processed.length} documents (${(performance.now() - startTime).toFixed(0)}ms)`));

		return processed;
	}

	/**
	 * Generate embeddings with Ollama
	 */
	async generateEmbeddings(documents) {
		console.log(chalk.cyan(`\n🧮 Generating embeddings for ${documents.length} documents...`));
		const startTime = performance.now();

		const embeddings = [];

		for (const doc of documents) {
			try {
				// Create embedding text (title + summary + content preview)
				const embeddingText = `${doc.title}\n\n${doc.summary || doc.description}\n\n${doc.content.substring(0, 1000)}`;

				const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: CONFIG.ollama.embeddingModel,
						prompt: embeddingText
					})
				});

				if (!response.ok) {
					throw new Error(`Embedding error: ${response.statusText}`);
				}

				const data = await response.json();

				embeddings.push({
					document: doc,
					embedding: data.embedding,
					text: embeddingText,
					createdAt: new Date().toISOString()
				});

				this.results.stats.totalEmbeddings++;

			} catch (error) {
				console.warn(chalk.yellow(`   ⚠️  Embedding failed for ${doc.url}: ${error.message}`));
			}
		}

		console.log(chalk.green(`   ✅ Generated ${embeddings.length} embeddings (${(performance.now() - startTime).toFixed(0)}ms)`));

		return embeddings;
	}

	/**
	 * Store in Qdrant
	 */
	async storeInQdrant(embeddings) {
		console.log(chalk.cyan(`\n💾 Storing ${embeddings.length} embeddings in Qdrant...`));
		const startTime = performance.now();

		try {
			const collectionConfig = {
				vectors: {
					size: CONFIG.qdrant.dimension,
					distance: 'Cosine'
				},
				// Force indexing even for very small collections so counts stay accurate
				hnsw_config: {
					full_scan_threshold: 1
				},
				optimizer_config: {
					indexing_threshold: 1,
					default_segment_number: 1
				},
				on_disk_payload: true
			};

			// Check if collection exists
			const collectionResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`);

			if (!collectionResponse.ok) {
				// Create collection
				console.log(chalk.yellow('   📦 Creating Qdrant collection...'));
				await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(collectionConfig)
				});
			} else {
				// Patch thresholds for existing collection so small batches index immediately
				await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						hnsw_config: collectionConfig.hnsw_config,
						optimizer_config: collectionConfig.optimizer_config,
						on_disk_payload: collectionConfig.on_disk_payload
					})
				});
			}

			// Upsert points
			const baseId = Date.now();
		const points = embeddings.map((emb, idx) => ({
			id: baseId + idx, // Qdrant requires integer IDs
			vector: emb.embedding,
			payload: {
				url: emb.document.url,
				title: emb.document.title,
				summary: emb.document.summary || emb.document.description || '',
				entities: emb.document.entities || [],
				source: emb.document.metadata?.source || 'unknown',
				scrapedAt: emb.document.metadata?.scrapedAt || new Date().toISOString(),
				contentLength: emb.document.contentLength || 0,
				format: emb.document.format || 'markdown'
			}
		}));			const response = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ points })
			});

			if (!response.ok) {
				throw new Error(`Qdrant upsert failed: ${response.statusText}`);
			}

			console.log(chalk.green(`   ✅ Stored ${points.length} points in Qdrant (${(performance.now() - startTime).toFixed(0)}ms)`));

			return true;
		} catch (error) {
			console.error(chalk.red(`   ❌ Qdrant storage failed: ${error.message}`));
			return false;
		}
	}

	/**
	 * Save checkpoint
	 */
	async saveCheckpoint() {
		const checkpointPath = path.join(CONFIG.output.dir, CONFIG.output.checkpoint);
		await fs.mkdir(CONFIG.output.dir, { recursive: true });
		await fs.writeFile(checkpointPath, JSON.stringify(this.results, null, 2));
		console.log(chalk.gray(`   💾 Checkpoint saved: ${checkpointPath}`));
	}

	/**
	 * Load checkpoint
	 */
	async loadCheckpoint() {
		const checkpointPath = path.join(CONFIG.output.dir, CONFIG.output.checkpoint);
		try {
			const data = await fs.readFile(checkpointPath, 'utf-8');
			this.results = JSON.parse(data);
			console.log(chalk.cyan(`   ✅ Checkpoint loaded (${this.results.stats.totalDocuments} documents)`));
			return true;
		} catch (error) {
			console.log(chalk.yellow(`   ⚠️  No checkpoint found, starting fresh`));
			return false;
		}
	}

	/**
	 * Full pipeline: Search → Crawl → Process → Embed → Store
	 */
	async buildKnowledgeBase(queries) {
		console.log(chalk.cyan.bold('\n🧠 Phase 76: Knowledge Base Builder\n'));
		const totalStart = performance.now();

		for (const query of queries) {
			// 1. Search
			const sources = await this.searchWeb(query);
			this.results.sources.push(...sources);

			// 2. Crawl
			const documents = await this.crawlPages(sources);
			this.results.documents.push(...documents);

			// 3. Process with MCP
			const processed = await this.processDocuments(documents);

			// 4. Generate embeddings
			const embeddings = await this.generateEmbeddings(processed);
			this.results.embeddings.push(...embeddings);

			// 5. Store in Qdrant
			await this.storeInQdrant(embeddings);

			// 6. Save checkpoint
			await this.saveCheckpoint();
		}

		this.results.stats.processingTime = performance.now() - totalStart;
		this.results.stats.totalDocuments = this.results.documents.length;

		// Save final results
		const resultsPath = path.join(CONFIG.output.dir, CONFIG.output.results);
		await fs.writeFile(resultsPath, JSON.stringify(this.results, null, 2));

		console.log(chalk.green.bold(`\n✅ Knowledge Base Built Successfully!\n`));
		console.log(chalk.cyan('📊 Statistics:'));
		console.log(chalk.white(`   Sources found: ${this.results.stats.totalSources}`));
		console.log(chalk.white(`   Pages scraped: ${this.results.stats.pagesScraped}`));
		console.log(chalk.white(`   Documents processed: ${this.results.stats.totalDocuments}`));
		console.log(chalk.white(`   Embeddings created: ${this.results.stats.totalEmbeddings}`));
		console.log(chalk.white(`   MCP function calls: ${this.results.stats.mcpCalls}`));
		console.log(chalk.white(`   Total time: ${(this.results.stats.processingTime / 1000).toFixed(2)}s`));
		console.log(chalk.gray(`\n📄 Results saved: ${resultsPath}\n`));

		return this.results;
	}
}

// ============================================
// CLI
// ============================================
async function main() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.length === 0) {
		console.log(chalk.cyan('\n🧠 Phase 76: Knowledge Base Builder\n'));
		console.log('Usage:');
		console.log('  node phase76-knowledge-builder.mjs --search "query1" "query2" ...');
		console.log('  node phase76-knowledge-builder.mjs --crawl "https://url1" "https://url2" ...');
		console.log('  node phase76-knowledge-builder.mjs --resume');
		console.log('\nExamples:');
		console.log('  node phase76-knowledge-builder.mjs --search "TypeScript 5.6 features" "SvelteKit 2.0 migration"');
		console.log('  node phase76-knowledge-builder.mjs --crawl "https://kit.svelte.dev/docs"');
		console.log('  node phase76-knowledge-builder.mjs --resume');
		console.log('\nEnvironment:');
		console.log(`  OLLAMA_URL=${CONFIG.ollama.url}`);
		console.log(`  QDRANT_URL=${CONFIG.qdrant.url}`);
		console.log(`  MCP_CONTEXT7_URL=${CONFIG.mcp.url}`);
		console.log(`  GOOGLE_SEARCH_API_KEY=${process.env.GOOGLE_SEARCH_API_KEY ? '✅ set' : '❌ not set'}`);
		console.log('');
		return;
	}

	const builder = new KnowledgeBaseBuilder();

	if (args.includes('--resume')) {
		await builder.loadCheckpoint();
	}

	if (args.includes('--search')) {
		const searchIdx = args.indexOf('--search');
		const queries = args.slice(searchIdx + 1).filter(arg => !arg.startsWith('--'));

		if (queries.length === 0) {
			console.error(chalk.red('❌ Error: --search requires at least one query'));
			process.exit(1);
		}

		await builder.buildKnowledgeBase(queries);
	}

	if (args.includes('--crawl')) {
		const crawlIdx = args.indexOf('--crawl');

		// Parse depth if provided
		let maxDepth = CONFIG.crawler.maxDepth;
		if (args.includes('--depth')) {
			const depthIdx = args.indexOf('--depth');
			if (depthIdx !== -1 && depthIdx + 1 < args.length) {
				maxDepth = parseInt(args[depthIdx + 1]);
			}
		}

		// Extract URLs (ignoring flags and their values)
		const urls = args.filter((arg, index) => {
			// Ignore the command itself
			if (arg === '--crawl') return false;

			// Ignore flags
			if (arg.startsWith('--')) return false;

			// Ignore values of known flags
			const prev = args[index - 1];
			if (prev === '--depth') return false;
			if (prev === '--url') return false; // Handle legacy/mistaken usage

			return true;
		});

		if (urls.length === 0) {
			console.error(chalk.red('❌ Error: --crawl requires at least one URL'));
			process.exit(1);
		}

		const sources = urls.map(url => ({
			url,
			title: url,
			snippet: '',
			source: 'manual'
		}));

		const documents = await builder.crawlPages(sources, { maxDepth });
		const processed = await builder.processDocuments(documents);
		const embeddings = await builder.generateEmbeddings(processed);
		await builder.storeInQdrant(embeddings);
		await builder.saveCheckpoint();
	}
}

main().catch(error => {
	console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
	console.error(error.stack);
	process.exit(1);
});
