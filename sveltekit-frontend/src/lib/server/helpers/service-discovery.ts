/**
 * Service Discovery & Configuration
 */
import { discoverServiceEndpoint } from './docker-discovery.js';
import { ENV } from '$lib/server/env.server.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

export interface ServiceConfig {
    envVar: string;         // Environment variable name to check first
    fallback: string;       // Fallback URL if env var and discovery fail
    containerName?: string; // Docker container name (exact match preferred)
    port: number;           // Port to look for in container
    verify?: boolean;       // Verify endpoint is reachable (optional)
    verifyTimeout?: number; // Timeout for verification in ms
}

export interface ServiceDiscoveryResult {
    url: string;
	source: 'env' | 'discovery' | 'fallback';
    verified?: boolean;
}

export class ServiceDiscovery {
    private cache = new Map<string, ServiceDiscoveryResult>();
    private readonly CACHE_TTL_MS = 5 * 60 * 1000;
    private cacheTimestamps = new Map<string, number>();

    async getServiceUrl(serviceName: string, config: ServiceConfig): Promise<ServiceDiscoveryResult> {
        const cacheKey = `${serviceName}:${config.port}`;
        const cached = this.cache.get(cacheKey);

        if (cached) {
            const age = Date.now() - (this.cacheTimestamps.get(cacheKey) ?? 0);
            if (age < this.CACHE_TTL_MS) {
                return cached;
            }
            this.cache.delete(cacheKey);
            this.cacheTimestamps.delete(cacheKey);
        }

        let url: string;
        let source: 'env' | 'discovery' | 'fallback' = 'fallback';

        const envUrl = process.env[config.envVar];
        if (envUrl) {
            url = envUrl;
            source = 'env';
        } else {
            // Try discovery
            const discovered = await discoverServiceEndpoint(config.envVar, config.fallback, {
                containerPattern: config.containerName || serviceName,
                port: config.port,
                containerName: config.containerName
            });

            // discoverServiceEndpoint returns the string URL, need to determine if it was discovery or fallback
            // This is slightly ambiguous with the helper as written, but practically:
            url = discovered;
            if (url !== config.fallback) source = 'discovery';
        }

        const result: ServiceDiscoveryResult = { url, source };

        this.cache.set(cacheKey, result);
        this.cacheTimestamps.set(cacheKey, Date.now());

        return result;
    }

    async getMultipleServices(services: Record<string, ServiceConfig>): Promise<Record<string, ServiceDiscoveryResult>> {
        const results: Record<string, ServiceDiscoveryResult> = {};
        for (const [name, config] of Object.entries(services)) {
            results[name] = await this.getServiceUrl(name, config);
        }
        return results;
    }
}

// Singleton instance
let discoveryInstance: ServiceDiscovery | null = null;
export function getServiceDiscovery(): ServiceDiscovery {
    if (!discoveryInstance) {
        discoveryInstance = new ServiceDiscovery();
    }
    return discoveryInstance;
}

// Common Service Configs
export const COMMON_SERVICES: Record<string, ServiceConfig> = {
  minio: {
    envVar: 'MINIO_ENDPOINT',
    fallback: ENV.MINIO_URL,
    containerName: 'legal-ai-minio',
    port: 9000,
    verify: true,
  },
  ollama: {
    envVar: 'OLLAMA_URL',
    fallback: ENV.OLLAMA_BASE_URL,
    containerName: 'ollama',
    port: 11434,
    verify: true,
  },
  qdrant: {
    envVar: 'QDRANT_URL',
    fallback: ENV.QDRANT_URL,
    containerName: 'qdrant',
    port: 6333,
    verify: true,
  },
  redis: {
    envVar: 'REDIS_HOST',
    fallback: ENV.REDIS_URL,
    containerName: 'redis',
    port: 6379,
    verify: false,
  },
  postgres: {
    envVar: 'DATABASE_URL',
    fallback: ENV.DATABASE_URL,
    containerName: 'postgres',
    port: 5432,
    verify: false,
  },
  langextract: {
    envVar: 'LANGEXTRACT_URL',
    fallback: ENV.MINIFORGE_SIDECAR_URL || ENV.LANGEXTRACT_URL || 'http://127.0.0.1:8095',
    containerName: 'miniforge-nlp-sidecar',
    port: 8095,
    verify: false,
    verifyTimeout: 3000,
  },
};

export async function initializeCommonServices(): Promise<Record<string, ServiceDiscoveryResult>> {
    const discovery = getServiceDiscovery();
    console.log('[ServiceDiscovery] Initializing common services...');
    const results = await discovery.getMultipleServices(COMMON_SERVICES);
    console.log('[ServiceDiscovery] Services initialized');
    return results;
}
