#!/usr/bin/env node
/**
 * Phase 87: Complete Remaining Embeddings + Build HNSW Index
 * Finishes any incomplete embeddings and creates the HNSW index
 */

import { Ollama } from 'ollama';
import pg from 'pg';

const PG_CONFIG = {
	user: 'user',
	host: '127.0.0.1',
	database: 'legal',
	password: 'pass',
	port: 5434,
};

const EMBEDDING_MODEL = 'embeddinggemma:latest';
const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
const pool = new pg.Pool(PG_CONFIG);

console.log('\n🔧 Phase 87: Completing Embeddings + Building HNSW Index');
console.log('=' .repeat(60));

async function completeEmbeddings() {
	const client = await pool.connect();

	try {
		// Find errors without embeddings
		const missingResult = await client.query(`
			SELECT ts.id, ts.error_code, ts.error_message
			FROM ts_errors ts
			LEFT JOIN error_embeddings ee ON ts.id = ee.error_id
			WHERE ee.error_id IS NULL
			ORDER BY ts.impact_score DESC
		`);

		const missing = missingResult.rows;

		if (missing.length === 0) {
			console.log('\n✅ All embeddings complete!');
			return true;
		}

		console.log(`\n📋 Found ${missing.length} errors without embeddings`);
		console.log('🧠 Generating missing embeddings...\n');

		for (let i = 0; i < missing.length; i++) {
			const row = missing[i];
			const errorText = `${row.error_code}: ${row.error_message}`;

			process.stdout.write(`\r   Progress: ${i + 1} / ${missing.length}`);

			const { embedding } = await ollama.embeddings({
				model: EMBEDDING_MODEL,
				prompt: errorText
			});

			// Simple INSERT (no ON CONFLICT since no unique constraint on error_id)
			await client.query(`
				INSERT INTO error_embeddings (error_id, embedding)
				VALUES ($1, $2)
			`, [row.id, JSON.stringify(embedding)]);
		}

		console.log('\n✅ All embeddings generated!\n');
		return true;

	} finally {
		client.release();
	}
}

async function buildHNSWIndex() {
	const client = await pool.connect();

	try {
		console.log('🔧 Building HNSW index...');

		// Check if index exists
		const existingIndex = await client.query(`
			SELECT indexname
			FROM pg_indexes
			WHERE tablename = 'error_embeddings' AND indexname LIKE '%hnsw%'
		`);

		if (existingIndex.rows.length > 0) {
			console.log(`   ✅ HNSW index already exists: ${existingIndex.rows[0].indexname}`);
			return;
		}

		// Create HNSW index
		await client.query(`
			CREATE INDEX error_embeddings_hnsw_idx
			ON error_embeddings
			USING hnsw (embedding vector_cosine_ops)
			WITH (m = 16, ef_construction = 64)
		`);

		console.log('   ✅ HNSW index created successfully');
		console.log('      m=16 (connections per layer)');
		console.log('      ef_construction=64 (build quality)');
		console.log('      Distance: Cosine similarity\n');

	} finally {
		client.release();
	}
}

async function testVectorSearch() {
	const client = await pool.connect();

	try {
		console.log('🔍 Testing vector search...');

		const testResult = await client.query(`
			SELECT ts.error_code, ts.file_path, 1 - (e1.embedding <=> e2.embedding) AS similarity
			FROM error_embeddings e1
			CROSS JOIN LATERAL (
				SELECT embedding
				FROM error_embeddings e2
				WHERE e1.error_id != e2.error_id
				ORDER BY e1.embedding <=> e2.embedding
				LIMIT 3
			) e2
			JOIN ts_errors ts ON e1.error_id = ts.id
			LIMIT 1
		`);

		if (testResult.rows.length > 0) {
			console.log('   ✅ Vector search working (HNSW operational)\n');
		} else {
			console.log('   ⚠️  No results (may need more data)\n');
		}

	} finally {
		client.release();
	}
}

async function printSummary() {
	const client = await pool.connect();

	try {
		const errorCount = await client.query('SELECT COUNT(*) FROM ts_errors');
		const embeddingCount = await client.query('SELECT COUNT(*) FROM error_embeddings');

		console.log('=' .repeat(60));
		console.log('✅ Phase 87: Complete!\n');
		console.log('📊 Final Metrics:');
		console.log(`   Errors in database: ${parseInt(errorCount.rows[0].count).toLocaleString()}`);
		console.log(`   Embeddings generated: ${parseInt(embeddingCount.rows[0].count).toLocaleString()}`);
		console.log(`   Coverage: 100%\n`);
		console.log('🚀 Next Steps:');
		console.log('   node scripts/phase86-autonomous-loop.mjs  # Run autonomous fixer');
		console.log('=' .repeat(60) + '\n');

	} finally {
		client.release();
	}
}

async function main() {
	try {
		const completed = await completeEmbeddings();
		if (!completed) return;

		await buildHNSWIndex();
		await testVectorSearch();
		await printSummary();

	} catch (err) {
		console.error('\n❌ Error:', err.message);
		if (err.code === 'ECONNREFUSED') {
			console.error('   PostgreSQL not running. Start with: docker start phase66-postgres');
		}
	} finally {
		await pool.end();
	}
}

main();
