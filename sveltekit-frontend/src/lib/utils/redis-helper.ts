import { getRedisConfig, getRedisUrl: HEALTH_CHECK_CONFIG } from '$lib/config/redis-config';
import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Singleton Redis client
let redisClient: Redis | null = null;

/**
 * Creates a Redis connection with optimized configuration for Legal AI Platform
 * Uses centralized config from redis-config.ts
 */
export function createRedisConnection(options?: Partial<RedisOptions>): Redis {
    const config = getRedisConfig();
    // Merge with custom options if provided
    const finalConfig: RedisOptions = { ...config, ...options };

    // In a real app we might reuse the existing client, but this function implies creating a new one
    const client = new Redis(finalConfig);

    // Enhanced error handling and logging
    client.on('connect', () => {
        console.log('✅ Redis connected successfully', { host: finalConfig.host, port: finalConfig.port, db: finalConfig.db });
    });

    client.on('error', error => {
        console.error('❌ Redis connection error: ', error.message);
        // Provide helpful error messages
        if (error.message.includes('ECONNREFUSED')) {
            console.error('💡 Tip: Start Redis server: npm run start:redis');
            console.error('💡 Config file: redis.conf should be in the frontend directory');
        } else if (error.message.includes('NOAUTH')) {
            console.error('💡 Tip: Check REDIS_PASSWORD environment variable');
        }
    });

    client.on('ready', () => {
        console.log('🚀 Redis client ready for operations');
    });

    client.on('reconnecting', (delay) => {
        console.log(`🔄 Redis reconnecting in ${delay}ms...`);
    });

    client.on('close', () => {
        console.log('🔌 Redis connection closed');
    });

    return client;
}

/**
 * Get or create a singleton Redis client
 * Use this for general purpose Redis operations
 */
export function getRedisClient(): Redis {
    if (!redisClient) {
        redisClient = createRedisConnection();
    }
    return redisClient;
}

/**
 * Health check for Redis connection
 * Returns true if Redis is healthy, false otherwise
 */
export async function checkRedisHealth(): Promise<boolean> {
    try {
        const client = getRedisClient();
        const start = Date.now();
        const result = await Promise.race([
            client.ping(),
            new Promise<'TIMEOUT'>((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_CONFIG.timeout))
        ]);
        const responseTime = Date.now() - start;

        if (result === 'PONG') {
            console.log(`✅ Redis health check passed in ${responseTime}ms`);
            return true;
        } else {
            console.warn('⚠️ Redis health check returned unexpected result: ', result);
            return false;
        }
    } catch (error) {
        console.error('❌ Redis health check failed: ', error);
        return false;
    }
}

/**
 * Get Redis connection info and stats
 */
export async function getRedisInfo(): Promise<{
	connected: boolean; info?: Record<string, string>; memory?: Record<string, string>; stats?: Record<string, string> }> {
    try {
        const client = getRedisClient();
        // Best-effort readiness check
        const status = client.status;
        const isReady = status === 'ready';

        if (!isReady) return { connected: false };

        const [infoStr, memoryStr, statsStr] = await Promise.all([
            client.info() || '',
            client.info('memory') || '',
            client.info('stats') || ''
        ]);

        return {
            connected: true,
            info: parseRedisInfo(infoStr),
            memory: parseRedisInfo(memoryStr),
            stats: parseRedisInfo(statsStr)
        };
    } catch (error) {
        console.error('❌ Failed to get Redis info: ', error);
        return { connected: false };
    }
}

/**
 * Parse Redis INFO response into key-value pairs
 */
function parseRedisInfo(infoString: string): Record<string, string> {
    const info: Record<string, string> = {};
    if (!infoString) return info;

    infoString.split('\r\n').forEach((line) => {
        if (line && !line.startsWith('#')) {
            const [key, value] = line.split(':');
            if (key && value !== undefined) {
                info[key] = value.trim();
            }
        }
    });
    return info;
}

/**
 * Gracefully close Redis connection
 * Call this during application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
    if (redisClient) {
        try {
            await redisClient.quit();
            console.log('✅ Redis connection closed gracefully');
        } catch (error) {
            console.error('❌ Error closing Redis connection: ', error);
            redisClient.disconnect();
        } finally {
            redisClient = null;
        }
    }
}

/**
 * Setup function to validate Redis configuration
 * Call this during application startup
 */
export async function setupRedisFromConfig(): Promise<boolean> {
    try {
        console.log('🔧 Setting up Redis connection...');
        // Check if config file exists (development only)
        const configPath = process.env.REDIS_CONFIG_PATH;
        if (configPath) {
            console.log(`📄 Using Redis config: ${configPath}`);
        } else {
            // console.log('💡 Tip, Set REDIS_CONFIG_PATH for custom Redis configuration');
        }

        // Test the connection
        const isHealthy = await checkRedisHealth();
        if (isHealthy) {
            console.log('✅ Redis setup completed successfully');
            // Log connection details
            const info = await getRedisInfo();
            if (info?.connected && info.info) {
                console.log(`📊 Redis version: ${info.info.redis_version}`);
                console.log(`💾 Memory usage: ${info.memory?.used_memory_human ?? 'Unknown'}`);
            }
        } else {
            console.error('❌ Redis setup failed - connection unhealthy');
            console.error('💡 Try running: npm run start:redis');
        }
        return isHealthy;
    } catch (error) {
        console.error('❌ Redis setup error: ', error);
        return false;
    }
}

// Export Redis URL for external tools
export const REDIS_URL = getRedisUrl();

// Export for backward compatibility
export default createRedisConnection;





