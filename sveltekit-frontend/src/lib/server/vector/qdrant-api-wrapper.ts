import { QdrantClient } from '@qdrant/js-client-rest';
import { productionLogger as logger } from '../production-logger.js';

export class QdrantApiWrapper {
    private client: QdrantClient;

    constructor(config: {
	url: string; apiKey?: string }) {
        this.client = new QdrantClient({
            url: config.url,
            apiKey: config.apiKey,
        });
    }

    async getCollections() {
        try {
            const response = await this.client.getCollections();
            logger.debug('Retrieved Qdrant collections', {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collectionCount: response.collections?.length ?? 0
            });
            return response;
        } catch (error) {
            logger.error('Failed to get collections', error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant'
            });
            throw error;
        }
    }

    async getCollection(collectionName: string) {
        try {
            const response = await this.client.getCollection(collectionName);
            logger.debug(`Retrieved collection ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant'
            });
            return response;
        } catch (error) {
            logger.error(`Failed to get collection ${collectionName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant'
            });
            throw error;
        }
    }

    async createCollection(collectionName: string, config: any) {
        try {
            const response = await this.client.createCollection(collectionName, config);
            logger.info(`Created collection ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                vectorSize: config.vectors?.size,
                distance: config.vectors?.distance
            });
            return response;
        } catch (error) {
            logger.error(`Failed to create collection ${collectionName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                config
            });
            throw error;
        }
    }

    async deleteCollection(collectionName: string) {
        try {
            const response = await this.client.deleteCollection(collectionName);
            logger.warn(`Deleted collection ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName
            });
            return response;
        } catch (error) {
            logger.error(`Failed to delete collection ${collectionName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName
            });
            throw error;
        }
    }

    async upsert(collectionName: string, options: { wait?: boolean;
	points: any[] }) {
        try {
            const response = await this.client.upsert(collectionName, options);
            logger.debug(`Upserted ${options.points.length} points to ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                pointCount: options.points.length
            });
            return response;
        } catch (error) {
            logger.error(`Failed to upsert points to ${collectionName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                pointCount: options.points.length
            });
            throw error;
        }
    }

    async search(collectionName: string, options: {
	vector: number[]; limit?: number; offset?: number; score_threshold?: number; with_payload?: boolean; with_vector?: boolean; filter?: any }) {
        try {
            const response = await this.client.search(collectionName, options);
            logger.debug(`Search completed in ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                resultsCount: response.length,
                scoreThreshold: options.score_threshold
            });
            return response;
        } catch (error) {
            logger.error(`Search failed in ${collectionName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName
            });
            throw error;
        }
    }

    async retrieve(collectionName: string, options: {
	ids: (string | number)[]; with_payload?: boolean; with_vector?: boolean }) {
        try {
            const response = await this.client.retrieve(collectionName, options);
            logger.debug(`Retrieved ${options.ids.length} points from ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                pointCount: options.ids.length
            });
            return response;
        } catch (error) {
            logger.error(`Failed to retrieve points from ${collectionName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                ids: options.ids
            });
            throw error;
        }
    }

    async delete(collectionName: string, options: { wait?: boolean; points?: (string | number)[] }) {
        try {
            const response = await this.client.delete(collectionName, {
                wait: options.wait,
                points: options.points || []
            });
            logger.info(`Deleted points from ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                pointCount: options.points?.length ?? 0
            });
            return response;
        } catch (error) {
            logger.error(`Failed to delete points from ${collectionName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName
            });
            throw error;
        }
    }

    async createFieldIndex(collectionName: string, fieldName: string, options?: any) {
        try {
            const response = await this.client.createPayloadIndex(collectionName, {
                field_name: fieldName,
                field_schema: options?.field_schema,
                wait: options?.wait
            });
             logger.info(`Created field index for ${fieldName} in ${collectionName}`, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                field: fieldName
            });
            return response;
        } catch (error) {
             logger.error(`Failed to create field index for ${fieldName}`, error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant',
                collection: collectionName,
                field: fieldName
            });
            throw error;
        }
    }

    async healthCheck() {
        try {
            await this.client.getCollections();
            return { status: 'healthy', service: 'qdrant' };
        } catch (error: any) {
            logger.error('Qdrant health check failed', error, {
                component: 'QdrantApiWrapper',
                service: 'qdrant'
            });
            return { status: 'unhealthy', service: 'qdrant', message: error.message };
        }
    }
}

export function createQdrantWrapper(config: { url?: string; apiKey?: string } = {}): QdrantApiWrapper {
    const url = config.url || (import.meta.env.QDRANT_URL as string) || 'http://localhost:6333';
    const apiKey = config.apiKey || (import.meta.env.QDRANT_API_KEY as string);
    return new QdrantApiWrapper({ url, apiKey });
}

export default QdrantApiWrapper;


