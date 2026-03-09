import type { Tool } from '../types.js';

/**
 * SIMD JSON Parse Tool - High-performance JSON parsing using SIMD accelerator
 *
 * Uses SIMD_JSON_ACCEL_URL environment variable for service discovery
 * Falls back to http://127.0.0.1:8103 if not set
 */
export const simdJsonParse: Tool = {
  name: 'simd_json_parse',
  description: 'Parse and normalize JSON using SIMD-accelerated parser (simdjson-go + sonic). ' +
               'Provides 25x faster parsing for large JSON payloads. ' +
               'Returns tokens and metadata for Phase 72 topology brain.',
  parameters: {
    type: 'object',
    properties: {
      payload: {
        type: 'string',
        description: 'Raw JSON string to parse/validate'
      },
      method: {
        type: 'string',
        enum: ['simdjson', 'sonic', 'tokens'],
        description: 'Parsing method (default: simdjson)',
        default: 'simdjson'
      }
    },
    required: ['payload']
  },

  async execute({ payload, method = 'simdjson' }) {
    const baseUrl = process.env.SIMD_JSON_ACCEL_URL ?? 'http://127.0.0.1:8103';
    const url = `${baseUrl}/parse`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Context7-MCP/1.0'
        },
        body: JSON.stringify({
          json: payload,
          method: method
        })
      });

      if (!response.ok) {
        throw new Error(
          `SIMD parse failed: ${response.status} ${response.statusText}`
        );
      }

      const result = await response.json();

      return {
        success: true,
        tokens: result.tokens || [],
        metadata: result.metadata || {},
        method: method,
        service_url: baseUrl
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        service_url: baseUrl,
        fallback: 'SIMD service unavailable - using standard JSON.parse',
        parsed: JSON.parse(payload) // Fallback to standard parsing
      };
    }
  }
};

/**
 * SIMD JSON Health Check Tool
 */
export const simdHealthCheck: Tool = {
  name: 'simd_health_check',
  description: 'Check SIMD JSON accelerator service health and availability',
  parameters: {
    type: 'object',
    properties: {}
  },

  async execute() {
    const baseUrl = process.env.SIMD_JSON_ACCEL_URL ?? 'http://127.0.0.1:8103';
    const url = `${baseUrl}/health`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Context7-MCP/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const health = await response.json();

      return {
        status: 'healthy',
        service_url: baseUrl,
        ...health
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        service_url: baseUrl
      };
    }
  }
};
