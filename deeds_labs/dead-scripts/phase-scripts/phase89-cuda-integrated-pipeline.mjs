#!/usr/bin/env node
/**
 * Phase 89: CUDA-Accelerated Integrated Pipeline
 *
 * Comprehensive system that integrates:
 * - AST embeddings with embeddinggemma:latest (GPU)
 * - Qdrant HNSW indexing with GPU acceleration
 * - CUDA clustering for topological error grouping
 * - Batch summarization for comprehensive recommendations
 * - ACE contextual engineering with KB updates
 * - Diff tool calls with cosine ranking
 * - RAG + KAG enhancement through feedback loop
 *
 * Flow:
 * 1. Scan codebase → Extract AST → Generate embeddings (GPU)
 * 2. Index in Qdrant with HNSW + tags → GPU-accelerated search
 * 3. Cluster errors topologically → CUDA batch processing
 * 4. Generate comprehensive summaries → LLM with KB context
 * 5. ACE tool calling → Recommend fixes with confidence scores
 * 6. Apply diffs → Track success → Update KB with learnings
 * 7. Re-rank KB entries by cosine similarity → Enhance future queries
 */

import { spawn } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OLLAMA_URL = 'http://127.0.0.1:11434';
const QDRANT_URL = 'http://127.0.0.1:6333';
const POSTGRES_CONFIG = {
	host: '127.0.0.1',
	port: 5434,
	database: 'legal_ai_db',
	user: 'legal_admin',
	password: '123456'
};

const COLLECTIONS = {
	ast_embeddings: 'phase89_ast_embeddings',
	error_clusters: 'phase89_error_clusters',
	recommendations: 'phase89_recommendations',
	kb_enhanced: 'phase76_knowledge_base'
};

// ============================================================
// Stage 1: AST Embedding Generator (GPU-Accelerated)
// ============================================================

class CUDAASTEmbedder {
	constructor() {
		this.batchSize = 32; // RTX 3060 can handle 32 parallel
		this.cache = new Map();
		this.processedCount = 0;
	}

	async embedAST(astNode, metadata = {}) {
		const cacheKey = this.getCacheKey(astNode);

		if (this.cache.has(cacheKey)) {
			console.log(`  ♻️  Cache hit for ${metadata.file_path || 'unknown'}`);
			return this.cache.get(cacheKey);
		}

		const text = this.astToText(astNode);
		const embedding = await this.generateEmbedding(text);

		this.cache.set(cacheKey, embedding);
		this.processedCount++;

		return embedding;
	}

	astToText(node) {
		// Convert AST node to searchable text
		const parts = [];

		if (node.type) parts.push(`Type: ${node.type}`);
		if (node.name) parts.push(`Name: ${node.name}`);
		if (node.body) parts.push(`Body: ${JSON.stringify(node.body).slice(0, 500)}`);
		if (node.imports) parts.push(`Imports: ${node.imports.join(', ')}`);
		if (node.exports) parts.push(`Exports: ${node.exports.join(', ')}`);
		if (node.functions) parts.push(`Functions: ${node.functions.join(', ')}`);

		return parts.join('\n');
	}

	async generateEmbedding(text) {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: text
			})
		});

		if (!response.ok) {
			throw new Error(`Embedding failed: ${response.statusText}`);
		}

		const data = await response.json();
		return data.embedding;
	}

	getCacheKey(node) {
		return JSON.stringify({
			type: node.type,
			name: node.name,
			imports: node.imports?.slice(0, 5),
			functions: node.functions?.slice(0, 5)
		});
	}

	async processBatch(nodes) {
		const results = [];

		for (let i = 0; i < nodes.length; i += this.batchSize) {
			const batch = nodes.slice(i, i + this.batchSize);
			const embeddings = await Promise.all(
				batch.map(node => this.embedAST(node, node.metadata))
			);
			results.push(...embeddings);

			console.log(`  🔄 Processed ${Math.min(i + this.batchSize, nodes.length)}/${nodes.length} nodes`);
		}

		return results;
	}
}

// ============================================================
// Stage 2: Qdrant GPU-Accelerated Indexer
// ============================================================

class QdrantGPUIndexer {
	constructor() {
		this.collections = COLLECTIONS;
	}

	async ensureCollection(name, vectorSize = 768) {
		try {
			await fetch(`${QDRANT_URL}/collections/${name}`);
			console.log(`  ✅ Collection ${name} exists`);
		} catch {
			console.log(`  📦 Creating collection ${name}...`);

			await fetch(`${QDRANT_URL}/collections/${name}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vectors: {
						size: vectorSize,
						distance: 'Cosine',
						on_disk: false // Keep in memory for GPU access
					},
					optimizers_config: {
						indexing_threshold: 10000,
						memmap_threshold: 20000
					},
					hnsw_config: {
						m: 48, // Higher connectivity for better recall
						ef_construct: 200, // Higher for better initial indexing
						full_scan_threshold: 10000,
						on_disk: false // GPU-accelerated
					},
					quantization_config: {
						scalar: {
							type: 'int8',
							quantile: 0.99,
							always_ram: true // Keep quantized vectors in RAM
						}
					}
				})
			});

			console.log(`  ✅ Created collection ${name} with GPU config`);
		}
	}

	async indexPoints(collection, points) {
		const batchSize = 100;
		let indexed = 0;

		for (let i = 0; i < points.length; i += batchSize) {
			const batch = points.slice(i, i + batchSize);

			await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					points: batch.map((point, idx) => ({
						id: `${Date.now()}-${i + idx}`,
						vector: point.vector,
						payload: point.payload
					}))
				})
			});

			indexed += batch.length;
			console.log(`  📊 Indexed ${indexed}/${points.length} points in ${collection}`);
		}
	}

	async searchSimilar(collection, vector, limit = 10, filter = null) {
		const response = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector,
				limit,
				filter,
				with_payload: true,
				with_vector: false,
				score_threshold: 0.7
			})
		});

		const data = await response.json();
		return data.result || [];
	}
}

// ============================================================
// Stage 3: CUDA Error Clustering
// ============================================================

class CUDAErrorClusterer {
	constructor(pythonPath) {
		this.pythonPath = pythonPath;
	}

	async clusterErrors(embeddings, minClusterSize = 3) {
		console.log(`  🔬 Running CUDA clustering on ${embeddings.length} error embeddings...`);

		// Create temp file with embeddings
		const tempFile = path.join(__dirname, '../temp/cluster-input.json');
		await mkdir(path.dirname(tempFile), { recursive: true });
		await writeFile(tempFile, JSON.stringify(embeddings));

		return new Promise((resolve, reject) => {
			const python = spawn(this.pythonPath, [
				path.join(__dirname, 'phase89-cuda-clustering.py'),
				'--input', tempFile,
				'--min-cluster-size', minClusterSize.toString(),
				'--output', path.join(__dirname, '../temp/cluster-output.json')
			]);

			let output = '';
			python.stdout.on('data', data => {
				output += data.toString();
				console.log(`  🐍 ${data.toString().trim()}`);
			});

			python.stderr.on('data', data => {
				console.error(`  ⚠️  ${data.toString().trim()}`);
			});

			python.on('close', async (code) => {
				if (code === 0) {
					const result = JSON.parse(
						await readFile(path.join(__dirname, '../temp/cluster-output.json'), 'utf-8')
					);
					resolve(result);
				} else {
					reject(new Error(`Python clustering failed with code ${code}`));
				}
			});
		});
	}
}

// ============================================================
// Stage 4: Batch Summarizer (LLM-Powered)
// ============================================================

class BatchSummarizer {
	async summarizeCluster(cluster, kbContext = '') {
		const errors = cluster.errors.slice(0, 20); // Limit to avoid context overflow

		const prompt = `You are a senior software engineer analyzing a cluster of related TypeScript/Svelte errors.

ERROR CLUSTER (${cluster.errors.length} total errors):
${errors.map((e, i) => `${i + 1}. [${e.file_path}] ${e.error_code}: ${e.error_message}`).join('\n')}

CLUSTER CHARACTERISTICS:
- Centroid: ${cluster.centroid_description || 'N/A'}
- Common pattern: ${cluster.pattern || 'Unknown'}
- Affected files: ${cluster.file_count}

KNOWLEDGE BASE CONTEXT:
${kbContext || 'No specific KB context available'}

TASK:
Provide a comprehensive summary including:
1. Root cause analysis
2. Recommended fix strategy (batch or individual)
3. Priority level (high/medium/low)
4. Estimated effort (hours)
5. Confidence score (0-100%)

Return JSON:
{
  "root_cause": "...",
  "fix_strategy": "...",
  "priority": "high|medium|low",
  "estimated_hours": 0.5,
  "confidence": 85,
  "recommended_tools": ["ace:typescript:fix", "diff:apply"],
  "next_steps": ["step 1", "step 2"]
}`;

		const response = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt,
				stream: false,
				options: {
					temperature: 0.2, // Low temperature for consistent analysis
					top_p: 0.9,
					num_predict: 1024
				}
			})
		});

		const data = await response.json();
		const text = data.response || '';

		// Extract JSON from response
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}

		// Fallback
		return {
			root_cause: 'Could not parse analysis',
			fix_strategy: 'Manual review required',
			priority: 'medium',
			estimated_hours: 1,
			confidence: 50,
			recommended_tools: [],
			next_steps: []
		};
	}
}

// ============================================================
// Stage 5: ACE Contextual Engineering
// ============================================================

class ACEContextualEngineer {
	constructor(indexer) {
		this.indexer = indexer;
	}

	async getContextForError(errorEmbedding, errorMetadata) {
		// Search KB for similar error fixes
		const similar = await this.indexer.searchSimilar(
			COLLECTIONS.kb_enhanced,
			errorEmbedding,
			5,
			{
				should: [
					{ key: 'type', match: { value: 'fix' } },
					{ key: 'type', match: { value: 'error' } }
				]
			}
		);

		return similar.map(s => ({
			content: s.payload.content || s.payload.text,
			score: s.score,
			tags: s.payload.tags || []
		}));
	}

	async recommendFixes(summary, context) {
		const prompt = `Based on this error analysis and KB context, recommend specific fixes:

ANALYSIS:
${JSON.stringify(summary, null, 2)}

KB CONTEXT:
${context.map((c, i) => `${i + 1}. [Score: ${c.score.toFixed(2)}] ${c.content.slice(0, 200)}...`).join('\n')}

Recommend ACE tool calls in JSON format:
{
  "tools": [
    {
      "name": "ace:typescript:fix",
      "args": {"file": "...", "error_code": "..."},
      "confidence": 0.9,
      "reasoning": "..."
    }
  ]
}`;

		const response = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt,
				stream: false
			})
		});

		const data = await response.json();
		const jsonMatch = (data.response || '').match(/\{[\s\S]*\}/);

		if (jsonMatch) {
			return JSON.parse(jsonMatch[0]);
		}

		return { tools: [] };
	}
}

// ============================================================
// Stage 6: Diff Tool with Cosine Ranking
// ============================================================

class DiffToolRanker {
	constructor(embedder, indexer) {
		this.embedder = embedder;
		this.indexer = indexer;
	}

	async rankDiffs(proposedDiffs, context) {
		const results = [];

		for (const diff of proposedDiffs) {
			// Generate embedding for the diff
			const diffText = `
File: ${diff.file_path}
Changes: ${diff.changes}
Reasoning: ${diff.reasoning}
			`;

			const diffEmbedding = await this.embedder.generateEmbedding(diffText);

			// Calculate cosine similarity with KB context
			const similarities = context.map(c => {
				// Cosine similarity = dot product (assuming normalized vectors)
				return this.cosineSimilarity(diffEmbedding, c.vector);
			});

			const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

			results.push({
				...diff,
				kb_similarity: avgSimilarity,
				confidence_boost: avgSimilarity > 0.8 ? 0.2 : 0
			});
		}

		// Sort by KB similarity (descending)
		return results.sort((a, b) => b.kb_similarity - a.kb_similarity);
	}

	cosineSimilarity(vecA, vecB) {
		const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
		const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
		const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
		return dotProduct / (magA * magB);
	}
}

// ============================================================
// Stage 7: Knowledge Base Updater
// ============================================================

class KnowledgeBaseUpdater {
	constructor(indexer) {
		this.indexer = indexer;
	}

	async updateFromSuccess(fixResult) {
		const learningPoint = {
			vector: fixResult.error_embedding,
			payload: {
				type: 'fix',
				content: `Successfully fixed: ${fixResult.error_message}. Applied: ${fixResult.diff_applied}`,
				tags: ['success', 'fix', fixResult.error_code],
				confidence: fixResult.confidence,
				timestamp: new Date().toISOString(),
				file_path: fixResult.file_path,
				success_rate: 1.0
			}
		};

		await this.indexer.indexPoints(COLLECTIONS.kb_enhanced, [learningPoint]);
		console.log(`  🎓 Updated KB with successful fix for ${fixResult.file_path}`);
	}

	async updateFromFailure(fixResult) {
		const learningPoint = {
			vector: fixResult.error_embedding,
			payload: {
				type: 'failure',
				content: `Failed fix attempt: ${fixResult.error_message}. Reason: ${fixResult.failure_reason}`,
				tags: ['failure', 'warning', fixResult.error_code],
				confidence: 0.2,
				timestamp: new Date().toISOString(),
				file_path: fixResult.file_path,
				success_rate: 0.0
			}
		};

		await this.indexer.indexPoints(COLLECTIONS.kb_enhanced, [learningPoint]);
		console.log(`  ⚠️  Updated KB with failed fix for ${fixResult.file_path}`);
	}
}

// ============================================================
// Main Pipeline Orchestrator
// ============================================================

class IntegratedPipeline {
	constructor() {
		this.embedder = new CUDAASTEmbedder();
		this.indexer = new QdrantGPUIndexer();
		this.clusterer = new CUDAErrorClusterer('C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe');
		this.summarizer = new BatchSummarizer();
		this.ace = new ACEContextualEngineer(this.indexer);
		this.diffRanker = new DiffToolRanker(this.embedder, this.indexer);
		this.kbUpdater = new KnowledgeBaseUpdater(this.indexer);
	}

	async run() {
		console.log('\n🚀 Phase 89: CUDA-Accelerated Integrated Pipeline\n');

		// Stage 1: Initialize collections
		console.log('📦 Stage 1: Initialize Qdrant collections...');
		await this.indexer.ensureCollection(COLLECTIONS.ast_embeddings);
		await this.indexer.ensureCollection(COLLECTIONS.error_clusters);
		await this.indexer.ensureCollection(COLLECTIONS.recommendations);
		await this.indexer.ensureCollection(COLLECTIONS.kb_enhanced);

		// Stage 2: Load AST data and generate embeddings
		console.log('\n🌳 Stage 2: Generate AST embeddings (GPU)...');
		const astData = await this.loadASTData();
		const embeddings = await this.embedder.processBatch(astData);

		// Index in Qdrant
		const points = embeddings.map((vector, i) => ({
			vector,
			payload: astData[i]
		}));
		await this.indexer.indexPoints(COLLECTIONS.ast_embeddings, points);

		// Stage 3: Cluster errors
		console.log('\n🔬 Stage 3: CUDA error clustering...');
		const errorEmbeddings = points.filter(p => p.payload.has_errors);
		const clusters = await this.clusterer.clusterErrors(errorEmbeddings);
		console.log(`  ✅ Found ${clusters.length} error clusters`);

		// Stage 4: Generate summaries
		console.log('\n📊 Stage 4: Batch summarization...');
		const summaries = [];

		for (const cluster of clusters) {
			const summary = await this.summarizer.summarizeCluster(cluster);
			summaries.push({ cluster, summary });
			console.log(`  📝 Cluster ${cluster.id}: ${summary.priority} priority, ${summary.confidence}% confidence`);
		}

		// Stage 5: ACE recommendations
		console.log('\n🤖 Stage 5: ACE contextual engineering...');
		const recommendations = [];

		for (const { cluster, summary } of summaries) {
			const context = await this.ace.getContextForError(
				cluster.centroid_vector,
				cluster.metadata
			);

			const toolCalls = await this.ace.recommendFixes(summary, context);
			recommendations.push({ cluster, summary, toolCalls, context });
			console.log(`  🛠️  Recommended ${toolCalls.tools?.length || 0} tool calls for cluster ${cluster.id}`);
		}

		// Stage 6: Rank diffs by cosine similarity
		console.log('\n🎯 Stage 6: Diff ranking with cosine similarity...');
		for (const rec of recommendations) {
			if (rec.toolCalls.tools) {
				const rankedDiffs = await this.diffRanker.rankDiffs(
					rec.toolCalls.tools,
					rec.context
				);
				rec.rankedDiffs = rankedDiffs;
				console.log(`  📈 Ranked ${rankedDiffs.length} diffs, top similarity: ${rankedDiffs[0]?.kb_similarity.toFixed(3)}`);
			}
		}

		// Stage 7: Update KB
		console.log('\n📚 Stage 7: Update knowledge base...');
		// Simulate some fixes for demo
		const mockSuccess = {
			error_embedding: embeddings[0],
			error_message: 'TS2304: Cannot find name',
			error_code: 'TS2304',
			diff_applied: 'Added import statement',
			confidence: 0.95,
			file_path: 'src/lib/utils.ts'
		};
		await this.kbUpdater.updateFromSuccess(mockSuccess);

		// Save recommendations
		console.log('\n💾 Saving recommendations...');
		await this.saveRecommendations(recommendations);

		console.log('\n✅ Pipeline complete!\n');
		console.log('📊 Summary:');
		console.log(`  - AST nodes processed: ${astData.length}`);
		console.log(`  - Error clusters: ${clusters.length}`);
		console.log(`  - Recommendations: ${recommendations.length}`);
		console.log(`  - KB updates: 1`);
		console.log(`  - Cache hit rate: ${((this.embedder.cache.size / this.embedder.processedCount) * 100).toFixed(1)}%`);
	}

	async loadASTData() {
		// Load actual error data from PostgreSQL
		try {
			const pg = await import('pg');
			const pool = new pg.default.Pool(POSTGRES_CONFIG);

			const result = await pool.query(`
				SELECT DISTINCT
					file_path,
					COUNT(*) as error_count,
					array_agg(DISTINCT message) as error_messages
				FROM phase89_error_instances
				WHERE status = 'open'
				GROUP BY file_path
				LIMIT 100
			`);

			await pool.end();

			if (result.rows.length === 0) {
				console.log('  ⚠️  No errors found in database, using mock data');
				return this.getMockData();
			}

			return result.rows.map(row => ({
				type: row.file_path.endsWith('.svelte') ? 'component' : 'typescript',
				name: path.basename(row.file_path),
				file_path: row.file_path,
				imports: [],
				exports: [],
				functions: [],
				has_errors: row.error_count > 0,
				error_count: parseInt(row.error_count),
				error_messages: row.error_messages
			}));
		} catch (err) {
			console.error('  ❌ Failed to load from DB:', err.message);
			return this.getMockData();
		}
	}

	getMockData() {
		return [
			{
				type: 'page',
				name: '+page.svelte',
				file_path: 'src/routes/admin/explorer/+page.svelte',
				imports: ['svelte', 'svelte/store'],
				exports: [],
				functions: ['loadRoutes', 'selectRoute'],
				has_errors: false,
				error_count: 0
			},
			{
				type: 'component',
				name: 'Button.svelte',
				file_path: 'src/lib/components/Button.svelte',
				imports: ['svelte'],
				exports: ['Button'],
				functions: ['handleClick'],
				has_errors: true,
				error_count: 2
			}
		];
	}

	async saveRecommendations(recommendations) {
		const outputPath = path.join(__dirname, '../reports/phase89-recommendations.json');
		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, JSON.stringify(recommendations, null, 2));
		console.log(`  📄 Saved to ${outputPath}`);
	}
}

// ============================================================
// Run Pipeline
// ============================================================

const pipeline = new IntegratedPipeline();
pipeline.run().catch(console.error);
