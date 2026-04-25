/**
 * Production Configuration and Optimization Settings
 * Centralized configuration for production-ready legal AI platform
 */

export interface ProductionConfig {
    // Performance Settings
    performance: {
        maxConcurrentUploads: number;
        maxFileSize: number; // bytes
        maxBatchSize: number;
        cacheTimeout: number; // milliseconds
        requestTimeout: number; // milliseconds
        retryAttempts: number;
        retryDelay: number; // milliseconds
    };
    // Database Settings
    database: {
        connectionPoolSize: number;
        queryTimeout: number; // milliseconds
        enableQueryLogging: boolean;
        enableSlowQueryLogging: boolean;
        slowQueryThreshold: number; // milliseconds
    };
    // Cache Settings
    cache: {
        redis: {
            maxMemory: string;
            ttl: number; // seconds
            keyPrefix: string;
            enableCompression: boolean;
        };
        gpu: {
            bufferSize: number; // bytes
            maxBuffers: number;
            enablePrefetch: boolean;
        };
    };
    // Security Settings
    security: {
        enableRateLimit: boolean;
        rateLimit: {
            windowMs: number;
            maxRequests: number;
        };
        enableCors: boolean;
        corsOrigins: string[];
        enableCsrfProtection: boolean;
        maxRequestSize: number; // bytes
    };
    // Monitoring Settings
    monitoring: {
        enableMetrics: boolean;
        metricsInterval: number; // milliseconds
        enableHealthChecks: boolean;
        healthCheckInterval: number; // milliseconds
        enableErrorTracking: boolean;
        logLevel: 'error' | 'warn' | 'info' | 'debug';
    };
    // AI Settings
    ai: {
        defaultModel: string;
        fallbackModel: string;
        ollamaEndpoint?: string;
        maxTokens: number;
        temperature: number;
        enableCaching: boolean;
        batchProcessing: boolean;
        maxBatchSize: number;
    };
    // MinIO Settings
    minio: {
        maxFileSize: number;
        allowedMimeTypes: string[];
        bucketRetention: number; // days
        enableEncryption: boolean;
        enableVersioning: boolean;
        enableNotifications: boolean;
    };
}

// Production Configuration
export const PRODUCTION_CONFIG: ProductionConfig = {
    performance: {
        maxConcurrentUploads: 10,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        maxBatchSize: 50,
        cacheTimeout: 30000,
        requestTimeout: 60000,
        retryAttempts: 3,
        retryDelay: 1000
    },
    database: {
        connectionPoolSize: 20,
        queryTimeout: 30000,
        enableQueryLogging: false,
        enableSlowQueryLogging: true,
        slowQueryThreshold: 1000
    },
    cache: {
        redis: {
            maxMemory: '1gb',
            ttl: 3600,
            keyPrefix: 'legal_ai:',
            enableCompression: true
        },
        gpu: {
            bufferSize: 64 * 1024 * 1024,
            maxBuffers: 10,
            enablePrefetch: true
        }
    },
    security: {
        enableRateLimit: true,
        rateLimit: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 1000
        },
        enableCors: true,
        corsOrigins: ['https://legal-ai.yourdomain.com', 'https://app.yourdomain.com'],
        enableCsrfProtection: true,
        maxRequestSize: 50 * 1024 * 1024
    },
    monitoring: {
        enableMetrics: true,
        metricsInterval: 60000,
        enableHealthChecks: true,
        healthCheckInterval: 30000,
        enableErrorTracking: true,
        logLevel: 'warn'
    },
    ai: {
        defaultModel: 'gemma3-legal',
        fallbackModel: 'embeddinggemma',
        maxTokens: 4000,
        temperature: 0.7,
        enableCaching: true,
        batchProcessing: true,
        maxBatchSize: 10
    },
    minio: {
        maxFileSize: 100 * 1024 * 1024,
        allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/csv',
            'image/jpeg',
            'image/png',
            'image/tiff'
        ],
        bucketRetention: 2555,
        enableEncryption: true,
        enableVersioning: true,
        enableNotifications: true
    }
};

// Development Configuration
export const DEVELOPMENT_CONFIG: ProductionConfig = {
    ...PRODUCTION_CONFIG,
    performance: {
        ...PRODUCTION_CONFIG.performance,
        maxConcurrentUploads: 5,
        cacheTimeout: 10000,
        requestTimeout: 120000
    },
    database: {
        ...PRODUCTION_CONFIG.database,
        connectionPoolSize: 5,
        enableQueryLogging: true,
        slowQueryThreshold: 500
    },
    security: {
        ...PRODUCTION_CONFIG.security,
        enableRateLimit: false,
        corsOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
        enableCsrfProtection: false
    },
    monitoring: {
        ...PRODUCTION_CONFIG.monitoring,
        logLevel: 'debug'
    }
};

export function getConfig(): ProductionConfig {
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    return isDevelopment ? DEVELOPMENT_CONFIG : PRODUCTION_CONFIG;
}

export function validateConfig(config: ProductionConfig): string[] {
    const errors: string[] = [];
    if (config.performance.maxFileSize <= 0) errors.push('performance.maxFileSize must be positive');
    if (config.database.connectionPoolSize <= 0) errors.push('database.connectionPoolSize must be positive');
    return errors;
}

export const CONFIG = getConfig();
export default CONFIG;

