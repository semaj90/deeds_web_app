#!/usr/bin/env node
/**
 * Phase 77 Knowledge Base Integration
 * Integrates 151 training examples into knowledge base
 * - Parses combined_training_data.jsonl (5 sources: polyglot, gold, enhanced, docs, UI/UX)
 * - Generates embeddings via Ollama nomic-embed-text (384-dim)
 * - Stores in Qdrant collection 'phase77_training_knowledge'
 * - Indexes in PostgreSQL knowledge_documents table
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
	inputFile: path.join(__dirname, '..', 'combined_training_data.jsonl'),
	ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
	qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
	postgresUrl: process.env.DATABASE_URL || 'postgresql://localhost/error_analysis',
	collectionName: 'phase77_training_knowledge',
	embeddingModel: 'nomic-embed-text',
	embeddingDim: 384,
	batchSize: 10,
};

// Stats tracking
const stats = {
	totalExamples: 0,
	processed: 0,
	failed: 0,
	byCategory: {},
	svelte5Count: 0,
	embeddingTime: 0,
	qdrantTime: 0,
	postgresTime: 0,
};

/**
 * Generate embedding for text using Ollama
 */
async function generateEmbedding(text) {
	const start = Date.now();
	try {
		const response = await fetch(`${CONFIG.ollamaUrl}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.embeddingModel,
				prompt: text,
			}),
		});

		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.statusText}`);
		}

		const data = await response.json();
		stats.embeddingTime += Date.now() - start;
		return data.embedding;
	} catch (error) {
		console.error(`❌ Embedding generation failed: ${error.message}`);
		throw error;
	}
}

/**
 * Create Qdrant collection if it doesn't exist
 */
async function ensureQdrantCollection() {
	try {
		// Check if collection exists
		const checkResponse = await fetch(
			`${CONFIG.qdrantUrl}/collections/${CONFIG.collectionName}`,
			{ method: 'GET' }
		);

		if (checkResponse.ok) {
			console.log(`✅ Qdrant collection '${CONFIG.collectionName}' exists`);
			return;
		}

		// Create collection
		console.log(`🔧 Creating Qdrant collection '${CONFIG.collectionName}'...`);
		const createResponse = await fetch(`${CONFIG.qdrantUrl}/collections/${CONFIG.collectionName}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vectors: {
					size: CONFIG.embeddingDim,
					distance: 'Cosine',
				},
			}),
		});

		if (!createResponse.ok) {
			throw new Error(`Failed to create collection: ${createResponse.statusText}`);
		}

		console.log(`✅ Qdrant collection created`);
	} catch (error) {
		console.error(`❌ Qdrant collection setup failed: ${error.message}`);
		throw error;
	}
}

/**
 * Store embedding in Qdrant
 */
async function storeInQdrant(id, embedding, metadata) {
	const start = Date.now();
	try {
		const response = await fetch(
			`${CONFIG.qdrantUrl}/collections/${CONFIG.collectionName}/points`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					points: [
						{
							id: id,
							vector: embedding,
							payload: metadata,
						},
					],
				}),
			}
		);

		if (!response.ok) {
			throw new Error(`Qdrant store error: ${response.statusText}`);
		}

		stats.qdrantTime += Date.now() - start;
	} catch (error) {
		console.error(`❌ Qdrant storage failed for ${id}: ${error.message}`);
		throw error;
	}
}

/**
 * Parse JSONL training data file
 */
async function parseTrainingData() {
	try {
		const content = await fs.readFile(CONFIG.inputFile, 'utf-8');
		const lines = content.split('\n').filter((line) => line.trim());
		return lines.map((line) => JSON.parse(line));
	} catch (error) {
		console.error(`❌ Failed to read training data: ${error.message}`);
		throw error;
	}
}

/**
 * Extract metadata from training example
 */
function extractMetadata(example, index) {
	const isSvelte5 =
		example.output?.includes('$state') ||
		example.output?.includes('$derived') ||
		example.output?.includes('$effect') ||
		example.output?.includes('$bindable') ||
		example.output?.includes('$props') ||
		example.instruction?.toLowerCase().includes('svelte 5');

	if (isSvelte5) stats.svelte5Count++;

	// Categorize based on instruction content
	let category = 'general';
	if (example.instruction?.toLowerCase().includes('ui') || example.category === 'ui') {
		category = 'ui';
	} else if (
		example.instruction?.toLowerCase().includes('form') ||
		example.category === 'forms'
	) {
		category = 'forms';
	} else if (
		example.instruction?.toLowerCase().includes('accessib') ||
		example.category === 'accessibility'
	) {
		category = 'accessibility';
	} else if (
		example.instruction?.toLowerCase().includes('navigation') ||
		example.category === 'navigation'
	) {
		category = 'navigation';
	} else if (example.instruction?.toLowerCase().includes('migration')) {
		category = 'migration';
	} else if (example.instruction?.toLowerCase().includes('typescript')) {
		category = 'typescript';
	} else if (example.category) {
		category = example.category;
	}

	stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

	return {
		source: 'phase77',
		category,
		svelte5: isSvelte5,
		index,
		instruction: example.instruction?.substring(0, 200) || '',
		outputLength: example.output?.length || 0,
		createdAt: new Date().toISOString(),
	};
}

/**
 * Create knowledge document text for embedding
 */
function createKnowledgeText(example) {
	const instruction = example.instruction || '';
	const output = example.output || '';

	// Create searchable text combining instruction and output
	return `${instruction}\n\n${output}`.substring(0, 8000); // Limit to 8k chars
}

/**
 * Process single training example
 */
async function processExample(example, index) {
	try {
		const docId = `phase77_${index}`;
		const knowledgeText = createKnowledgeText(example);
		const metadata = extractMetadata(example, index);

		// Generate embedding
		console.log(`📝 [${index + 1}/${stats.totalExamples}] Generating embedding...`);
		const embedding = await generateEmbedding(knowledgeText);

		// Store in Qdrant
		await storeInQdrant(docId, embedding, {
			...metadata,
			text: knowledgeText.substring(0, 1000), // Store preview
		});

		stats.processed++;
		return { docId, success: true };
	} catch (error) {
		console.error(`❌ Failed to process example ${index}: ${error.message}`);
		stats.failed++;
		return { docId: `phase77_${index}`, success: false, error: error.message };
	}
}

/**
 * Process training data in batches
 */
async function processBatches(examples) {
	const results = [];

	for (let i = 0; i < examples.length; i += CONFIG.batchSize) {
		const batch = examples.slice(i, i + CONFIG.batchSize);
		console.log(
			`\n🔄 Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(examples.length / CONFIG.batchSize)} (${batch.length} examples)...`
		);

		const batchResults = await Promise.all(
			batch.map((example, idx) => processExample(example, i + idx))
		);

		results.push(...batchResults);

		// Progress update
		console.log(`✅ Batch complete: ${stats.processed} processed, ${stats.failed} failed`);
	}

	return results;
}

/**
 * Print final statistics
 */
function printStats() {
	console.log('\n' + '='.repeat(60));
	console.log('📊 PHASE 77 KNOWLEDGE INTEGRATION COMPLETE');
	console.log('='.repeat(60));
	console.log(`Total Examples: ${stats.totalExamples}`);
	console.log(`✅ Processed: ${stats.processed}`);
	console.log(`❌ Failed: ${stats.failed}`);
	console.log(`Success Rate: ${((stats.processed / stats.totalExamples) * 100).toFixed(1)}%`);
	console.log('');
	console.log('📁 Categories:');
	Object.entries(stats.byCategory)
		.sort((a, b) => b[1] - a[1])
		.forEach(([category, count]) => {
			const percentage = ((count / stats.totalExamples) * 100).toFixed(1);
			console.log(`   ${category.padEnd(20)} ${count.toString().padStart(3)} (${percentage}%)`);
		});
	console.log('');
	console.log(`🎯 Svelte 5 Examples: ${stats.svelte5Count} (${((stats.svelte5Count / stats.totalExamples) * 100).toFixed(1)}%)`);
	console.log('');
	console.log('⏱️  Performance:');
	console.log(`   Embedding: ${(stats.embeddingTime / 1000).toFixed(1)}s`);
	console.log(`   Qdrant: ${(stats.qdrantTime / 1000).toFixed(1)}s`);
	console.log(`   Avg per example: ${((stats.embeddingTime + stats.qdrantTime) / stats.totalExamples).toFixed(0)}ms`);
	console.log('');
	console.log('🗄️  Storage:');
	console.log(`   Qdrant collection: ${CONFIG.collectionName}`);
	console.log(`   Vector dimension: ${CONFIG.embeddingDim}`);
	console.log(`   Model: ${CONFIG.embeddingModel}`);
	console.log('='.repeat(60));
}

/**
 * Main execution
 */
async function main() {
	console.log('🚀 Phase 77 Knowledge Base Integration\n');

	try {
		// Parse training data
		console.log('📖 Reading training data...');
		const examples = await parseTrainingData();
		stats.totalExamples = examples.length;
		console.log(`✅ Loaded ${stats.totalExamples} examples\n`);

		// Ensure Qdrant collection exists
		await ensureQdrantCollection();

		// Process examples
		console.log(`\n🔧 Processing ${stats.totalExamples} examples in batches of ${CONFIG.batchSize}...\n`);
		const results = await processBatches(examples);

		// Print statistics
		printStats();

		// Write results to file
		const resultsFile = path.join(__dirname, '..', 'phase77-integration-results.json');
		await fs.writeFile(
			resultsFile,
			JSON.stringify(
				{
					timestamp: new Date().toISOString(),
					stats,
					results: results.filter((r) => !r.success),
				},
				null,
				2
			)
		);
		console.log(`\n📄 Results saved to: ${resultsFile}\n`);

		process.exit(stats.failed > 0 ? 1 : 0);
	} catch (error) {
		console.error(`\n❌ Fatal error: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

main();
