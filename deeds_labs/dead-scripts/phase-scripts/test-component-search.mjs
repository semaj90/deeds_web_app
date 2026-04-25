#!/usr/bin/env node
/**
 * Test Phase 89 Component Search Engine
 * - Semantic code unit search using embeddinggemma
 * - Tree-shakeable component discovery
 * - Dependency graph traversal
 */

import ollama from 'ollama';

async function testComponentSearch(query) {
	console.log(`\n🔍 Searching for: "${query}"\n`);

	// 1. Generate embedding for query
	const { embedding } = await ollama.embeddings({
		model: 'embeddinggemma:latest',
		prompt: query
	});

	// 2. Search phase89_code_units collection
	const res = await fetch('http://localhost:6333/collections/phase89_code_units/points/search', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: embedding,
			limit: 10,
			with_payload: true
		})
	});

	const data = await res.json();

	// 3. Display results
	console.log('✅ Top 10 Code Units:\n');
	data.result.forEach((r, i) => {
		const score = (r.score * 100).toFixed(1);
		const type = r.payload.unitType || 'unknown';
		const path = r.payload.filePath || r.payload.file_path || 'no-path';
		const deps = r.payload.dependencies?.length || 0;

		console.log(`  ${i + 1}. [${score}%] ${type.toUpperCase()}`);
		console.log(`     📄 ${path}`);
		if (deps > 0) console.log(`     🔗 ${deps} dependencies`);
		console.log();
	});

	// 4. Show dependency graph for top result
	if (data.result.length > 0) {
		const top = data.result[0];
		console.log('🌳 Dependency Graph for Top Match:');
		console.log(`   File: ${top.payload.filePath}`);
		console.log(`   Type: ${top.payload.unitType}`);

		if (top.payload.dependencies) {
			console.log(`   Dependencies (${top.payload.dependencies.length}):`);
			top.payload.dependencies.slice(0, 5).forEach((dep) => {
				console.log(`      → ${dep}`);
			});
		}

		if (top.payload.exports) {
			console.log(`   Exports: ${top.payload.exports.join(', ')}`);
		}

		console.log();
	}
}

// Run test queries
const queries = process.argv.slice(2);
if (queries.length === 0) {
	// Default test queries
	await testComponentSearch('Svelte 5 accessibility action component');
	await testComponentSearch('TypeScript XState actor wrapper');
	await testComponentSearch('WebAssembly AI adapter module');
} else {
	for (const query of queries) {
		await testComponentSearch(query);
	}
}

console.log('✅ Component search test complete!\n');
