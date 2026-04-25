#!/usr/bin/env node
/**
 * Test Error Search - Semantic Vector Search in Qdrant
 *
 * Usage: node scripts/test-error-search.mjs "Cannot find name"
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'phase72_error_patterns';

const searchQuery = process.argv[2] || 'Cannot find name';

console.log('\n🔍 Phase 72 - Semantic Error Search\n');
console.log(`📝 Query: "${searchQuery}"`);
console.log(`📊 Collection: ${QDRANT_COLLECTION}\n`);

/**
 * Generate embedding for search query
 */
async function generateEmbedding(text) {
	try {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_EMBEDDING_MODEL,
				prompt: text
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();
		return data.embedding;
	} catch (error) {
		console.error(`❌ Embedding generation failed: ${error.message}`);
		return null;
	}
}

/**
 * Search Qdrant for similar errors
 */
async function searchSimilarErrors(embedding, limit = 10) {
	try {
		const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: embedding,
				limit: limit,
				with_payload: true,
				with_vector: false
			}),
			signal: AbortSignal.timeout(10000)
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
		}

		const data = await response.json();
		return data.result;
	} catch (error) {
		console.error(`❌ Search failed: ${error.message}`);
		return null;
	}
}

/**
 * Main search function
 */
async function main() {
	try {
		// Generate embedding for query
		console.log('⏳ Generating query embedding...');
		const embedding = await generateEmbedding(searchQuery);

		if (!embedding || embedding.length !== 768) {
			throw new Error('Failed to generate valid embedding');
		}

		console.log('✅ Embedding generated (768 dimensions)\n');

		// Search Qdrant
		console.log('🔎 Searching for similar errors...\n');
		const results = await searchSimilarErrors(embedding, 10);

		if (!results || results.length === 0) {
			console.log('❌ No similar errors found\n');
			return;
		}

		console.log(`📊 Found ${results.length} similar errors:\n`);
		console.log('═'.repeat(80));

		results.forEach((result, idx) => {
			const payload = result.payload;
			const score = (result.score * 100).toFixed(1);

			console.log(`\n${idx + 1}. [Score: ${score}%] ${payload.category || 'unknown'}`);
			console.log(`   File: ${payload.file}:${payload.line}`);
			console.log(`   Code: ${payload.error_code}`);
			console.log(`   Message: ${payload.message}`);
			console.log(`   Severity: ${payload.severity}`);

			if (payload.verified) {
				console.log(`   ✅ Verified fix available`);
			}
			if (payload.kag_hit) {
				console.log(`   🎯 KAG cache hit`);
			}
		});

		console.log('\n' + '═'.repeat(80));
		console.log('\n✅ Search complete!\n');

	} catch (error) {
		console.error(`\n❌ Error during search:`);
		console.error(`   ${error.message}\n`);
		process.exit(1);
	}
}

main().catch(console.error);
