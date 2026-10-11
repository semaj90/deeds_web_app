import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  algorithmExecutionManifestSchema,
  checksumAlgorithmExecutionManifest,
  type AlgorithmExecutionManifestV1,
} from './algorithm-execution-manifest.js';
import {
  kernelDagExecutionBindingV1Schema,
  type KernelDagExecutionBindingV1,
} from './kernel-dag-execution-binding-v1.js';

const id = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Immutable REFERENCE descriptor over the existing execution owners
 * (KernelDagExecutionBindingV1 + AlgorithmExecutionManifestV1). It carries no
 * bound arguments, no operator registry, no execution/CUDA authorization and no
 * canonical source authority. Admission is a separate downstream decision.
 */
export const instructionCardV1Schema = z.object({
  schema: z.literal('atlas.instruction-card.v1').default('atlas.instruction-card.v1'),
  instructionCardId: id,
  descriptorRevision: id,
  actionId: id,
  stepId: id,
  functionId: id,
  executionBindingRef: id,
  executionBindingChecksum: sha256Hex,
  algorithmExecutionManifestRef: id,
  algorithmExecutionManifestChecksum: sha256Hex,
  packetKey: id,
  sourceRevision: id,
  workspaceRevision: id,
  inputChecksum: sha256Hex,
  expectedOutputSchemaId: id,
  requiredCapabilityIds: z.array(id),
  deviceClass: z.enum(['cpu', 'cuda', 'webgpu']),
  resourcePolicyRef: id,
  admissionStatus: z.literal('NOT_ADMITTED'),
  canonicalSourceAuthority: z.literal(false),
  executionAuthorized: z.literal(false),
}).strict();

export type InstructionCardV1 = z.infer<typeof instructionCardV1Schema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function checksumKernelDagExecutionBinding(binding: KernelDagExecutionBindingV1): string {
  return createHash('sha256').update(canonical(kernelDagExecutionBindingV1Schema.parse(binding)), 'utf8').digest('hex');
}

export interface BuildInstructionCardV1Input {
  instructionCardId: string;
  descriptorRevision: string;
  binding: KernelDagExecutionBindingV1;
  bindingRef: string;
  manifest: AlgorithmExecutionManifestV1;
  manifestRef: string;
  packetKey: string;
  workspaceRevision: string;
  /** Source revision the caller expects; must equal the manifest's snapshot revision. */
  sourceRevision: string;
  requiredCapabilityIds: string[];
  /** Capabilities proven available by the caller's capability receipt. */
  availableCapabilityIds: string[];
  resourcePolicyRef: string;
}

/** Build and fail closed on any cross-contract mismatch. Never admits or authorizes. */
export function buildInstructionCardV1(input: BuildInstructionCardV1Input): InstructionCardV1 {
  const binding = kernelDagExecutionBindingV1Schema.parse(input.binding);
  const manifest = algorithmExecutionManifestSchema.parse(input.manifest);

  if (binding.action.mutationPolicy !== 'READ_ONLY') {
    throw new Error(`INSTRUCTION_CARD_BINDING_NOT_READ_ONLY:${binding.action.actionId}`);
  }
  if (manifest.action_id !== undefined && manifest.action_id !== binding.action.actionId) {
    throw new Error(`INSTRUCTION_CARD_ACTION_MISMATCH:${manifest.action_id}`);
  }
  if (manifest.input_checksum !== binding.action.inputChecksum) {
    throw new Error('INSTRUCTION_CARD_INPUT_CHECKSUM_MISMATCH');
  }
  if (manifest.source_snapshot_revision !== input.sourceRevision) {
    throw new Error(`INSTRUCTION_CARD_STALE_SOURCE_REVISION:${manifest.source_snapshot_revision}`);
  }
  if (manifest.canonical_authority) {
    throw new Error('INSTRUCTION_CARD_CANONICAL_AUTHORITY_ESCALATION');
  }
  const m = manifest.mutation;
  if (m.mutates_tensor || m.mutates_cache || m.mutates_derived_projection || m.proposes_dag_mutation || m.canonical_state_mutated) {
    throw new Error('INSTRUCTION_CARD_MANIFEST_MUTATES_STATE');
  }
  const available = new Set(input.availableCapabilityIds);
  const missing = input.requiredCapabilityIds.filter((c) => !available.has(c));
  if (missing.length) throw new Error(`INSTRUCTION_CARD_CAPABILITY_MISSING:${missing.join(',')}`);

  return instructionCardV1Schema.parse({
    instructionCardId: input.instructionCardId,
    descriptorRevision: input.descriptorRevision,
    actionId: binding.action.actionId,
    stepId: binding.stepId,
    functionId: binding.functionId,
    executionBindingRef: input.bindingRef,
    executionBindingChecksum: checksumKernelDagExecutionBinding(binding),
    algorithmExecutionManifestRef: input.manifestRef,
    algorithmExecutionManifestChecksum: checksumAlgorithmExecutionManifest(manifest),
    packetKey: input.packetKey,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    inputChecksum: manifest.input_checksum,
    expectedOutputSchemaId: binding.expectedOutputSchemaId,
    requiredCapabilityIds: [...new Set(input.requiredCapabilityIds)].sort(),
    deviceClass: manifest.device.kind,
    resourcePolicyRef: input.resourcePolicyRef,
    admissionStatus: 'NOT_ADMITTED',
    canonicalSourceAuthority: false,
    executionAuthorized: false,
  });
}

/** Re-verify a card against the current referenced contracts (stale/tamper detection). */
export function verifyInstructionCardV1(
  cardInput: unknown,
  binding: KernelDagExecutionBindingV1,
  manifest: AlgorithmExecutionManifestV1,
  currentSourceRevision: string,
): InstructionCardV1 {
  const card = instructionCardV1Schema.parse(cardInput);
  if (card.executionBindingChecksum !== checksumKernelDagExecutionBinding(binding)) {
    throw new Error('INSTRUCTION_CARD_BINDING_CHECKSUM_MISMATCH');
  }
  if (card.algorithmExecutionManifestChecksum !== checksumAlgorithmExecutionManifest(manifest)) {
    throw new Error('INSTRUCTION_CARD_MANIFEST_CHECKSUM_MISMATCH');
  }
  if (card.sourceRevision !== currentSourceRevision) {
    throw new Error(`INSTRUCTION_CARD_STALE_SOURCE_REVISION:${currentSourceRevision}`);
  }
  return card;
}
