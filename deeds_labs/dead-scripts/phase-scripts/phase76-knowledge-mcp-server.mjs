/**
 * 🔌 Phase 76: FastMCP Knowledge Search Server
 *
 * Exposes the Knowledge Search Engine as MCP (Model Context Protocol) tools
 * for use by AI agents like Claude, Gemini, and local LLMs.
 *
 * MCP Tools:
 * - knowledge:search - Semantic search with optional LLM synthesis
 * - knowledge:document - Retrieve specific document by ID
 * - knowledge:stats - Get collection statistics
 * - knowledge:index - Index new documents
 * - knowledge:tag - Extract and manage tags
 *
 * Usage:
 *   node scripts/phase76-knowledge-mcp-server.mjs
 *   npm run phase76:knowledge:mcp
 *
 * Port: 3004 (configurable via MCP_KNOWLEDGE_PORT)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import chalk from 'chalk';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { Client } from 'minio';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = parseInt(process.env.MCP_KNOWLEDGE_PORT || '3004');
const COLLECTION = 'knowledge_base';

// ═══════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════
const CONFIG = {
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: COLLECTION
	},
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		embeddingModel: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest',
		chatModel: process.env.OLLAMA_MODEL || 'gemma3-legal:latest'
	},
	minio: {
		endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
		port: parseInt(process.env.MINIO_ENDPOINT?.split(':')[1] || '9000'),
		useSSL: process.env.MINIO_USE_SSL === 'true',
		accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
		secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
		bucket: 'knowledge-base'
	}
};

const qdrant = new QdrantClient({ url: CONFIG.qdrant.url });
const minioClient = new Client(CONFIG.minio);

// Ensure bucket exists
(async () => {
	try {
		const exists = await minioClient.bucketExists(CONFIG.minio.bucket);
		if (!exists) {
			await minioClient.makeBucket(CONFIG.minio.bucket, 'us-east-1');
			console.log(chalk.green(`   ✅ Created MinIO bucket: ${CONFIG.minio.bucket}`));
		}
	} catch (err) {
		console.warn(chalk.yellow(`   ⚠️  MinIO bucket check failed: ${err.message}`));
	}
})();

// ═══════════════════════════════════════════════════════════════════════
// MCP Tool Registry
// ═══════════════════════════════════════════════════════════════════════
const MCP_TOOLS = {
	'knowledge:search': {
		description: 'Search the knowledge base using semantic similarity. Returns ranked results with optional LLM synthesis.',
		parameters: {
			query: { type: 'string', required: true, description: 'Search query' },
			topK: { type: 'number', required: false, description: 'Number of results (default: 10)' },
			threshold: { type: 'number', required: false, description: 'Similarity threshold (default: 0.5)' },
			synthesize: { type: 'boolean', required: false, description: 'Generate AI summary (default: false)' },
			tags: { type: 'array', required: false, description: 'Filter by tags' }
		}
	},
	'knowledge:document': {
		description: 'Retrieve a specific document by ID',
		parameters: {
			id: { type: 'string', required: true, description: 'Document ID' }
		}
	},
	'knowledge:stats': {
		description: 'Get knowledge base statistics (document count, last updated, etc.)',
		parameters: {}
	},
	'knowledge:index': {
		description: 'Index a new document into the knowledge base',
		parameters: {
			url: { type: 'string', required: true, description: 'Document URL' },
			title: { type: 'string', required: true, description: 'Document title' },
			content: { type: 'string', required: true, description: 'Document content' },
			summary: { type: 'string', required: false, description: 'Optional summary' },
			tags: { type: 'array', required: false, description: 'Optional tags' }
		}
	},
	'knowledge:crawl': {
		description: 'Crawl and index a URL',
		parameters: {
			url: { type: 'string', required: true, description: 'URL to crawl' }
		}
	}
};

// ═══════════════════════════════════════════════════════════════════════
// Embedding Generation
// ═══════════════════════════════════════════════════════════════════════
async function generateEmbedding(text) {
	const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: CONFIG.ollama.embeddingModel,
			prompt: text.substring(0, 8000) // Limit to avoid overflow
		})
	});

	if (!response.ok) {
		throw new Error(`Embedding failed: ${response.statusText}`);
	}

	const data = await response.json();
	return data.embedding;
}

// ═══════════════════════════════════════════════════════════════════════
// Tool Implementations
// ═══════════════════════════════════════════════════════════════════════

/**
 * knowledge:search - Semantic search with optional synthesis
 */
async function toolSearch(params) {
	const { query, topK = 10, threshold = 0.5, synthesize = false, tags } = params;

	// Generate query embedding
	const embedding = await generateEmbedding(query);

	// Build filter if tags provided
	let filter = undefined;
	if (tags && tags.length > 0) {
		filter = {
			should: tags.map(tag => ({
				key: 'tags',
				match: { value: tag }
			}))
		};
	}

	// Search Qdrant
	const searchResult = await qdrant.search(COLLECTION, {
		vector: embedding,
		limit: topK,
		score_threshold: threshold,
		with_payload: true,
		filter
	});

	const results = searchResult.map(item => ({
		id: item.id,
		score: item.score,
		title: item.payload.title,
		url: item.payload.url,
		summary: item.payload.summary,
		tags: item.payload.tags || [],
		scrapedAt: item.payload.scrapedAt
	}));

	// Optional LLM synthesis
	let synthesized = undefined;
	if (synthesize && results.length > 0) {
		const context = results
			.slice(0, 5)
			.map((r, i) => `[${i + 1}] ${r.title}: ${r.summary}`)
			.join('\n\n');

		const prompt = `Based on the following documentation, answer this question: "${query}"\n\nContext:\n${context}\n\nAnswer:`;

		const llmResponse = await fetch(`${CONFIG.ollama.url}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.ollama.chatModel,
				prompt,
				stream: false,
				options: { temperature: 0.3, num_predict: 1024 }
			})
		});

		if (llmResponse.ok) {
			const llmData = await llmResponse.json();
			synthesized = llmData.response;
		}
	}

	return {
		query,
		results,
		synthesized,
		metadata: {
			totalResults: results.length,
			collection: COLLECTION,
			threshold
		}
	};
}

/**
 * knowledge:document - Get document by ID
 */
async function toolDocument(params) {
	const { id } = params;

	try {
		const points = await qdrant.retrieve(COLLECTION, {
			ids: [parseInt(id) || id],
			with_payload: true,
			with_vector: false
		});

		if (points.length === 0) {
			return { error: 'Document not found', id };
		}

		const doc = points[0];
		return {
			id: doc.id,
			title: doc.payload.title,
			url: doc.payload.url,
			summary: doc.payload.summary,
			content: doc.payload.content,
			tags: doc.payload.tags || [],
			scrapedAt: doc.payload.scrapedAt
		};
	} catch (error) {
		return { error: error.message, id };
	}
}

/**
 * knowledge:stats - Collection statistics
 */
async function toolStats() {
	try {
		const info = await qdrant.getCollection(COLLECTION);
		return {
			collection: COLLECTION,
			vectorsCount: info.vectors_count,
			pointsCount: info.points_count,
			status: info.status,
			config: {
				vectorSize: info.config?.params?.vectors?.size,
				distance: info.config?.params?.vectors?.distance
			}
		};
	} catch (error) {
		return { error: error.message, collection: COLLECTION };
	}
}

/**
 * knowledge:index - Index new document
 */
async function toolIndex(params) {
	const { url, title, content, summary, tags = [] } = params;

	// Generate embedding
	const textToEmbed = `${title}\n${summary || ''}\n${content.substring(0, 2000)}`;
	const embedding = await generateEmbedding(textToEmbed);

	// Get next ID
	const info = await qdrant.getCollection(COLLECTION);
	const nextId = (info.points_count || 0) + 1;

	// Upsert to Qdrant
	await qdrant.upsert(COLLECTION, {
		wait: true,
		points: [{
			id: nextId,
			vector: embedding,
			payload: {
				url,
				title,
				summary: summary || content.substring(0, 500),
				content,
				tags,
				scrapedAt: new Date().toISOString(),
				source: 'mcp-index'
			}
		}]
	});

	// Save to MinIO
	try {
		const key = `docs/${new Date().toISOString().split('T')[0]}/${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
		await minioClient.putObject(CONFIG.minio.bucket, key, content, {
			'x-amz-meta-title': title,
			'x-amz-meta-url': url,
			'x-amz-meta-summary': summary ? encodeURIComponent(summary.substring(0, 100)) : ''
		});
		console.log(chalk.gray(`   💾 Saved to MinIO: ${key}`));
	} catch (err) {
		console.error(chalk.red(`   ❌ MinIO save failed: ${err.message}`));
	}

	return {
		success: true,
		id: nextId,
		title,
		url
	};
}

// ═══════════════════════════════════════════════════════════════════════
// Express Routes
// ═══════════════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
	res.json({
		status: 'ok',
		service: 'phase76-knowledge-mcp',
		tools: Object.keys(MCP_TOOLS),
		version: '1.0.0'
	});
});

// List available tools (MCP discovery)
app.get('/tools', (req, res) => {
	res.json({
		tools: Object.entries(MCP_TOOLS).map(([name, config]) => ({
			name,
			...config
		}))
	});
});

// Execute tool (MCP invoke)
app.post('/invoke', async (req, res) => {
	const startTime = Date.now();
	const { tool, params = {} } = req.body;

	if (!tool) {
		return res.status(400).json({ error: 'Tool name is required' });
	}

	if (!MCP_TOOLS[tool]) {
		return res.status(404).json({
			error: `Unknown tool: ${tool}`,
			availableTools: Object.keys(MCP_TOOLS)
		});
	}

	try {
		let result;

		switch (tool) {
			case 'knowledge:search':
				result = await toolSearch(params);
				break;
			case 'knowledge:document':
				result = await toolDocument(params);
				break;
			case 'knowledge:stats':
				result = await toolStats();
				break;
			case 'knowledge:index':
				result = await toolIndex(params);
				break;
			default:
				result = { error: 'Tool not implemented' };
		}

		res.json({
			tool,
			result,
			metadata: {
				latencyMs: Date.now() - startTime,
				timestamp: new Date().toISOString()
			}
		});

	} catch (error) {
		console.error(chalk.red(`Tool ${tool} error:`), error.message);
		res.status(500).json({
			tool,
			error: error.message,
			metadata: {
				latencyMs: Date.now() - startTime,
				timestamp: new Date().toISOString()
			}
		});
	}
});

// Shorthand routes for common tools
app.post('/search', async (req, res) => {
	req.body = { tool: 'knowledge:search', params: req.body };
	return app._router.handle(req, res, () => {});
});

app.get('/stats', async (req, res) => {
	try {
		const result = await toolStats();
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ═══════════════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
	console.log(chalk.cyan.bold('\n🔌 Phase 76: Knowledge Search MCP Server\n'));
	console.log(chalk.gray(`   Port: ${PORT}`));
	console.log(chalk.gray(`   Qdrant: ${CONFIG.qdrant.url}`));
	console.log(chalk.gray(`   Collection: ${COLLECTION}`));
	console.log(chalk.gray(`   Ollama: ${CONFIG.ollama.url}`));
	console.log('');
	console.log(chalk.cyan('📋 Available MCP Tools:'));
	Object.keys(MCP_TOOLS).forEach(tool => {
		console.log(chalk.gray(`   • ${tool}`));
	});
	console.log('');
	console.log(chalk.green('✅ Ready for agent connections\n'));
});

// Graceful shutdown
process.on('SIGINT', () => {
	console.log(chalk.yellow('\n👋 Shutting down MCP server...'));
	process.exit(0);
});
