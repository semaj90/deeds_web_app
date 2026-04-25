#!/usr/bin/env node
/**
 * Phase 72 - RAG/KAG AST Knowledge Base Integrator
 *
 * Contextual Engineering with Self-Prompting (LangChain-style)
 *
 * Features:
 * - Load AST knowledge base into Qdrant vector store
 * - Generate embeddings for code structure
 * - Create semantic clusters for RAG context
 * - Self-prompting recommendations engine
 * - LangChain-style contextual prompt engineering
 *
 * Usage:
 *   node scripts/rag-kag-ast-integrator.mjs --kb project-knowledge-base.tree.json
 *   node scripts/rag-kag-ast-integrator.mjs --auto-recommendations
 */

import { createHash } from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'gemma3-legal:latest';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_AST_COLLECTION = 'phase72_ast_knowledge_base';

// Parse arguments
const args = process.argv.slice(2);
const kbFile = args.includes('--kb') ? args[args.indexOf('--kb') + 1] : 'project-knowledge-base.tree.json';
const autoRecommendations = args.includes('--auto-recommendations');

console.log('🧠 Phase 72 - RAG/KAG AST Knowledge Base Integrator\n');
console.log('📊 Configuration:');
console.log(`   Knowledge Base: ${kbFile}`);
console.log(`   Ollama: ${OLLAMA_URL}`);
console.log(`   Qdrant: ${QDRANT_URL}`);
console.log(`   Collection: ${QDRANT_AST_COLLECTION}`);
console.log(`   Auto-Recommendations: ${autoRecommendations}\n`);

const stats = {
	startTime: Date.now(),
	nodesEmbedded: 0,
	clustersProcessed: 0,
	recommendationsGenerated: 0,
	selfPromptIterations: 0
};

/**
 * Load knowledge base from file
 */
function loadKnowledgeBase() {
	// Handle absolute path or relative path
	let kbPath;
	if (path.isAbsolute(kbFile)) {
		kbPath = kbFile;
	} else if (kbFile.startsWith('reports/') || kbFile.startsWith('reports\\')) {
		// If already includes reports/, use from project root
		kbPath = path.join(__dirname, '..', kbFile);
	} else {
		// Otherwise, assume it's in reports/latest/
		kbPath = path.join(__dirname, '..', 'reports', 'latest', kbFile);
	}

	if (!fs.existsSync(kbPath)) {
		throw new Error(`Knowledge base not found: ${kbPath}\nRun: node scripts/ast-error-analyzer.mjs --graph ${kbFile.replace('.tree.json', '.json')}`);
	}

	console.log(`📖 Loading knowledge base from: ${kbPath}`);
	const kb = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
	console.log(`✅ Loaded: ${kb.graph.nodes.length} nodes, ${kb.graph.edges.length} edges, ${kb.clusters.length} clusters\n`);

	return kb;
}

/**
 * Create Qdrant collection for AST knowledge base
 */
async function createQdrantCollection() {
	try {
		// Check if collection exists
		const checkResponse = await fetch(`${QDRANT_URL}/collections/${QDRANT_AST_COLLECTION}`);

		if (checkResponse.ok) {
			console.log(`✅ Collection '${QDRANT_AST_COLLECTION}' already exists`);
			return;
		}

		// Create collection
		console.log(`🔧 Creating Qdrant collection: ${QDRANT_AST_COLLECTION}`);
		const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_AST_COLLECTION}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vectors: {
					size: 768, // embeddinggemma dimensions
					distance: 'Cosine'
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to create collection: ${response.statusText}`);
		}

		console.log(`✅ Collection created successfully\n`);
	} catch (error) {
		console.error(`❌ Error creating collection: ${error.message}`);
		throw error;
	}
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text) {
	try {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_EMBEDDING_MODEL,
				prompt: text
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();
		return data.embedding;
	} catch (error) {
		console.log(`⚠️  Embedding failed: ${error.message}`);
		return null;
	}
}

/**
 * Embed knowledge base nodes into Qdrant
 */
async function embedKnowledgeBase(kb) {
	console.log('🔄 Embedding knowledge base into Qdrant...\n');

	const points = [];
	const totalNodes = kb.graph.nodes.length;
	let processed = 0;

	if (totalNodes === 0) {
		console.log('⚠️  No nodes to embed (empty knowledge base)\n');
		return;
	}

	for (const node of kb.graph.nodes) {
		processed++;
		const percent = ((processed / totalNodes) * 100).toFixed(1);

		// Create contextual description
		const context = `File: ${node.path}
Type: ${node.type}
Imports: ${node.metadata.importCount}
Exports: ${node.metadata.exportCount}
Symbols: ${node.metadata.symbolCount}
Errors: ${node.metadata.errorCount}

This file is part of the codebase structure and has dependencies on other modules.`;

		// Progress bar
		const barWidth = 30;
		const filled = Math.floor((processed / totalNodes) * barWidth);
		const empty = barWidth - filled;
		const bar = '█'.repeat(filled) + '░'.repeat(empty);
		process.stdout.write(`\r   [${bar}] ${percent}% (${processed}/${totalNodes}) ${node.label.slice(0, 40).padEnd(40)}`);

		const embedding = await generateEmbedding(context);

		if (embedding) {
			points.push({
				id: createHash('sha256').update(node.path).digest('hex').slice(0, 16),
				vector: embedding,
				payload: {
					path: node.path,
					label: node.label,
					type: node.type,
					importCount: node.metadata.importCount,
					exportCount: node.metadata.exportCount,
					symbolCount: node.metadata.symbolCount,
					errorCount: node.metadata.errorCount,
					context: context
				}
			});

			stats.nodesEmbedded++;
		}

		// Batch insert every 100 nodes
		if (points.length >= 100) {
			await insertToQdrant(points);
			points.length = 0;
		}
	}

	// Insert remaining points
	if (points.length > 0) {
		await insertToQdrant(points);
	}

	console.log('\n');

	console.log(`\n✅ Embedded ${stats.nodesEmbedded} nodes into Qdrant\n`);
}

/**
 * Insert points to Qdrant
 */
async function insertToQdrant(points) {
	try {
		const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_AST_COLLECTION}/points`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ points }),
			signal: AbortSignal.timeout(60000)
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
	} catch (error) {
		console.error(`⚠️  Qdrant insert failed: ${error.message}`);
	}
}

/**
 * Process semantic clusters
 */
async function processSemanticClusters(kb) {
	console.log('🔄 Processing semantic clusters...\n');

	for (const cluster of kb.clusters) {
		console.log(`   📦 Cluster: ${cluster.name} (${cluster.files.length} files)`);

		// Create cluster summary
		const clusterContext = `Semantic Cluster: ${cluster.name}
Type: ${cluster.type}
File Count: ${cluster.files.length}
Files: ${cluster.files.slice(0, 10).join(', ')}${cluster.files.length > 10 ? '...' : ''}

This cluster represents a semantic grouping of related files in the codebase.`;

		const embedding = await generateEmbedding(clusterContext);

		if (embedding) {
			await insertToQdrant([{
				id: createHash('sha256').update(cluster.name).digest('hex').slice(0, 16),
				vector: embedding,
				payload: {
					type: 'cluster',
					name: cluster.name,
					fileCount: cluster.files.length,
					files: cluster.files,
					context: clusterContext
				}
			}]);

			stats.clustersProcessed++;
		}
	}

	console.log(`\n✅ Processed ${stats.clustersProcessed} clusters\n`);
}

/**
 * Self-prompting recommendation engine (LangChain-style)
 */
async function generateSelfPromptRecommendations(kb) {
	console.log('🤖 Generating self-prompting recommendations...\n');

	// Analyze knowledge base patterns
	const highErrorFiles = kb.graph.nodes
		.filter(n => n.metadata.errorCount > 50)
		.sort((a, b) => b.metadata.errorCount - a.metadata.errorCount)
		.slice(0, 10);

	const highImportFiles = kb.graph.nodes
		.filter(n => n.metadata.importCount > 10)
		.sort((a, b) => b.metadata.importCount - a.metadata.importCount)
		.slice(0, 10);

	const largeClusters = kb.clusters
		.filter(c => c.files.length > 20)
		.sort((a, b) => b.files.length - a.files.length);

	// Build self-prompting context
	const selfPromptContext = {
		iteration: 1,
		insights: {
			highErrorFiles: highErrorFiles.map(n => ({
				path: n.path,
				errors: n.metadata.errorCount,
				imports: n.metadata.importCount
			})),
			highImportFiles: highImportFiles.map(n => ({
				path: n.path,
				imports: n.metadata.importCount,
				exports: n.metadata.exportCount
			})),
			largeClusters: largeClusters.map(c => ({
				name: c.name,
				fileCount: c.files.length
			}))
		}
	};

	// LangChain-style prompt chain
	const prompts = [
		{
			role: 'system',
			content: 'You are an expert software architect analyzing a TypeScript codebase. Your goal is to provide actionable refactoring recommendations based on AST analysis.'
		},
		{
			role: 'user',
			content: `Analyze this codebase knowledge base and provide 5 prioritized recommendations:

High Error Files (>50 errors):
${JSON.stringify(selfPromptContext.insights.highErrorFiles, null, 2)}

High Import Files (>10 imports - potential tight coupling):
${JSON.stringify(selfPromptContext.insights.highImportFiles, null, 2)}

Large Clusters (>20 files - potential for splitting):
${JSON.stringify(selfPromptContext.insights.largeClusters, null, 2)}

Provide recommendations in this format:
1. [Priority] Issue description
   - Root cause
   - Suggested fix
   - Impact: [High/Medium/Low]`
		}
	];

	console.log('🔄 Sending self-prompt to Ollama...');

	try {
		const response = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_CHAT_MODEL,
				messages: prompts,
				stream: false
			}),
			signal: AbortSignal.timeout(120000)
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();
		const recommendations = data.message.content;

		// Save recommendations
		const outputPath = path.join(__dirname, '..', 'reports', 'latest', 'ast-rag-recommendations.md');
		fs.writeFileSync(outputPath, `# AST-Based RAG/KAG Recommendations

**Generated:** ${new Date().toISOString()}
**Model:** ${OLLAMA_CHAT_MODEL}
**Knowledge Base:** ${kbFile}

---

${recommendations}

---

## Context Used

### High Error Files
${JSON.stringify(selfPromptContext.insights.highErrorFiles, null, 2)}

### High Import Files
${JSON.stringify(selfPromptContext.insights.highImportFiles, null, 2)}

### Large Clusters
${JSON.stringify(selfPromptContext.insights.largeClusters, null, 2)}
`);

		console.log(`\n✅ Recommendations saved to: ${outputPath}\n`);
		console.log('📋 Preview:\n');
		console.log(recommendations.split('\n').slice(0, 20).join('\n'));
		console.log('\n...(truncated)\n');

		stats.recommendationsGenerated = 1;
		stats.selfPromptIterations = 1;

	} catch (error) {
		console.error(`❌ Self-prompt failed: ${error.message}`);
	}
}

/**
 * Main execution
 */
async function main() {
	try {
		// Load knowledge base
		const kb = loadKnowledgeBase();

		// Create Qdrant collection
		await createQdrantCollection();

		// Embed knowledge base
		await embedKnowledgeBase(kb);

		// Process semantic clusters
		await processSemanticClusters(kb);

		// Generate recommendations if requested
		if (autoRecommendations) {
			await generateSelfPromptRecommendations(kb);
		}

		// Final summary
		const duration = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);

		console.log('═'.repeat(60));
		console.log('\n✅ RAG/KAG Integration Complete!\n');
		console.log('📊 Summary:');
		console.log(`   Nodes embedded: ${stats.nodesEmbedded}`);
		console.log(`   Clusters processed: ${stats.clustersProcessed}`);
		console.log(`   Recommendations: ${stats.recommendationsGenerated}`);
		console.log(`   Self-prompt iterations: ${stats.selfPromptIterations}`);
		console.log(`   Duration: ${duration} minutes\n`);
		console.log(`🔍 Query your knowledge base:`);
		console.log(`   curl -X POST ${QDRANT_URL}/collections/${QDRANT_AST_COLLECTION}/points/search \\`);
		console.log(`     -d '{"vector": [...], "limit": 10}'\n`);
		console.log('═'.repeat(60) + '\n');

		process.exit(0);

	} catch (error) {
		console.error(`\n❌ FATAL ERROR: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

main();
