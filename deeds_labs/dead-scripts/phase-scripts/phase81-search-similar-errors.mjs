#!/usr/bin/env node
/**
 * Phase 81: Semantic Error Search Tool
 *
 * Uses Qdrant + embeddinggemma to find similar TS errors
 * Recommends surgical fixes based on Phase 85 knowledge
 */

import fs from 'fs';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const QDRANT_URL = 'http://localhost:6333';
const ERROR_COLLECTION = 'phase81_ts_errors';
const KNOWLEDGE_COLLECTION = 'phase72_ast_knowledge_base';
const EMBEDDING_MODEL = 'embeddinggemma:latest';

const ollama = new Ollama({ host: 'http://localhost:11434' });

// Parse command line arguments
const args = process.argv.slice(2);
const query = args[0] || 'TS1005 comma expected in object literal';
const topK = parseInt(args[1]) || 10;

console.log('🔍 Phase 81: Semantic Error Search\n');
console.log(`📝 Query: "${query}"`);
console.log(`🎯 Top K: ${topK}\n`);

async function searchSimilarErrors(query, topK = 10) {
	// Step 1: Generate query embedding
	console.log('1️⃣  Generating query embedding...');
	const response = await ollama.embeddings({
		model: EMBEDDING_MODEL,
		prompt: `TypeScript Error: ${query}`
	});
	console.log(`   ✅ Embedding generated (${response.embedding.length}D)\n`);

	// Step 2: Search error corpus
	console.log('2️⃣  Searching error corpus...');
	const searchResponse = await fetch(`${QDRANT_URL}/collections/${ERROR_COLLECTION}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: response.embedding,
			limit: topK,
			with_payload: true
		})
	});

	const searchData = await searchResponse.json();
	const results = searchData.result || [];
	console.log(`   ✅ Found ${results.length} similar errors\n`);

	// Step 3: Display results with clusters
	console.log('3️⃣  Results:\n');
	const clusters = {};

	results.forEach((hit, i) => {
		const p = hit.payload;
		const clusterId = p.cluster_id || 'unknown';

		if (!clusters[clusterId]) {
			clusters[clusterId] = [];
		}
		clusters[clusterId].push({ hit, rank: i + 1 });
	});

	// Display by cluster
	for (const [clusterId, items] of Object.entries(clusters)) {
		console.log(`\n📊 Cluster: ${clusterId} (${items.length} errors)\n`);

		items.forEach(({ hit, rank }) => {
			const p = hit.payload;
			console.log(`   ${rank}. ${p.path}:${p.line}:${p.col} (score: ${hit.score.toFixed(4)})`);
			console.log(`      Code: ${p.ts_code}`);
			console.log(`      Message: ${p.message.substring(0, 80)}...`);
			console.log(`      Hash: ${p.message_hash}\n`);
		});
	}

	// Step 4: Search Phase 85 knowledge for fix recommendations
	console.log('\n4️⃣  Searching Phase 85 knowledge for fix patterns...\n');

	const knowledgeResponse = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: response.embedding,
			limit: 3,
			with_payload: true
		})
	});

	const knowledgeData = await knowledgeResponse.json();
	const fixPatterns = knowledgeData.result || [];

	if (fixPatterns.length > 0) {
		console.log('💡 Recommended Fix Patterns:\n');
		fixPatterns.forEach((hit, i) => {
			const p = hit.payload;
			console.log(`   ${i + 1}. ${p.category || 'Fix'} (score: ${hit.score.toFixed(4)})`);
			console.log(`      ${p.text?.substring(0, 120) || p.content?.substring(0, 120)}...\n`);
		});
	} else {
		console.log('   ⚠️  No matching fix patterns found in knowledge base\n');
	}

	// Step 5: Summary statistics
	console.log('\n📊 Summary:\n');
	console.log(`   Total results: ${results.length}`);
	console.log(`   Clusters found: ${Object.keys(clusters).length}`);
	console.log(`   Top error codes:`);

	const codeCounts = {};
	results.forEach(hit => {
		const code = hit.payload.ts_code;
		codeCounts[code] = (codeCounts[code] || 0) + 1;
	});

	Object.entries(codeCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.forEach(([code, count]) => {
			console.log(`      - ${code}: ${count} occurrences`);
		});

	console.log('\n');

	return { results, fixPatterns, clusters };
}

async function main() {
	try {
		const { results, fixPatterns, clusters } = await searchSimilarErrors(query, topK);

		// Export results to JSON
		const outputPath = path.join(ROOT, 'reports/phase81-search-results.json');
		fs.writeFileSync(outputPath, JSON.stringify({
			query,
			topK,
			timestamp: new Date().toISOString(),
			results: results.map(hit => ({
				score: hit.score,
				payload: hit.payload
			})),
			fixPatterns: fixPatterns.map(hit => ({
				score: hit.score,
				payload: hit.payload
			})),
			clusterSummary: Object.entries(clusters).map(([id, items]) => ({
				clusterId: id,
				count: items.length,
				avgScore: items.reduce((sum, item) => sum + item.hit.score, 0) / items.length
			}))
		}, null, 2));

		console.log(`💾 Results saved to: ${outputPath}\n`);

		// Suggest next actions
		console.log('🔧 Next Steps:\n');
		console.log('   1. Review top files with highest error density');
		console.log('   2. Apply surgical fixes from Phase 85 knowledge');
		console.log('   3. Re-run TSC baseline: node scripts/phase81-tsc-summarize.mjs');
		console.log('   4. Measure error reduction\n');

		console.log('📝 Example Commands:\n');
		console.log('   # Search for specific error pattern');
		console.log('   node scripts/phase81-search-similar-errors.mjs "TS2304 cannot find name"');
		console.log('');
		console.log('   # Get more results');
		console.log('   node scripts/phase81-search-similar-errors.mjs "TS1005" 20\n');

	} catch (error) {
		console.error('❌ Search failed:', error);
		process.exit(1);
	}
}

main();
