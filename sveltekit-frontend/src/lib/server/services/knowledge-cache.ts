import type { CONFIG } from '$lib/config/env.server';
import type { appPool } from '$lib/server/db/connections';
import { LokiHybridStore } from '$lib/server/lokiHybridStore';
import { ensureRedisReady, redis } from '$lib/server/redis-client';
import { EVIDENCE_COLLECTION_NAME, qdrant } from '$lib/server/services/qdrant-client';
import neo4j from 'neo4j-driver';

type GlobalRegistry = typeof globalThis & {
	knowledgeCache?: LokiHybridStore;
	knowledgeCacheReady?: Promise<void>;
	knowledgeCacheNeo4jDriver?: neo4j.Driver;
};

const globalRef = globalThis as GlobalRegistry;

function resolveNeo4jConnection(): neo4j.Driver | undefined {
	const url =
		process.env.NEO4J_URI ??
		process.env.NEO4J_URL ??
		CONFIG.NEO4J_URL ??
		'bolt://localhost:7687';
	const user =
		process.env.NEO4J_USERNAME ??
		process.env.NEO4J_USER ??
		CONFIG.NEO4J_USER ??
		'neo4j';
	const password =
		process.env.NEO4J_PASSWORD ??
		process.env.NEO4J_PASS ??
		CONFIG.NEO4J_PASSWORD ??
		'password';

	try {
		if (globalRef.knowledgeCacheNeo4jDriver) {
			return globalRef.knowledgeCacheNeo4jDriver;
		}
		const driver = neo4j.driver(url, neo4j.auth.basic(user, password));
		globalRef.knowledgeCacheNeo4jDriver = driver;
		return driver;
	} catch (error) {
		console.warn('[kgcl] neo4j driver unavailable', error);
		return undefined;
	}
}

async function initializeStore(store: LokiHybridStore): Promise<void> {
	try {
		await ensureRedisReady().catch((error) => {
			console.warn('[kgcl] redis not ready, continuing in memory only', error);
		});
	} catch {
		// already logged by ensureRedisReady
	}
	await store.init();
}

if (!globalRef.knowledgeCache) {
	const neo4jDriver = resolveNeo4jConnection();
	const store = new LokiHybridStore({
		redis,
		qdrant,
		qdrantCollection: EVIDENCE_COLLECTION_NAME ?? 'legal_documents',
		pgPool: appPool,
		neo4jDriver,
		openAIApiKey:
			process.env.OPENAI_API_KEY ??
			process.env.OPENAI_KEY ??
			process.env.ANTHROPIC_API_KEY ??
			undefined,
		transformersModel: process.env.KGCL_TRANSFORMER_MODEL
	});
	globalRef.knowledgeCache = store;
	globalRef.knowledgeCacheReady = initializeStore(store);
}

export const knowledgeCache = globalRef.knowledgeCache!;
export const knowledgeCacheReady = globalRef.knowledgeCacheReady ?? Promise.resolve();





