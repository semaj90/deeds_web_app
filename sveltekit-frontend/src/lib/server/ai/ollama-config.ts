// Unified Ollama configuration module (consolidated)
// Provides model registry, fallback chains, and helper utilities used by server AI services.

import type { OllamaConfig, ModelConfig } from './types.js';
import { SYSTEM_GEMMA4_LEGAL, SYSTEM_EMBEDDING } from '$lib/ai/prompts.js';
import { ENV } from '$lib/server/env.server.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';
import { getOllamaEndpoint } from '$lib/server/utils/ollama-endpoint.js';

/**
 * Ollama Configuration for High-Performance AI Assistant
 * Using the canonical local synthesis model; EmbeddingGemma owns embeddings.
 */
// Model configurations aligned with the blueprint architecture
export const MODELS: Record<string, ModelConfig> = {
  [LLM_MODEL_ID]: {
    name: LLM_MODEL_ID,
    type: 'local',
    capabilities: ['text-generation', 'legal-analysis'],
    contextWindow: 8192,
    embeddingDimension: 768,
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    systemPrompt: SYSTEM_GEMMA4_LEGAL,
    options: {
      num_gpu: 1, // Use GPU acceleration
      num_thread: 8, // Parallel processing threads
      repeat_penalty: 1.1,
      seed: 42,
      stop: ['User: ', 'Human: ', '\n\n\n'],
    },
  },
  embeddinggemma: {
    name: 'embeddinggemma',
    type: 'embedding',
    capabilities: ['embeddings'],
    embeddingDimension: 768,
    contextWindow: 2048, // Per google/embeddinggemma-300m model card: 2048 max input tokens
    temperature: 0.0, // Deterministic embeddings
    systemPrompt: SYSTEM_EMBEDDING,
  },
};

// Fallback chain configuration - llama3.2 removed
export const FALLBACK_CHAIN = {
	'legal-analysis': [
		LLM_MODEL_ID, // canonical local synthesis model
	],
	'text-generation': [
		LLM_MODEL_ID, // canonical local synthesis model
	],
	embeddings: [
		'embeddinggemma', // Canonical EmbeddingGemma semantic_768 lane
	]
};

export const OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: getOllamaEndpoint() ?? ENV.OLLAMA_BASE_URL,
  defaultModel: LLM_MODEL_ID,
	embeddingModel: 'embeddinggemma',
	fallbackModel: LLM_MODEL_ID,
	fallbackModels: {
	legal: LLM_MODEL_ID,
		general: LLM_MODEL_ID
	},
	timeout: 60000, // 60 seconds for complex legal analysis
	maxRetries: 3,
	streamEnabled: true,

    // GPU acceleration settings
	gpu: {
	enabled: true,
		layers: 35, // Number of layers to offload to GPU
		mainGpu: 0,
		tensorSplit: null
	},
	// Performance optimization
	performance: {
	batchSize: 32,
		parallelRequests: 4,
		cacheEnabled: true,
		cacheTTL: 3600, // 1 hour cache
	},
	// Advanced features from blueprint
	features: {
	som: true, // Self-Organizing Map for topic modeling
		proactiveCaching: true,
		multiModalIndexing: true,
		reinforcementLearning: false, // Can be enabled later
		webGpuAcceleration: true,
		intelligentFallback: true, // Enable smart model selection
	}
};

/**
 * Get model configuration with fallback support
 */
export function getModelConfig(modelName: string = OLLAMA_CONFIG.defaultModel): ModelConfig {
    return MODELS[modelName] || MODELS[OLLAMA_CONFIG.fallbackModels?.legal ?? LLM_MODEL_ID];
}

/**
 * Check if model supports a specific capability
 */
export function modelSupportsCapability(modelName: string, capability: string): boolean {
    const config = getModelConfig(modelName);
    return config?.capabilities?.includes(capability) ?? false;
}

/**
 * Get optimal model for a specific task with fallback chain
 */
export function getOptimalModel(task: 'embedding' | 'generation' | 'legal-analysis'): string[] {
    const taskMap = {
        'embedding': FALLBACK_CHAIN['embeddings'],
        'generation': FALLBACK_CHAIN['text-generation'],
        'legal-analysis': FALLBACK_CHAIN['legal-analysis']
    };
    return taskMap[task] || [OLLAMA_CONFIG.defaultModel];
}

/**
 * Get the best available model from a list
 * @param preferredModels Array of model names in order of preference
 * @param availableModels Array of currently available model names
 */
export function selectBestAvailableModel(preferredModels: string[], availableModels: string[]): string | null {
    for (const model of preferredModels) {
        // Check exact match
        if (availableModels.includes(model)) {
            return model;
        }
        // Check partial match for variants (e.g., legal-bert:latest)
        const matchingModel = availableModels.find(available => available.includes(model.split(':')[0]));
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
        'plaintiff', 'defendant', 'litigation', 'intellectual property', 'patent',
        'trademark', 'copyright', 'tort', 'negligence', 'breach', 'damages',
        'remedy', 'arbitration', 'mediation', 'settlement', 'precedent', 'deed',
        'title', 'evidence', 'testimony', 'witness', 'prosecutor', 'defense',
        'attorney', 'counsel', 'judge'
    ];
    const lowerPrompt = prompt.toLowerCase();
    return legalKeywords.some(keyword => lowerPrompt.includes(keyword));
}

export default OLLAMA_CONFIG;
