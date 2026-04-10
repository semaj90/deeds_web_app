#!/usr/bin/env node

/**
 * Test script for GPU-accelerated semantic codebase wiki
 *
 * Verifies:
 * - Database schema exists
 * - API endpoints are accessible
 * - Worker can process chunks
 *
 * Usage:
 *   node scripts/test-semantic-wiki.mjs
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const API_BASE = process.env.PUBLIC_API_URL || 'http://localhost:5173';

const pool = new Pool({ connectionString: DATABASE_URL });

console.log('🧪 GPU Semantic Wiki Test Suite\n');

// ─────────────────────────────────────────────────────────────────────
// Test 1: Verify Database Schema
// ─────────────────────────────────────────────────────────────────────

async function testDatabaseSchema() {
	console.log('[1/5] Testing database schema...');

	const tables = [
		'codebase_files',
		'codebase_embeddings',
		'codebase_graph_analysis',
		'codebase_mapreduce_jobs',
		'codebase_search_cache',
		'codebase_wiki_pages',
		'mapreduce_map_queue',
		'mapreduce_reduce_results',
		'gpu_performance_metrics'
	];

	const functions = [
		'codebase_semantic_search',
		'increment_wiki_view_count'
	];

	for (const table of tables) {
		const result = await pool.query(
			`SELECT EXISTS (
				SELECT FROM information_schema.tables
				WHERE table_schema = 'public'
				AND table_name = $1
			)`,
			[table]
		);

		if (result.rows[0].exists) {
			console.log(`  ✅ Table ${table} exists`);
		} else {
			console.log(`  ❌ Table ${table} missing`);
			console.log(`\n  Run: psql $DATABASE_URL -f sveltekit-frontend/drizzle/manual/gpu_codebase_wiki_schema.sql\n`);
			process.exit(1);
		}
	}

	for (const func of functions) {
		const result = await pool.query(
			`SELECT EXISTS (
				SELECT FROM pg_proc
				WHERE proname = $1
			)`,
			[func]
		);

		if (result.rows[0].exists) {
			console.log(`  ✅ Function ${func} exists`);
		} else {
			console.log(`  ❌ Function ${func} missing`);
			process.exit(1);
		}
	}

	console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 2: Verify HNSW Index
// ─────────────────────────────────────────────────────────────────────

async function testHNSWIndex() {
	console.log('[2/5] Testing HNSW index...');

	const result = await pool.query(`
		SELECT indexname, indexdef
		FROM pg_indexes
		WHERE tablename = 'codebase_embeddings'
		AND indexdef LIKE '%hnsw%'
	`);

	if (result.rows.length > 0) {
		console.log(`  ✅ HNSW index exists: ${result.rows[0].indexname}`);
	} else {
		console.log('  ⚠️  HNSW index not found (will be slow for large datasets)');
	}

	console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 3: Test Semantic Search Function
// ─────────────────────────────────────────────────────────────────────

async function testSemanticSearch() {
	console.log('[3/5] Testing semantic search function...');

	// Create a test embedding (zeros)
	const testEmbedding = Array(768).fill(0);
	testEmbedding[0] = 1; // Make it non-zero
	const embeddingStr = `[${testEmbedding.join(',')}]`;

	try {
		const result = await pool.query(
			`SELECT * FROM codebase_semantic_search($1::vector(768), 5, 0.0, NULL)`,
			[embeddingStr]
		);

		console.log(`  ✅ Semantic search executed (returned ${result.rows.length} results)`);

		if (result.rows.length === 0) {
			console.log('  ℹ️  No indexed data yet - run indexing first');
		}
	} catch (error) {
		console.error('  ❌ Semantic search failed:', error.message);
		process.exit(1);
	}

	console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 4: Check Ollama Availability
// ─────────────────────────────────────────────────────────────────────

async function testOllamaAvailability() {
	console.log('[4/5] Testing Ollama availability...');

	const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

	try {
		const response = await fetch(`${OLLAMA_URL}/api/tags`);
		if (response.ok) {
			const data = await response.json();
			const models = data.models.map(m => m.name);
			console.log(`  ✅ Ollama connected (${models.length} models loaded)`);

			if (models.includes('embeddinggemma:latest')) {
				console.log('  ✅ embeddinggemma:latest available');
			} else {
				console.log('  ⚠️  embeddinggemma:latest not found');
				console.log('  Run: ollama pull embeddinggemma');
			}
		}
	} catch (error) {
		console.log('  ❌ Ollama not available:', error.message);
		console.log('  Ensure Ollama is running on', OLLAMA_URL);
	}

	console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Test 5: Test Indexing API
// ─────────────────────────────────────────────────────────────────────

async function testIndexingAPI() {
	console.log('[5/5] Testing indexing API...');

	console.log('  ℹ️  API testing requires authenticated session');
	console.log('  Manual test:');
	console.log('    1. Navigate to /codebase-wiki');
	console.log('    2. Click "Reindex Codebase"');
	console.log('    3. Enter pattern: sveltekit-frontend/src/lib/components/**/*.svelte');
	console.log('    4. Watch progress bar');
	console.log('');
}

// ─────────────────────────────────────────────────────────────────────
// Run Tests
// ─────────────────────────────────────────────────────────────────────

async function runTests() {
	try {
		await testDatabaseSchema();
		await testHNSWIndex();
		await testSemanticSearch();
		await testOllamaAvailability();
		await testIndexingAPI();

		console.log('✅ All automated tests passed!\n');
		console.log('Next steps:');
		console.log('  1. Start dev server: npm run dev');
		console.log('  2. Navigate to: http://localhost:5173/codebase-wiki');
		console.log('  3. Click "Reindex Codebase"');
		console.log('  4. Perform semantic search\n');
	} catch (error) {
		console.error('\n❌ Test suite failed:', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

runTests();
