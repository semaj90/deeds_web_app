/**
 * Ollama Configuration for High-Performance AI Assistant
 * Using local gemma3-legal:latest model with legal-bert fallback
 */

// Types
export type OllamaEndpoint = 'generate' | 'chat' | 'embeddings' | 'models' | 'health' | 'pull' | 'version';

export interface ModelConfig {
    name: string;, type: 'local' | 'embedding' | 'remote';
    capabilities: string[];
    contextWindow?: number;
    embeddingDimension?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    systemPrompt?: string;
    options?: Record<string, unknown>;
}

export interface OllamaConfig {
    baseUrl: string;, endpoints: Record<OllamaEndpoint, string>;
    defaultModel: string;, embeddingModel: string;
    fallbackModel: string;
    fallbackModels?: Record<string, string>;
    timeout: number;, maxRetries: number;
    streamEnabled: boolean;
    gpu?: {, enabled: boolean;
        layers: number;, mainGpu: number;
        tensorSplit: null | number[];
    };
    performance?: {, batchSize: number;
        parallelRequests: number;, cacheEnabled: boolean;
        cacheTTL: number;
    };
    features?: {, som: boolean;
        proactiveCaching: boolean;, multiModalIndexing: boolean;
        reinforcementLearning: boolean;, webGpuAcceleration: boolean;
        intelligentFallback: boolean;
    };
}

const FALLBACK_PATHS: Record<OllamaEndpoint, string> = {
    generate: '/api/generate',
    chat: '/api/chat',
    embeddings: '/api/embeddings',
    models: '/api/tags',
    health: '/api/version',
    pull: '/api/pull',
    version: '/api/version'
};

function getEnv(name: string): string | undefined {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        const envRecord = import.meta.env as unknown as Record<string, string>;
        const value = envRecord[name];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    if (typeof process !== 'undefined' && process.env) {
        const value = process.env[name];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
}

function normalizeBaseUrl(url: string | undefined, fallback: string): string {
    const trimmed = url?.trim();
    if (!trimmed) return fallback;
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function parseEndpointOverrides(): Partial<Record<OllamaEndpoint, string>> {
    const explicitEndpoints: Partial<Record<OllamaEndpoint, string>> = {};
    const overridesRaw = getEnv('OLLAMA_ENDPOINTS');

    if (overridesRaw) {
        try {
            const parsed = JSON.parse(overridesRaw) as Record<string, unknown>;
            Object.entries(parsed).forEach(([key, value]) => {
                const endpoint = key.toLowerCase() as OllamaEndpoint;
                if (FALLBACK_PATHS[endpoint] && typeof value === 'string') {
                    explicitEndpoints[endpoint] = value;
                }
            });
        } catch (error) {
            console.warn('[Ollama] Failed to parse OLLAMA_ENDPOINTS env as JSON:', error);
        }
    }

    (Object.keys(FALLBACK_PATHS) as OllamaEndpoint[]).forEach(endpoint => {
        const envKey = `OLLAMA_${endpoint.toUpperCase()}_URL`;
        const value = getEnv(envKey);
        if (value) explicitEndpoints[endpoint] = value;
    });

    return explicitEndpoints;
}

const BASE_URL = normalizeBaseUrl(
    getEnv('OLLAMA_BASE_URL') || getEnv('OLLAMA_URL'),
    'http://localhost:11434'
);

const ENDPOINT_OVERRIDES = parseEndpointOverrides();
const BACKENDS = new Map<string, string>();

export const OLLAMA_ENDPOINTS: Record<OllamaEndpoint, string> = (Object.keys(FALLBACK_PATHS) as OllamaEndpoint[]).reduce(
    (acc, key) => {
        const explicit = ENDPOINT_OVERRIDES[key];
        acc[key] = explicit ?? `${BASE_URL}${FALLBACK_PATHS[key]}`;
        return acc;
    },
    {} as Record<OllamaEndpoint, string>
);

BACKENDS.set('ollama', BASE_URL);

function applyPath(base: string, path: string): string {
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getOllamaEndpoint(endpoint: OllamaEndpoint, baseOverride?: string): string {
    if (baseOverride) {
        const normalizedBase = normalizeBaseUrl(baseOverride, BASE_URL);
        const explicit = ENDPOINT_OVERRIDES[endpoint];
        if (explicit) {
            return /^https?:\/\//i.test(explicit) ? explicit : applyPath(normalizedBase, explicit);
        }
        return applyPath(normalizedBase, FALLBACK_PATHS[endpoint]);
    }
    return OLLAMA_ENDPOINTS[endpoint];
}

export function registerBackend(name: string, url: string): void {
    if (!name || typeof name !== 'string') return;
    if (!url || typeof url !== 'string') return;
    BACKENDS.set(name, normalizeBaseUrl(url, url));
}

export function getBackend(name = 'ollama'): string {
    return BACKENDS.get(name) ?? BASE_URL;
}

// Model configurations aligned with the blueprint architecture
export const MODELS: Record<string, ModelConfig> = {
    'gemma3-legal:latest': {, name: 'gemma3-legal:latest',
        type: 'local',
        capabilities: ['text-generation', 'embeddings', 'legal-analysis'],
        contextWindow: 8192,
        embeddingDimension: 768,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        systemPrompt: `You are a sophisticated legal AI assistant powered by Gemma3, specialized in legal document analysis, contract review, and case law research. You provide accurate, context-aware legal insights while maintaining strict confidentiality and professional standards.`,
        options: {, num_gpu: 1,
            num_thread: 8,
            repeat_penalty: 1.1,
            seed: 42,
            stop: ['User:', 'Human:', '\n\n\n']
        }
    },
    'nomic-embed-text': {, name: 'nomic-embed-text',
        type: 'embedding',
        capabilities: ['embeddings'],
        embeddingDimension: 768,
        contextWindow: 8192
    },
    'embeddinggemma': {, name: 'embeddinggemma',
        type: 'embedding',
        capabilities: ['embeddings'],
        embeddingDimension: 768,
        contextWindow: 8192,
        temperature: 0.0,
        systemPrompt: 'Generate high-quality semantic embeddings for legal document analysis and retrieval.'
    }
};

// Fallback chain configuration
export const FALLBACK_CHAIN: Record<string, string[]> = {
    'legal-analysis': ['gemma3-legal:latest'],
    'text-generation': ['gemma3-legal:latest'],
    'embeddings': ['embeddinggemma', 'nomic-embed-text']
};

export const OLLAMA_CONFIG: OllamaConfig = {
    baseUrl: BASE_URL,
    endpoints: OLLAMA_ENDPOINTS,
    defaultModel: 'gemma3-legal:latest',
    embeddingModel: 'embeddinggemma',
    fallbackModel: 'gemma3-legal:latest',
    fallbackModels: {, legal: 'gemma3-legal:latest',
        general: 'gemma3-legal:latest'
    },
    timeout: 60000,
    maxRetries: 3,
    streamEnabled: true,
    gpu: {, enabled: true,
        layers: 35,
        mainGpu: 0,
        tensorSplit: null
    },
    performance: {, batchSize: 32,
        parallelRequests: 4,
        cacheEnabled: true,
        cacheTTL: 3600
    },
    features: {, som: true,
        proactiveCaching: true,
        multiModalIndexing: true,
        reinforcementLearning: false,
        webGpuAcceleration: true,
        intelligentFallback: true
    }
};

/**
 * Get model configuration with fallback support
 */
export function getModelConfig(modelName: string = OLLAMA_CONFIG.defaultModel): ModelConfig {
    return MODELS[modelName] || MODELS[OLLAMA_CONFIG.fallbackModels?.legal ?? 'gemma3-legal:latest'];
}

/**
 * Check if model supports a specific capability
 */
export function modelSupportsCapability(modelName: string, capability: string): boolean {
    const config = getModelConfig(modelName);
    return config.capabilities.includes(capability);
}

/**
 * Get optimal model for a specific task with fallback chain
 */
export function getOptimalModel(task: 'embedding' | 'generation' | 'legal-analysis'): string[] {
    const taskMap: Record<string, string[]> = {
        'embedding': FALLBACK_CHAIN['embeddings'],
        'generation': FALLBACK_CHAIN['text-generation'],
        'legal-analysis': FALLBACK_CHAIN['legal-analysis']
    };
    return taskMap[task] || [OLLAMA_CONFIG.defaultModel];
}

/**
 * Get the best available model from a list
 */
export function selectBestAvailableModel(preferredModels: string[], availableModels: string[]): string | null {
    for (const model of preferredModels) {
        // Check exact match
        if (availableModels.includes(model)) {
            return model;
        }
        // Check partial match for variants
        const matchingModel = availableModels.find(available =>
            available.includes(model.split(':')[0])
        );
        if (matchingModel) {
            return matchingModel;
        }
    }
    // If no preferred models available, return first available or null
    return availableModels[0] ?? null;
}

/**
 * Determine if a task should use legal-specific model
 */
export function isLegalTask(prompt: string): boolean {
    const legalKeywords = [
        'contract', 'agreement', 'legal', 'law', 'court', 'case', 'statute',
        'regulation', 'compliance', 'liability', 'clause', 'jurisdiction',
        'plaintiff', 'defendant', 'litigation', 'intellectual property',
        'patent', 'trademark', 'copyright', 'tort', 'negligence', 'breach',
        'damages', 'remedy', 'arbitration', 'mediation', 'settlement',
        'precedent', 'deed', 'title', 'evidence', 'testimony', 'witness',
        'prosecutor', 'defense', 'attorney', 'counsel', 'judge'
    ];
    const lowerPrompt = prompt.toLowerCase();
    return legalKeywords.some(keyword => lowerPrompt.includes(keyword));
}

export default OLLAMA_CONFIG;
