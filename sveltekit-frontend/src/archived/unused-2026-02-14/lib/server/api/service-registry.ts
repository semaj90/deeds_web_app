
// API Service Registry and Route Mapper
// Maps all your existing API routes and provides service discovery
import { existsSync } from 'fs';
import { Socket } from 'net';
import { join } from 'path';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Add explicit types to avoid `any` type
export type HealthStatus = 'healthy' | 'unhealthy' | 'error' | 'unknown';

export interface ServiceConfig {
    name: string;
	port: number;
    host: string;
	type: string;
    required: boolean;
    // healthCheck returns a Promise<boolean>
    healthCheck: () => Promise<boolean>;
    // allow extra properties used elsewhere
    [key: string]: unknown;
}

export interface RouteConfig {
    endpoints: string[];
	description: string;
    dependencies?: string[];
    required?: boolean;
    [key: string]: unknown;
}

export interface HealthCheckRecord {
    status?: HealthStatus;
    lastCheck?: string;
    error?: string;
    [key: string]: any;
}

type ServiceCheckResult = ServiceConfig & {
    status: HealthStatus;
	lastCheck: string;
    error?: string;
};

export class ApiServiceRegistry {
    // replace `any` with explicit types
    routes: Map<string, RouteConfig>;
    services: Map<string, ServiceConfig>;
    healthChecks: Map<string, HealthCheckRecord>;

    constructor() {
        this.routes = new Map();
        this.services = new Map();
        this.healthChecks = new Map();
        this.initialize();
    }

    initialize() {
        // Core API routes from your sveltekit-frontend structure
        const apiRoutes: Record<string, RouteConfig> = {
            // Authentication & User Management
            auth: {
	endpoints: ['/api/auth/login', '/api/auth/logout', '/api/auth/register'],
                description: 'User authentication and session management',
                required: true
            },
	users: {
	endpoints: ['/api/users', '/api/user/profile'],
                description: 'User account management',
                required: true
            },
	// Core Legal AI Features
            cases: {
	endpoints: ['/api/cases', '/api/cases/[id]', '/api/cases/search'],
                description: 'Legal case management',
                required: true
            },
	evidence: {
	endpoints: ['/api/evidence', '/api/evidence/[id]', '/api/evidence/upload'],
                description: 'Evidence handling and processing',
                required: true
            },
	citations: {
	endpoints: ['/api/citations', '/api/citations/generate'],
                description: 'Legal citation management',
                required: true
            },
	reports: {
	endpoints: ['/api/reports', '/api/reports/generate'],
                description: 'Report generation',
                required: true
            },
	// AI Services
            chat: {
	endpoints: ['/api/chat', '/api/chat/stream'],
                description: 'AI chat with gemma3-legal',
                dependencies: ['ollama'],
                required: true
            },
	ai: {
	endpoints: ['/api/ai/analyze', '/api/ai/summarize', '/api/ai/suggest'],
                description: 'AI analysis and suggestions',
                dependencies: ['ollama'],
                required: true
            },
	embeddings: {
	endpoints: ['/api/embed', '/api/embeddings/generate'],
                description: 'Text embeddings with nomic-embed-text',
                dependencies: ['ollama'],
                required: true
            },
	// Search & Vector Operations
            search: {
	endpoints: ['/api/search', '/api/search/vector', '/api/search/similarity'],
                description: 'Vector and semantic search',
                dependencies: ['postgresql', 'qdrant'],
                required: true
            },
	vector: {
	endpoints: ['/api/vector', '/api/vectors/index'],
                description: 'Vector database operations',
                dependencies: ['qdrant', 'postgresql'],
                required: false
            },
	// Enhanced RAG System
            rag: {
	endpoints: ['/api/rag/query', '/api/rag/index', '/api/rag/status'],
                description: 'Enhanced RAG system',
                dependencies: ['enhanced_rag'],
                required: false
            },
	'enhanced-rag': {
	endpoints: ['/api/enhanced-rag', '/api/enhanced-rag/process'],
                description: 'Advanced RAG processing',
                dependencies: ['enhanced_rag'],
                required: false
            },
	// File & Document Management
            upload: {
	endpoints: ['/api/upload', '/api/upload/evidence', '/api/upload/status'],
                description: 'File upload and processing',
                dependencies: ['minio'],
                required: true
            },
	documents: {
	endpoints: ['/api/documents', '/api/documents/[id]', '/api/documents/process'],
                description: 'Document management and processing',
                required: true
            },
	// System & Administration
            health: {
	endpoints: ['/api/health', '/api/health-check'],
                description: 'System health monitoring',
                required: true
            },
	system: {
	endpoints: ['/api/system/status', '/api/system/info'],
                description: 'System information',
                required: true
            },
	metrics: {
	endpoints: ['/api/metrics'],
                description: 'Performance metrics',
                required: false
            },
	// GPU & Processing
            gpu: {
	endpoints: ['/api/gpu/status', '/api/gpu-orchestration'],
                description: 'GPU processing orchestration',
                dependencies: ['gpu_orchestrator'],
                required: false
            },
	process: {
	endpoints: ['/api/process', '/api/process-legal-document'],
                description: 'Document processing pipeline',
                required: true
            },
	// Legal Specific
            legal: {
	endpoints: ['/api/legal', '/api/legal-ai', '/api/legal-ai-integration'],
                description: 'Legal AI analysis',
                dependencies: ['ollama'],
                required: true
            },
	statutes: {
	endpoints: ['/api/statutes'],
                description: 'Legal statutes database',
                required: false
            },
	laws: {
	endpoints: ['/api/laws'],
                description: 'Legal laws database',
                required: false
            },
	// Specialized Features
            ocr: {
	endpoints: ['/api/ocr'],
                description: 'Optical Character Recognition',
                required: false
            },
	'text-to-voice': {
	endpoints: ['/api/text-to-voice', '/api/tts'],
                description: 'Text to speech conversion',
                required: false
            },
	'voice-to-text': {
	endpoints: ['/api/voice-to-text'],
                description: 'Speech to text conversion',
                required: false
            },
	// Development & Testing
            test: {
	endpoints: ['/api/test', '/api/test-simple', '/api/testing'],
                description: 'Development testing endpoints',
                required: false
            },
	debug: {
	endpoints: ['/api/debug', '/api/debug-users'],
                description: 'Debug and troubleshooting',
                required: false
            }
        };

        // Register routes
        for (const [name, config] of Object.entries(apiRoutes)) {
            this.routes.set(name, config);
        }

        // Register external services
        this.services.set('postgresql', {
            name: 'PostgreSQL',
            port: 5434,
            host: 'localhost',
            type: 'database',
            required: true,
            healthCheck: () => this.checkPort(5432)
        });
        this.services.set('redis', {
            name: 'Redis Cache',
            port: 6379,
            host: 'localhost',
            type: 'cache',
            required: false,
            healthCheck: () => this.checkPort(6379)
        });
        this.services.set('ollama', {
            name: 'Ollama AI',
            port: 11434,
            host: 'localhost',
            type: 'ai',
            required: true,
            healthCheck: () => this.checkHttp('http://localhost:11434/api/tags')
        });
        this.services.set('qdrant', {
            name: 'Qdrant Vector DB',
            port: 6333,
            host: 'localhost',
            type: 'database',
            required: false,
            healthCheck: () => this.checkHttp('http://localhost:6333/collections')
        });
        this.services.set('minio', {
            name: 'MinIO Object Storage',
            port: 9000,
            host: 'localhost',
            type: 'storage',
            required: false,
            healthCheck: () => this.checkHttp('http://localhost:9000/minio/health/live')
        });
        this.services.set('enhanced_rag', {
            name: 'Enhanced RAG Service',
            port: 8094,
            host: 'localhost',
            type: 'microservice',
            required: false,
            healthCheck: () => this.checkHttp('http://localhost:8094/health')
        });
        this.services.set('gpu_orchestrator', {
            name: 'GPU Orchestrator',
            port: 8095,
            host: 'localhost',
            type: 'microservice',
            required: false,
            healthCheck: () => this.checkHttp('http://localhost:8095/health')
        });
    }

    async checkPort(port: number, host = 'localhost', timeout = 5000): Promise<boolean> {
        return new Promise(resolve => {
            const timeoutId = setTimeout(() => resolve(false), timeout);
            try {
                const socket = new Socket();
                socket.setTimeout(timeout);
                socket.on('connect', () => {
                    clearTimeout(timeoutId);
                    socket.destroy();
                    resolve(true);
                });
                socket.on('timeout', () => {
                    clearTimeout(timeoutId);
                    socket.destroy();
                    resolve(false);
                });
                socket.on('error', () => {
                    clearTimeout(timeoutId);
                    socket.destroy();
                    resolve(false);
                });
                socket.connect({ port, host });
            } catch (e) {
                clearTimeout(timeoutId);
                resolve(false);
            }
        });
    }

    // add types to checkHttp
    async checkHttp(url: string, timeout = 5000): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async checkAllServices(): Promise<Map<string, ServiceCheckResult>> {
        const results = new Map<string, ServiceCheckResult>();
        for (const [name, service] of this.services) {
            try {
                const isHealthy = await service.healthCheck();
                results.set(name, {
                    ...service,
                    status: isHealthy ? 'healthy' : 'unhealthy',
                    lastCheck: new Date().toISOString()
                } as ServiceCheckResult);
            } catch (error) {
                results.set(name, {
                    ...service,
                    status: 'error',
                    error: (error as Error).message,
                    lastCheck: new Date().toISOString()
                } as ServiceCheckResult);
            }
        }
        return results;
    }

    getRoutesByService(serviceName: string): RouteConfig[] {
        const routes: RouteConfig[] = [];
        for (const [routeName, config] of this.routes) {
            if (config.dependencies?.includes(serviceName)) {
                routes.push({ ...config } as RouteConfig);
            }
        }
        return routes;
    }

    getRequiredServices(): ServiceConfig[] {
        return Array.from(this.services.values()).filter(service => service.required);
    }

    getOptionalServices(): ServiceConfig[] {
        return Array.from(this.services.values()).filter(service => !service.required);
    }

    getServiceDependencies(routeName: string): ServiceConfig[] {
        const route = this.routes.get(routeName);
        if (!route?.dependencies) return [];
        return route.dependencies.map(dep => this.services.get(dep)).filter(Boolean) as ServiceConfig[];
    }

    validateApiRoutes() {
        const apiPath = 'src/routes/api'; // Relative to project root
        // Fix for path existence check - assuming running from root
        const fullApiPath = join(process.cwd(), apiPath);

        const results: {
	registered: string[], existing: string[], missing: string[], extra: string[], error?: string } = {
            registered: Array.from(this.routes.keys()),
            existing: [],
            missing: [],
            extra: []
        };

        if (!existsSync(fullApiPath)) {
            // Try sveltekit-frontend prefix if cwd is root
             const frontendApiPath = join(process.cwd(), 'sveltekit-frontend', apiPath);
             if (!existsSync(frontendApiPath)) {
                 return { ...results, error: 'API directory not found' };
             }
        }

        // Scan existing API routes logic - simplified for now as recursive scanning needs careful implementation
        // to match registered routes structure.
        // Can be expanded if needed.

        return results;
    }

    generateServiceReport() {
        return {
            totalRoutes: this.routes.size,
            totalServices: this.services.size,
            requiredServices: this.getRequiredServices().length,
            optionalServices: this.getOptionalServices().length,
            routes: Object.fromEntries(this.routes),
            services: Object.fromEntries(this.services),
            timestamp: new Date().toISOString()
        };
    }
}

export const apiRegistry = new ApiServiceRegistry();

