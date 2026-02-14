import type { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantClient as QdrantClientImpl } from '@qdrant/js-client-rest';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Correct dimensions for modern embeddings
const VECTOR_CONFIG = {
    DIMENSIONS: 384, // e.g. for all-MiniLM-L6-v2 or similar
    DISTANCE_METRIC: {
	QDRANT: 'Cosine'
    },
	INDEX: {
	QDRANT_HNSW_M: 16,
        QDRANT_HNSW_EF: 100
    },
	COLLECTIONS: {
	LEGAL_DOCUMENTS: 'legal_documents',
        CASE_EMBEDDINGS: 'legal_cases',
        EVIDENCE: 'evidence_items',
        RAG_DOCUMENTS: 'rag_documents',
        CHAT_MESSAGES: 'chat_messages',
        KNOWLEDGE_BASE: 'knowledge_base'
    },
	DOCKER_SERVICES: {
	QDRANT_URL: 'http://localhost:6333'
    }
};

export interface CollectionConfig {
    name: string;
	description: string;
    onDisk: boolean;
    replicationFactor?: number;
}

export function createQdrantClient(): QdrantClient {
    const url = process.env.QDRANT_URL || VECTOR_CONFIG.DOCKER_SERVICES.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    console.log(`🔌 Connecting to Qdrant at: ${url}`);
    return new QdrantClientImpl({ url, apiKey });
}

export const QDRANT_COLLECTIONS: CollectionConfig[] = [
    { name: VECTOR_CONFIG.COLLECTIONS.LEGAL_DOCUMENTS, description: 'Legal documents with 384-dimensional embeddings', onDisk: true, replicationFactor: 1 },
	{ name: VECTOR_CONFIG.COLLECTIONS.CASE_EMBEDDINGS, description: 'Case-specific embeddings for legal case management', onDisk: true, replicationFactor: 1 },
	{ name: VECTOR_CONFIG.COLLECTIONS.EVIDENCE, description: 'Evidence item embeddings for similarity search', onDisk: true, replicationFactor: 1 },
	{ name: VECTOR_CONFIG.COLLECTIONS.RAG_DOCUMENTS, description: 'RAG pipeline document embeddings', onDisk: true, replicationFactor: 1 },
	{ name: VECTOR_CONFIG.COLLECTIONS.CHAT_MESSAGES, description: 'Chat message embeddings for semantic search', onDisk: false, replicationFactor: 1 },
	{ name: VECTOR_CONFIG.COLLECTIONS.KNOWLEDGE_BASE, description: 'Knowledge base article embeddings', onDisk: true, replicationFactor: 1 }
];

export async function createCollection(client: QdrantClient, config: CollectionConfig): Promise<boolean> {
    try {
        const collections = await client.getCollections();
        const exists = collections.collections.some(c => c.name === config.name);

        if (exists) {
            console.log(`✅ Collection: "${config.name}" already exists`);
            const collectionInfo = await client.getCollection(config.name);
            const vectorConfig = collectionInfo.config?.params?.vectors;

            if (vectorConfig && 'size' in vectorConfig) {
                 if (vectorConfig.size !== VECTOR_CONFIG.DIMENSIONS) {
                     console.warn(`⚠️ Collection: "${config.name}" has dimension ${vectorConfig.size},
	expected ${VECTOR_CONFIG.DIMENSIONS}`);
                 } else {
                     console.log(` ✓ Dimensions: ${vectorConfig.size} (correct)`);
                 }
                 return true;
            }
        }

        console.log(`📦 Creating collection: "${config.name}"...`);
        await client.createCollection(config.name, {
            vectors: {
	size: VECTOR_CONFIG.DIMENSIONS,
                distance: VECTOR_CONFIG.DISTANCE_METRIC.QDRANT as any
            },
	optimizers_config: {
	indexing_threshold: 20000
            },
	hnsw_config: {
	m: VECTOR_CONFIG.INDEX.QDRANT_HNSW_M,
                ef_construct: VECTOR_CONFIG.INDEX.QDRANT_HNSW_EF,
                on_disk: config.onDisk
            },
	replication_factor: config.replicationFactor
        });

        console.log(`✅ Collection: "${config.name}" created successfully`);
        return true;

    } catch (error) {
        console.error(`❌ Failed to create collection: "${config.name}":`, error);
        return false;
    }
}

export async function initializeQdrantCollections(): Promise<{
	success: boolean, created: string[];
	failed: string[] }> {
    console.log('\n🎯 Qdrant Collection Initialization');
    const client = createQdrantClient();
    const created: string[] = [];
    const failed: string[] = [];

    try {
        await client.getCollections();
        console.log('✅ Qdrant connection successful');
    } catch (error) {
        console.error('❌ Failed to connect to Qdrant:', error);
        return { success: false, created, failed };
    }

    for (const collectionConfig of QDRANT_COLLECTIONS) {
        const success = await createCollection(client, collectionConfig);
        if (success) created.push(collectionConfig.name);
        else failed.push(collectionConfig.name);
    }

    return { success: failed.length === 0, created, failed };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}`) {
    initializeQdrantCollections()
        .then(result => {
            if (result.success) {
                console.log('\n✅ All collections initialized successfully!');
                process.exit(0);
            } else {
                console.error('\n❌ Some collections failed to initialize');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n❌ Initialization failed:', error);
            process.exit(1);
        });
}







