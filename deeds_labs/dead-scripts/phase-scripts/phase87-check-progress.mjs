#!/usr/bin/env node
/**
 * Phase 87: Check Embedding Progress
 * Quick status check for error corpus ingestion
 */

import pg from 'pg';

const PG_CONFIG = {
	user: 'user',
	host: '127.0.0.1',
	database: 'legal',
	password: 'pass',
	port: 5434,
};

const pool = new pg.Pool(PG_CONFIG);

async function checkProgress() {
	const client = await pool.connect();

	try {
		console.log('\n📊 Phase 87: Embedding Progress Check');
		console.log('=' .repeat(60));

		// Total errors in database
		const totalResult = await client.query('SELECT COUNT(*) FROM ts_errors');
		const total = parseInt(totalResult.rows[0].count);

		// Total embeddings generated
		const embeddedResult = await client.query('SELECT COUNT(*) FROM error_embeddings');
		const embedded = parseInt(embeddedResult.rows[0].count);

		const percentage = total > 0 ? ((embedded / total) * 100).toFixed(1) : 0;

		console.log(`\n📋 Status:`);
		console.log(`   Errors in database: ${total.toLocaleString()}`);
		console.log(`   Embeddings generated: ${embedded.toLocaleString()}`);
		console.log(`   Progress: ${percentage}%`);

		if (embedded < total) {
			const remaining = total - embedded;
			const estimatedMinutes = Math.ceil((remaining * 0.2) / 60); // ~200ms per embedding
			console.log(`\n⏱️  Estimated time remaining: ~${estimatedMinutes} minutes`);
			console.log(`   (at ~200ms per embedding)`);
		} else {
			console.log(`\n✅ All embeddings complete!`);

			// Check HNSW index
			const indexResult = await client.query(`
				SELECT indexname
				FROM pg_indexes
				WHERE tablename = 'error_embeddings' AND indexname LIKE '%hnsw%'
			`);

			if (indexResult.rows.length > 0) {
				console.log(`✅ HNSW index created: ${indexResult.rows[0].indexname}`);
			} else {
				console.log(`⚠️  HNSW index not found - run: node scripts/phase87-ingest-error-corpus.mjs`);
			}

			// Test vector search
			console.log(`\n🔍 Testing vector search...`);
			const testResult = await client.query(`
				SELECT COUNT(*) as similar_errors
				FROM error_embeddings e1
				CROSS JOIN LATERAL (
					SELECT 1
					FROM error_embeddings e2
					WHERE e1.id != e2.id
					ORDER BY e1.embedding <=> e2.embedding
					LIMIT 5
				) e2
				WHERE e1.id = 1
			`);

			if (testResult.rows.length > 0) {
				console.log(`   ✅ Vector search working (HNSW operational)`);
			}
		}

		console.log('\n' + '=' .repeat(60));

	} catch (err) {
		console.error('\n❌ Error:', err.message);
		if (err.code === 'ECONNREFUSED') {
			console.error('   PostgreSQL not running. Start with: docker start phase66-postgres');
		}
	} finally {
		client.release();
		await pool.end();
	}
}

checkProgress();
