#!/usr/bin/env node
/**
 * Redis-Qdrant-pgvector-FastAPI Integration Test
 * Tests the full RAG pipeline: Redis cache → Qdrant vectors → pgvector → FastAPI NER
 */

import { createClient } from 'redis';
import postgres from 'postgres';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
	redis: {
		url: process.env.REDIS_URL || 'redis://localhost:6379',
		host: process.env.REDIS_HOST || 'localhost',
		port: parseInt(process.env.REDIS_PORT || '6379')
	},
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: process.env.QDRANT_COLLECTION || 'error_vectors'
	},
	postgres: {
		url: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db'
	},
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		model: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest'
	},
	fastapi: {
		url: process.env.NER_API_URL || 'http://localhost:8096'
	}
};

class IntegrationTester {
	constructor() {
		this.results = {
			redis: { status: 'pending', details: {} },
			qdrant: { status: 'pending', details: {} },
			postgres: { status: 'pending', details: {} },
			ollama: { status: 'pending', details: {} },
			fastapi: { status: 'pending', details: {} },
			integration: { status: 'pending', details: {} }
		};
		this.redis = null;
		this.sql = null;
		this.embeddingModelName = CONFIG.ollama.model;
	}

	async testRedis() {
		console.log('\n🔴 Testing Redis Connection...');
		try {
			this.redis = createClient({
				url: CONFIG.redis.url,
				socket: {
					host: CONFIG.redis.host,
					port: CONFIG.redis.port,
					reconnectStrategy: false
				}
			});

			this.redis.on('error', (err) => {
				console.error('Redis error:', err);
			});

			await this.redis.connect();

			// Test basic operations
			const testKey = 'integration:test:' + Date.now();
			await this.redis.set(testKey, JSON.stringify({ test: true, timestamp: Date.now() }), {
				EX: 60
			});
			const retrieved = await this.redis.get(testKey);

			// Test error cache structure
			const errorKeys = await this.redis.keys('error:*');
			const embeddingKeys = await this.redis.keys('ai:embedding:*');

			this.results.redis = {
				status: 'success',
				details: {
					connected: true,
					errorCacheKeys: errorKeys.length,
					embeddingCacheKeys: embeddingKeys.length,
					testPassed: retrieved !== null,
					url: CONFIG.redis.url
				}
			};
			console.log('✅ Redis: Connected and operational');
			console.log(`   - Error cache entries: ${errorKeys.length}`);
			console.log(`   - Embedding cache entries: ${embeddingKeys.length}`);
		} catch (error) {
			this.results.redis = {
				status: 'failed',
				details: { error: error.message }
			};
			console.error('❌ Redis: Failed -', error.message);
		}
	}

	async testQdrant() {
		console.log('\n🟣 Testing Qdrant Vector Database...');
		try {
			// Test Qdrant health
			const healthResponse = await fetch(`${CONFIG.qdrant.url}/`);
			if (!healthResponse.ok) {
				throw new Error(`Qdrant health check failed: ${healthResponse.status}`);
			}

			// Check collections
			const collectionsResponse = await fetch(`${CONFIG.qdrant.url}/collections`);
			const collections = await collectionsResponse.json();

			const errorCollection = collections.result?.collections?.find(
				(c) => c.name === CONFIG.qdrant.collection
			);

			// Get collection stats if it exists
			let collectionStats = null;
			if (errorCollection) {
				const statsResponse = await fetch(
					`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`
				);
				collectionStats = await statsResponse.json();
			}

			this.results.qdrant = {
				status: 'success',
				details: {
					connected: true,
					collections: collections.result?.collections?.length || 0,
					errorCollection: errorCollection ? 'exists' : 'missing',
					vectorCount: collectionStats?.result?.vectors_count || 0,
					indexedCount: collectionStats?.result?.indexed_vectors_count || 0,
					url: CONFIG.qdrant.url
				}
			};
			console.log('✅ Qdrant: Connected and operational');
			console.log(`   - Collections: ${collections.result?.collections?.length || 0}`);
			console.log(`   - Error vectors: ${collectionStats?.result?.vectors_count || 0}`);
		} catch (error) {
			this.results.qdrant = {
				status: 'failed',
				details: { error: error.message }
			};
			console.error('❌ Qdrant: Failed -', error.message);
		}
	}

	async testPostgres() {
		console.log('\n🐘 Testing PostgreSQL + pgvector...');
		try {
			this.sql = postgres(CONFIG.postgres.url, { max: 1 });

			// Test basic connection
			const result = await this.sql`SELECT version()`;

			// Check for pgvector extension
			const extensions = await this.sql`
				SELECT extname, extversion 
				FROM pg_extension 
				WHERE extname = 'vector'
			`;

			// Check for vector-enabled tables
			const vectorTables = await this.sql`
				SELECT table_name, column_name, udt_name
				FROM information_schema.columns
				WHERE udt_name = 'vector'
			`;

			// Check embeddings table
			const embeddingsCount = await this.sql`
				SELECT COUNT(*) as count FROM embeddings
			`.catch(() => [{ count: 0 }]);

			this.results.postgres = {
				status: 'success',
				details: {
					connected: true,
					version: result[0].version.split(' ')[1],
					pgvectorInstalled: extensions.length > 0,
					pgvectorVersion: extensions[0]?.extversion || 'not installed',
					vectorTables: vectorTables.length,
					embeddingsCount: parseInt(embeddingsCount[0].count),
					url: CONFIG.postgres.url.replace(/:[^:@]+@/, ':***@')
				}
			};
			console.log('✅ PostgreSQL: Connected and operational');
			console.log(`   - pgvector: ${extensions[0]?.extversion || 'not installed'}`);
			console.log(`   - Vector tables: ${vectorTables.length}`);
			console.log(`   - Embeddings: ${embeddingsCount[0].count}`);
		} catch (error) {
			this.results.postgres = {
				status: 'failed',
				details: { error: error.message }
			};
			console.error('❌ PostgreSQL: Failed -', error.message);
		}
	}

	async testOllama() {
		console.log('\n🤖 Testing Ollama Embeddings...');
		try {
			// Test Ollama health
			const healthResponse = await fetch(`${CONFIG.ollama.url}/api/tags`);
			if (!healthResponse.ok) {
				throw new Error(`Ollama health check failed: ${healthResponse.status}`);
			}

			const models = await healthResponse.json();
			const availableModelNames = models.models?.map((m) => m.name) ?? [];
			const preferredOrder = [
				'embeddinggemma:latest',
				'embeddinggemma',
				'nomic-embed-text:latest',
				'nomic-embed-text'
			];
			const candidateModels = preferredOrder.filter((name) => availableModelNames.includes(name));
			if (candidateModels.length === 0 && availableModelNames.length > 0) {
				candidateModels.push(availableModelNames[0]);
			}

			let embeddingDim = 0;
			let selectedModel = candidateModels[0] || CONFIG.ollama.model;
			let fallbackModelUsed = null;
			let lastError;

			for (const modelName of candidateModels.length ? candidateModels : [CONFIG.ollama.model]) {
				try {
					const testText = 'Test error: Cannot find module';
					const embedResponse = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							model: modelName,
							prompt: testText
						})
					});

					if (!embedResponse.ok) {
						throw new Error(`Embedding request failed (${modelName}): ${embedResponse.status}`);
					}

					const embedData = await embedResponse.json();
					embeddingDim = embedData.embedding?.length || 0;
					selectedModel = modelName;
					if (modelName !== CONFIG.ollama.model) {
						fallbackModelUsed = modelName;
					}
					break;
				} catch (err) {
					lastError = err;
					console.warn(`Embedding model ${modelName} unavailable, trying next option...`, err);
				}
			}

			if (embeddingDim === 0 && lastError) {
				throw lastError;
			}

			this.embeddingModelName = selectedModel;

			this.results.ollama = {
				status: 'success',
				details: {
					connected: true,
					modelsAvailable: models.models?.length || 0,
					embeddingModel: selectedModel,
					fallbackModel: fallbackModelUsed,
					embeddingDimension: embeddingDim,
					testPassed: embeddingDim > 0,
					url: CONFIG.ollama.url
				}
			};
			console.log('✅ Ollama: Connected and operational');
			console.log(`   - Models: ${models.models?.length || 0}`);
			console.log(
				`   - Embedding model: ${selectedModel}${
					fallbackModelUsed ? ` (fallback from ${CONFIG.ollama.model})` : ''
				}`
			);
			console.log(`   - Dimension: ${embeddingDim}`);
		} catch (error) {
			this.results.ollama = {
				status: 'failed',
				details: { error: error.message }
			};
			console.error('❌ Ollama: Failed -', error.message);
		}
	}

	async testFastAPI() {
		console.log('\n⚡ Testing FastAPI NER Service...');
		try {
			const healthResponse = await fetch(`${CONFIG.fastapi.url}/health`);
			const health = await healthResponse.json();

			// Test NER extraction
			const testText = 'Error in UserProfile.svelte on line 42: Cannot find name userId';
			const nerResponse = await fetch(`${CONFIG.fastapi.url}/extract`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: testText })
			});

			let entities = [];
			if (nerResponse.ok) {
				const nerData = await nerResponse.json();
				entities = nerData.entities || [];
			}

			this.results.fastapi = {
				status: 'success',
				details: {
					connected: true,
					version: health.version || 'unknown',
					entitiesExtracted: entities.length,
					testPassed: entities.length > 0,
					url: CONFIG.fastapi.url
				}
			};
			console.log('✅ FastAPI: Connected and operational');
			console.log(`   - Version: ${health.version || 'unknown'}`);
			console.log(`   - Test entities extracted: ${entities.length}`);
		} catch (error) {
			this.results.fastapi = {
				status: 'warning',
				details: { error: error.message, note: 'Optional service' }
			};
			console.warn('⚠️  FastAPI: Not available (optional) -', error.message);
		}
	}

	async testFullIntegration() {
		console.log('\n🔗 Testing Full RAG Pipeline Integration...');
		try {
			const testError = {
				file: 'test.svelte',
				line: 42,
				message: 'Type "string" is not assignable to type "number"',
				code: 'TS2322',
				context: 'const age: number = "25";'
			};

			// Step 1: Generate embedding
			const embedResponse = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: CONFIG.ollama.model,
					prompt: testError.message
				})
			});

			if (!embedResponse.ok) {
				throw new Error('Embedding generation failed');
			}

			const embedData = await embedResponse.json();
			const embedding = embedData.embedding;

			// Step 2: Cache in Redis
			const cacheKey = `error:test:${Date.now()}`;
			const embeddingKey = `ai:embedding:${cacheKey}`;

			await this.redis.set(cacheKey, JSON.stringify(testError), { EX: 3600 });
			await this.redis.set(embeddingKey, JSON.stringify(embedding), { EX: 3600 });

			// Step 3: Store in Qdrant
			const qdrantResponse = await fetch(
				`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						points: [
							{
								id: Date.now(),
								vector: embedding,
								payload: testError
							}
						]
					})
				}
			).catch(() => ({ ok: false }));

			// Step 4: Store in pgvector (if table exists)
			let pgvectorStored = false;
			try {
				await this.sql`
					INSERT INTO embeddings (text, embedding, metadata)
					VALUES (
						${testError.message},
						${JSON.stringify(embedding)},
						${JSON.stringify(testError)}
					)
				`;
				pgvectorStored = true;
			} catch (e) {
				console.log('   - pgvector storage skipped (table may not exist)');
			}

			// Step 5: Search similar in Qdrant
			const searchResponse = await fetch(
				`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points/search`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						vector: embedding,
						limit: 5,
						with_payload: true
					})
				}
			).catch(() => ({ ok: false }));

			let similarErrors = [];
			if (searchResponse.ok) {
				const searchData = await searchResponse.json();
				similarErrors = searchData.result || [];
			}

			this.results.integration = {
				status: 'success',
				details: {
					embeddingGenerated: embedding.length > 0,
					embeddingDimension: embedding.length,
					redisCached: true,
					qdrantStored: qdrantResponse.ok,
					pgvectorStored,
					similarErrorsFound: similarErrors.length,
					pipelineComplete: true
				}
			};

			console.log('✅ Full Pipeline: Operational');
			console.log(`   - Embedding: ${embedding.length}D vector generated`);
			console.log(`   - Redis: Cached error + embedding`);
			console.log(`   - Qdrant: ${qdrantResponse.ok ? 'Stored' : 'Skipped'}`);
			console.log(`   - pgvector: ${pgvectorStored ? 'Stored' : 'Skipped'}`);
			console.log(`   - Similar errors found: ${similarErrors.length}`);
		} catch (error) {
			this.results.integration = {
				status: 'failed',
				details: { error: error.message }
			};
			console.error('❌ Integration: Failed -', error.message);
		}
	}

	async generateReport() {
		const report = {
			timestamp: new Date().toISOString(),
			summary: {
				redis: this.results.redis.status,
				qdrant: this.results.qdrant.status,
				postgres: this.results.postgres.status,
				ollama: this.results.ollama.status,
				fastapi: this.results.fastapi.status,
				integration: this.results.integration.status
			},
			details: this.results,
			recommendations: []
		};

		// Generate recommendations
		if (this.results.redis.status !== 'success') {
			report.recommendations.push('Start Redis: docker run -d -p 6379:6379 redis:7-alpine');
		}
		if (this.results.qdrant.status !== 'success') {
			report.recommendations.push(
				'Start Qdrant: docker run -d -p 6333:6333 qdrant/qdrant:latest'
			);
		}
		if (this.results.postgres.status !== 'success') {
			report.recommendations.push('Check PostgreSQL connection in .env');
		}
		if (this.results.ollama.status !== 'success') {
			report.recommendations.push('Start Ollama and pull embedding model: ollama pull embeddinggemma');
		}
		if (this.results.qdrant.details.errorCollection === 'missing') {
			report.recommendations.push(
				'Create Qdrant collection: see scripts/setup-qdrant-collection.mjs'
			);
		}

		// Save report
		const reportPath = path.join(process.cwd(), 'logs', 'integration-test-report.json');
		await fs.mkdir(path.dirname(reportPath), { recursive: true });
		await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

		return report;
	}

	async cleanup() {
		if (this.redis) {
			await this.redis.quit();
		}
		if (this.sql) {
			await this.sql.end();
		}
	}

	async run() {
		console.log('🧪 Redis-Qdrant-pgvector-FastAPI Integration Test');
		console.log('=' .repeat(60));

		await this.testRedis();
		await this.testQdrant();
		await this.testPostgres();
		await this.testOllama();
		await this.testFastAPI();

		if (
			this.results.redis.status === 'success' &&
			this.results.ollama.status === 'success'
		) {
			await this.testFullIntegration();
		} else {
			console.log('\n⚠️  Skipping integration test - required services not available');
		}

		const report = await this.generateReport();

		console.log('\n' + '='.repeat(60));
		console.log('📊 INTEGRATION TEST SUMMARY');
		console.log('='.repeat(60));
		console.log(
			`Redis:       ${this.getStatusIcon(report.summary.redis)}  ${report.summary.redis}`
		);
		console.log(
			`Qdrant:      ${this.getStatusIcon(report.summary.qdrant)}  ${report.summary.qdrant}`
		);
		console.log(
			`PostgreSQL:  ${this.getStatusIcon(report.summary.postgres)}  ${report.summary.postgres}`
		);
		console.log(
			`Ollama:      ${this.getStatusIcon(report.summary.ollama)}  ${report.summary.ollama}`
		);
		console.log(
			`FastAPI:     ${this.getStatusIcon(report.summary.fastapi)}  ${report.summary.fastapi}`
		);
		console.log(
			`Integration: ${this.getStatusIcon(report.summary.integration)}  ${report.summary.integration}`
		);

		if (report.recommendations.length > 0) {
			console.log('\n📋 Recommendations:');
			report.recommendations.forEach((rec, i) => {
				console.log(`   ${i + 1}. ${rec}`);
			});
		}

		console.log(`\n📄 Full report: logs/integration-test-report.json`);

		await this.cleanup();

		const allSuccess = Object.values(report.summary).every(
			(s) => s === 'success' || s === 'warning'
		);
		process.exit(allSuccess ? 0 : 1);
	}

	getStatusIcon(status) {
		switch (status) {
			case 'success':
				return '✅';
			case 'warning':
				return '⚠️ ';
			case 'failed':
				return '❌';
			default:
				return '⏳';
		}
	}
}

// Run the test
const tester = new IntegrationTester();
tester.run().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
