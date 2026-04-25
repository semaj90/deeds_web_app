#!/usr/bin/env node
/**
 * Setup Qdrant Collection for Phase 72 Error Patterns
 *
 * Creates collection for storing 16,444 TypeScript errors with:
 * - 768-dim embeddings (embeddinggemma:latest)
 * - Metadata indexes (file, line, error category)
 * - Auto-tagging support
 *
 * Loads configuration from .env.phase72
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.phase72
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'phase72_error_patterns';
const VECTOR_SIZE = parseInt(process.env.QDRANT_VECTOR_SIZE || '768', 10);

async function setupQdrantCollection() {
	console.log('\n🚀 Setting up Qdrant Collection for Phase 72\n');
	console.log(`📝 Qdrant URL: ${QDRANT_URL}`);
	console.log(`📝 Collection: ${COLLECTION_NAME}`);
	console.log(`📝 Vector Size: ${VECTOR_SIZE}\n`);

	try {
		// Check if collection exists (try both API paths)
		console.log('1️⃣ Checking if collection exists...');
		let getResponse = await fetch(`${QDRANT_URL}/api/v1/collections/${COLLECTION_NAME}`);

		if (getResponse.status === 404 && !getResponse.url.includes('/api/v1')) {
			getResponse = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
		}

		if (getResponse.ok) {
			console.log(`   ✅ Collection '${COLLECTION_NAME}' already exists\n`);

			// Get collection info
			const collectionData = await getResponse.json();
			console.log('📊 Collection Info:');
			console.log(`   - Vectors count: ${collectionData.result.vectors_count || 0}`);
			console.log(`   - Vector size: ${collectionData.result.config.params.vectors.size || VECTOR_SIZE}\n`);

			return;
		}

		// Create collection
		console.log(`2️⃣ Creating collection '${COLLECTION_NAME}'...\n`);

		const createResponse = await fetch(`${QDRANT_URL}/collections`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				collection_name: COLLECTION_NAME,
				vectors: {
					size: VECTOR_SIZE,
					distance: 'Cosine',
					on_disk: false
				},
				shard_number: 1,
				replication_factor: 1
			})
		});

		if (!createResponse.ok) {
			const error = await createResponse.text();
			console.error(`❌ Failed to create collection: ${error}`);
			process.exit(1);
		}

		console.log(`✅ Collection created successfully!\n`);

		// Create payload indexes
		console.log('3️⃣ Creating payload indexes...\n');

		const indexFields = [
			{ name: 'file', type: 'text' },
			{ name: 'error_code', type: 'keyword' },
			{ name: 'line', type: 'integer' },
			{ name: 'category', type: 'keyword' },
			{ name: 'severity', type: 'keyword' },
			{ name: 'auto_tag', type: 'keyword' },
			{ name: 'kag_hit', type: 'keyword' },
			{ name: 'verified', type: 'keyword' }
		];

		for (const field of indexFields) {
			try {
				const indexResponse = await fetch(
					`${QDRANT_URL}/collections/${COLLECTION_NAME}/index`,
					{
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							field_name: field.name,
							field_schema: field.type
						})
					}
				);

				if (indexResponse.ok) {
					console.log(`   ✅ Index '${field.name}' created (${field.type})`);
				} else {
					console.log(`   ⚠️ Index '${field.name}' skipped or already exists`);
				}
			} catch (error) {
				console.log(`   ⚠️ Index '${field.name}' error: ${error.message}`);
			}
		}

		console.log(`\n✅ Qdrant collection '${COLLECTION_NAME}' is ready for Phase 72 error embeddings!\n`);
		console.log('📋 Next steps:');
		console.log('   1. Run: npm run phase72:embed-errors');
		console.log('   2. Run: npm run phase72:fix-batch');
		console.log('   3. Verify: npm run phase72:stats\n');

	} catch (error) {
		console.error(`❌ Error: ${error.message}`);
		process.exit(1);
	}
}

setupQdrantCollection().catch(console.error);
