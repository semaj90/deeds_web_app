/**
 * OpenCode Dispatcher Validation Schema
 *
 * Parameter validation for Phase 1 OpenCode dispatcher endpoint.
 * Provides type checking, constraint enforcement, and middleware factory.
 */

/**
 * Parameter Definition & Validation Schema
 */

export interface DispatcherParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: unknown;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    enum?: unknown[];
    min?: number;
    max?: number;
  };
  description: string;
}

export interface DispatcherSchema {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  parameters: DispatcherParameter[];
}

/**
 * OpenCode Dispatcher Endpoint Schema (Phase 1)
 */
export const OPENCODE_DISPATCH_SCHEMA: DispatcherSchema = {
  endpoint: '/api/opencode-dispatch',
  method: 'POST',
  parameters: [
    {
      name: 'intent',
      type: 'string',
      required: true,
      constraints: {
        minLength: 3,
        maxLength: 500,
        pattern: /^[\w\s\-.:,()]+$/,
      },
      description: 'User intent/query to dispatch (e.g., "Find where auth.sessions is implemented")',
    },
    {
      name: 'action',
      type: 'string',
      required: false,
      defaultValue: 'auto',
      constraints: {
        enum: ['search_rg', 'query_qdrant', 'search_codebase', 'auto', 'plan'],
      },
      description: 'Action to execute (defaults to "auto" for planner routing)',
    },
    {
      name: 'tool_name',
      type: 'string',
      required: false,
      constraints: {
        pattern: /^[\w:]+$/,
      },
      description: 'Optional MCP tool name override (e.g., "trace:kag-search")',
    },
    {
      name: 'context',
      type: 'object',
      required: false,
      description: 'Optional context object (file_path, case_id, user_id, etc.)',
    },
    {
      name: 'capture_telemetry',
      type: 'boolean',
      required: false,
      defaultValue: true,
      description: 'Whether to capture telemetry (defaults to true)',
    },
    {
      name: 'redis_key_prefix',
      type: 'string',
      required: false,
      defaultValue: 'telemetry:opencode',
      description: 'Redis key prefix for telemetry storage',
    },
  ],
};

/**
 * Validation Helper Functions
 */

export function validateParameter(
  param: DispatcherParameter,
  value: unknown
): { valid: boolean; error?: string } {
  // Check type
  if (typeof value !== param.type) {
    return {
      valid: false,
      error: `Parameter "${param.name}" must be of type ${param.type}, got ${typeof value}`,
    };
  }

  // Check required
  if (param.required && (value === null || value === undefined || value === '')) {
    return {
      valid: false,
      error: `Parameter "${param.name}" is required`,
    };
  }

  // Check constraints
  if (param.constraints) {
    // String constraints
    if (typeof value === 'string') {
      if (param.constraints.minLength && value.length < param.constraints.minLength) {
        return {
          valid: false,
          error: `Parameter "${param.name}" must be at least ${param.constraints.minLength} characters`,
        };
      }

      if (param.constraints.maxLength && value.length > param.constraints.maxLength) {
        return {
          valid: false,
          error: `Parameter "${param.name}" must be at most ${param.constraints.maxLength} characters`,
        };
      }

      if (param.constraints.pattern && !param.constraints.pattern.test(value)) {
        return {
          valid: false,
          error: `Parameter "${param.name}" does not match required pattern: ${param.constraints.pattern}`,
        };
      }

      if (param.constraints.enum && !param.constraints.enum.includes(value)) {
        return {
          valid: false,
          error: `Parameter "${param.name}" must be one of: ${param.constraints.enum.join(', ')}`,
        };
      }
    }

    // Number constraints
    if (typeof value === 'number') {
      if (param.constraints.min !== undefined && value < param.constraints.min) {
        return {
          valid: false,
          error: `Parameter "${param.name}" must be at least ${param.constraints.min}`,
        };
      }

      if (param.constraints.max !== undefined && value > param.constraints.max) {
        return {
          valid: false,
          error: `Parameter "${param.name}" must be at most ${param.constraints.max}`,
        };
      }
    }
  }

  return { valid: true };
}

export function validateRequest(
  schema: DispatcherSchema,
  payload: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check all required parameters are present
  for (const param of schema.parameters) {
    if (param.required && !(param.name in payload)) {
      errors.push(`Missing required parameter: ${param.name}`);
    }

    // Validate parameter if present
    if (param.name in payload) {
      const validation = validateParameter(param, payload[param.name]);
      if (!validation.valid) {
        errors.push(validation.error || `Invalid parameter: ${param.name}`);
      }
    }
  }

  // Check for unknown parameters
  for (const key of Object.keys(payload)) {
    if (!schema.parameters.some((p) => p.name === key)) {
      errors.push(`Unknown parameter: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validation Middleware Factory
 */

export interface ValidationMiddleware {
  validateRequest: (payload: Record<string, unknown>) => { valid: boolean; errors: string[] };
  applyDefaults: (payload: Record<string, unknown>) => Record<string, unknown>;
  getSchema: () => DispatcherSchema;
}

export function createValidationMiddleware(): ValidationMiddleware {
  return {
    validateRequest: (payload: Record<string, unknown>) =>
      validateRequest(OPENCODE_DISPATCH_SCHEMA, payload),

    applyDefaults: (payload: Record<string, unknown>) => {
      const result = { ...payload };

      for (const param of OPENCODE_DISPATCH_SCHEMA.parameters) {
        if (!(param.name in result) && param.defaultValue !== undefined) {
          result[param.name] = param.defaultValue;
        }
      }

      return result;
    },

    getSchema: () => OPENCODE_DISPATCH_SCHEMA,
  };
}
