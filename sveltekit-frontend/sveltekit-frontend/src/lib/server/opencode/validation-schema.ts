/**
 * OpenCode Dispatch Request Validation Schema
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
  };
  description: string;
}

export interface DispatcherSchema {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  parameters: DispatcherParameter[];
}

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
      description: 'User intent/query to dispatch',
    },
    {
      name: 'action',
      type: 'string',
      required: false,
      defaultValue: 'auto',
      constraints: {
        enum: ['search_rg', 'query_qdrant', 'search_codebase', 'auto', 'plan'],
      },
      description: 'Action to execute (defaults to "auto")',
    },
    {
      name: 'tool_name',
      type: 'string',
      required: false,
      constraints: {
        pattern: /^[\w:]+$/,
      },
      description: 'Optional MCP tool name override',
    },
    {
      name: 'context',
      type: 'object',
      required: false,
      description: 'Optional context object',
    },
    {
      name: 'capture_telemetry',
      type: 'boolean',
      required: false,
      defaultValue: true,
      description: 'Whether to capture telemetry',
    },
    {
      name: 'redis_key_prefix',
      type: 'string',
      required: false,
      defaultValue: 'telemetry:opencode',
      description: 'Redis key prefix for telemetry',
    },
  ],
};

export function validateParameter(
  param: DispatcherParameter,
  value: unknown
): { valid: boolean; error?: string } {
  if (typeof value !== param.type) {
    return {
      valid: false,
      error: `Parameter "${param.name}" must be of type ${param.type}`,
    };
  }

  if (param.required && (value === null || value === undefined || value === '')) {
    return {
      valid: false,
      error: `Parameter "${param.name}" is required`,
    };
  }

  if (param.constraints && typeof value === 'string') {
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
        error: `Parameter "${param.name}" does not match required pattern`,
      };
    }

    if (param.constraints.enum && !param.constraints.enum.includes(value)) {
      return {
        valid: false,
        error: `Parameter "${param.name}" must be one of: ${param.constraints.enum.join(', ')}`,
      };
    }
  }

  return { valid: true };
}

export function validateRequest(
  schema: DispatcherSchema,
  payload: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const param of schema.parameters) {
    if (param.required && !(param.name in payload)) {
      errors.push(`Missing required parameter: ${param.name}`);
    }

    if (param.name in payload) {
      const validation = validateParameter(param, payload[param.name]);
      if (!validation.valid) {
        errors.push(validation.error || `Invalid parameter: ${param.name}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createValidationMiddleware() {
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
