/**
 * Client-side WebAssembly LLaMA.cpp integration for gemma3:270m
 * Provides instant, private AI responses with automatic server fallback
 */

// Replace the inline module augmentation (which caused TS errors) with a local runtime type
// describing just the methods this file uses. This avoids augmenting a module that may not exist
// at compile time and removes the dependency on an ambient `LlamaCpp` symbol.
type LlamaInstance = {
  load(opts?: any): Promise<void>;
  createCompletion(opts?: any): Promise<{ text: string }>;

  // allow any additional runtime properties/methods
  [key: string]: any;
};

interface ClientAIConfig {
  modelPath: string;
  contextSize: number;
  threads: number;
  gpuLayers: number;
}

interface ModelLoadStatus {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  modelSize: number;
}

interface ContextSwitchRules {
  maxTokensClient: number;
  maxComplexityClient: number;
  serverThreshold: number;
  fallbackToServer: boolean;
}

export class ClientSideAI {
  private llama: LlamaInstance | null = null;
  private modelStatus: ModelLoadStatus = {
    loaded: false,
    loading: false,
    error: null,
    modelSize: 0,
  };

  private config: ClientAIConfig = {
    modelPath: '/models/gemma3-270m-q4km.gguf',
    contextSize: 4096,
    threads: navigator.hardwareConcurrency || 4,
    gpuLayers: 0, // WebGL not typically used for llama.cpp
  };

  private contextRules: ContextSwitchRules = {
    maxTokensClient: 2048, // Switch to server for longer queries
    maxComplexityClient: 0.7, // Complexity score 0-1
    serverThreshold: 1500, // Token count threshold
    fallbackToServer: true,
  };

  constructor() {
    this.initializeModel();
  }

  /**
   * Initialize WebAssembly LLaMA.cpp model
   */
  private async initializeModel(): Promise<void> {
    if (this.modelStatus.loading) return;

    this.modelStatus.loading = true;
    this.modelStatus.error = null;

    try {
      // Try dynamic imports for optional native/node/browser packages.
      // Use @ts-ignore because these are optional dev/runtime dependencies
      // and may not exist in all environments (SSR, CI, browsers).
      let mod: any = null;
      try {
        // @ts-ignore - optional dependency may not be installed
        mod = await import('@llama-node/llama-cpp');
      } catch (e1) {
        try {
          // @ts-ignore - try alternate wasm package commonly used in browser builds
          mod = await import('llama-cpp-wasm');
        } catch (e2) {
          mod = null;
        }
      }

      if (!mod || !(mod.LlamaCpp || mod.default)) {
        const msg =
          'llama cpp module not available in the environment; falling back to server-only mode';
        this.modelStatus.error = msg;
        console.warn('❌', msg);
        return;
      }

      // Handle both CommonJS and default-export shapes
      const LlamaCtor = mod?.LlamaCpp || mod?.default;
      // cast to any because the concrete constructor type depends on the runtime package
      this.llama = new (LlamaCtor as any)();

      // Guard that llama was constructed successfully before calling load
      if (!this.llama) {
        const msg = 'Failed to construct LlamaCpp instance';
        this.modelStatus.error = msg;
        console.warn('❌', msg);
        return;
      }

      // Load the quantized gemma3:270m model
      await this.llama.load({
        modelPath: this.config.modelPath,
        enableLogging: false,
        nCtx: this.config.contextSize,
        nParts: 1,
        seed: -1,
        f16Kv: false,
        logitsAll: false,
        vocabOnly: false,
        useMlock: false,
        embedding: false,
        useMmap: true,
        nGpuLayers: this.config.gpuLayers,
        nThreads: this.config.threads,
      });

      this.modelStatus.loaded = true;
      this.modelStatus.modelSize = 100 * 1024 * 1024; // ~100MB estimate
      console.log('✅ Client-side gemma3:270m loaded successfully');
    } catch (error) {
      this.modelStatus.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to load client-side model:', error);
    } finally {
      this.modelStatus.loading = false;
    }
  }

  /**
   * Analyze query complexity to determine routing
   */
  private analyzeComplexity(query: string): {
    tokenCount: number;
    complexity: number;
    useServer: boolean;
    reason: string;
  } {
    const tokenCount = this.estimateTokens(query);

    // Legal complexity indicators
    const complexIndicators = [
      /contract|agreement|clause|provision/i,
      /liability|damages|breach|obligation/i,
      /jurisdiction|precedent|statute|regulation/i,
      /analysis|interpretation|opinion|advice/i,
      /\bcite\b|\blaw\b|\blegal\b|\bcourt\b/i,
    ];

    const complexityScore = complexIndicators.reduce((score, pattern) => {
      return score + (pattern.test(query) ? 0.15 : 0);
    }, 0);

    // Add length-based complexity
    const lengthComplexity = Math.min(tokenCount / 1000, 0.3);
    const totalComplexity = Math.min(complexityScore + lengthComplexity, 1.0);

    // Decision logic
    let useServer = false;
    let reason = 'Simple query, using client-side model';

    if (tokenCount > this.contextRules.maxTokensClient) {
      useServer = true;
      reason = `Query too long (${tokenCount} tokens), using server`;
    } else if (totalComplexity > this.contextRules.maxComplexityClient) {
      useServer = true;
      reason = `Complex legal analysis (${(totalComplexity * 100).toFixed(0)}%), using server`;
    }

    return { tokenCount, complexity: totalComplexity, useServer, reason };
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate response with automatic context switching
   */
  async generateResponse(
    query: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<{
    response: string;
    source: 'client' | 'server';
    reasoning: string;
    metadata: any;
  }> {
    const analysis = this.analyzeComplexity(query);

    // Force server for complex queries or if client model isn't loaded
    if (analysis.useServer || !this.modelStatus.loaded) {
      return this.generateServerResponse(query, options, analysis);
    }

    // Use client-side model for simple queries
    return this.generateClientResponse(query, options, analysis);
  }

  /**
   * Generate response using client-side WebAssembly model
   */
  private async generateClientResponse(query: string, options: any, analysis: any): Promise<any> {
    if (!this.llama || !this.modelStatus.loaded) {
      // Fallback to server if client model unavailable
      return this.generateServerResponse(query, options, analysis);
    }

    try {
      const startTime = Date.now();

      const response = await this.llama.createCompletion({
        prompt: this.buildLegalPrompt(query),
        maxTokens: options.maxTokens || 512,
        temperature: options.temperature || 0.3,
        topP: 0.95,
        topK: 40,
        repeatPenalty: 1.1,
        stop: ['</response>', '\n\nHuman:', '\n\nAssistant:'],
      });

      const duration = Date.now() - startTime;

      return {
        response: response.text.trim(),
        source: 'client' as const,
        reasoning: `${analysis.reason} (${duration}ms)`,
        metadata: {
          tokenCount: analysis.tokenCount,
          complexity: analysis.complexity,
          duration,
          model: 'gemma3:270m',
          privacy: 'fully_private',
        },
      };
    } catch (error) {
      console.warn('Client-side generation failed, falling back to server:', error);
      return this.generateServerResponse(query, options, analysis);
    }
  }

  /**
   * Generate response using server TensorRT
   */
  private async generateServerResponse(query: string, options: any, analysis: any): Promise<any> {
    const startTime = Date.now();

    try {
      // Use your existing TensorRT bridge
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          model: 'gemma3-legal:latest',
          temperature: options.temperature || 0.1,
          maxTokens: options.maxTokens || 2048,
          stream: options.stream || false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      return {
        response: result.text || result.response || '',
        source: 'server' as const,
        reasoning: `${analysis.reason} (${duration}ms)`,
        metadata: {
          tokenCount: analysis.tokenCount,
          complexity: analysis.complexity,
          duration,
          model: 'gemma3-legal:latest',
          acceleration: 'tensorrt',
          privacy: 'server_processed',
        },
      };
    } catch (error) {
      throw new Error(`Server generation failed: ${error}`);
    }
  }

  /**
   * Build legal-optimized prompt
   */
  private buildLegalPrompt(query: string): string {
    return `<legal_context>
You are a legal AI assistant. Provide accurate, helpful responses while noting that this is not legal advice.

Query: ${query}

Response: `;
  }

  /**
   * Get model status for UI
   */
  getModelStatus(): ModelLoadStatus & { config: ClientAIConfig; rules: ContextSwitchRules } {
    return {
      ...this.modelStatus,
      config: this.config,
      rules: this.contextRules,
    };
  }

  /**
   * Update context switching rules
   */
  updateContextRules(newRules: Partial<ContextSwitchRules>): void {
    this.contextRules = { ...this.contextRules, ...newRules };
  }
}

// Export singleton instance
export const clientAI = new ClientSideAI();
