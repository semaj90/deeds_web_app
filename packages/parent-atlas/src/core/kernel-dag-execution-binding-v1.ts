import { createHash } from 'node:crypto';
import { z } from 'zod';
import { adaptiveDagActionSchema, type AdaptiveDagActionV1 } from './adaptive-dag-plan-v1.js';
import { kernelOperatorKindSchema, type KernelOperatorKind } from './kernel-operator-library-v1.js';
import { parameterArtifactV1Schema, type ParameterArtifactV1 } from './parameter-artifact-v1.js';

const id = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Runtime-only lowering of an OaK action into an executable operator binding.
 * The adaptive DAG contract intentionally remains unchanged: this object is
 * the checked bridge that restores the planner's bound arguments at runtime.
 */
export const kernelDagExecutionBindingV1Schema = z.object({
  schema: z.literal('atlas.kernel-dag-execution-binding.v1').default('atlas.kernel-dag-execution-binding.v1'),
  action: adaptiveDagActionSchema,
  functionId: id,
  stepId: id,
  operatorId: id,
  operatorKind: kernelOperatorKindSchema,
  implementationRef: id,
  parameterArtifactRef: id.nullable(),
  boundArguments: z.record(z.string(), z.unknown()),
  expectedOutputSchemaId: id,
}).strict();

export type KernelDagExecutionBindingV1 = z.infer<typeof kernelDagExecutionBindingV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
      out[key] = (item as Record<string, unknown>)[key];
      return out;
    }, {})
    : item);
}

export function checksumKernelDagBoundArguments(boundArguments: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(boundArguments), 'utf8').digest('hex');
}

export interface BuildKernelDagExecutionBindingV1Input {
  action: AdaptiveDagActionV1;
  functionId: string;
  stepId: string;
  operatorId: string;
  operatorKind: KernelOperatorKind;
  implementationRef: string;
  boundArguments: Record<string, unknown>;
  expectedOutputSchemaId: string;
}

/** Build and fail closed if the runtime arguments do not match the plan. */
export function buildKernelDagExecutionBindingV1(
  input: BuildKernelDagExecutionBindingV1Input,
): KernelDagExecutionBindingV1 {
  const action = adaptiveDagActionSchema.parse(input.action);
  if (!action.parameterChecksum) {
    throw new Error(`DAG_EXEC_BINDING_PARAMETER_CHECKSUM_MISSING:${action.actionId}`);
  }
  if (action.parameterArtifactRef !== null && action.parameterArtifactRef !== undefined && typeof action.parameterArtifactRef !== 'string') {
    throw new Error(`DAG_EXEC_BINDING_PARAMETER_ARTIFACT_REF_INVALID:${action.actionId}`);
  }
  const actualChecksum = checksumKernelDagBoundArguments(input.boundArguments);
  if (actualChecksum !== action.parameterChecksum) {
    throw new Error(`DAG_EXEC_BINDING_PARAMETER_CHECKSUM_MISMATCH:${action.actionId}`);
  }
  if (input.expectedOutputSchemaId !== action.outputContract) {
    throw new Error(`DAG_EXEC_BINDING_OUTPUT_SCHEMA_MISMATCH:${action.actionId}`);
  }
  return kernelDagExecutionBindingV1Schema.parse({
    schema: 'atlas.kernel-dag-execution-binding.v1',
    parameterArtifactRef: action.parameterArtifactRef ?? null,
    ...input,
  });
}

/** Resolve a planner artifact without granting persistence or mutation authority. */
export function resolveKernelDagParameterArtifactV1(input: {
  action: AdaptiveDagActionV1;
  binding: KernelDagExecutionBindingV1;
  artifact: ParameterArtifactV1;
}): Record<string, unknown> {
  const action = adaptiveDagActionSchema.parse(input.action);
  const binding = kernelDagExecutionBindingV1Schema.parse(input.binding);
  const artifact = parameterArtifactV1Schema.parse(input.artifact);
  if (!action.parameterArtifactRef || !binding.parameterArtifactRef) {
    throw new Error(`DAG_EXEC_PARAMETER_ARTIFACT_REF_MISSING:${action.actionId}`);
  }
  if (binding.parameterArtifactRef !== action.parameterArtifactRef || artifact.artifactId !== action.parameterArtifactRef) {
    throw new Error(`DAG_EXEC_PARAMETER_ARTIFACT_REF_MISMATCH:${action.actionId}`);
  }
  if (artifact.actionId !== action.actionId || artifact.actionId !== binding.action.actionId) {
    throw new Error(`DAG_EXEC_PARAMETER_ARTIFACT_ACTION_MISMATCH:${action.actionId}`);
  }
  if (artifact.parameterChecksum !== action.parameterChecksum) {
    throw new Error(`DAG_EXEC_PARAMETER_ARTIFACT_CHECKSUM_MISMATCH:${action.actionId}`);
  }
  if (checksumKernelDagBoundArguments(artifact.boundArguments) !== artifact.parameterChecksum) {
    throw new Error(`DAG_EXEC_PARAMETER_ARTIFACT_CONTENT_MISMATCH:${action.actionId}`);
  }
  return artifact.boundArguments;
}
