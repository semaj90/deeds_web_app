import { createHash } from 'node:crypto';
import type { ProjectionIdentity, RepresentationIdentity } from './contracts.js';

export type RepresentationRecord = ProjectionIdentity & {
  packetId: string;
  representation: RepresentationIdentity;
  vectorHash: string;
  generatedAt: string;
};

export function validateRepresentationIdentity(value: RepresentationIdentity): void {
  if (!value.representationId) throw new Error('representationId is required');
  if (!value.modelId) throw new Error('modelId is required');
  if (!value.modelRevision) throw new Error('modelRevision is required');
  if (!Number.isSafeInteger(value.dimensions) || value.dimensions < 1) {
    throw new Error(`Invalid dimensions: ${value.dimensions}`);
  }
  if (value.fallback && value.runtime !== 'local-fallback') {
    throw new Error('Fallback representations must use runtime=local-fallback');
  }
}

export function hashFloatVector(vector: readonly number[]): string {
  const bytes = Buffer.allocUnsafe(vector.length * 4);
  vector.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new Error(`Non-finite vector value at index ${index}`);
    bytes.writeFloatLE(value, index * 4);
  });
  return createHash('sha256').update(bytes).digest('hex');
}

export function makeRepresentationRecord(input: {
  packetId: string;
  projection: ProjectionIdentity;
  representation: RepresentationIdentity;
  vector: readonly number[];
  generatedAt?: string;
}): RepresentationRecord {
  validateRepresentationIdentity(input.representation);
  if (input.vector.length !== input.representation.dimensions) {
    throw new Error(`Vector dimension mismatch: expected ${input.representation.dimensions}, received ${input.vector.length}`);
  }

  return {
    packetId: input.packetId,
    ...input.projection,
    representation: input.representation,
    vectorHash: hashFloatVector(input.vector),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
