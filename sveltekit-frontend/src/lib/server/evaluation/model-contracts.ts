/**
 * Model Contracts: Cline vs Code Extension Evaluation
 *
 * Defines the contract each model must satisfy for integration.
 * Uses for: Gemma4, HForF, Qwen, and other models.
 */

export type ModelIdentifier = 'gemma4-legal' | 'hforf-7b' | 'qwen3-7b' | 'unknown';

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsCaching: boolean;
  supportsToolCalls: boolean;
  supportsReasoningBlock: boolean;
  nativeKvCacheSupport: boolean;
  maxContextTokens: number;
  recommendedMaxContextTokens: number;
  maxOutputTokens: number;
}

export interface ClinetIntegrationContract {
  model: ModelIdentifier;
  baseUrl: string;
  streaming: boolean;
  toolCalling: boolean;
  kvCache: boolean;
  kvCacheTtl?: number;
  temperature: number;
  maxTokens: number;
  systemPromptSize?: number;
}

export interface CodeExtensionIntegrationContract {
  model: ModelIdentifier;
  baseUrl: string;
  streaming: boolean;
  toolCalling: boolean;
  instructionFollowing: 'strict' | 'flexible' | 'poor';
  multiTurnCapability: 'excellent' | 'good' | 'degraded';
  errorRecovery: 'self_aware' | 'partial' | 'none';
}

/**
 * Capabilities for known models
 */
export const MODEL_CAPABILITIES: Record<ModelIdentifier, ModelCapabilities> = {
  'gemma4-legal': {
    supportsStreaming: true,
    supportsCaching: true,
    supportsToolCalls: true,
    supportsReasoningBlock: true,
    nativeKvCacheSupport: true,
    maxContextTokens: 131072,
    recommendedMaxContextTokens: 65536,
    maxOutputTokens: 8192,
  },
  'hforf-7b': {
    supportsStreaming: true,
    supportsCaching: false, // HForF has known cache corruption issues
    supportsToolCalls: false, // Limited tool call support
    supportsReasoningBlock: false,
    nativeKvCacheSupport: false,
    maxContextTokens: 32768,
    recommendedMaxContextTokens: 16384,
    maxOutputTokens: 4096,
  },
  'qwen3-7b': {
    supportsStreaming: true,
    supportsCaching: true,
    supportsToolCalls: true,
    supportsReasoningBlock: false,
    nativeKvCacheSupport: true,
    maxContextTokens: 32768,
    recommendedMaxContextTokens: 16384,
    maxOutputTokens: 4096,
  },
  unknown: {
    supportsStreaming: false,
    supportsCaching: false,
    supportsToolCalls: false,
    supportsReasoningBlock: false,
    nativeKvCacheSupport: false,
    maxContextTokens: 4096,
    recommendedMaxContextTokens: 2048,
    maxOutputTokens: 512,
  },
};

/**
 * Cline-specific contract for local IDE integration
 */
export function createClinetContract(model: ModelIdentifier): ClinetIntegrationContract {
  const caps = MODEL_CAPABILITIES[model] || MODEL_CAPABILITIES.unknown;

  return {
    model,
    baseUrl: 'http://127.0.0.1:8090/v1',
    streaming: caps.supportsStreaming,
    toolCalling: caps.supportsToolCalls,
    kvCache: caps.nativeKvCacheSupport,
    kvCacheTtl: caps.nativeKvCacheSupport ? 256 : undefined,
    temperature: 0.3, // Conservative for code generation
    maxTokens: Math.min(4096, caps.maxOutputTokens),
  };
}

/**
 * Code extension-specific contract
 */
export function createCodeExtensionContract(model: ModelIdentifier): CodeExtensionIntegrationContract {
  const caps = MODEL_CAPABILITIES[model] || MODEL_CAPABILITIES.unknown;

  // Model-specific instruction-following assessment
  const instructionFollowing: Record<ModelIdentifier, 'strict' | 'flexible' | 'poor'> = {
    'gemma4-legal': 'strict',
    'hforf-7b': 'flexible', // HForF is less precise
    'qwen3-7b': 'strict',
    unknown: 'poor',
  };

  const multiTurn: Record<ModelIdentifier, 'excellent' | 'good' | 'degraded'> = {
    'gemma4-legal': 'excellent',
    'hforf-7b': 'degraded', // Known issues with long conversations
    'qwen3-7b': 'good',
    unknown: 'degraded',
  };

  const errorRecovery: Record<ModelIdentifier, 'self_aware' | 'partial' | 'none'> = {
    'gemma4-legal': 'self_aware',
    'hforf-7b': 'none', // Loops into repetition
    'qwen3-7b': 'partial',
    unknown: 'none',
  };

  return {
    model,
    baseUrl: 'http://127.0.0.1:8090/v1',
    streaming: caps.supportsStreaming,
    toolCalling: caps.supportsToolCalls,
    instructionFollowing: instructionFollowing[model],
    multiTurnCapability: multiTurn[model],
    errorRecovery: errorRecovery[model],
  };
}

/**
 * Model-specific warnings and caveats
 */
export function getModelWarnings(model: ModelIdentifier): string[] {
  const warnings: Record<ModelIdentifier, string[]> = {
    'gemma4-legal': [
      '✅ Recommended for production use',
      '✅ Full tool-calling support',
      '✅ Excellent instruction following',
    ],
    'hforf-7b': [
      '⚠️  Known KV cache corruption after 1000+ turns',
      '⚠️  Limited tool-call support (experimental)',
      '⚠️  Multi-turn degradation observed',
      '⚠️  Loops into repetition without error recovery',
      '🔴 NOT RECOMMENDED for Cline integration',
    ],
    'qwen3-7b': [
      '✅ Good alternative to Gemma4',
      '⚠️  TurboQuant support is experimental (requires D=128 kernels)',
      '✅ Solid tool-calling support',
    ],
    unknown: [
      '❌ Model not recognized',
      '❌ Capabilities unknown',
      '❌ NOT RECOMMENDED for production',
    ],
  };

  return warnings[model] || warnings.unknown;
}

/**
 * Health check: validate model is responsive and correctly configured
 */
export async function checkModelHealth(model: ModelIdentifier, baseUrl: string): Promise<{
  healthy: boolean;
  version?: string;
  contextLength?: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let healthy = true;

  try {
    // Test 1: Model list endpoint
    const modelsResponse = await fetch(`${baseUrl}/models`, { timeout: 5000 });
    if (!modelsResponse.ok) {
      errors.push(`Models endpoint returned ${modelsResponse.status}`);
      healthy = false;
    }

    // Test 2: Simple completion
    const completionResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getModelFileName(model),
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 10,
        stream: false,
      }),
      timeout: 10000,
    });

    if (!completionResponse.ok) {
      errors.push(`Chat completion returned ${completionResponse.status}`);
      healthy = false;
    } else {
      const data = await completionResponse.json();
      if (!data.choices?.[0]?.message?.content) {
        errors.push('Empty response from model');
        healthy = false;
      }
    }
  } catch (err) {
    errors.push(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
    healthy = false;
  }

  return { healthy, errors };
}

/**
 * Map model identifier to GGUF filename
 */
function getModelFileName(model: ModelIdentifier): string {
  const fileMap: Record<ModelIdentifier, string> = {
    'gemma4-legal': 'gemma4-legal-iq4xs-direct.gguf',
    'hforf-7b': 'hforf-7b.gguf',
    'qwen3-7b': 'qwen3-7b-instruct-q4_k_m.gguf',
    unknown: 'unknown.gguf',
  };
  return fileMap[model];
}
