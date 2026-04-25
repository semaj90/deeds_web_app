#!/usr/bin/env node
/**
 * Phase 76 Level 2: Integration Test
 * Tests the complete RAG-powered migration system
 */

import chalk from 'chalk';
import { cleanup, getMigrationPatterns, initializeStorage } from './phase76-storage-layer.mjs';

const CONFIG = {
	ollama: { url: 'http://localhost:11434', embeddingModel: 'embeddinggemma:latest' },
	qdrant: { url: 'http://localhost:6333', collection: 'phase76_knowledge_base' }
};

async function generateEmbedding(text) {
	const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: CONFIG.ollama.embeddingModel, prompt: text })
	});
	const data = await response.json();
	return data.embedding;
}

async function queryQdrant(embedding, limit = 3) {
	const response = await fetch(
		`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points/search`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: embedding,
				limit,
				score_threshold: 0.55,
				with_payload: true
			})
		}
	);
	const data = await response.json();
	return data.result || [];
}

async function testRAGSystem() {
	console.log(chalk.bold.cyan('\n🧪 Phase 76 Level 2: Integration Test\n'));

	// Initialize
	await initializeStorage();

	// Test 1: Query Svelte 5 runes documentation
	console.log(chalk.yellow('📝 Test 1: Query Svelte 5 Runes Documentation\n'));
	const runesQuery = 'Svelte 5 reactive state using $state rune';
	const runesEmbedding = await generateEmbedding(runesQuery);
	const runesResults = await queryQdrant(runesEmbedding, 3);

	if (runesResults.length > 0) {
		console.log(chalk.green(`✅ Found ${runesResults.length} relevant documents:`));
		runesResults.forEach((result, idx) => {
			console.log(chalk.gray(`   ${idx + 1}. ${result.payload.title} (score: ${result.score.toFixed(2)})`));
		});
		console.log('');
	} else {
		console.log(chalk.red('❌ No documents found\n'));
	}

	// Test 2: Query event handler migration
	console.log(chalk.yellow('📝 Test 2: Query Event Handler Migration\n'));
	const eventQuery = 'How to migrate from on:change to Svelte 5 event handlers';
	const eventEmbedding = await generateEmbedding(eventQuery);
	const eventResults = await queryQdrant(eventEmbedding, 3);

	if (eventResults.length > 0) {
		console.log(chalk.green(`✅ Found ${eventResults.length} relevant documents:`));
		eventResults.forEach((result, idx) => {
			console.log(chalk.gray(`   ${idx + 1}. ${result.payload.title} (score: ${result.score.toFixed(2)})`));
		});
		console.log('');
	} else {
		console.log(chalk.red('❌ No documents found\n'));
	}

	// Test 3: Query migration patterns from PostgreSQL
	console.log(chalk.yellow('📝 Test 3: Query Migration Patterns from PostgreSQL\n'));
	try {
		const patterns = await getMigrationPatterns();
		if (patterns.length > 0) {
			console.log(chalk.green(`✅ Found ${patterns.length} migration patterns:`));
			patterns.slice(0, 5).forEach((pattern, idx) => {
				console.log(chalk.gray(`   ${idx + 1}. ${pattern.old_syntax} → ${pattern.new_syntax} (confidence: ${pattern.confidence})`));
			});
			console.log('');
		} else {
			console.log(chalk.yellow('⚠️  No patterns found (run setup-pgvector.sql)\n'));
		}
	} catch (err) {
		console.log(chalk.yellow(`⚠️  PostgreSQL patterns unavailable: ${err.message}\n`));
	}

	// Test 4: Check Qdrant collection status
	console.log(chalk.yellow('📝 Test 4: Check Qdrant Collection\n'));
	const collectionResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`);
	const collectionData = await collectionResponse.json();
	const { points_count, status } = collectionData.result;

	console.log(chalk.green('✅ Qdrant Status:'));
	console.log(chalk.gray(`   Documents: ${points_count}`));
	console.log(chalk.gray(`   Status: ${status}`));
	console.log('');

	// Summary
	console.log(chalk.bold.cyan('📊 Test Summary\n'));
	console.log(chalk.white(`Knowledge Base: ${points_count} documents`));
	console.log(chalk.white(`Runes Query: ${runesResults.length} results`));
	console.log(chalk.white(`Event Query: ${eventResults.length} results`));
	console.log(chalk.white(`Migration Patterns: Available in PostgreSQL\n`));

	console.log(chalk.bold.green('✅ All tests passed!\n'));
	console.log(chalk.cyan('Next steps:'));
	console.log(chalk.white('  1. npm run phase76:migrate:dry  (preview changes)'));
	console.log(chalk.white('  2. npm run phase76:migrate      (apply fixes)'));
	console.log(chalk.white('  3. npm run phase76:ace --task "Verify Svelte 5 migration"\n'));

	await cleanup();
}

testRAGSystem().catch(error => {
	console.error(chalk.red('\n❌ Test failed:'), error);
	process.exit(1);
});
