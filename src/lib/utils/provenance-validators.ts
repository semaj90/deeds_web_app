import { z } from 'zod';

import {
  CANONICAL_EMBEDDING_COLLECTION,
  CANONICAL_EMBEDDING_DIMENSIONS,
  CANONICAL_EMBEDDING_NORMALIZATION,
  CANONICAL_EMBEDDING_REDUCTION,
  CANONICAL_EMBEDDING_REPRESENTATION_ID,
  CANONICAL_EMBEDDING_VECTOR_NAME,
  isFiniteNumberArray,
  normalizeL2Vector,
} from '../server/db/canonical-768-contract';

export interface RepresentationContractExpectation {
  representationId?: string;
  sourceDimensions?: number;
  outputDimensions?: number;
  normalization?: string;
  reduction?: string;
  vectorName?: string;
  physicalCollection?: string;
  projectionHash?: string | null;
}

function strictCanonicalExpectation(
  expected: RepresentationContractExpectation = {}
): Required<Omit<RepresentationContractExpectation, 'projectionHash'>> {
  return {
    representationId: expected.representationId ?? CANONICAL_EMBEDDING_REPRESENTATION_ID,
    sourceDimensions: expected.sourceDimensions ?? CANONICAL_EMBEDDING_DIMENSIONS,
    outputDimensions: expected.outputDimensions ?? CANONICAL_EMBEDDING_DIMENSIONS,
    normalization: expected.normalization ?? CANONICAL_EMBEDDING_NORMALIZATION,
    reduction: expected.reduction ?? CANONICAL_EMBEDDING_REDUCTION,
    vectorName: expected.vectorName ?? CANONICAL_EMBEDDING_VECTOR_NAME,
    physicalCollection: expected.physicalCollection ?? CANONICAL_EMBEDDING_COLLECTION,
  };
}

export async function validateRepresentationContract(
  representationId: string,
  expected?: RepresentationContractExpectation
): Promise<boolean> {
  const canonical = strictCanonicalExpectation(expected);
  return (
    representationId === canonical.representationId &&
    canonical.sourceDimensions === CANONICAL_EMBEDDING_DIMENSIONS &&
    canonical.outputDimensions === CANONICAL_EMBEDDING_DIMENSIONS &&
    canonical.normalization.toLowerCase() === CANONICAL_EMBEDDING_NORMALIZATION &&
    canonical.reduction.toLowerCase() === CANONICAL_EMBEDDING_REDUCTION &&
    canonical.vectorName === CANONICAL_EMBEDDING_VECTOR_NAME &&
    canonical.physicalCollection === CANONICAL_EMBEDDING_COLLECTION
  );
}

export async function safeSourceLineage(sourceHash: string): Promise<boolean> {
  return /^[a-f0-9]{64}$/i.test(sourceHash) || /^sha256:[a-f0-9]{64}$/i.test(sourceHash);
}

export async function validateQdrantMapping(
  vectorName: string,
  collectionName?: string
): Promise<boolean> {
  return (
    vectorName === CANONICAL_EMBEDDING_VECTOR_NAME &&
    (collectionName ?? CANONICAL_EMBEDDING_COLLECTION) === CANONICAL_EMBEDDING_COLLECTION
  );
}

export async function safeVectorReadback(rawVector: unknown, expectedVector: unknown): Promise<boolean> {
  if (!isFiniteNumberArray(rawVector) || !isFiniteNumberArray(expectedVector)) {
    return false;
  }

  if (rawVector.length !== expectedVector.length) {
    return false;
  }

  const epsilon = 1e-5;
  return rawVector.every((value, index) => Math.abs(value - expectedVector[index]) <= epsilon);
}

export async function checkDimensionality(rawVector: unknown, expectedDim: number): Promise<boolean> {
  return (
    isFiniteNumberArray(rawVector) &&
    Number.isInteger(expectedDim) &&
    expectedDim === CANONICAL_EMBEDDING_DIMENSIONS &&
    rawVector.length === expectedDim
  );
}

export async function validatePayloadSchema(validatedProjection: unknown, schema: unknown): Promise<boolean> {
  if (
    schema &&
    typeof schema === 'object' &&
    'safeParse' in schema &&
    typeof (schema as z.ZodType).safeParse === 'function'
  ) {
    return (schema as z.ZodType).safeParse(validatedProjection).success;
  }

  if (schema && typeof schema === 'object' && 'parse' in schema && typeof (schema as z.ZodType).parse === 'function') {
    try {
      (schema as z.ZodType).parse(validatedProjection);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export { normalizeL2Vector };
