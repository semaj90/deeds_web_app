#!/usr/bin/env node
/**
 * Phase 81: Infrastructure Test
 * Tests Qdrant, PostgreSQL (pgvector), CouchDB, and Ollama embeddinggemma
 */

import { Ollama } from 'ollama';
import pg from 'pg';
const { Client } = pg;

console.log('🧪 Phase 81: Infrastructure Test\n');

// Test 1: Ollama embeddinggemma
console.log('1️⃣  Testing Ollama embeddinggemma...');
try {
	const ollama = new Ollama({ host: 'http://localhost:11434' });
	const response = await ollama.embeddings({
		model: 'embeddinggemma:latest',
		prompt: 'Phase 81 TypeScript error analysis test'
	});
	console.log(`   ✅ Embedding dimensions: ${response.embedding.length}`);
	console.log(`   📊 Sample values: [${response.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]\n`);
} catch (error) {
	console.error(`   ❌ Ollama test failed:`, error.message);
}

// Test 2: Qdrant
console.log('2️⃣  Testing Qdrant vector DB...');
try {
	const response = await fetch('http://localhost:6333/collections');
	const data = await response.json();
	const collections = data.result.collections;
	console.log(`   ✅ Found ${collections.length} collections:`);
	collections.slice(0, 5).forEach(c => {
		console.log(`      - ${c.name}: ${c.points_count || 0} points`);
	});
	console.log('');
} catch (error) {
	console.error(`   ❌ Qdrant test failed:`, error.message);
}

// Test 3: PostgreSQL + pgvector
console.log('3️⃣  Testing PostgreSQL + pgvector...');
try {
	// Try different user configurations
	const configs = [
		{ user: 'user', password: 'pass', database: 'legal' },
		{ user: 'postgres', password: 'postgres', database: 'postgres' },
		{ user: 'legal_user', password: 'legalai2024', database: 'legal_ai_db' }
	];

	let connected = false;
	for (const config of configs) {
		try {
			const client = new Client({
				host: 'localhost',
				port: 5432,
				...config
			});
			await client.connect();

			// Check pgvector extension
			const extResult = await client.query(
				"SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
			);

			console.log(`   ✅ Connected as ${config.user}@${config.database}`);
			if (extResult.rows.length > 0) {
				console.log(`   ✅ pgvector ${extResult.rows[0].extversion} installed`);
			} else {
				console.log(`   ⚠️  pgvector not installed`);
			}

			// List tables
			const tablesResult = await client.query(`
				SELECT tablename
				FROM pg_tables
				WHERE schemaname = 'public'
				ORDER BY tablename
			`);
			console.log(`   📊 Tables: ${tablesResult.rows.map(r => r.tablename).join(', ') || 'none'}\n`);

			await client.end();
			connected = true;
			break;
		} catch (err) {
			// Try next config
			continue;
		}
	}

	if (!connected) {
		console.error(`   ❌ Could not connect with any config\n`);
	}
} catch (error) {
	console.error(`   ❌ PostgreSQL test failed:`, error.message);
}

// Test 4: CouchDB
console.log('4️⃣  Testing CouchDB...');
try {
	const response = await fetch('http://localhost:5984/_all_dbs');
	const databases = await response.json();
	if (Array.isArray(databases)) {
		console.log(`   ✅ Found ${databases.length} databases:`);
		databases.slice(0, 10).forEach(db => console.log(`      - ${db}`));
	} else {
		console.log(`   ⚠️  Unexpected response format`);
	}
	console.log('');
} catch (error) {
	console.error(`   ❌ CouchDB test failed:`, error.message);
}

// Test 5: Test embedding → Qdrant workflow
console.log('5️⃣  Testing embedding → Qdrant insertion...');
try {
	const ollama = new Ollama({ host: 'http://localhost:11434' });

	// Generate test embedding
	const testDoc = {
		text: 'TS1005 comma expected error in ACPToolRegistry.ts line 97',
		code: 'TS1005',
		file: 'src/lib/services/knowledge-search/ACPToolRegistry.ts',
		line: 97
	};

	const embeddingResponse = await ollama.embeddings({
		model: 'embeddinggemma:latest',
		prompt: `Error: ${testDoc.text}`
	});

	const vector = embeddingResponse.embedding;
	console.log(`   ✅ Generated embedding (${vector.length}D)`);

	// Try to create test collection if it doesn't exist
	const collectionName = 'phase81_test';
	try {
		await fetch(`http://localhost:6333/collections/${collectionName}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vectors: {
					size: vector.length,
					distance: 'Cosine'
				}
			})
		});
		console.log(`   ✅ Created collection: ${collectionName}`);
	} catch (err) {
		// Collection might already exist
	}

	// Insert test point
	const upsertResponse = await fetch(`http://localhost:6333/collections/${collectionName}/points`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			points: [{
				id: Date.now(),
				vector: vector,
				payload: testDoc
			}]
		})
	});

	const upsertData = await upsertResponse.json();
	if (upsertData.status === 'ok') {
		console.log(`   ✅ Inserted test error into Qdrant`);
	} else {
		console.log(`   ⚠️  Qdrant insert status: ${upsertData.status}`);
	}

	// Test search
	const searchResponse = await fetch(`http://localhost:6333/collections/${collectionName}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: vector,
			limit: 1
		})
	});

	const searchData = await searchResponse.json();
	if (searchData.result && searchData.result.length > 0) {
		console.log(`   ✅ Search successful, score: ${searchData.result[0].score.toFixed(4)}`);
	}

	console.log('');
} catch (error) {
	console.error(`   ❌ Workflow test failed:`, error.message);
}

console.log('✅ Infrastructure test complete!\n');
console.log('📊 Summary:');
console.log('   - Ollama embeddinggemma: Check output above');
console.log('   - Qdrant: Check collections');
console.log('   - PostgreSQL + pgvector: Check connection');
console.log('   - CouchDB: Check databases');
console.log('   - End-to-end embedding workflow: Check test collection\n');
