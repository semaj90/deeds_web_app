/**
 * Phase52: MCP JSON Validation Service
 *
 * MCP service for intelligent JSON parsing validation and error analysis
 * with GPU acceleration and Gemma3-legal integration.
 */

import express from 'express';
import { fastjson, checkBackends, type FastJSONResult } from '../json/fastjson';

interface ValidationRequest {
  action: 'validate-json-parsing' | 'analyze-errors' | 'optimize-parsing';
  data?: string[];
  results?: any[];
  timestamp: string;
  phase: string;
}

interface ValidationResponse {
  success: boolean;
  analysis?: {
    backendPerformance: Record<string, number>;
    errorPatterns: string[];
    recommendations: string[];
  };
  error?: string;
}

class MCPJSONValidationService {
  private app: express.Application;
  private port: number;

  constructor(port: number = 3003) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS for MCP integration
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/mcp/health', (req, res) => {
      res.json({ ok: true, service: 'json-validation', phase: 'Phase52' });
    });

    // Main validation endpoint
    this.app.post('/mcp/json-validation', async (req, res) => {
      try {
        const request: ValidationRequest = req.body;
        const response = await this.handleValidationRequest(request);
        res.json(response);
      } catch (error) {
        console.error('MCP JSON validation error:', error);
        res.status(500).json({
          success: false,
          error: `Validation failed: ${error.message}`
        });
      }
    });

    // Backend status
    this.app.get('/mcp/backends', async (req, res) => {
      try {
        const backends = await checkBackends();
        res.json({ backends });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Performance metrics
    this.app.get('/mcp/metrics', async (req, res) => {
      try {
        const backends = await checkBackends();
        const metrics = {
          backends,
          timestamp: new Date().toISOString(),
          phase: 'Phase52'
        };
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private async handleValidationRequest(request: ValidationRequest): Promise<ValidationResponse> {
    switch (request.action) {
      case 'validate-json-parsing':
        return await this.validateJSONParsing(request);
      case 'analyze-errors':
        return await this.analyzeErrors(request);
      case 'optimize-parsing':
        return await this.optimizeParsing(request);
      default:
        throw new Error(`Unknown action: ${request.action}`);
    }
  }

  private async validateJSONParsing(request: ValidationRequest): Promise<ValidationResponse> {
    if (!request.results) {
      throw new Error('No validation results provided');
    }

    const results = request.results;
    const backendPerformance: Record<string, number> = {};
    const errorPatterns: string[] = [];
    const recommendations: string[] = [];

    // Analyze performance by backend
    const backendStats = new Map<string, { times: number[]; errors: number }>();

    for (const result of results) {
      const stats = backendStats.get(result.backend) || { times: [], errors: 0 };
      stats.times.push(result.performance);
      if (!result.success) {
        stats.errors++;
        if (result.error) errorPatterns.push(result.error);
      }
      backendStats.set(result.backend, stats);
    }

    // Calculate averages and generate recommendations
    for (const [backend, stats] of backendStats) {
      const avgTime = stats.times.reduce((a, b) => a + b, 0) / stats.times.length;
      backendPerformance[backend] = avgTime;

      const errorRate = stats.errors / stats.times.length;

      if (errorRate > 0.1) {
        recommendations.push(`High error rate in ${backend} (${(errorRate * 100).toFixed(1)}%) - investigate parsing issues`);
      }

      if (avgTime > 10) {
        recommendations.push(`${backend} parsing is slow (${avgTime.toFixed(2)}ms avg) - consider optimization`);
      }
    }

    // Recommend best backend
    const bestBackend = Object.entries(backendPerformance)
      .sort(([, a], [, b]) => a - b)[0];

    if (bestBackend) {
      recommendations.push(`Recommended backend: ${bestBackend[0]} (${bestBackend[1].toFixed(2)}ms avg)`);
    }

    return {
      success: true,
      analysis: {
        backendPerformance,
        errorPatterns: [...new Set(errorPatterns)],
        recommendations
      }
    };
  }

  private async analyzeErrors(request: ValidationRequest): Promise<ValidationResponse> {
    // Use Gemma3-legal for error analysis
    const errorAnalysis = await this.analyzeWithLLM(request.results || []);

    return {
      success: true,
      analysis: {
        backendPerformance: {},
        errorPatterns: errorAnalysis.patterns,
        recommendations: errorAnalysis.recommendations
      }
    };
  }

  private async optimizeParsing(request: ValidationRequest): Promise<ValidationResponse> {
    // Generate optimization recommendations
    const optimizations = await this.generateOptimizations(request.data || []);

    return {
      success: true,
      analysis: {
        backendPerformance: {},
        errorPatterns: [],
        recommendations: optimizations
      }
    };
  }

  private async analyzeWithLLM(results: any[]): Promise<{ patterns: string[]; recommendations: string[] }> {
    // This would integrate with Gemma3-legal for intelligent error analysis
    // For now, return basic analysis
    const patterns: string[] = [];
    const recommendations: string[] = [];

    const errorResults = results.filter(r => !r.success);

    if (errorResults.length > 0) {
      patterns.push('Parsing errors detected');
      recommendations.push('Consider using GPU-accelerated parsing for complex JSON');
      recommendations.push('Implement retry logic with fallback backends');
    }

    return { patterns, recommendations };
  }

  private async generateOptimizations(jsonSamples: string[]): Promise<string[]> {
    const recommendations: string[] = [];

    // Analyze JSON structure for optimization opportunities
    for (const json of jsonSamples) {
      try {
        const parsed = JSON.parse(json);
        const size = JSON.stringify(parsed).length;

        if (size > 10000) {
          recommendations.push('Large JSON detected - consider streaming parsing for >10KB payloads');
        }

        // Check for nested structures that benefit from SIMD
        const depth = this.calculateDepth(parsed);
        if (depth > 5) {
          recommendations.push('Deeply nested JSON - SIMD parsing provides significant speedup');
        }
      } catch (error) {
        recommendations.push(`Invalid JSON sample: ${error.message}`);
      }
    }

    return recommendations;
  }

  private calculateDepth(obj: any): number {
    if (typeof obj !== 'object' || obj === null) return 0;

    let maxDepth = 0;
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        maxDepth = Math.max(maxDepth, this.calculateDepth(value));
      }
    }

    return maxDepth + 1;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`Phase52 MCP JSON Validation Service running on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Graceful shutdown logic would go here
  }
}

// Export for use in other modules
export { MCPJSONValidationService, type ValidationRequest, type ValidationResponse };

// Start service if run directly
if (require.main === module) {
  const service = new MCPJSONValidationService();
  service.start().catch(console.error);
}