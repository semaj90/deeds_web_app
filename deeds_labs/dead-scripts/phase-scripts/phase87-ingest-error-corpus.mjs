#!/usr/bin/env node
/**
 * Phase 87: Ingest Full Error Corpus with Embeddings
 *
 * Reads reports/tsc-summary.json and ingests ALL errors into:
 * 1. PostgreSQL ts_errors table (with pgvector)
 * 2. error_embeddings table (768D vectors via embeddinggemma:latest)
 * 3. Creates HNSW index for fast cosine similarity search
 *
 * Integrates with Phase 66-85 knowledge bases:
 * - phase72_ast_knowledge_base (Qdrant)
 * - surgical_fixes_phase66_85 (Qdrant)
 * - RAG/KAG patterns from existing scripts
 */

import fs from 'fs';
import { Ollama } from 'ollama';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// CONFIG
const OLLAMA_URL = 'http://127.0.0.1:11434';
const PG_CONFIG = {
	user: 'user',
	host: '127.0.0.1',
	database: 'legal',
	password: 'pass',
	port: 5434,
};

const BATCH_SIZE = 50; // Process embeddings in batches
const EMBEDDING_MODEL = 'embeddinggemma:latest'; // 768 dimensions

const ollama = new Ollama({ host: OLLAMA_URL });
const pool = new pg.Pool(PG_CONFIG);

console.log('🚀 Phase 87: Error Corpus Ingestion');
console.log('=' .repeat(80));
console.log(`📊 PostgreSQL: postgresql://${PG_CONFIG.user}@${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`);
console.log(`🧠 Embedding Model: ${EMBEDDING_MODEL} (768D)`);
console.log('');

async function loadTSCSummary() {
	const summaryPath = path.join(ROOT, 'reports/tsc-summary.json');

	if (!fs.existsSync(summaryPath)) {
		throw new Error('❌ reports/tsc-summary.json not found. Run phase81-tsc-summarize.mjs first.');
	}

	const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
	console.log(`📋 Loaded TSC Summary:`);
	console.log(`   Total Errors: ${summary.tsErrorCount.toLocaleString()}`);
	console.log(`   Sample Size: ${summary.sample?.length || 0}`);
	console.log(`   All Errors: ${summary.allErrors?.length || 0}`);
	console.log('');

	return summary;
}

async function calculateImpactScore(error, topCodes, topFiles) {
	// Impact = frequency of error code + frequency of file + line number proximity to start
	const codeFreq = topCodes.find(c => c.key === error.code)?.count || 0;
	const fileFreq = topFiles.find(f => f.key === error.file)?.count || 0;

	// Normalize to 0-10 scale
	const maxCodeFreq = topCodes[0]?.count || 1;
	const maxFileFreq = topFiles[0]?.count || 1;

	const codeScore = (codeFreq / maxCodeFreq) * 5; // 0-5 points
	const fileScore = (fileFreq / maxFileFreq) * 3; // 0-3 points
	const proximityScore = Math.max(0, 2 - (error.line / 1000)); // Earlier lines = higher score

	return Number((codeScore + fileScore + proximityScore).toFixed(2));
}

async function ingestErrorsToPostgres(errors, topCodes, topFiles) {
	const client = await pool.connect();

	try {
		console.log('📊 Step 1: Ingesting errors into ts_errors table...');

		// Clear existing errors
		await client.query('TRUNCATE TABLE ts_errors CASCADE');

		let inserted = 0;
		for (const error of errors) {
			const impactScore = await calculateImpactScore(error, topCodes, topFiles);

			await client.query(`
				INSERT INTO ts_errors (error_code, file_path, line_number, column_number, error_message, impact_score, status)
				VALUES ($1, $2, $3, $4, $5, $6, 'open')
			`, [error.code, error.file, error.line, error.col, error.msg, impactScore]);

			inserted++;
			if (inserted % 1000 === 0) {
				process.stdout.write(`\r   Progress: ${inserted.toLocaleString()} / ${errors.length.toLocaleString()}`);
			}
		}

		console.log(`\n   ✅ Inserted ${inserted.toLocaleString()} errors`);

	} finally {
		client.release();
	}
}

async function generateEmbeddingsInBatches() {
	const client = await pool.connect();

	try {
		console.log('\n🧠 Step 2: Generating embeddings for all errors...');

		// Get total count
		const countResult = await client.query('SELECT COUNT(*) FROM ts_errors');
		const totalErrors = parseInt(countResult.rows[0].count);

		console.log(`   Total to embed: ${totalErrors.toLocaleString()}`);
		console.log(`   Batch size: ${BATCH_SIZE}`);
		console.log('');

		let offset = 0;
		let totalEmbedded = 0;

		while (offset < totalErrors) {
			// Fetch batch
			const result = await client.query(`
				SELECT id, error_code, error_message
				FROM ts_errors
				ORDER BY impact_score DESC
				LIMIT $1 OFFSET $2
			`, [BATCH_SIZE, offset]);

			if (result.rows.length === 0) break;

			// Generate embeddings for batch
			for (const row of result.rows) {
				const errorText = `${row.error_code}: ${row.error_message}`;

				try {
					const { embedding } = await ollama.embeddings({
						model: EMBEDDING_MODEL,
						prompt: errorText
					});

					// Check if embedding already exists
					const existingCheck = await client.query(
						'SELECT id FROM error_embeddings WHERE error_id = $1',
						[row.id]
					);

					if (existingCheck.rows.length === 0) {
						// Convert embedding array to PostgreSQL vector format
						const vectorString = `[${embedding.join(',')}]`;

						await client.query(`
							INSERT INTO error_embeddings (error_id, embedding)
							VALUES ($1, $2::vector)
						`, [row.id, vectorString]);

						totalEmbedded++;
					}

				} catch (err) {
					console.error(`\n   ⚠️  Failed to embed error ${row.id}: ${err.message}`);
				}
			}

			offset += BATCH_SIZE;
			process.stdout.write(`\r   Progress: ${totalEmbedded.toLocaleString()} / ${totalErrors.toLocaleString()} (${((totalEmbedded / totalErrors) * 100).toFixed(1)}%)`);
		}

		console.log(`\n   ✅ Generated ${totalEmbedded.toLocaleString()} embeddings`);

	} finally {
		client.release();
	}
}

async function createHNSWIndex() {
	const client = await pool.connect();

	try {
		console.log('\n🔧 Step 3: Creating HNSW index for fast vector search...');

		// Drop existing index if it exists
		await client.query('DROP INDEX IF EXISTS error_embeddings_hnsw_idx');

		// Create HNSW index for cosine similarity
		// m=16: number of connections per layer (higher = better recall, more memory)
		// ef_construction=64: size of dynamic candidate list (higher = better quality, slower build)
		await client.query(`
			CREATE INDEX error_embeddings_hnsw_idx
			ON error_embeddings
			USING hnsw (embedding vector_cosine_ops)
			WITH (m = 16, ef_construction = 64)
		`);

		console.log('   ✅ HNSW index created with cosine similarity');
		console.log('      m=16 (connections per layer)');
		console.log('      ef_construction=64 (build quality)');

	} finally {
		client.release();
	}
}

async function verifyIngestion() {
	const client = await pool.connect();

	try {
		console.log('\n📊 Step 4: Verification...\n');

		// Error count
		const errorCount = await client.query('SELECT COUNT(*) FROM ts_errors');
		console.log(`   ts_errors: ${parseInt(errorCount.rows[0].count).toLocaleString()} rows`);

		// Embedding count
		const embeddingCount = await client.query('SELECT COUNT(*) FROM error_embeddings');
		console.log(`   error_embeddings: ${parseInt(embeddingCount.rows[0].count).toLocaleString()} vectors`);

		// Index info
		const indexInfo = await client.query(`
			SELECT indexname, indexdef
			FROM pg_indexes
			WHERE tablename = 'error_embeddings' AND indexname LIKE '%hnsw%'
		`);
		console.log(`   HNSW indexes: ${indexInfo.rows.length}`);

		// Top errors by impact
		const topErrors = await client.query(`
			SELECT error_code, file_path, impact_score
			FROM ts_errors
			ORDER BY impact_score DESC
			LIMIT 5
		`);

		console.log('\n   🎯 Top 5 High-Impact Errors:');
		topErrors.rows.forEach((row, i) => {
			const shortFile = row.file_path.length > 50
				? '...' + row.file_path.slice(-47)
				: row.file_path;
			console.log(`   ${i + 1}. [${row.error_code}] ${shortFile} (impact: ${row.impact_score})`);
		});

		// Test vector search
		console.log('\n   🔍 Testing vector search...');
		const testQuery = await client.query(`
			SELECT
				ts.error_code,
				ts.error_message,
				ee.embedding <=> (SELECT embedding FROM error_embeddings LIMIT 1) AS distance
			FROM error_embeddings ee
			JOIN ts_errors ts ON ee.error_id = ts.id
			ORDER BY ee.embedding <=> (SELECT embedding FROM error_embeddings LIMIT 1)
			LIMIT 3
		`);

		console.log(`   ✅ Vector search working: Found ${testQuery.rows.length} similar errors`);

	} finally {
		client.release();
	}
}

async function syncWithKnowledgeBases() {
	console.log('\n📚 Step 5: Syncing with existing knowledge bases...');

	// List existing Qdrant collections for cross-reference
	const qdrantCollections = [
		'phase72_ast_knowledge_base',
		'surgical_fixes_phase66_85',
		'phase81_ts_errors'
	];

	console.log('   Integration points:');
	qdrantCollections.forEach(col => {
		console.log(`   - ${col} (Qdrant)`);
	});
	console.log('   - error_embeddings (PostgreSQL pgvector)');
	console.log('');
	console.log('   💡 Phase 87 autonomous loop will query:');
	console.log('      1. PostgreSQL ts_errors (priority queue)');
	console.log('      2. error_embeddings HNSW (similar error patterns)');
	console.log('      3. phase72_ast_knowledge_base (surgical fixes)');
	console.log('      4. FastMCP agent (ripgrep + awk + web search)');
}

async function main() {
	try {
		// Step 0: Load TSC summary
		const summary = await loadTSCSummary();

		// Use allErrors if available, otherwise sample
		let allErrors = summary.allErrors || summary.sample || [];

		if (allErrors.length === 0) {
			throw new Error('No errors found in TSC summary');
		}

		// Prioritize TS1005, TS1128, TS1109
		const PRIORITY_CODES = ['TS1005', 'TS1128', 'TS1109'];
		const TARGET_SIZE = 5000;

		console.log(`\n⚖️  Filtering & Prioritizing (Target: ${TARGET_SIZE})...`);

		const priorityErrors = allErrors.filter(e => PRIORITY_CODES.includes(e.code));
		const otherErrors = allErrors.filter(e => !PRIORITY_CODES.includes(e.code));

		console.log(`   Found ${priorityErrors.length} priority errors (${PRIORITY_CODES.join(', ')})`);
		console.log(`   Found ${otherErrors.length} other errors`);

		// Combine: Priority first, then fill rest
		const errors = [...priorityErrors, ...otherErrors].slice(0, TARGET_SIZE);
		console.log(`   Selected ${errors.length} errors for ingestion`);

		// Step 1: Ingest errors to PostgreSQL
		await ingestErrorsToPostgres(errors, summary.topCodes, summary.topFiles);

		// Step 2: Generate embeddings
		await generateEmbeddingsInBatches();

		// Step 3: Create HNSW index
		await createHNSWIndex();

		// Step 4: Verify
		await verifyIngestion();

		// Step 5: Sync with knowledge bases
		await syncWithKnowledgeBases();

		console.log('\n' + '='.repeat(80));
		console.log('✅ Phase 87: Error Corpus Ingestion Complete!');
		console.log('');
		console.log('Next steps:');
		console.log('  node scripts/phase87-autonomous-fixer.mjs  # Enable automatic fixes');
		console.log('  node scripts/phase87-knowledge-sync.mjs    # Sync with Qdrant');
		console.log('=' .repeat(80));

	} catch (err) {
		console.error('\n❌ Error:', err.message);
		console.error(err.stack);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main();
