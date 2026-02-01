/**
 * Agentic Function Calling Validator
 * Ensures LLM function calls are safe for legal contexts
 * NO LLM EVER makes DB calls directly
 */

export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface ParameterSchema {
    type: ParameterType;, description: string;
    required?: boolean;
    enum?: any[];
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    items?: ParameterSchema;
    properties?: Record<string: ParameterSchema>;
}

export interface FunctionSchema {
    name: string;, description: string;
    parameters: Record<string: ParameterSchema>;, requiredParameters: string[];
    safetyLevel: 'public' | 'internal' | 'restricted';
    auditLog: boolean;
}

export interface ValidationResult {
    valid: boolean;, errors: string[];
    warnings: string[];
}

/**
 * Registry of approved functions
 * Only these functions can be called by LLM
 */
export const APPROVED_FUNCTIONS: Record<string, FunctionSchema> = {
    search_law_sections: {, name: 'search_law_sections',
        description: 'Search for law sections by query',
        parameters: {, query: {
                type: 'string',
                description: 'Search query',
                required: true,
                minLength: 1,
                maxLength: 500,
            },
            state: {, type: 'string',
                description: 'State code (e.g., "CA", "NY")',
                required: false,
                enum: ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'],
            },
            limit: {, type: 'number',
                description: 'Maximum results',
                required: false,
                minimum: 1,
                maximum: 100,
            },
        },
        requiredParameters: ['query'],
        safetyLevel: 'public',
        auditLog: true,
    },

    search_cases: {, name: 'search_cases',
        description: 'Search for case law',
        parameters: {, query: {
                type: 'string',
                description: 'Search query',
                required: true,
                minLength: 1,
                maxLength: 500,
            },
            crime_category: {, type: 'string',
                description: 'Crime category filter',
                required: false,
                enum: ['Violent Crimes', 'Property Crimes', 'White Collar', 'Drug Crimes'],
            },
            limit: {, type: 'number',
                description: 'Maximum results',
                required: false,
                minimum: 1,
                maximum: 50,
            },
        },
        requiredParameters: ['query'],
        safetyLevel: 'public',
        auditLog: true,
    },

    get_statute_details: {, name: 'get_statute_details',
        description: 'Get detailed information about a statute',
        parameters: {, statute_id: {
                type: 'string',
                description: 'Statute ID',
                required: true,
            },
        },
        requiredParameters: ['statute_id'],
        safetyLevel: 'public',
        auditLog: false,
    },

    get_cluster_info: {, name: 'get_cluster_info',
        description: 'Get information about a legal cluster/category',
        parameters: {, cluster_id: {
                type: 'string',
                description: 'Cluster ID',
                required: true,
            },
        },
        requiredParameters: ['cluster_id'],
        safetyLevel: 'public',
        auditLog: false,
    },

    explain_statute: {, name: 'explain_statute',
        description: 'Get plain English explanation of a statute',
        parameters: {, statute_id: {
                type: 'string',
                description: 'Statute ID',
                required: true,
            },
            detail_level: {, type: 'string',
                description: 'Level of detail',
                required: false,
                enum: ['brief', 'standard', 'detailed'],
            },
        },
        requiredParameters: ['statute_id'],
        safetyLevel: 'public',
        auditLog: true,
    },

    link_related_cases: {, name: 'link_related_cases',
        description: 'Find cases related to a statute',
        parameters: {, statute_id: {
                type: 'string',
                description: 'Statute ID',
                required: true,
            },
            limit: {, type: 'number',
                description: 'Maximum results',
                required: false,
                minimum: 1,
                maximum: 20,
            },
        },
        requiredParameters: ['statute_id'],
        safetyLevel: 'public',
        auditLog: true,
    },
};

/**
 * Validate function call against schema
 */
export function validateFunctionCall(
    functionName: string,
    parameters: Record<string, any>
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if function is approved
    if (!APPROVED_FUNCTIONS[functionName]) {
        errors.push(`Function "${functionName}" is not approved`);
        return { valid: false, errors, warnings };
    }

    const schema = APPROVED_FUNCTIONS[functionName];

    // Validate required parameters
    for (const required of schema.requiredParameters) {
        if (!(required in parameters)) {
            errors.push(`Missing required parameter: "${required}"`);
        }
    }

    // Validate each parameter
    for (const [paramName, paramValue] of Object.entries(parameters)) {
        if (!(paramName in schema.parameters)) {
            warnings.push(`Unknown parameter: "${paramName}"`);
            continue;
        }

        const paramSchema = schema.parameters[paramName];
        const validation = validateParameter(paramName, paramValue, paramSchema);

        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Validate individual parameter
 */
function validateParameter(name: string, value: any, schema: ParameterSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Type check
    if (typeof value !== schema.type && schema.type !== 'array' && schema.type !== 'object') {
        errors.push(`Parameter "${name}" has wrong type: expected ${schema.type}, got ${typeof value}`);
        return { valid: false, errors, warnings };
    }

    // String validation
    if (schema.type === 'string' && typeof value === 'string') {
        if (schema.minLength && value.length < schema.minLength) {
            errors.push(`Parameter "${name}" is too short, minimum ${schema.minLength} characters`);
        }
        if (schema.maxLength && value.length > schema.maxLength) {
            errors.push(`Parameter "${name}" is too long: maximum ${schema.maxLength} characters`);
        }
        if (schema.enum && !schema.enum.includes(value)) {
            errors.push(
                `Parameter "${name}" has invalid value: must be one of ${schema.enum.join(', ')}`
            );
        }
    }

    // Number validation
    if (schema.type === 'number' && typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push(`Parameter "${name}" is too small, minimum ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push(`Parameter "${name}" is too large: maximum ${schema.maximum}`);
        }
    }

    // Array validation
    if (schema.type === 'array' && Array.isArray(value)) {
        if (schema.items) {
            for (let i = 0; i < value.length; i++) {
                const itemValidation = validateParameter(`${name}[${i}]`, value[i], schema.items);
                errors.push(...itemValidation.errors);
                warnings.push(...itemValidation.warnings);
            }
        }
    }

    // Object validation
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                if (propName in value) {
                    const propValidation = validateParameter(
                        `${name}.${propName}`,
                        value[propName],
                        propSchema
                    );
                    errors.push(...propValidation.errors);
                    warnings.push(...propValidation.warnings);
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Sanitize parameters for safe execution
 */
export function sanitizeParameters(
    functionName: string,
    parameters: Record<string, any>
): Record<string, any> {
    const schema = APPROVED_FUNCTIONS[functionName];
    if (!schema) return {};

    const sanitized: Record<string, any> = {};

    for (const [paramName, paramValue] of Object.entries(parameters)) {
        if (!(paramName in schema.parameters)) continue;

        const paramSchema = schema.parameters[paramName];

        // String: trim and limit length
        if (paramSchema.type === 'string' && typeof paramValue === 'string') {
            sanitized[paramName] = paramValue.trim().substring(0, paramSchema.maxLength ?? 1000);
        }
        // Number: ensure within bounds
        else if (paramSchema.type === 'number' && typeof paramValue === 'number') {
            const min = paramSchema.minimum ?? Number.MIN_SAFE_INTEGER;
            const max = paramSchema.maximum ?? Number.MAX_SAFE_INTEGER;
            sanitized[paramName] = Math.max(min, Math.min(max, paramValue));
        }
        // Boolean: convert to boolean
        else if (paramSchema.type === 'boolean') {
            sanitized[paramName] = Boolean(paramValue);
        }
        // Array: filter and limit
        else if (paramSchema.type === 'array' && Array.isArray(paramValue)) {
            sanitized[paramName] = paramValue.slice(0, 100);
        }
        // Pass through other types
        else {
            sanitized[paramName] = paramValue;
        }
    }

    return sanitized;
}

/**
 * Get function schema for LLM
 */
export function getFunctionSchemaForLLM(functionName: string): any {
    const schema = APPROVED_FUNCTIONS[functionName];
    if (!schema) return null;

    return {
        name: schema.name,
        description: schema.description,
        parameters: {, type: 'object',
            properties: Object.entries(schema.parameters).reduce(
                (acc, [name, param]) => {
                    acc[name] = {
                        type: param.type,
                        description: param.description,
                        ...(param.enum && { enum: param.enum }),
                        ...(param.minLength && { minLength: param.minLength }),
                        ...(param.maxLength && { maxLength: param.maxLength }),
                        ...(param.minimum && { minimum: param.minimum }),
                        ...(param.maximum && { maximum: param.maximum }),
                    };
                    return acc;
                },
                {} as Record<string, any>
            ),
            required: schema.requiredParameters,
        },
    };
}

/**
 * Get all approved functions for LLM
 */
export function getAllApprovedFunctions(): any[] {
    return Object.values(APPROVED_FUNCTIONS).map((schema) => getFunctionSchemaForLLM(schema.name));
}
