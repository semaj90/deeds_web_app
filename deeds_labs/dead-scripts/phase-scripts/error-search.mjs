#!/usr/bin/env node

/**
 * Phase 79: Semantic Error Search
 *
 * Search indexed errors via Qdrant vector similarity:
 * - Natural language queries
 * - Find similar errors across codebase
 * - RAG retrieval for agentic fixing
 *
 * Usage:
 *   node scripts/error-search.mjs --query "database connection errors"
 *   node scripts/error-search.mjs --query "import type issues" --top 20
 */

import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'phase79_errors';
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Parse CLI args
const args = process.argv.slice(2);
const QUERY = args.find(a => a.startsWith('--query='))?.split('=')[1]?.replace(/^["']|["']$/g, '') ||
              args.find((a, i) => args[i - 1] === '--query')?.replace(/^["']|["']$/g, '');
const TOP_K = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] || '10', 10);
const THRESHOLD = parseFloat(args.find(a => a.startsWith('--threshold='))?.split('=')[1] || '0.5');

if (!QUERY) {
	console.error('❌ Usage: node error-search.mjs --query "your search query" [--top 10] [--threshold 0.5]');
	console.error('\nExamples:');
	console.error('  node error-search.mjs --query "database type errors"');
	console.error('  node error-search.mjs --query "lucia auth adapter issues" --top 5');
	console.error('  node error-search.mjs --query "svelte component problems" --threshold 0.7');
	process.exit(1);
}

console.log('🔍 Phase 79: Semantic Error Search\n');
console.log(`   Query: "${QUERY}"`);
console.log(`   Top K: ${TOP_K}`);
console.log(`   Threshold: ${THRESHOLD}\n`);

/**
 * Generate embedding via Ollama
 */
async function generateEmbedding(text) {
	const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
			prompt: text
		})
	});

	if (!response.ok) {
		throw new Error(`Ollama embedding failed: ${response.statusText}`);
	}

	const data = await response.json();
	return data.embedding;
}

/**
 * Search Qdrant collection
 */
async function searchErrors(queryVector, topK, threshold) {
	const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: queryVector,
			limit: topK,
			score_threshold: threshold,
			with_payload: true
		})
	});

	if (!response.ok) {
		throw new Error(`Qdrant search failed: ${response.statusText}`);
	}

	const data = await response.json();
	return data.result;
}

/**
 * Format search results
 */
function formatResults(results) {
	if (results.length === 0) {
		console.log('❌ No results found. Try lowering --threshold or broadening your query.\n');
		return;
	}

	console.log(`📊 SEARCH RESULTS (${results.length} matches)\n`);

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		const payload = result.payload;
		const score = result.score;

		const shortPath = relative(ROOT, payload.file);

		console.log(`${i + 1}. ${shortPath}:${payload.line}:${payload.column}`);
		console.log(`   Score: ${(score * 100).toFixed(1)}%`);
		console.log(`   Error: [${payload.code}] ${payload.message}`);
		console.log(`   Pattern: ${payload.patternId} (Priority: ${payload.priority})`);
		console.log(`   Domains: ${payload.domains.join(', ')}`);

		if (payload.snippet) {
			console.log(`   Snippet: ${payload.snippet.substring(0, 100)}...`);
		}

		console.log('');
	}
}

/**
 * Group results by pattern
 */
function analyzePatterns(results) {
	const patterns = {};

	for (const result of results) {
		const patternId = result.payload.patternId;
		if (!patterns[patternId]) {
			patterns[patternId] = {
				count: 0,
				files: new Set(),
				avgScore: 0,
				totalScore: 0
			};
		}

		patterns[patternId].count++;
		patterns[patternId].files.add(result.payload.file);
		patterns[patternId].totalScore += result.score;
	}

	// Calculate averages
	for (const [patternId, data] of Object.entries(patterns)) {
		data.avgScore = data.totalScore / data.count;
		data.files = data.files.size;
	}

	console.log(`📋 PATTERN ANALYSIS\n`);

	const sorted = Object.entries(patterns)
		.sort((a, b) => b[1].count - a[1].count);

	for (const [patternId, data] of sorted) {
		console.log(`${patternId}:`);
		console.log(`   Occurrences: ${data.count}`);
		console.log(`   Affected Files: ${data.files}`);
		console.log(`   Avg Relevance: ${(data.avgScore * 100).toFixed(1)}%`);
		console.log('');
	}
}

/**
 * Group results by file
 */
function analyzeFiles(results) {
	const files = {};

	for (const result of results) {
		const file = result.payload.file;
		if (!files[file]) {
			files[file] = {
				count: 0,
				patterns: new Set(),
				maxScore: 0
			};
		}

		files[file].count++;
		files[file].patterns.add(result.payload.patternId);
		files[file].maxScore = Math.max(files[file].maxScore, result.score);
	}

	// Convert sets to counts
	for (const [file, data] of Object.entries(files)) {
		data.patterns = data.patterns.size;
	}

	console.log(`📂 FILE ANALYSIS\n`);

	const sorted = Object.entries(files)
		.sort((a, b) => b[1].count - a[1].count)
		.slice(0, 10);

	for (const [file, data] of sorted) {
		const shortPath = relative(ROOT, file);
		console.log(`${shortPath}:`);
		console.log(`   Errors: ${data.count}`);
		console.log(`   Patterns: ${data.patterns}`);
		console.log(`   Max Relevance: ${(data.maxScore * 100).toFixed(1)}%`);
		console.log('');
	}
}

/**
 * Main execution
 */
async function main() {
	// Generate query embedding
	console.log(`🔮 Generating query embedding...`);
	const queryVector = await generateEmbedding(QUERY);
	console.log(`✅ Embedding generated (${queryVector.length} dimensions)\n`);

	// Search Qdrant
	console.log(`🔍 Searching Qdrant collection...`);
	const results = await searchErrors(queryVector, TOP_K, THRESHOLD);
	console.log(`✅ Search complete\n`);

	// Display results
	formatResults(results);

	if (results.length > 0) {
		analyzePatterns(results);
		analyzeFiles(results);

		console.log(`💡 Next steps:`);
		console.log(`   1. Review top files for common patterns`);
		console.log(`   2. node scripts/phase79-pattern-fixer.mjs --pattern <patternId> --apply`);
		console.log(`   3. node scripts/phase79-agentic-fixer.mjs --file <path> --use-rag`);
	}
}

main().catch(error => {
	console.error('❌ Search failed:', error.message);
	process.exit(1);
});
