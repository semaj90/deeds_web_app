// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_REPRESENTATION_BINDING_V2,
  assertCandidateRepresentationBindingSetV2,
  candidateRepresentationBindingV2Schema,
  type CandidateRepresentationBindingV2,
} from './candidate-representation-binding-v2.js';

const semantic768: CandidateRepresentationBindingV2 = {
  schema: CANDIDATE_REPRESENTATION_BINDING_V2,
  representationId: 'semantic_768',
  family: 'EMBEDDINGGEMMA_MRL',
  dimensions: 768,
  modelRevision: 'embeddinggemma:model:abc',
  representationRevision: 'semantic:rev:1',
  projectionKind: 'NONE',
  sourceRepresentationId: null,
  sourceRepresentationRevision: null,
  projectionRevision: null,
  normalized: true,
  available: true,
  availabilityReason: null,
};

function mrl(
  representationId: 'semantic_mrl_512' | 'semantic_mrl_256' | 'semantic_mrl_128',
  dimensions: 512 | 256 | 128,
): CandidateRepresentationBindingV2 {
  return {
    schema: CANDIDATE_REPRESENTATION_BINDING_V2,
    representationId,
    family: 'EMBEDDINGGEMMA_MRL',
    dimensions,
    modelRevision: semantic768.modelRevision,
    representationRevision: `${representationId}:rev:1`,
    projectionKind: 'MRL_PREFIX_L2_RENORMALIZE',
    sourceRepresentationId: 'semantic_768',
    sourceRepresentationRevision: semantic768.representationRevision,
    projectionRevision: 'embeddinggemma-mrl-prefix-l2:v1',
    normalized: true,
    available: true,
    availabilityReason: null,
  };
}

const latent256: CandidateRepresentationBindingV2 = {
  schema: CANDIDATE_REPRESENTATION_BINDING_V2,
  representationId: 'latent_256',
  family: 'LEARNED_LATENT',
  dimensions: 256,
  modelRevision: 'nested-ae:model:checkpoint-1',
  representationRevision: 'latent256:rev:1',
  projectionKind: 'LEARNED_AUTOENCODER',
  sourceRepresentationId: 'semantic_768',
  sourceRepresentationRevision: semantic768.representationRevision,
  projectionRevision: 'nested-ae:checkpoint-1',
  normalized: true,
  available: true,
  availabilityReason: null,
};

const latent128: CandidateRepresentationBindingV2 = {
  schema: CANDIDATE_REPRESENTATION_BINDING_V2,
  representationId: 'latent_128',
  family: 'LEARNED_LATENT',
  dimensions: 128,
  modelRevision: latent256.modelRevision,
  representationRevision: 'latent128:rev:1',
  projectionKind: 'NESTED_PREFIX_L2_RENORMALIZE',
  sourceRepresentationId: 'latent_256',
  sourceRepresentationRevision: latent256.representationRevision,
  projectionRevision: 'nested-prefix-l2:v1',
  normalized: true,
  available: true,
  availabilityReason: null,
};

const latent64: CandidateRepresentationBindingV2 = {
  schema: CANDIDATE_REPRESENTATION_BINDING_V2,
  representationId: 'latent_64',
  family: 'LEARNED_LATENT',
  dimensions: 64,
  modelRevision: latent256.modelRevision,
  representationRevision: 'latent64:rev:1',
  projectionKind: 'NESTED_PREFIX_L2_RENORMALIZE',
  sourceRepresentationId: 'latent_128',
  sourceRepresentationRevision: latent128.representationRevision,
  projectionRevision: 'nested-prefix-l2:v1',
  normalized: true,
  available: true,
  availabilityReason: null,
};

describe('CandidateRepresentationBindingV2', () => {
  it('accepts the canonical semantic + MRL + learned latent chain', () => {
    const bindings = [
      semantic768,
      mrl('semantic_mrl_512', 512),
      mrl('semantic_mrl_256', 256),
      mrl('semantic_mrl_128', 128),
      latent256,
      latent128,
      latent64,
    ];

    expect(() => assertCandidateRepresentationBindingSetV2(bindings)).not.toThrow();
  });

  it('requires MRL prefix + L2 renormalization, not plain truncation', () => {
    expect(() => candidateRepresentationBindingV2Schema.parse({
      ...mrl('semantic_mrl_128', 128),
      projectionKind: 'NONE',
    })).toThrow(/REPRESENTATION_PROJECTION_MISMATCH/);
  });

  it('requires latent_64 to derive from latent_128 rather than semantic_768', () => {
    expect(() => candidateRepresentationBindingV2Schema.parse({
      ...latent64,
      sourceRepresentationId: 'semantic_768',
      sourceRepresentationRevision: semantic768.representationRevision,
    })).toThrow(/REPRESENTATION_SOURCE_MISMATCH/);
  });

  it('rejects a derived binding whose source revision does not match the admitted source binding', () => {
    const bad = {
      ...mrl('semantic_mrl_256', 256),
      sourceRepresentationRevision: 'semantic:rev:other',
    };

    expect(() => assertCandidateRepresentationBindingSetV2([semantic768, bad])).toThrow(
      /REPRESENTATION_BINDING_SOURCE_REVISION_MISMATCH/,
    );
  });
});
