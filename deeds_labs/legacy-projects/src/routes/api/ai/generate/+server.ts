/**
 * Server-side TensorRT bridge with GPU heap monitoring
 * Integrates with existing TensorRT setup (Port 8086)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface TensorRTRequest {
  query: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface GPUMemoryStatus {
  total: number;
  used: number;
  free: number;
  utilization: number;
  temperature: number;
}

interface TensorRTResponse {
  text: string;
  model: string;
  duration: number;
  tokens: number;
  source: 'tensorrt-llm' | 'ollama-fallback';
  gpu_status: GPUMemoryStatus;
}

class TensorRTBridge {
  private bridgeUrl = 'http://localhost:8086';
  private tensorrtUrl = 'http://localhost:8084';
  private ollamaUrl = 'http://localhost:11434';

  // GPU monitoring thresholds
  private gpuThresholds = {
    maxMemoryUsage: 0.85, // 85% GPU memory usage
    maxTemperature: 80, // 80°C
    criticalMemory: 0.95, // 95% critical threshold
    cooldownPeriod: 30000, // 30 seconds
  };

  private lastGpuCheck = 0;
  private gpuStatus: GPUMemoryStatus | null = null;

  /**
   * Main generation endpoint with intelligent routing
   */
  async generate(request: TensorRTRequest): Promise<TensorRTResponse> {
    const startTime = Date.now();

    // Check GPU status and determine routing
    const routing = await this.determineRouting(request);

    let response: TensorRTResponse;

    if (routing.useTensorRT) {
      response = await this.generateWithTensorRT(request, routing);
    } else {
      response = await this.generateWithOllama(request, routing);
    }

    response.duration = Date.now() - startTime;
    return response;
  }

  /**
   * Determine routing based on GPU status and query complexity
   */
  private async determineRouting(request: TensorRTRequest): Promise<{
    useTensorRT: boolean;
    reason: string;
    gpuStatus: GPUMemoryStatus;
  }> {
    // Get current GPU status
    const gpuStatus = await this.getGPUStatus();

    // Check GPU memory and temperature
    const gpuOk =
      gpuStatus.utilization < this.gpuThresholds.maxMemoryUsage &&
      gpuStatus.temperature < this.gpuThresholds.maxTemperature;

    // Analyze query complexity
    const isComplexQuery = this.isComplexLegalQuery(request.query);
    const tokenCount = this.estimateTokens(request.query);

    let useTensorRT = true;
    let reason = 'Using TensorRT for optimal performance';

    // Decision logic
    if (!gpuOk) {
      useTensorRT = false;
      reason = `GPU overloaded (${(gpuStatus.utilization * 100).toFixed(1)}% mem, ${gpuStatus.temperature}°C)`;
    } else if (!isComplexQuery && tokenCount < 500) {
      // Simple queries might be fine with Ollama
      useTensorRT = Math.random() > 0.3; // 70% TensorRT, 30% Ollama for load balancing
      reason = useTensorRT ? 'TensorRT (load balanced)' : 'Ollama (load balanced)';
    } else if (isComplexQuery || tokenCount > 1500) {
      // Complex queries definitely need TensorRT
      useTensorRT = true;
      reason = 'Complex legal query, using TensorRT-LLM';
    }

    return { useTensorRT, reason, gpuStatus };
  }

  /**
   * Generate using TensorRT-LLM via bridge
   */
  private async generateWithTensorRT(
    request: TensorRTRequest,
    routing: any
  ): Promise<TensorRTResponse> {
    try {
      // Use your existing TensorRT bridge
      const response = await fetch(`${this.bridgeUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dummy', // If needed
        },
        body: JSON.stringify({
          model: request.model || 'gemma3-legal:latest',
          messages: [
            {
              role: 'system',
              content:
                'You are a legal AI assistant. Provide accurate, helpful responses while noting that this is not legal advice.',
            },
            {
              role: 'user',
              content: request.query,
            },
          ],
          temperature: request.temperature || 0.1,
          max_tokens: request.maxTokens || 2048,
          stream: request.stream || false,
        }),
      });

      if (!response.ok) {
        throw new Error(`TensorRT bridge error: ${response.status}`);
      }

      const result = await response.json();

      return {
        text: result.choices?.[0]?.message?.content || result.response || '',
        model: request.model || 'gemma3-legal:latest',
        duration: 0, // Will be set by caller
        tokens: this.estimateTokens(result.choices?.[0]?.message?.content || ''),
        source: 'tensorrt-llm',
        gpu_status: routing.gpuStatus,
      };
    } catch (error) {
      console.warn('TensorRT generation failed, falling back to Ollama:', error);
      return this.generateWithOllama(request, routing);
    }
  }

  /**
   * Generate using Ollama fallback
   */
  private async generateWithOllama(
    request: TensorRTRequest,
    routing: any
  ): Promise<TensorRTResponse> {
    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model?.includes('legal') ? 'gemma3-legal:latest' : 'embeddinggemma:latest',
        prompt: request.query,
        temperature: request.temperature || 0.3,
        max_tokens: request.maxTokens || 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const result = await response.json();

    return {
      text: result.response || '',
      model: request.model || 'ollama-fallback',
      duration: 0,
      tokens: this.estimateTokens(result.response || ''),
      source: 'ollama-fallback',
      gpu_status: routing.gpuStatus,
    };
  }

  /**
   * Get GPU status via nvidia-ml-py or nvidia-smi
   */
  private async getGPUStatus(): Promise<GPUMemoryStatus> {
    // Cache GPU status for 5 seconds to avoid excessive polling
    const now = Date.now();
    if (this.gpuStatus && now - this.lastGpuCheck < 5000) {
      return this.gpuStatus;
    }

    try {
      // Try to get GPU status from your existing monitoring
      const response = await fetch(`${this.bridgeUrl}/health`, {
        timeout: 1000,
      });

      if (response.ok) {
        const health = await response.json();

        this.gpuStatus = {
          total: health.gpu?.memory_total || 12288, // RTX 3060 Ti default
          used: health.gpu?.memory_used || 0,
          free: health.gpu?.memory_free || 12288,
          utilization: health.gpu?.utilization || 0,
          temperature: health.gpu?.temperature || 45,
        };
      } else {
        // Fallback to estimated values
        this.gpuStatus = this.getEstimatedGPUStatus();
      }
    } catch (error) {
      console.warn('GPU monitoring unavailable, using estimates:', error);
      this.gpuStatus = this.getEstimatedGPUStatus();
    }

    this.lastGpuCheck = now;
    return this.gpuStatus;
  }

  /**
   * Estimated GPU status when monitoring is unavailable
   */
  private getEstimatedGPUStatus(): GPUMemoryStatus {
    return {
      total: 12288, // 12GB RTX 3060 Ti
      used: 6144, // Assume 50% usage
      free: 6144,
      utilization: 0.5,
      temperature: 65, // Reasonable estimate
    };
  }

  /**
   * Analyze if query is complex legal work
   */
  private isComplexLegalQuery(query: string): boolean {
    const complexPatterns = [
      /contract.*analy[sz]e/i,
      /legal.*opinion/i,
      /interpret.*clause/i,
      /liability.*assessment/i,
      /precedent.*research/i,
      /compliance.*review/i,
      /risk.*evaluation/i,
      /\b(draft|review|analyze|interpret)\b.*\b(agreement|contract|clause|provision)\b/i,
    ];

    return (
      complexPatterns.some((pattern) => pattern.test(query)) ||
      query.length > 500 ||
      (query.match(/\b(legal|law|court|statute|regulation)\b/gi) || []).length > 2
    );
  }

  /**
   * Estimate token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// Initialize bridge
const tensorrtBridge = new TensorRTBridge();

/**
 * POST /api/ai/generate
 * Main AI generation endpoint with hybrid routing
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as TensorRTRequest;

    // Validate request
    if (!body.query || typeof body.query !== 'string') {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    // Generate response with intelligent routing
    const result = await tensorrtBridge.generate(body);

    return json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('AI generation error:', error);

    return json(
      {
        error: 'AI generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};

/**
 * GET /api/ai/generate
 * Status endpoint for monitoring
 */
export const GET: RequestHandler = async () => {
  try {
    const bridge = new TensorRTBridge();
    const gpuStatus = await bridge['getGPUStatus']();

    return json({
      status: 'operational',
      gpu: gpuStatus,
      endpoints: {
        tensorrt_bridge: 'http://localhost:8086',
        tensorrt_llm: 'http://localhost:8084',
        ollama: 'http://localhost:11434',
      },
      features: {
        client_side_ai: true,
        context_switching: true,
        gpu_monitoring: true,
        intelligent_routing: true,
      },
    });
  } catch (error) {
    return json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
