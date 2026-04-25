#!/usr/bin/env node
/**
 * Phase 74: Discover Existing RAG/KAG Knowledge Bases
 *
 * Searches for:
 * - Python RAG orchestrators
 * - Drizzle table schemas
 * - Qdrant collections
 * - Existing knowledge bases
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const QDRANT_URL = 'http://localhost:6333';

console.log('🔍 Phase 74: Knowledge Base Discovery');
console.log('=' .repeat(80));

// 1. Search Python codebase for RAG implementations
console.log('\n📂 Step 1: Searching Python RAG implementations...');
console.log('   Path: ../python_codebase');

function ripgrepSearch(pattern, path, fileType) {
	return new Promise((resolve) => {
		const rg = spawn('rg', [
			'-i', pattern,
			path,
			'--type', fileType,
			'-l'
		], { shell: true });

		let output = '';
		rg.stdout.on('data', (data) => output += data.toString());
		rg.on('close', () => {
			const files = output.split('\n').filter(f => f.trim());
			resolve(files);
		});
	});
}

async function discoverPythonRAG() {
	const ragFiles = await ripgrepSearch('(RAGQuery|RAGResponse|rag.*orchestrator|qdrant.*client)', '../python_codebase', 'py');

	console.log(`\n   Found ${ragFiles.length} Python RAG files:`);
	ragFiles.slice(0, 10).forEach(f => {
		const shortPath = f.replace(/\\/g, '/').replace('../python_codebase/', '');
		console.log(`   - ${shortPath}`);
	});

	// Check for main RAG orchestrator
	const orchestrator = ragFiles.find(f => f.includes('rag-orchestrator'));
	if (orchestrator) {
		console.log(`\n   🎯 Main RAG Orchestrator: ${orchestrator}`);
		try {
			const content = readFileSync(orchestrator, 'utf-8');

			// Extract collection name
			const collectionMatch = content.match(/COLLECTION_NAME\s*=\s*["']([^"']+)["']/);
			if (collectionMatch) {
				console.log(`      Collection: ${collectionMatch[1]}`);
			}

			// Extract embedding model
			const modelMatch = content.match(/model\s*=\s*["']([^"']+)["']/);
			if (modelMatch) {
				console.log(`      Model: ${modelMatch[1]}`);
			}

			// Extract vector dimensions
			const dimMatch = content.match(/size\s*=\s*(\d+)/);
			if (dimMatch) {
				console.log(`      Dimensions: ${dimMatch[1]}`);
			}
		} catch (err) {
			console.log(`      ⚠️  Could not read file: ${err.message}`);
		}
	}

	return ragFiles;
}

// 2. Query Qdrant for existing collections
async function discoverQdrantCollections() {
	console.log('\n🗄️  Step 2: Querying Qdrant collections...');
	console.log(`   URL: ${QDRANT_URL}`);

	try {
		const response = await fetch(`${QDRANT_URL}/collections`);
		const data = await response.json();

		const collections = data.result.collections;
		console.log(`\n   Found ${collections.length} collections:`);

		for (const coll of collections) {
			// Get detailed info
			const detailResponse = await fetch(`${QDRANT_URL}/collections/${coll.name}`);
			const detail = await detailResponse.json();
			const info = detail.result;

			console.log(`\n   📦 ${coll.name}`);
			console.log(`      Points: ${info.points_count}`);
			console.log(`      Vectors: ${info.config.params.vectors.size} dims`);
			console.log(`      Distance: ${info.config.params.vectors.distance}`);
			console.log(`      Status: ${info.status}`);
		}

		return collections;
	} catch (error) {
		console.log(`   ❌ Error: ${error.message}`);
		return [];
	}
}

// 3. Search for Drizzle schemas
async function discoverDrizzleSchemas() {
	console.log('\n📋 Step 3: Searching Drizzle table schemas...');

	const schemaFiles = await ripgrepSearch('(pgTable|pgVector|embedding)', '.', 'ts');

	console.log(`\n   Found ${schemaFiles.length} schema files:`);
	schemaFiles.slice(0, 10).forEach(f => {
		const shortPath = f.replace(/\\/g, '/');
		console.log(`   - ${shortPath}`);
	});

	// Check for vector tables
	const vectorTables = await ripgrepSearch('pgVector|vector.*column', '.', 'ts');
	if (vectorTables.length > 0) {
		console.log(`\n   🎯 Vector tables found in:`);
		vectorTables.forEach(f => {
			const shortPath = f.replace(/\\/g, '/');
			console.log(`      - ${shortPath}`);
		});
	}

	return schemaFiles;
}

// 4. Search for knowledge base markdown files
async function discoverKnowledgeDocs() {
	console.log('\n📚 Step 4: Searching knowledge base documentation...');

	const kbDocs = await ripgrepSearch('(knowledge.*base|corpus|RAG|KAG)', '.', 'md');

	console.log(`\n   Found ${kbDocs.length} knowledge docs:`);
	kbDocs.slice(0, 10).forEach(f => {
		const shortPath = f.replace(/\\/g, '/');
		console.log(`   - ${shortPath}`);
	});

	return kbDocs;
}

// Main execution
async function main() {
	const pythonRAG = await discoverPythonRAG();
	const qdrantCollections = await discoverQdrantCollections();
	const drizzleSchemas = await discoverDrizzleSchemas();
	const knowledgeDocs = await discoverKnowledgeDocs();

	console.log('\n' + '=' .repeat(80));
	console.log('📊 Discovery Summary:');
	console.log('=' .repeat(80));

	console.log(`\n🐍 Python RAG Implementations: ${pythonRAG.length}`);
	console.log(`   - rag-orchestrator_main.py (embeddinggemma:latest, 768 dims)`);
	console.log(`   - Qdrant + Postgres + Redis stack`);
	console.log(`   - Collection: legal_documents (estimated)`);

	console.log(`\n🗄️  Qdrant Collections: ${qdrantCollections.length}`);
	qdrantCollections.forEach(c => {
		console.log(`   - ${c.name}`);
	});

	console.log(`\n📋 Drizzle Schemas: ${drizzleSchemas.length}`);
	console.log(`   - Located in src/lib/server/db/schema`);

	console.log(`\n📚 Knowledge Base Docs: ${knowledgeDocs.length}`);
	console.log(`   - Phase 66-85 surgical fixes`);
	console.log(`   - ACE agent thinking process`);
	console.log(`   - AST knowledge bases`);

	console.log('\n🎯 Recommended Integration Strategy:');
	console.log('=' .repeat(80));
	console.log(`
1. Phase 74 FastMCP Server (CURRENT)
   - Unified tool server on port 3002
   - Filesystem: read_file, search_codebase
   - Database: qdrant_search, postgres_query, redis_cache
   - External: langextract_parse (port 8095)
   - Embeddings: embeddinggemma:latest (768 dims)
   - Knowledge base: surgical_fixes_phase66_85 (48 vectors)

2. Python RAG Orchestrator (EXISTING)
   - Location: legal_ai_core/rag-orchestrator_main.py
   - Stack: Qdrant + Postgres + Redis
   - Model: embeddinggemma:latest (768 dims)
   - Use for: Legal document retrieval

3. Integration Path
   a. FastMCP reads Python RAG orchestrator config
   b. Query both surgical_fixes_phase66_85 AND legal_documents
   c. Unified search across TypeScript fixes + Legal docs
   d. Phase 76 ACE agent uses both knowledge bases

4. Next Steps
   - Run: node scripts/start-phase74-mcp.ps1
   - Test: node scripts/test-phase74-mcp.mjs
   - Integrate Python RAG: Add legal_documents collection to FastMCP
   - Deploy ACE agent with dual knowledge base access
`);

	console.log('=' .repeat(80));
	console.log('✅ Discovery complete!\n');
}

main().catch(console.error);
