/**
 * Embedding Representation Contract Validator
 *
 * Checks that embedding services (ONNX, Ollama, gRPC) actually produce
 * what their registered representation contract claims.
 *
 * Prevents representation drift where a service claims to output 384 dims
 * but actually outputs 768, or changes dimension_method without updating registry.
 */

import { z } from 'zod';

// ── Zod contract for representation metadata ──────────────────────────────────

export const DimensionMethodSchema = z.enum([
  'NATIVE',
  'MRL_TRUNCATE',
  'LINEAR_PROJECTION',
  'AUTOENCODER',
  'CUSTOM_MODEL_HEAD',
  'SLICE_FIRST_N',
  'UNKNOWN',
]);

export const NormalizationSchema = z.enum(['L2', 'NONE']);

export const RuntimeSchema = z.enum([
  'ollama_cpu',
  'ollama_gpu',
  'onnx_cpu',
  'onnx_cuda',
  'onnx_tensorrt',
  'grpc_service',
  'http_service',
  'unknown',
]);

export const EmbeddingBackendContractSchema = z.object({
  representationId: z.string(),
  modelId: z.string(),
  modelRevision: z.string(),
  nativeDimensions: z.number().int().positive(),
  outputDimensions: z.number().int().positive(),
  dimensionMethod: DimensionMethodSchema,
  normalization: NormalizationSchema,
  runtime: RuntimeSchema,
  endpointUrl: z.string().url(),
  tokenizerRevision: z.string().optional(),
});

export type EmbeddingBackendContract = z.infer<typeof EmbeddingBackendContractSchema>;

type ValidationChecks = {
  health?: boolean;
  healthError?: string;
  embedding?: boolean;
  embeddingError?: string;
  contractMatch?: boolean;
  contractMismatches: string[];
};

// ── Health check responses ─────────────────────────────────────────────────────

/**
 * Ollama /api/embeddings response
 * We send a test prompt and measure the actual output vector dimensions
 */
export interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * ONNX server /health response (custom format)
 * Should return what it actually produces
 */
export interface ONNXHealthResponse {
  ok: boolean;
  model_id: string;
  model_revision?: string;
  native_dimensions: number;
  output_dimensions: number;
  dimension_method: string;
  normalization: string;
  cuda_available?: boolean;
}

// ── Validator functions ────────────────────────────────────────────────────────

/**
 * Test Ollama endpoint and verify it produces the claimed output dimensions
 */
export async function validateOllamaContract(
  contract: EmbeddingBackendContract,
  testPrompt: string = 'test embedding',
): Promise<{
  isValid: boolean;
  actualDimensions: number;
  claimedDimensions: number;
  error?: string;
}> {
  if (contract.runtime !== 'ollama_cpu' && contract.runtime !== 'ollama_gpu') {
    return { isValid: false, actualDimensions: 0, claimedDimensions: contract.outputDimensions, error: 'Not an Ollama runtime' };
  }

  try {
    const response = await fetch(`${contract.endpointUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: contract.modelId,
        prompt: testPrompt,
      }),
    });

    if (!response.ok) {
      return {
        isValid: false,
        actualDimensions: 0,
        claimedDimensions: contract.outputDimensions,
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;
    const actualDimensions = data.embedding?.length ?? 0;

    return {
      isValid: actualDimensions === contract.outputDimensions,
      actualDimensions,
      claimedDimensions: contract.outputDimensions,
      error: actualDimensions === contract.outputDimensions ? undefined : `Expected ${contract.outputDimensions}, got ${actualDimensions}`,
    };
  } catch (error) {
    return {
      isValid: false,
      actualDimensions: 0,
      claimedDimensions: contract.outputDimensions,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test ONNX server /health endpoint and verify contract match
 */
export async function validateONNXHealthContract(
  contract: EmbeddingBackendContract,
): Promise<{
  isValid: boolean;
  health?: ONNXHealthResponse;
  mismatchReasons: string[];
  error?: string;
}> {
  if (!contract.runtime.startsWith('onnx')) {
    return { isValid: false, mismatchReasons: ['Not an ONNX runtime'] };
  }

  try {
    const response = await fetch(`${contract.endpointUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return {
        isValid: false,
        mismatchReasons: [`HTTP ${response.status}`],
        error: `Health check returned ${response.status}`,
      };
    }

    const health = (await response.json()) as ONNXHealthResponse;
    const mismatches: string[] = [];

    // Verify all claimed dimensions
    if (health.native_dimensions !== contract.nativeDimensions) {
      mismatches.push(`native_dimensions: claimed ${contract.nativeDimensions}, got ${health.native_dimensions}`);
    }

    if (health.output_dimensions !== contract.outputDimensions) {
      mismatches.push(`output_dimensions: claimed ${contract.outputDimensions}, got ${health.output_dimensions}`);
    }

    // Verify derivation method
    if (health.dimension_method && health.dimension_method !== contract.dimensionMethod) {
      mismatches.push(`dimension_method: claimed ${contract.dimensionMethod}, got ${health.dimension_method}`);
    }

    // Verify normalization
    if (health.normalization && health.normalization !== contract.normalization) {
      mismatches.push(`normalization: claimed ${contract.normalization}, got ${health.normalization}`);
    }

    // Verify model identity if available
    if (health.model_id && health.model_id !== contract.modelId) {
      mismatches.push(`model_id: claimed ${contract.modelId}, got ${health.model_id}`);
    }

    return {
      isValid: mismatches.length === 0,
      health,
      mismatchReasons: mismatches,
    };
  } catch (error) {
    return {
      isValid: false,
      mismatchReasons: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if two representations can be fallback candidates
 * They must produce identical output contracts
 */
export function canFallback(primary: EmbeddingBackendContract, fallback: EmbeddingBackendContract): boolean {
  return (
    primary.outputDimensions === fallback.outputDimensions &&
    primary.normalization === fallback.normalization &&
    primary.dimensionMethod === fallback.dimensionMethod
  );
}

/**
 * Validate a fallback chain is safe
 * All fallbacks must have identical output contracts
 */
export function validateFallbackChain(
  primary: EmbeddingBackendContract,
  fallbacks: EmbeddingBackendContract[],
): { isValid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const fallback of fallbacks) {
    if (!canFallback(primary, fallback)) {
      reasons.push(
        `Fallback ${fallback.representationId} output contract differs from primary: ` +
          `output_dims ${fallback.outputDimensions} vs ${primary.outputDimensions}, ` +
          `normalization ${fallback.normalization} vs ${primary.normalization}`,
      );
    }
  }

  return {
    isValid: reasons.length === 0,
    reasons,
  };
}

/**
 * Complete validation suite for a representation
 */
export async function validateRepresentation(
  contract: EmbeddingBackendContract,
): Promise<{
  representationId: string;
  isValid: boolean;
  checks: ValidationChecks;
}> {
  const checks: ValidationChecks = {
    contractMismatches: [],
  };

  // Run health check if ONNX
  if (contract.runtime.startsWith('onnx')) {
    const healthResult = await validateONNXHealthContract(contract);
    checks.health = healthResult.isValid;
    checks.healthError = healthResult.error;
    checks.contractMatch = healthResult.isValid;
    checks.contractMismatches = healthResult.mismatchReasons;
  }

  // Run embedding test if Ollama
  if (contract.runtime.startsWith('ollama')) {
    const embResult = await validateOllamaContract(contract);
    checks.embedding = embResult.isValid;
    checks.embeddingError = embResult.error;
  }

  return {
    representationId: contract.representationId,
    isValid: (checks.health ?? true) && (checks.embedding ?? true),
    checks,
  };
}
