#!/usr/bin/env node
/**
 * Phase 76: KB Manifest Ingestion for Operator Docs + LLM Outputs
 *
 * Ingests ACE operator documentation and successful LLM outputs into:
 * - Qdrant phase76_knowledge_base
 * - Postgres kb_chunks table
 *
 * This enables Phase 87 to retrieve:
 * - Operator playbooks (how to fix specific patterns)
 * - Successful diff patches (proven fixes)
 * - ACE prompting strategies
 *
 * Usage:
 *   node scripts/phase76-manifest-ingest.mjs --manifest data/knowledge/kb-manifest-ace.txt
 *   node scripts/phase76-manifest-ingest.mjs --llm-outputs reports/phase86/runs/*.json
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs';
import { Ollama } from 'ollama';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ============================================================================
// Configuration
// ============================================================================

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const PG_CONFIG = {
	user: process.env.PG_USER || 'user',
	host: process.env.PG_HOST || '127.0.0.1',
	database: process.env.PG_DATABASE || 'legal',
	password: process.env.PG_PASSWORD || 'pass',
	port: parseInt(process.env.PG_PORT || '5434'),
};

const EMBEDDING_MODEL = 'embeddinggemma:latest';
const EMBEDDING_DIM = 768;
const COLLECTION_NAME = 'phase76_knowledge_base';

const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 200;

const ollama = new Ollama({ host: OLLAMA_URL });
const qdrant = new QdrantClient({ url: QDRANT_URL });
const pool = new pg.Pool(PG_CONFIG);

// ============================================================================
// Chunking Logic
// ============================================================================

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
	if (text.length <= chunkSize) {
		return [{ text, start: 0, end: text.length }];
	}

	const chunks = [];
	let start = 0;

	while (start < text.length) {
		let end = Math.min(start + chunkSize, text.length);

		// Try to break at sentence boundary
		if (end < text.length) {
			const searchStart = Math.max(start, end - 200);
			const lastPeriod = text.lastIndexOf('. ', end);
			const lastNewline = text.lastIndexOf('\n', end);
			const lastBreak = Math.max(lastPeriod, lastNewline);

			if (lastBreak > searchStart) {
				end = lastBreak + 1;
			}
		}

		const chunkText = text.slice(start, end).trim();
		if (chunkText) {
			chunks.push({ text: chunkText, start, end });
		}

		start = end - overlap;
	}

	return chunks;
}

// ============================================================================
// Embedding Generation
// ============================================================================

async function getEmbedding(text) {
	const response = await ollama.embeddings({
		model: EMBEDDING_MODEL,
		prompt: text,
	});

	if (!response.embedding || response.embedding.length !== EMBEDDING_DIM) {
		throw new Error(`Invalid embedding dimension: ${response.embedding?.length}`);
	}

	return response.embedding;
}

// ============================================================================
// Qdrant Collection Setup
// ============================================================================

async function ensureQdrantCollection() {
	try {
		await qdrant.getCollection(COLLECTION_NAME);
		console.log(`   ✅ Qdrant collection exists: ${COLLECTION_NAME}`);
	} catch {
		console.log(`   📦 Creating Qdrant collection: ${COLLECTION_NAME}`);
		await qdrant.createCollection(COLLECTION_NAME, {
			vectors: {
				size: EMBEDDING_DIM,
				distance: 'Cosine',
			},
		});
	}
}

// ============================================================================
// Postgres Table Setup
// ============================================================================

async function ensurePostgresTables() {
	const client = await pool.connect();

	try {
		const createTableSQL = `
			CREATE TABLE IF NOT EXISTS kb_chunks (
				id SERIAL PRIMARY KEY,
				source_file TEXT NOT NULL,
				chunk_id INTEGER NOT NULL,
				chunk_text TEXT NOT NULL,
				chunk_start INTEGER,
				chunk_end INTEGER,
				kind TEXT NOT NULL,  -- 'ace_operator_doc', 'ace_llm_output', etc.
				tags TEXT[],
				embedding vector(768),
				created_at TIMESTAMP DEFAULT NOW(),
				UNIQUE(source_file, chunk_id)
			);

			CREATE INDEX IF NOT EXISTS kb_chunks_kind_idx ON kb_chunks(kind);
			CREATE INDEX IF NOT EXISTS kb_chunks_tags_idx ON kb_chunks USING GIN(tags);
			CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
		`;

		await client.query(createTableSQL);
		console.log('   ✅ Postgres kb_chunks table ready');
	} finally {
		client.release();
	}
}

// ============================================================================
// Ingest Single Document
// ============================================================================

async function ingestDocument(filePath, kind, tags) {
	const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);

	if (!fs.existsSync(fullPath)) {
		console.log(`   ⚠️  File not found: ${filePath}`);
		return 0;
	}

	const content = fs.readFileSync(fullPath, 'utf-8');
	const chunks = chunkText(content);

	console.log(`   📄 ${path.basename(filePath)}: ${chunks.length} chunks`);

	const client = await pool.connect();
	let ingested = 0;

	try {
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];

			// Generate embedding
			const embedding = await getEmbedding(chunk.text);

			// Insert into Postgres
			await client.query(
				`
				INSERT INTO kb_chunks (source_file, chunk_id, chunk_text, chunk_start, chunk_end, kind, tags, embedding)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT (source_file, chunk_id) DO UPDATE SET
					chunk_text = EXCLUDED.chunk_text,
					embedding = EXCLUDED.embedding,
					tags = EXCLUDED.tags
			`,
				[filePath, i, chunk.text, chunk.start, chunk.end, kind, tags, JSON.stringify(embedding)]
			);

			// Insert into Qdrant
			const pointId = `${filePath}_chunk_${i}`.replace(/[^a-zA-Z0-9_-]/g, '_');
			await qdrant.upsert(COLLECTION_NAME, {
				points: [
					{
						id: pointId,
						vector: embedding,
						payload: {
							source_file: filePath,
							chunk_id: i,
							text: chunk.text,
							kind,
							tags,
						},
					},
				],
			});

			ingested++;
			process.stdout.write(`\r      Progress: ${i + 1}/${chunks.length}`);
		}

		console.log(''); // newline
	} finally {
		client.release();
	}

	return ingested;
}

// ============================================================================
// Ingest from Manifest File
// ============================================================================

async function ingestManifest(manifestPath, kind, tags) {
	const fullPath = path.isAbsolute(manifestPath) ? manifestPath : path.join(ROOT, manifestPath);

	if (!fs.existsSync(fullPath)) {
		throw new Error(`Manifest not found: ${manifestPath}`);
	}

	const lines = fs
		.readFileSync(fullPath, 'utf-8')
		.split('\n')
		.map(l => l.trim())
		.filter(l => l && !l.startsWith('#'));

	console.log(`📋 Manifest: ${path.basename(manifestPath)} (${lines.length} files)`);
	console.log('');

	let totalIngested = 0;

	for (const filePath of lines) {
		const count = await ingestDocument(filePath, kind, tags);
		totalIngested += count;
	}

	return totalIngested;
}

// ============================================================================
// Ingest LLM Outputs
// ============================================================================

async function ingestLLMOutputs(pattern) {
	const glob = await import('glob');
	const files = glob.sync(pattern, { cwd: ROOT });

	console.log(`🤖 LLM Outputs: ${files.length} files matching ${pattern}`);
	console.log('');

	let totalIngested = 0;

	for (const file of files) {
		const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf-8'));

		// Extract key parts
		const text = [
			`Run ID: ${data.runId || 'unknown'}`,
			`Prompt: ${data.prompt || ''}`,
			`LLM Output:\n${data.output || data.response || ''}`,
			`Status: ${data.status || 'unknown'}`,
			`Errors Fixed: ${data.errorsFixed || 0}`,
		].join('\n\n');

		// Ingest as single "document"
		const chunks = chunkText(text);
		const tags = ['llm-output', 'phase86', data.status || 'unknown'];

		console.log(`   📄 ${path.basename(file)}: ${chunks.length} chunks`);

		const client = await pool.connect();

		try {
			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i];
				const embedding = await getEmbedding(chunk.text);

				await client.query(
					`
					INSERT INTO kb_chunks (source_file, chunk_id, chunk_text, chunk_start, chunk_end, kind, tags, embedding)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					ON CONFLICT (source_file, chunk_id) DO UPDATE SET
						chunk_text = EXCLUDED.chunk_text,
						embedding = EXCLUDED.embedding,
						tags = EXCLUDED.tags
				`,
					[file, i, chunk.text, chunk.start, chunk.end, 'ace_llm_output', tags, JSON.stringify(embedding)]
				);

				const pointId = `${file}_chunk_${i}`.replace(/[^a-zA-Z0-9_-]/g, '_');
				await qdrant.upsert(COLLECTION_NAME, {
					points: [
						{
							id: pointId,
							vector: embedding,
							payload: { source_file: file, chunk_id: i, text: chunk.text, kind: 'ace_llm_output', tags },
						},
					],
				});

				totalIngested++;
			}

			console.log(`      ✅ Ingested ${chunks.length} chunks`);
		} finally {
			client.release();
		}
	}

	return totalIngested;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	const args = process.argv.slice(2);

	console.log('🚀 Phase 76: KB Manifest Ingestion');
	console.log('=' .repeat(80));
	console.log(`📊 Qdrant: ${QDRANT_URL}`);
	console.log(`📊 PostgreSQL: postgresql://${PG_CONFIG.user}@${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`);
	console.log(`🧠 Embedding Model: ${EMBEDDING_MODEL} (${EMBEDDING_DIM}D)`);
	console.log('');

	// Setup
	await ensureQdrantCollection();
	await ensurePostgresTables();
	console.log('');

	let totalIngested = 0;

	// Parse arguments
	if (args.includes('--manifest')) {
		const manifestIdx = args.indexOf('--manifest');
		const manifestPath = args[manifestIdx + 1];
		const kind = args.includes('--kind') ? args[args.indexOf('--kind') + 1] : 'ace_operator_doc';
		const tags = args.includes('--tags') ? args[args.indexOf('--tags') + 1].split(',') : ['ace', 'operator-docs'];

		totalIngested = await ingestManifest(manifestPath, kind, tags);
	} else if (args.includes('--llm-outputs')) {
		const patternIdx = args.indexOf('--llm-outputs');
		const pattern = args[patternIdx + 1];

		totalIngested = await ingestLLMOutputs(pattern);
	} else {
		console.log('Usage:');
		console.log('  node scripts/phase76-manifest-ingest.mjs --manifest <path> [--kind <kind>] [--tags <tag1,tag2>]');
		console.log('  node scripts/phase76-manifest-ingest.mjs --llm-outputs <glob-pattern>');
		console.log('');
		console.log('Examples:');
		console.log('  node scripts/phase76-manifest-ingest.mjs --manifest data/knowledge/kb-manifest-ace.txt --kind ace_operator_doc');
		console.log('  node scripts/phase76-manifest-ingest.mjs --llm-outputs "reports/phase86/runs/*.json"');
		process.exit(1);
	}

	console.log('');
	console.log('=' .repeat(80));
	console.log(`✅ Ingestion Complete: ${totalIngested} chunks`);
	console.log('=' .repeat(80));

	await pool.end();
}

main().catch(err => {
	console.error('❌ Error:', err.message);
	console.error(err.stack);
	process.exit(1);
});
