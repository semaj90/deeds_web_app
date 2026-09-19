import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonicalEncodeV1 } from './canonical-hash-v1.js';

/**
 * Internal neural-state observation only.
 *
 * `hidden_256` is an execution intermediate, not a registered representation.
 * This contract carries checksums and lifecycle metadata without carrying the
 * hidden tensor itself, so it cannot become a durable vector/cache payload.
 */
export const HiddenNeuralStateV1Schema = z.object({
  schema: z.literal('atlas.hidden-neural-state.v1'),
  stateId: z.literal('hidden_256'),
  dimensions: z.literal(256),
  modelRevision: z.string().min(1),
  executionRevision: z.string().min(1),
  inputChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  outputChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  lifecycle: z.literal('EPHEMERAL_MODEL_EXECUTION'),
  registeredRepresentation: z.literal(false),
  durableArtifact: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
}).strict();

export type HiddenNeuralStateV1 = z.infer<typeof HiddenNeuralStateV1Schema>;

export function buildHiddenNeuralStateReceiptV1(
  input: Omit<HiddenNeuralStateV1, 'schema' | 'stateId' | 'dimensions' | 'lifecycle' | 'registeredRepresentation' | 'durableArtifact' | 'canonicalAuthority' | 'writesPerformed' | 'checksumSha256'>,
): HiddenNeuralStateV1 {
  const payload = {
    schema: 'atlas.hidden-neural-state.v1' as const,
    stateId: 'hidden_256' as const,
    dimensions: 256 as const,
    ...input,
    lifecycle: 'EPHEMERAL_MODEL_EXECUTION' as const,
    registeredRepresentation: false as const,
    durableArtifact: false as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const checksumSha256 = `sha256:${createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex')}`;
  return HiddenNeuralStateV1Schema.parse({ ...payload, checksumSha256 });
}

