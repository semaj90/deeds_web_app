/**
 * Unified Configuration Management System
 * Production-ready configuration management for Legal AI Platform
 * Supports Windows-native deployment with environment-based configuration
 */
const dev = import.meta.env.NODE_ENV === 'development';
const browser = false; // Server-side config

// Configuration interfaces for type safety
export interface DatabaseConfig {
    postgres: {
        url: string;
        maxConnections: number;
        ssl: boolean;
        timeout: number;
        retryAttempts: number;
    };
    redis: {
        url: string;
        fallbackUrl?: string;
        maxRetries: number;
        connectTimeout: number;
        commandTimeout: number;
        keepAlive: number;
    };
    neo4j: {
        url: string;
        username: string;
        password: string;
        maxConnectionPoolSize: number;
        connectionTimeout: number;
    };
    qdrant: {
        url: string;
        apiKey?: string;
        timeout: number;
        retries: number;
    };
}

export interface AIConfig {
    ollama: {
        baseUrl: string;
        models: {
            legal: string;
            embedding: string;
            chat: string;
        };
        timeout: number;
        maxConcurrent: number;
        gpuLayers: number;
    };
    openai?: {
        apiKey: string;
        model: string;
        maxTokens: number;
    };
    embedding: {
        dimensions: number;
        batchSize: number;
        cacheEnabled: boolean;
    };
}

export interface ServiceConfig {
    enhancedRAG: {
        url: string;
        timeout: number;
        retries: number;
        batchSize: number;
    };
    uploadService: {
        url: string;
        maxFileSize: number;
        allowedTypes: string[];
        timeout: number;
    };
    clusterManager: {
        url: string;
        workers: {
            legal: number;
            ai: number;
            vector: number;
            database: number;
        };
        ports: {
            basePort: number;
            legalBase: number;
            aiBase: number;
            vectorBase: number;
            databaseBase: number;
        };
    };
}

export interface WindowsConfig {
    platform: 'win32' | 'linux' | 'darwin';
    gpuAcceleration: boolean;
    pathSeparator: '\\' | '/';
    serviceInstallation: {
        useWindowsServices: boolean;
        serviceUser: string;
        dataPath: string;
        logPath: string;
    };
    performance: {
        maxMemoryMB: number;
        cpuCores: number;
        ioOptimization: boolean;
        networkKeepAlive: number;
    };
}

export interface SecurityConfig {
    cors: {
        origins: string[];
        credentials: boolean;
    };
    rateLimit: {
        windowSec: number;
        limits: {
            free: number;
            premium: number;
            enterprise: number;
            api: number;
            admin: number;
        };
    };
    auth: {
        sessionTimeout: number;
        jwtSecret: string;
        bcryptRounds: number;
    };
}

export interface LoggingConfig {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    outputs: ('console' | 'file' | 'syslog')[];
    file?: {
        path: string;
        maxSize: string;
        maxFiles: number;
        rotate: boolean;
    };
    structured: boolean;
    includeStack: boolean;
}

// Main unified configuration interface
export interface UnifiedConfig {
    environment: 'development' | 'staging' | 'production';
    database: DatabaseConfig;
    ai: AIConfig;
    services: ServiceConfig;
    windows: WindowsConfig;
    security: SecurityConfig;
    logging: LoggingConfig;
    monitoring: {
        enabled: boolean;
        metricsPort: number;
        healthCheckInterval: number;
        alerting: {
            enabled: boolean;
            webhookUrl?: string;
            channels: string[];
        };
    };
}

// Configuration loading and validation class
class ConfigManager {
    private config: UnifiedConfig | null = null;
    private configOverrides: Partial<UnifiedConfig> = {};

    constructor() {
        this.loadConfiguration();
    }

    private loadConfiguration(): void {
        // Detect Windows environment
        // Safely check for process/navigator
        const isWindows = (typeof process !== 'undefined' && process.platform === 'win32') ||
                          (typeof navigator !== 'undefined' && (navigator.platform?.toLowerCase().includes('win') ?? false));

        // Get environment variables with fallbacks
        const env = this.getEnvironmentVariables();

        this.config = {
            environment: (env.NODE_ENV as any) ?? 'development',
            database: {
                postgres: {
                    url: env.DATABASE_URL || env.POSTGRES_URL || 'postgresql://localhost:5434/legal_ai_db',
                    maxConnections: parseInt(env.POSTGRES_MAX_CONNECTIONS || (isWindows ? '20' : '25')),
                    ssl: env.POSTGRES_SSL === 'true' || env.NODE_ENV === 'production',
                    timeout: parseInt(env.POSTGRES_TIMEOUT || (isWindows ? '30000' : '20000')),
                    retryAttempts: parseInt(env.POSTGRES_RETRIES || '3')
                },
                redis: {
                    url: env.REDIS_URL || 'redis://localhost:6379',
                    fallbackUrl: env.REDIS_FALLBACK_URL || 'redis://127.0.0.1:6379',
                    maxRetries: parseInt(env.REDIS_MAX_RETRIES || '3'),
                    connectTimeout: parseInt(env.REDIS_CONNECT_TIMEOUT || (isWindows ? '8000' : '5000')),
                    commandTimeout: parseInt(env.REDIS_COMMAND_TIMEOUT || (isWindows ? '8000' : '5000')),
                    keepAlive: parseInt(env.REDIS_KEEP_ALIVE || (isWindows ? '30000' : '0'))
                },
                neo4j: {
                    url: env.NEO4J_URL || 'bolt://localhost:7687',
                    username: env.NEO4J_USERNAME || 'neo4j',
                    password: env.NEO4J_PASSWORD || 'password',
                    maxConnectionPoolSize: parseInt(env.NEO4J_MAX_POOL || (isWindows ? '50' : '100')),
                    connectionTimeout: parseInt(env.NEO4J_TIMEOUT || '30000')
                },
                qdrant: {
                    url: env.QDRANT_URL || 'http://localhost:6333',
                    apiKey: env.QDRANT_API_KEY,
                    timeout: parseInt(env.QDRANT_TIMEOUT || (isWindows ? '45000' : '30000')),
                    retries: parseInt(env.QDRANT_RETRIES || '3')
                }
            },
            ai: {
                ollama: {
                    baseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
                    models: {
                        legal: env.OLLAMA_LEGAL_MODEL || 'gemma3-legal',
                        embedding: env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
                        chat: env.OLLAMA_CHAT_MODEL || 'gemma3-legal'
                    },
                    timeout: parseInt(env.OLLAMA_TIMEOUT || (isWindows ? '120000' : '90000')),
                    maxConcurrent: parseInt(env.OLLAMA_MAX_CONCURRENT || (isWindows ? '2' : '4')),
                    gpuLayers: parseInt(env.OLLAMA_GPU_LAYERS || (isWindows ? '35' : '30'))
                },
                openai: env.OPENAI_API_KEY ? {
                    apiKey: env.OPENAI_API_KEY,
                    model: env.OPENAI_MODEL || 'gpt-4',
                    maxTokens: parseInt(env.OPENAI_MAX_TOKENS || '4000')
                } : undefined,
                embedding: {
                    dimensions: parseInt(env.EMBEDDING_DIMENSIONS || '384'),
                    batchSize: parseInt(env.EMBEDDING_BATCH_SIZE || (isWindows ? '16' : '32')),
                    cacheEnabled: env.EMBEDDING_CACHE !== 'false'
                }
            },
            services: {
                enhancedRAG: {
                    url: env.ENHANCED_RAG_URL || 'http://localhost:8094',
                    timeout: parseInt(env.RAG_TIMEOUT || (isWindows ? '60000' : '45000')),
                    retries: parseInt(env.RAG_RETRIES || '3'),
                    batchSize: parseInt(env.RAG_BATCH_SIZE || (isWindows ? '8' : '16'))
                },
                uploadService: {
                    url: env.UPLOAD_SERVICE_URL || 'http://localhost:8093',
                    maxFileSize: parseInt(env.UPLOAD_MAX_SIZE || String(50 * 1024 * 1024)), // 50MB
                    allowedTypes: (env.UPLOAD_ALLOWED_TYPES || 'pdf,doc,docx,txt,rtf').split(','),
                    timeout: parseInt(env.UPLOAD_TIMEOUT || (isWindows ? '180000' : '120000'))
                },
                clusterManager: {
                    url: env.CLUSTER_MANAGER_URL || 'http://localhost:8213',
                    workers: {
                        legal: parseInt(env.LEGAL_WORKERS || (isWindows ? '2' : '4')),
                        ai: parseInt(env.AI_WORKERS || (isWindows ? '1' : '2')),
                        vector: parseInt(env.VECTOR_WORKERS || (isWindows ? '2' : '3')),
                        database: parseInt(env.DATABASE_WORKERS || (isWindows ? '1' : '2'))
                    },
                    ports: {
                        basePort: parseInt(env.BASE_PORT || '5000'),
                        legalBase: parseInt(env.LEGAL_BASE_PORT || '5010'),
                        aiBase: parseInt(env.AI_BASE_PORT || '5020'),
                        vectorBase: parseInt(env.VECTOR_BASE_PORT || '5030'),
                        databaseBase: parseInt(env.DATABASE_BASE_PORT || '5040')
                    }
                }
            },
            windows: {
                platform: isWindows ? 'win32' : (typeof process !== 'undefined' ? (process.platform as any) : 'linux'),
                gpuAcceleration: env.GPU_ACCELERATION !== 'false' && isWindows,
                pathSeparator: isWindows ? '\\' : '/',
                serviceInstallation: {
                    useWindowsServices: isWindows && env.USE_WINDOWS_SERVICES === 'true',
                    serviceUser: env.WINDOWS_SERVICE_USER || 'LocalSystem',
                    dataPath: env.WINDOWS_DATA_PATH || (isWindows ? 'C:\\ProgramData\\LegalAI' : '/var/lib/legalai'),
                    logPath: env.WINDOWS_LOG_PATH || (isWindows ? 'C:\\ProgramData\\LegalAI\\logs' : '/var/log/legalai')
                },
                performance: {
                    maxMemoryMB: parseInt(env.MAX_MEMORY_MB || (isWindows ? '8192' : '4096')),
                    cpuCores: parseInt(env.CPU_CORES || String(this.getCPUCores())),
                    ioOptimization: env.IO_OPTIMIZATION !== 'false',
                    networkKeepAlive: parseInt(env.NETWORK_KEEP_ALIVE || (isWindows ? '30000' : '0'))
                }
            },
            security: {
                cors: {
                    origins: (env.CORS_ORIGINS || 'http://localhost:5173').split(','),
                    credentials: env.CORS_CREDENTIALS !== 'false'
                },
                rateLimit: {
                    windowSec: parseInt(env.RATE_LIMIT_WINDOW || '60'),
                    limits: {
                        free: parseInt(env.RATE_LIMIT_FREE || '10'),
                        premium: parseInt(env.RATE_LIMIT_PREMIUM || '50'),
                        enterprise: parseInt(env.RATE_LIMIT_ENTERPRISE || '200'),
                        api: parseInt(env.RATE_LIMIT_API || '1000'),
                        admin: parseInt(env.RATE_LIMIT_ADMIN || '10000')
                    }
                },
                auth: {
                    sessionTimeout: parseInt(env.SESSION_TIMEOUT || String(24 * 60 * 60)), // 24 hours
                    jwtSecret: env.JWT_SECRET || this.generateSecretKey(),
                    bcryptRounds: parseInt(env.BCRYPT_ROUNDS || '12')
                }
            },
            logging: {
                level: (env.LOG_LEVEL as any) || (dev ? 'debug' : 'info'),
                format: (env.LOG_FORMAT as any) || 'json',
                outputs: (env.LOG_OUTPUTS || 'console').split(',') as any,
                file: env.LOG_FILE_PATH ? {
                    path: env.LOG_FILE_PATH,
                    maxSize: env.LOG_MAX_SIZE || '10M',
                    maxFiles: parseInt(env.LOG_MAX_FILES || '5'),
                    rotate: env.LOG_ROTATE !== 'false'
                } : undefined,
                structured: env.LOG_STRUCTURED !== 'false',
                includeStack: env.LOG_INCLUDE_STACK === 'true' || dev
            },
            monitoring: {
                enabled: env.MONITORING_ENABLED !== 'false',
                metricsPort: parseInt(env.METRICS_PORT || '9090'),
                healthCheckInterval: parseInt(env.HEALTH_CHECK_INTERVAL || '30000'),
                alerting: {
                    enabled: env.ALERTING_ENABLED === 'true',
                    webhookUrl: env.ALERTING_WEBHOOK_URL,
                    channels: (env.ALERTING_CHANNELS || '').split(',').filter(Boolean)
                }
            }
        };

        // Apply runtime overrides if any
        if (Object.keys(this.configOverrides).length > 0) {
            this.config = this.mergeDeep(this.config, this.configOverrides);
        }

        this.validateConfiguration();
    }

    private getEnvironmentVariables(): Record<string, string> {
        if (typeof process !== 'undefined') {
            return process.env as Record<string, string>;
        }
        // Fallback for browser if needed, though mostly empty in client without build injects
        return (import.meta as any).env || {};
    }

    private getCPUCores(): number {
        try {
            if (!browser && typeof process !== 'undefined') {
                 // require('os') might fail in strict ESM if not properly polyfilled.
                 // Assuming node environment here or build replacement.
                 // For safety in shared code:
                 try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const os = require('os');
                    return os.cpus().length;
                 } catch {
                     return 2;
                 }
            }
            return navigator?.hardwareConcurrency ?? 4;
        } catch {
            return 4; // Safe fallback
        }
    }

    private generateSecretKey(): string {
        // Generate a secure secret key for JWT
        if (!browser && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
            return 'dev-secret-key-change-in-production';
        }
        // In production, this should come from environment variables
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    private mergeDeep(target: any, source: any): any {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.mergeDeep(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    private validateConfiguration(): void {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        const errors: string[] = [];

        // Validate required configurations
        if (!this.config.database.postgres.url) errors.push('PostgreSQL URL is required');
        if (!this.config.database.redis.url) errors.push('Redis URL is required');
        if (!this.config.ai.ollama.baseUrl) errors.push('Ollama base URL is required');
        if (!this.config.security.auth.jwtSecret) errors.push('JWT secret is required');

        // Windows-specific validations
        if (this.config.windows.platform === 'win32') {
            if (this.config.windows.serviceInstallation.useWindowsServices) {
                if (!this.config.windows.serviceInstallation.serviceUser) {
                    errors.push('Windows service user is required when using Windows services');
                }
            }
        }

        // Production-specific validations
        if (this.config.environment === 'production') {
            if (this.config.security.auth.jwtSecret.includes('dev-secret')) {
                errors.push('Production JWT secret must be changed from development default');
            }
            if (this.config.logging.level === 'debug') {
                console.warn('WARNING: Debug logging enabled in production');
            }
        }

        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    // Public API methods
    public getConfig(): UnifiedConfig {
        if (!this.config) {
            throw new Error('Configuration not initialized');
        }
        return { ...this.config };
    }

    public get<T extends keyof UnifiedConfig>(section: T): UnifiedConfig[T] {
        if (!this.config) {
            throw new Error('Configuration not initialized');
        }
        return this.config[section];
    }

    public override(overrides: Partial<UnifiedConfig>): void {
        this.configOverrides = { ...this.configOverrides, ...overrides };
        this.loadConfiguration(); // Reload with overrides
    }

    public isDevelopment(): boolean {
        return (this.config?.environment ?? 'development') === 'development';
    }

    public isProduction(): boolean {
        return this.config?.environment === 'production';
    }

    public isWindows(): boolean {
        return this.config?.windows.platform === 'win32';
    }

    public hasGPUAcceleration(): boolean {
        return this.config?.windows.gpuAcceleration ?? false;
    }

    public getServiceUrl(service: keyof ServiceConfig): string {
        if (!this.config) {
            throw new Error('Configuration not initialized');
        }
        return this.config.services[service].url;
    }

    public getDatabaseUrl(database: keyof DatabaseConfig): string {
        if (!this.config) {
            throw new Error('Configuration not initialized');
        }
        return (this.config.database[database] as any).url;
    }

    // Health check for configuration
    public async healthCheck(): Promise<any> {
        const checks: Record<string, boolean> = {};
        try {
            // Check if configuration is loaded
            checks.configLoaded = !!this.config;

            // Check required environment variables
            checks.requiredEnvVars = !!(
                this.config?.database.postgres?.url &&
                this.config?.database.redis?.url &&
                this.config?.ai.ollama.baseUrl
            );

            // Check Windows-specific configurations
            if (this.isWindows()) {
                checks.windowsConfig = !!(
                    this.config?.windows.performance?.maxMemoryMB &&
                    this.config?.windows.pathSeparator
                );
            } else {
                checks.windowsConfig = true; // N/A for non-Windows
            }

            // Check security configuration
            checks.securityConfig = !!(
                this.config?.security.auth?.jwtSecret &&
                !this.config?.security.auth.jwtSecret.includes('dev-secret')
            );

            // Allow dev secret in development
            if (this.isDevelopment()) checks.securityConfig = true;

            const allHealthy = Object.values(checks).every(Boolean);
            const status = allHealthy ? 'healthy' : 'degraded';

            return {
                status,
                checks,
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
             return {
                 status: 'unhealthy',
                 error: error.message,
                 timestamp: new Date().toISOString()
             };
        }
    }

    // Export configuration for debugging (development only)
    public exportConfig(): unknown {
        if (!this.isDevelopment()) {
            throw new Error('Configuration export is only available in development');
        }
        // Redact sensitive information
        const exportConfig = JSON.parse(JSON.stringify(this.config));
        if (exportConfig?.security?.auth?.jwtSecret) exportConfig.security.auth.jwtSecret = '[REDACTED]';
        if (exportConfig?.database?.neo4j?.password) exportConfig.database.neo4j.password = '[REDACTED]';
        if (exportConfig?.ai?.openai?.apiKey) exportConfig.ai.openai.apiKey = '[REDACTED]';

        return exportConfig;
    }
}

// Export singleton instance
export const config = new ConfigManager();

// Export utility functions
export function getConfig(): UnifiedConfig {
    return config.getConfig();
}

export function getConfigSection<T extends keyof UnifiedConfig>(section: T): UnifiedConfig[T] {
    return config.get(section);
}

export function isWindows(): boolean {
    return config.isWindows();
}

export function isDevelopment(): boolean {
    return config.isDevelopment();
}

export function isProduction(): boolean {
    return config.isProduction();
}

// Default export
export default config;
