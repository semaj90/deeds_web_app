#!/usr/bin/env node
/**
 * Quick test of Qdrant retrieval bypassing Knowledge Plane
 */

import fetch from 'node-fetch';

const QDRANT_URL = 'http://localhost:6333';
const OLLAMA_URL = 'http://localhost:11434';
const COLLECTION = 'phase76_knowledge_base';

async function generateEmbedding(text) {
	const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'embeddinggemma:latest',
			prompt: text
		})
	});

	const data = await response.json();
	return data.embedding;
}

async function searchQdrant(query, limit = 5) {
	console.log(`\n🔍 Searching for: "${query}"`);

	// Generate embedding
	console.log('   Generating embedding...');
	const startEmbed = Date.now();
	const embedding = await generateEmbedding(query);
	console.log(`   ✅ Embedding generated (${Date.now() - startEmbed}ms, dim: ${embedding.length})`);

	// Search Qdrant
	console.log('   Searching Qdrant...');
	const startSearch = Date.now();
	const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: embedding,
			limit,
			with_payload: true,
			with_vector: false
		})
	});

	const data = await response.json();
	console.log(`   ✅ Search complete (${Date.now() - startSearch}ms)`);

	if (data.result && data.result.length > 0) {
		console.log(`\n📊 Found ${data.result.length} results:`);
		data.result.forEach((result, i) => {
			const score = result.score.toFixed(4);
			const tags = result.payload?.tags?.join(', ') || 'no tags';
			const content = result.payload?.content || result.payload?.text || 'no content';
			const preview = content.substring(0, 150).replace(/\n/g, ' ');

			console.log(`\n   ${i + 1}. Score: ${score}, Tags: ${tags}`);
			console.log(`      ${preview}...`);
		});
	} else {
		console.log('   ⚠️  No results found');
	}

	return data.result;
}

async function main() {
	console.log('🧪 Direct Qdrant Retrieval Test');
	console.log('================================\n');

	const queries = [
		'Svelte 5 runes $state $derived $effect',
		'SvelteKit 2 load function server',
		'reactive state management Svelte'
	];

	for (const query of queries) {
		await searchQdrant(query, 3);
		console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	}

	console.log('✅ Test complete!\n');
}

main().catch(console.error);
