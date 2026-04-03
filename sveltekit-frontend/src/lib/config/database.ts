import ENV_CONFIG from './env';

export interface PoolConfig {
    connectionString: string;
    max: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
}

function getDatabaseConfig() {
    return {
        maxConnections: 20,
        idleTimeoutMs: 60000,
        connectionTimeoutMs: 5000
    };
}

function getConnectionString(): string {
    return ENV_CONFIG.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
}

/**
 * Get pool configuration for different environments
 */
export function getPoolConfig(environment: 'development' | 'production' | 'test' = 'development'): PoolConfig {
    const config = getDatabaseConfig();
    const poolConfigs: Record<'development' | 'production' | 'test', Omit<PoolConfig, 'connectionString'>> = {
        development: {
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        },
        production: {
            max: config.maxConnections,
            idleTimeoutMillis: config.idleTimeoutMs,
            connectionTimeoutMillis: config.connectionTimeoutMs
        },
        test: {
            max: 2,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 5000
        }
    };
    return {
        connectionString: getConnectionString(),
        ...poolConfigs[environment]
    };
}