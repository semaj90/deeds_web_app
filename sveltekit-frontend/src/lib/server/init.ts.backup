/**
 * Server Initialization with Service Discovery
 *
 * Centralizes initialization of services:
 * - Dynamic service discovery (Docker containers)
 * - Environment variable resolution
 * - Graceful fallbacks
 */

import { initializeCommonServices, getServiceDiscovery } from '$lib/server/helpers/service-discovery';
import { verifyServiceEndpoint } from '$lib/server/helpers/docker-discovery';

export interface ServerServices {
    minio: { url: string; source: 'env' | 'discovery' | 'fallback' };
    minioConsole: { url: string; source: 'env' | 'discovery' | 'fallback' };
    ollama: { url: string; source: 'env' | 'discovery' | 'fallback' };
    qdrant: { url: string; source: 'env' | 'discovery' | 'fallback' };
    redis: { url: string; source: 'env' | 'discovery' | 'fallback' };
    postgres: { url: string; source: 'env' | 'discovery' | 'fallback' };
    neo4j: { url: string; source: 'env' | 'discovery' | 'fallback' };
    rabbitmq: { url: string; source: 'env' | 'discovery' | 'fallback' };
    rabbitmqManagement: { url: string; source: 'env' | 'discovery' | 'fallback' };
}

// Global services instance
let globalServices: ServerServices | null = null;
let initializationPromise: Promise<ServerServices> | null = null;

/**
 * Initialize all server services with discovery
 * Returns cached instance if already initialized
 */
export async function initializeServer(): Promise<ServerServices> {
    // Return cached instance if already initialized
    if (globalServices) return globalServices;

    // Prevent multiple concurrent initializations
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
        const startTime = Date.now();
        console.log('[Server] 🚀 Initializing services...');

        try {
            // Check if discovery is enabled
            const discoveryEnabled = process.env.DEV_DOCKER_DISCOVERY === 'true';
            const isDev = process.env.NODE_ENV === 'development';

            if (discoveryEnabled && isDev) {
                console.log('[Server] 🐋 Docker service discovery ENABLED');
            } else {
                console.log('[Server] 📌 Docker service discovery DISABLED');
            }

            // Initialize all common services
            const discovered = await initializeCommonServices();

            // Transform to expected format
            // @ts-ignore - mismatch on exact properties potentially but compatible structure
            globalServices = {
                minio: discovered.minio,
                minioConsole: discovered.minioConsole,
                ollama: discovered.ollama,
                qdrant: discovered.qdrant,
                redis: discovered.redis,
                postgres: discovered.postgres,
                neo4j: discovered.neo4j,
                rabbitmq: discovered.rabbitmq,
                rabbitmqManagement: discovered.rabbitmqManagement
            };

            const initTime = Date.now() - startTime;
            console.log(`[Server] ✅ Services initialized in ${initTime}ms`);

            return globalServices!;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[Server] ❌ Service initialization failed: ', msg);
            throw error;
        }
    })();

    return initializationPromise;
}

/**
 * Get initialized services (returns null if not initialized)
 */
export function getServices(): ServerServices | null {
    return globalServices;
}

/**
 * Get specific service URL
 */
export function getServiceUrl(serviceName: keyof ServerServices): string | null {
    if (!globalServices) {
        console.warn(`[Server] ⚠️ Services not initialized. Use initializeServer() first.`);
        return null;
    }
    const service = globalServices[serviceName];
    if (!service) {
        console.warn(`[Server] ⚠️ Unknown service: ${serviceName}`);
        return null;
    }
    return service.url;
}

/**
 * Check if service is available
 */
export function isServiceAvailable(serviceName: keyof ServerServices): boolean {
    return getServiceUrl(serviceName) !== null;
}

/**
 * Get all service URLs as a map
 */
export function getServiceUrls(): Record<string, string> {
    if (!globalServices) return {};
    return Object.fromEntries(
        Object.entries(globalServices).map(([key, service]) => [key, service.url])
    );
}

/**
 * Verify all services are reachable (optional, for debugging)
 */
export async function verifyServices(): Promise<Map<string, boolean>> {
    if (!globalServices) {
        throw new Error('Services not initialized');
    }

    const servicesToVerify = [
        { name: 'minio' as const, url: globalServices.minio.url },
        { name: 'ollama' as const, url: globalServices.ollama.url },
        { name: 'qdrant' as const, url: globalServices.qdrant.url },
        { name: 'rabbitmqManagement' as const, url: globalServices.rabbitmqManagement.url }
    ];

    console.log('[Server] 🔎 Verifying service endpoints...');
    const results = new Map<string, boolean>();

    const verifications = servicesToVerify.map(async (service) => {
        try {
            // Only verify HTTP services
            if (service.url.startsWith('http')) {
                const isReachable = await verifyServiceEndpoint(service.url, 5000);
                results.set(service.name, isReachable);
                console.log(`[Server] ${isReachable ? '✅' : '⚠️'} ${service.name}: ${service.url}`);
            }
        } catch (e) {
            results.set(service.name, false);
        }
    });

    await Promise.all(verifications);
    return results;
}
