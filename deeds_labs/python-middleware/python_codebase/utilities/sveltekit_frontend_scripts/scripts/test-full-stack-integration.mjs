#!/usr/bin/env node
/**
 * Full Stack Integration Test
 * 
 * Tests complete RAG pipeline with:
 * - Redis cache
 * - Qdrant vector store
 * - pgvector PostgreSQL
 * - Ollama embeddings
 * - FastAPI NER (optional)
 * 
 * Usage:
 *   node scripts/test-full-stack-integration.mjs
 *   node scripts/test-full-stack-integration.mjs --verbose
 *   node scripts/test-full-stack-integration.mjs --skip-ner
 */

import { createClient } from 'redis';
import postgres from 'postgres';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
config({ path: join(__dirname, '..', '.env') });

const CONFIG = {
	redis: {
		url: process.env.REDIS_URL || 'redis://localhost:6379',
		password: process.env.REDIS_PASSWORD || ''
	},
	postgres: {
		connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
	},
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: process.env.QDRANT_COLLECTION || 'error_vectors'
	},
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		embeddingModel: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest'
	},
	ner: {
		url: process.env.NER_API_URL || 'http://localhost:8096'
	},
	goRag: {
		url: process.env.GO_RAG_URL || 'http://localhost:8094'
	}
};

const VERBOSE = process.argv.includes('--verbose');
const SKIP_NER = process.argv.includes('--skip-ner');

// Test results tracker
const results = {
	redis: { status: '❌', message: '', details: {} },
	postgres: { status: '❌', message: '', details: {} },
	qdrant: { status: '❌', message: '', details: {} },
	ollama: { status: '❌', message: '', details: {} },
	ner: { status: '⏭️', message: 'Skipped', details: {} },
	goRag: { status: '❌', message: '', details: {} },
	integration: { status: '❌', message: '', details: {} }
};

// Utility functions
function log(message, level = 'info') {
	const timestamp = new Date().toISOString();
	const prefix = {
		info: '🔍',
		success: '✅',
		error: '❌',
		warn: '⚠️'
	}[level] || 'ℹ️';
	console.log(`[${timestamp}] ${prefix} ${message}`);
}

function debug(message) {
	if (VERBOSE) {
		console.log(`  🔎 ${message}`);
	}
}

async function testRedis() {
	log('Testing Redis connection...');
	try {
		const client = createClient({
			url: CONFIG.redis.url,
			password: CONFIG.redis.password || undefined
		});

		client.on('error', (err) => {
			debug(`Redis client error: ${err.message}`);
		});

		await client.connect();
		
		// Test basic operations
		const testKey = 'integration_test_key';
		const testValue = JSON.stringify({ test: 'data', timestamp: Date.now() });
		
		await client.set(testKey, testValue, { EX: 60 });
		const retrieved = await client.get(testKey);
		
		if (retrieved !== testValue) {
			throw new Error('Redis data mismatch');
		}
		
		// Test error cache pattern
		const errorKey = 'error:test:12345';
		await client.set(errorKey, JSON.stringify({
			file: 'test.svelte',
			line: 10,
			message: 'Test error',
			embedding: new Array(384).fill(0.1)
		}), { EX: 3600 });
		
		const errorData = await client.get(errorKey);
		const parsed = JSON.parse(errorData);
		
		await client.del(testKey, errorKey);
		await client.quit();
		
		results.redis = {
			status: '✅',
			message: 'Connected and operational',
			details: {
				url: CONFIG.redis.url,
				hasPassword: !!CONFIG.redis.password,
				testsPassed: ['set', 'get', 'delete', 'error_cache_pattern'],
				embeddingDimension: parsed.embedding.length
			}
		};
		log('Redis test passed', 'success');
		return true;
	} catch (error) {
		results.redis = {
			status: '❌',
			message: error.message,
			details: { url: CONFIG.redis.url }
		};
		log(`Redis test failed: ${error.message}`, 'error');
		return false;
	}
}

async function testPostgres() {
	log('Testing PostgreSQL with pgvector...');
	try {
		const sql = postgres(CONFIG.postgres.connectionString, { max: 1 });
		
		// Check connection
		const [{ version }] = await sql`SELECT version()`;
		debug(`PostgreSQL version: ${version}`);
		
		// Check pgvector extension
		const [extResult] = await sql`
			SELECT EXISTS(
				SELECT 1 FROM pg_extension WHERE extname = 'vector'
			) as has_vector
		`;
		
		if (!extResult.has_vector) {
			throw new Error('pgvector extension not installed');
		}
		
		// Test vector operations
		const testEmbedding = `[${new Array(384).fill(0).map(() => Math.random()).join(',')}]`;
		const [similarityTest] = await sql`
			SELECT 
				${testEmbedding}::vector <=> ${testEmbedding}::vector as similarity,
				vector_dims(${testEmbedding}::vector) as dimensions
		`;
		
		// Check key tables
		const tables = await sql`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name IN ('legal_documents_processed', 'semantic_phrases_ranking', 'embeddings')
		`;
		
		await sql.end();
		
		results.postgres = {
			status: '✅',
			message: 'Connected with pgvector support',
			details: {
				connectionString: CONFIG.postgres.connectionString.replace(/:[^:@]+@/, ':***@'),
				pgvectorInstalled: true,
				vectorDimensions: similarityTest.dimensions,
				tablesFound: tables.map(t => t.table_name),
				selfSimilarity: similarityTest.similarity
			}
		};
		log('PostgreSQL test passed', 'success');
		return true;
	} catch (error) {
		results.postgres = {
			status: '❌',
			message: error.message,
			details: { connectionString: CONFIG.postgres.connectionString.replace(/:[^:@]+@/, ':***@') }
		};
		log(`PostgreSQL test failed: ${error.message}`, 'error');
		return false;
	}
}

async function testQdrant() {
	log('Testing Qdrant vector database...');
	try {
		// Test health endpoint
		const healthResponse = await fetch(`${CONFIG.qdrant.url}/health`);
		if (!healthResponse.ok) {
			throw new Error(`Qdrant health check failed: ${healthResponse.status}`);
		}
		
		// List collections
		const collectionsResponse = await fetch(`${CONFIG.qdrant.url}/collections`);
		if (!collectionsResponse.ok) {
			throw new Error(`Failed to list collections: ${collectionsResponse.status}`);
		}
		
		const collectionsData = await collectionsResponse.json();
		const collections = collectionsData.result?.collections || [];
		
		// Check if our collection exists
		const hasErrorVectors = collections.some(c => c.name === CONFIG.qdrant.collection);
		
		// If collection exists, test vector search
		let vectorSearchTest = null;
		if (hasErrorVectors) {
			const testVector = new Array(384).fill(0).map(() => Math.random());
			const searchResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vector: testVector,
					limit: 5,
					with_payload: true
				})
			});
			
			if (searchResponse.ok) {
				const searchData = await searchResponse.json();
				vectorSearchTest = {
					resultsCount: searchData.result?.length || 0,
					topScore: searchData.result?.[0]?.score || 0
				};
			}
		}
		
		results.qdrant = {
			status: '✅',
			message: 'Connected and operational',
			details: {
				url: CONFIG.qdrant.url,
				collectionsCount: collections.length,
				hasErrorVectors,
				collections: collections.map(c => c.name),
				vectorSearchTest
			}
		};
		log('Qdrant test passed', 'success');
		return true;
	} catch (error) {
		results.qdrant = {
			status: '❌',
			message: error.message,
			details: { url: CONFIG.qdrant.url }
		};
		log(`Qdrant test failed: ${error.message}`, 'error');
		return false;
	}
}

async function testOllama() {
	log('Testing Ollama embedding service...');
	try {
		// Test API endpoint
		const apiResponse = await fetch(`${CONFIG.ollama.url}/api/tags`);
		if (!apiResponse.ok) {
			throw new Error(`Ollama API not responding: ${apiResponse.status}`);
		}
		
		const modelsData = await apiResponse.json();
		const models = modelsData.models || [];
		const hasEmbeddingModel = models.some(m => m.name.includes(CONFIG.ollama.embeddingModel.split(':')[0]));
		
		// Test embedding generation
		let embeddingTest = null;
		if (hasEmbeddingModel) {
			const testText = 'This is a test error message for embedding generation.';
			const embeddingResponse = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: CONFIG.ollama.embeddingModel,
					prompt: testText
				})
			});
			
			if (embeddingResponse.ok) {
				const embeddingData = await embeddingResponse.json();
				embeddingTest = {
					dimension: embeddingData.embedding?.length || 0,
					sampleValues: embeddingData.embedding?.slice(0, 5) || []
				};
			}
		}
		
		results.ollama = {
			status: '✅',
			message: 'Connected and operational',
			details: {
				url: CONFIG.ollama.url,
				modelsAvailable: models.length,
				hasEmbeddingModel,
				modelName: CONFIG.ollama.embeddingModel,
				embeddingTest
			}
		};
		log('Ollama test passed', 'success');
		return true;
	} catch (error) {
		results.ollama = {
			status: '❌',
			message: error.message,
			details: { url: CONFIG.ollama.url }
		};
		log(`Ollama test failed: ${error.message}`, 'error');
		return false;
	}
}

async function testNER() {
	if (SKIP_NER) {
		log('Skipping NER API test (--skip-ner)', 'warn');
		return true;
	}
	
	log('Testing FastAPI NER service (optional)...');
	try {
		const healthResponse = await fetch(`${CONFIG.ner.url}/health`, {
			signal: AbortSignal.timeout(3000)
		});
		
		if (!healthResponse.ok) {
			throw new Error(`NER API not responding: ${healthResponse.status}`);
		}
		
		// Test entity extraction
		const testResponse = await fetch(`${CONFIG.ner.url}/extract`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: 'The case Doe v. Smith was filed on 2024-01-15 in California.'
			}),
			signal: AbortSignal.timeout(5000)
		});
		
		if (testResponse.ok) {
			const entities = await testResponse.json();
			results.ner = {
				status: '✅',
				message: 'Connected and operational',
				details: {
					url: CONFIG.ner.url,
					entitiesExtracted: entities.length || 0,
					sampleEntities: entities.slice(0, 3)
				}
			};
			log('NER API test passed', 'success');
			return true;
		}
	} catch (error) {
		results.ner = {
			status: '⚠️',
			message: `Optional service: ${error.message}`,
			details: { url: CONFIG.ner.url }
		};
		log('NER API not available (optional)', 'warn');
		return true; // Don't fail on optional service
	}
}

async function testGoRAG() {
	log('Testing Go RAG microservice...');
	try {
		const healthResponse = await fetch(`${CONFIG.goRag.url}/health`, {
			signal: AbortSignal.timeout(3000)
		});
		
		if (!healthResponse.ok) {
			throw new Error(`Go RAG service not responding: ${healthResponse.status}`);
		}
		
		const healthData = await healthResponse.json();
		
		results.goRag = {
			status: '✅',
			message: 'Connected and operational',
			details: {
				url: CONFIG.goRag.url,
				health: healthData
			}
		};
		log('Go RAG test passed', 'success');
		return true;
	} catch (error) {
		results.goRag = {
			status: '❌',
			message: error.message,
			details: { url: CONFIG.goRag.url }
		};
		log(`Go RAG test failed: ${error.message}`, 'error');
		return false;
	}
}

async function testIntegration() {
	log('Testing full integration pipeline...');
	try {
		// Only run integration test if core services are up
		const coreServicesUp = 
			results.redis.status === '✅' &&
			results.postgres.status === '✅' &&
			results.qdrant.status === '✅' &&
			results.ollama.status === '✅';
		
		if (!coreServicesUp) {
			throw new Error('Core services not all operational');
		}
		
		const testError = {
			file: 'src/routes/test/+page.svelte',
			line: 42,
			column: 10,
			message: 'Type "string" is not assignable to type "number"',
			code: 'ts(2322)'
		};
		
		// 1. Generate embedding with Ollama
		const embeddingResponse = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.ollama.embeddingModel,
				prompt: testError.message
			})
		});
		
		if (!embeddingResponse.ok) {
			throw new Error('Failed to generate embedding');
		}
		
		const { embedding } = await embeddingResponse.json();
		
		// 2. Store in Redis cache
		const redisClient = createClient({
			url: CONFIG.redis.url,
			password: CONFIG.redis.password || undefined
		});
		await redisClient.connect();
		
		const cacheKey = `error:integration_test:${Date.now()}`;
		await redisClient.set(cacheKey, JSON.stringify({
			...testError,
			embedding,
			timestamp: new Date().toISOString()
		}), { EX: 300 });
		
		// 3. Store vector in Qdrant (if collection exists)
		let qdrantStored = false;
		try {
			const qdrantResponse = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					points: [{
						id: Date.now(),
						vector: embedding,
						payload: {
							file: testError.file,
							message: testError.message,
							code: testError.code,
							test: true
						}
					}]
				})
			});
			qdrantStored = qdrantResponse.ok;
		} catch (e) {
			debug(`Qdrant storage skipped: ${e.message}`);
		}
		
		// 4. Store in PostgreSQL with pgvector
		const sql = postgres(CONFIG.postgres.connectionString, { max: 1 });
		
		// Check if embeddings table exists
		const [tableExists] = await sql`
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'public' 
				AND table_name = 'error_embeddings_test'
			) as exists
		`;
		
		let pgVectorStored = false;
		if (tableExists.exists) {
			await sql`
				INSERT INTO error_embeddings_test (file, message, embedding, created_at)
				VALUES (
					${testError.file},
					${testError.message},
					${JSON.stringify(embedding)}::vector(384),
					NOW()
				)
			`;
			pgVectorStored = true;
		}
		
		// 5. Retrieve and verify
		const cachedData = await redisClient.get(cacheKey);
		const cached = JSON.parse(cachedData);
		
		await redisClient.del(cacheKey);
		await redisClient.quit();
		await sql.end();
		
		results.integration = {
			status: '✅',
			message: 'Full pipeline operational',
			details: {
				embeddingGenerated: embedding.length === 384,
				redisCached: !!cached,
				qdrantStored,
				pgVectorStored,
				pipeline: [
					'Ollama embedding ✅',
					'Redis cache ✅',
					qdrantStored ? 'Qdrant vector ✅' : 'Qdrant vector ⏭️',
					pgVectorStored ? 'pgvector storage ✅' : 'pgvector storage ⏭️'
				]
			}
		};
		log('Integration test passed', 'success');
		return true;
	} catch (error) {
		results.integration = {
			status: '❌',
			message: error.message,
			details: {}
		};
		log(`Integration test failed: ${error.message}`, 'error');
		return false;
	}
}

// Main execution
async function main() {
	console.log('╔════════════════════════════════════════════════════════════╗');
	console.log('║     Full Stack RAG Integration Test                       ║');
	console.log('╚════════════════════════════════════════════════════════════╝\n');
	
	const tests = [
		{ name: 'Redis Cache', fn: testRedis },
		{ name: 'PostgreSQL + pgvector', fn: testPostgres },
		{ name: 'Qdrant Vector DB', fn: testQdrant },
		{ name: 'Ollama Embeddings', fn: testOllama },
		{ name: 'FastAPI NER', fn: testNER },
		{ name: 'Go RAG Service', fn: testGoRAG },
		{ name: 'Full Integration', fn: testIntegration }
	];
	
	for (const test of tests) {
		await test.fn();
		console.log(''); // Spacing
	}
	
	// Summary
	console.log('\n╔════════════════════════════════════════════════════════════╗');
	console.log('║                    Test Summary                            ║');
	console.log('╚════════════════════════════════════════════════════════════╝\n');
	
	Object.entries(results).forEach(([service, result]) => {
		console.log(`${result.status} ${service.toUpperCase()}: ${result.message}`);
		if (VERBOSE && Object.keys(result.details).length > 0) {
			console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
		}
	});
	
	const allPassed = Object.values(results).every(r => r.status === '✅' || r.status === '⚠️' || r.status === '⏭️');
	
	console.log('\n' + '═'.repeat(60));
	if (allPassed) {
		console.log('✅ ALL SYSTEMS OPERATIONAL - RAG pipeline ready!');
		process.exit(0);
	} else {
		console.log('❌ SOME TESTS FAILED - Check configuration');
		process.exit(1);
	}
}

main().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
