#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEmbedding, getOllamaEndpoint } from '../src/lib/config/ollama.js';

// Load .env.phase72
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

async function testOllamaEndpoints() {
	console.log('\n🔍 Testing Ollama Endpoints\n');
	console.log(`📝 OLLAMA_URL: ${process.env.OLLAMA_URL || 'http://localhost:11434'}`);
	console.log(`📝 OLLAMA_MODEL: ${process.env.OLLAMA_MODEL || 'gemma3-legal:latest'}`);
	console.log(`📝 OLLAMA_EMBEDDING_MODEL: ${process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest'}\n`);

	// Test each endpoint
	const useCases = ['fastFix', 'embedding', 'legal'];

	for (const useCase of useCases) {
		try {
			const endpoint = await getOllamaEndpoint(useCase);
			console.log(`✅ ${useCase}: ${endpoint.model} @ ${endpoint.url}`);
		} catch (error) {
			console.error(`❌ ${useCase}: ${error.message}`);
		}
	}

	// Test embedding generation
	console.log('\n🧠 Testing Embedding Generation\n');
	try {
		const embedding = await generateEmbedding('TypeScript error: semicolon expected');
		console.log(`✅ Generated embedding: ${embedding.length} dimensions`);
		console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
	} catch (error) {
		console.error(`❌ Embedding generation failed: ${error.message}`);
	}

	console.log('\n✅ Ollama endpoint testing complete\n');
}

testOllamaEndpoints().catch(console.error);
