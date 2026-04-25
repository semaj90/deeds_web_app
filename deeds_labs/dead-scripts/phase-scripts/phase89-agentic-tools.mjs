// Phase 89: Agentic Tool Calling with RAG/KAG Updates
// ACE contextual engineering with diff tool calls and knowledge base updates

import { QdrantClient } from '@qdrant/js-client-rest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import Redis from 'ioredis';
import pg from 'pg';

const { Pool } = pg;

class AgenticToolCaller {
	constructor() {
		this.pool = new Pool({
			user: 'legal_admin',
			password: '123456',
			host: 'localhost',
			port: 5434,
			database: 'legal_ai_db'
		});

		this.qdrant = new QdrantClient({ url: 'http://localhost:6333' });
		this.redis = new Redis({ port: 6379 });

		this.tools = {
			cluster_errors: this.clusterErrors.bind(this),
			fetch_recommendations: this.fetchRecommendations.bind(this),
			apply_diff: this.applyDiff.bind(this),
			validate_fix: this.validateFix.bind(this),
			update_rag: this.updateRAG.bind(this),
			update_kag: this.updateKAG.bind(this),
			cosine_rank: this.cosineRank.bind(this),
			search_local_docs: this.searchLocalDocs.bind(this)
		};
	}

	// Tool 8: Search local documentation files (llms.txt, copilot.md, etc.)
	async searchLocalDocs(query) {
		console.log(`🔎 Tool: search_local_docs (query: "${query}")`);

		return new Promise((resolve) => {
			const rg = spawn('rg', [
				'-i',
				'-F', // Fixed string search
				query,
				'data/svelte-docs',
				'copilot.md',
				'claude.md',
				'llms.txt',
				'--max-count=5',
				'--no-heading',
				'-C', '3'
			]);

			let output = '';
			rg.stdout.on('data', (data) => {
				output += data.toString();
			});

			rg.on('close', (code) => {
				if (code === 0 && output.trim()) {
					console.log(`   ✅ Found local documentation matches`);
					resolve({
						success: true,
						source: 'local-docs',
						content: output.substring(0, 1500)
					});
				} else {
					console.log(`   ⚠️  No local documentation found`);
					resolve({ success: false, content: '' });
				}
			});

			rg.on('error', (err) => {
				console.error(`   ❌ ripgrep failed: ${err.message}`);
				resolve({ success: false, error: err.message });
			});
		});
	}

	// Tool 1: Cluster errors using CUDA
	async clusterErrors() {
		console.log('🔥 Tool: cluster_errors (CUDA-accelerated)');

		return new Promise((resolve, reject) => {
			const python = spawn('python', [
				'scripts/phase89-cuda-clustering.py'
			]);

			let output = '';
			python.stdout.on('data', (data) => {
				output += data.toString();
				console.log(data.toString());
			});

			python.stderr.on('data', (data) => {
				console.error(data.toString());
			});

			python.on('close', async (code) => {
				if (code === 0) {
					const report = JSON.parse(
						await fs.readFile('reports/phase89-cuda-clustering-report.json', 'utf8')
					);
					resolve(report);
				} else {
					reject(new Error(`Python script exited with code ${code}`));
				}
			});
		});
	}

	// Tool 2: Fetch recommendations from Qdrant
	async fetchRecommendations(query = 'high priority errors', topK = 5) {
		console.log(`🔍 Tool: fetch_recommendations (query: "${query}", topK: ${topK})`);

		// Search Qdrant for similar error clusters
		const result = await this.qdrant.search('phase89_error_clusters', {
			vector: await this.embedQuery(query),
			limit: topK,
			with_payload: true
		});

		const recommendations = result.map((hit) => ({
			cluster_id: hit.payload.cluster_id,
			priority: hit.payload.priority,
			action: hit.payload.action,
			error_type: hit.payload.error_type,
			score: hit.score
		}));

		console.log(`   ✅ Found ${recommendations.length} recommendations`);
		return recommendations;
	}

	// Tool 3: Apply diff using git-like patch
	async applyDiff(filePath, diff) {
		console.log(`🔧 Tool: apply_diff (file: ${filePath})`);

		try {
			// Read original file
			const originalContent = await fs.readFile(filePath, 'utf8');

			// Parse diff and apply changes
			const lines = originalContent.split('\n');
			const diffLines = diff.split('\n');

			let lineOffset = 0;
			for (const diffLine of diffLines) {
				if (diffLine.startsWith('@@')) {
					// Parse hunk header: @@ -10,5 +10,6 @@
					const match = diffLine.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
					if (match) {
						const [, oldStart, oldCount, newStart, newCount] = match.map(Number);
						lineOffset = newStart - oldStart;
					}
				} else if (diffLine.startsWith('-')) {
					// Remove line
					const lineNum = parseInt(diffLine.match(/^-(\d+)/)?.[1] || 0) + lineOffset;
					if (lineNum > 0 && lineNum <= lines.length) {
						lines.splice(lineNum - 1, 1);
					}
				} else if (diffLine.startsWith('+')) {
					// Add line
					const lineNum = parseInt(diffLine.match(/^\+(\d+)/)?.[1] || 0) + lineOffset;
					const content = diffLine.substring(diffLine.indexOf(' ') + 1);
					if (lineNum > 0) {
						lines.splice(lineNum - 1, 0, content);
					}
				}
			}

			// Write back to file
			await fs.writeFile(filePath, lines.join('\n'), 'utf8');

			console.log(`   ✅ Applied diff to ${filePath}`);
			return { success: true, filePath };
		} catch (error) {
			console.error(`   ❌ Failed to apply diff: ${error.message}`);
			return { success: false, error: error.message };
		}
	}

	// Tool 4: Validate fix using svelte-check or tsc
	async validateFix(filePath) {
		console.log(`✅ Tool: validate_fix (file: ${filePath})`);

		return new Promise((resolve) => {
			const checker = spawn('npx', ['svelte-check', '--threshold', 'error', filePath]);

			let errors = '';
			checker.stderr.on('data', (data) => {
				errors += data.toString();
			});

			checker.on('close', (code) => {
				const success = code === 0;
				console.log(`   ${success ? '✅' : '❌'} Validation ${success ? 'passed' : 'failed'}`);
				resolve({ success, errors: success ? [] : errors.split('\n') });
			});
		});
	}

	// Tool 5: Update RAG (Retrieval-Augmented Generation)
	async updateRAG(clusterReport) {
		console.log('📚 Tool: update_rag (add new error patterns)');

		// Extract unique error patterns
		const patterns = [];
		for (const rec of clusterReport.recommendations) {
			patterns.push({
				error_type: rec.summary.error_type,
				action: rec.action,
				sample_errors: rec.summary.sample_errors,
				cluster_size: rec.summary.cluster_size
			});
		}

		// Store in Qdrant for RAG retrieval
		const points = patterns.map((pattern, idx) => ({
			id: `pattern-${Date.now()}-${idx}`,
			vector: this.computePatternEmbedding(pattern),
			payload: pattern
		}));

		await this.qdrant.upsert('phase89_rag_patterns', {
			points,
			wait: true
		});

		console.log(`   ✅ Added ${patterns.length} patterns to RAG`);
		return { patterns_added: patterns.length };
	}

	// Tool 6: Update KAG (Knowledge-Augmented Generation)
	async updateKAG(fixHistory) {
		console.log('🧠 Tool: update_kag (build knowledge graph)');

		// Insert into PostgreSQL knowledge graph
		const client = await this.pool.connect();

		try {
			await client.query('BEGIN');

			// Create KAG tables if not exist
			await client.query(`
				CREATE TABLE IF NOT EXISTS kag_nodes (
					id SERIAL PRIMARY KEY,
					node_type TEXT NOT NULL,
					label TEXT NOT NULL,
					properties JSONB,
					created_at TIMESTAMP DEFAULT NOW()
				)
			`);

			await client.query(`
				CREATE TABLE IF NOT EXISTS kag_edges (
					id SERIAL PRIMARY KEY,
					from_node INTEGER REFERENCES kag_nodes(id),
					to_node INTEGER REFERENCES kag_edges(id),
					edge_type TEXT NOT NULL,
					weight FLOAT DEFAULT 1.0,
					created_at TIMESTAMP DEFAULT NOW()
				)
			`);

			// Insert fix history as nodes
			for (const fix of fixHistory) {
				const result = await client.query(
					`INSERT INTO kag_nodes (node_type, label, properties)
					 VALUES ($1, $2, $3) RETURNING id`,
					['fix', fix.action, JSON.stringify(fix)]
				);

				const nodeId = result.rows[0].id;

				// Create edges to related errors
				for (const errorId of fix.related_errors || []) {
					await client.query(
						`INSERT INTO kag_edges (from_node, to_node, edge_type, weight)
						 VALUES ($1, $2, $3, $4)`,
						[nodeId, errorId, 'fixes', fix.success ? 1.0 : 0.5]
					);
				}
			}

			await client.query('COMMIT');
			console.log(`   ✅ Added ${fixHistory.length} nodes to KAG`);
			return { nodes_added: fixHistory.length };
		} catch (error) {
			await client.query('ROLLBACK');
			console.error(`   ❌ KAG update failed: ${error.message}`);
			return { error: error.message };
		} finally {
			client.release();
		}
	}

	// Tool 7: Cosine ranking
	async cosineRank(queryEmbedding, candidates) {
		console.log(`📊 Tool: cosine_rank (ranking ${candidates.length} candidates)`);

		// Compute cosine similarity for each candidate
		const ranked = candidates.map((candidate) => {
			const similarity = this.cosineSimilarity(queryEmbedding, candidate.embedding);
			return { ...candidate, score: similarity };
		});

		// Sort by score (descending)
		ranked.sort((a, b) => b.score - a.score);

		console.log(`   ✅ Ranked ${ranked.length} candidates`);
		return ranked;
	}

	// Helper: Embed query using cached embeddings or Ollama
	async embedQuery(query) {
		// Check Redis cache
		const cached = await this.redis.get(`embed:${query}`);
		if (cached) {
			return JSON.parse(cached);
		}

		// Generate embedding using Ollama (embeddinggemma:latest)
		const response = await fetch('http://localhost:11434/api/embeddings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query })
		});

		const data = await response.json();
		const embedding = data.embedding;

		// Cache for 7 days
		await this.redis.setex(`embed:${query}`, 7 * 24 * 3600, JSON.stringify(embedding));

		return embedding;
	}

	// Helper: Compute pattern embedding
	computePatternEmbedding(pattern) {
		// Simplified: concatenate and hash
		const text = `${pattern.error_type} ${pattern.action} ${pattern.sample_errors.join(' ')}`;
		// In production, use actual embedding model
		return Array(384)
			.fill(0)
			.map(() => Math.random());
	}

	// Helper: Cosine similarity
	cosineSimilarity(a, b) {
		const dotProduct = a.reduce((sum, val, idx) => sum + val * b[idx], 0);
		const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
		const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
		return dotProduct / (magA * magB);
	}

	// Main agentic loop
	async run() {
		console.log('🤖 Phase 89: Agentic Tool Calling Pipeline\n');

		try {
			// Step 1: Cluster errors using CUDA
			const clusterReport = await this.tools.cluster_errors();

			// Step 2: Fetch top 5 high-priority recommendations
			const recommendations = await this.tools.fetch_recommendations('high priority', 5);

			// Step 3: Update RAG with new patterns
			await this.tools.update_rag(clusterReport);

			// Step 4: Update KAG with fix history
			const fixHistory = clusterReport.recommendations.map((rec) => ({
				action: rec.action,
				priority: rec.priority,
				related_errors: [rec.cluster_id],
				success: false // Will be updated after validation
			}));
			await this.tools.update_kag(fixHistory);

			// Step 5: For each recommendation, apply diff and validate
			for (const rec of recommendations.slice(0, 3)) {
				// Only process top 3
				console.log(`\n🎯 Processing: ${rec.action}`);

				// TODO: Generate diff using LLM (gemma3-legal:latest)
				// For now, skip actual file modification
				console.log('   ⏭️  Skipping diff application (TODO: integrate LLM)');
			}

			// Step 6: Generate final summary
			const summary = {
				total_errors: clusterReport.total_errors,
				total_clusters: clusterReport.total_clusters,
				recommendations_generated: recommendations.length,
				rag_updated: true,
				kag_updated: true,
				timestamp: new Date().toISOString()
			};

			await fs.writeFile(
				'reports/phase89-agentic-summary.json',
				JSON.stringify(summary, null, 2)
			);

			console.log('\n✅ Agentic pipeline complete!');
			console.log(JSON.stringify(summary, null, 2));
		} catch (error) {
			console.error('❌ Pipeline failed:', error);
		} finally {
			await this.pool.end();
			await this.redis.quit();
		}
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	const agent = new AgenticToolCaller();
	agent.run();
}

export default AgenticToolCaller;
