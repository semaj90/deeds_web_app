import { describe, expect, it } from 'vitest';

import {
  SymbolRepresentationNameEnum,
  VECTOR_MANIFESTS,
  VectorManifestSchema,
  getVectorManifest,
} from './vector-manifest.js';

describe('symbol representation registry', () => {
  it('provides the complete seven-view physical/derived contract', () => {
    const names = [
      'semantic_768',
      'semantic_mrl_512',
      'semantic_mrl_256',
      'semantic_mrl_128',
      'latent_256',
      'latent_128',
      'latent_64',
    ] as const;
    expect(names).toHaveLength(7);

    const expectedKinds = {
      semantic_768: 'PHYSICAL',
      semantic_mrl_512: 'DERIVED',
      semantic_mrl_256: 'DERIVED',
      semantic_mrl_128: 'DERIVED',
      latent_256: 'PHYSICAL',
      latent_128: 'DERIVED',
      latent_64: 'DERIVED',
    } as const;

    for (const name of names) {
      const manifest = VectorManifestSchema.parse(getVectorManifest(name));
      expect(manifest, name).toBeDefined();
      expect(manifest?.storage?.kind, name).toBe(expectedKinds[name]);
      expect(() => VectorManifestSchema.parse(manifest)).not.toThrow();
    }

    expect(VectorManifestSchema.parse(getVectorManifest('semantic_mrl_512')).storage).toMatchObject({
      derivedFrom: 'semantic_768',
      derivation: 'MRL_PREFIX_L2_RENORMALIZE',
    });
    expect(VectorManifestSchema.parse(getVectorManifest('semantic_mrl_256')).storage).toMatchObject({
      derivedFrom: 'semantic_768',
      derivation: 'MRL_PREFIX_L2_RENORMALIZE',
    });
    expect(VectorManifestSchema.parse(getVectorManifest('semantic_mrl_128')).storage).toMatchObject({
      derivedFrom: 'semantic_768',
      derivation: 'MRL_PREFIX_L2_RENORMALIZE',
    });
    expect(VectorManifestSchema.parse(getVectorManifest('latent_128')).storage).toMatchObject({
      derivedFrom: 'latent_256',
      derivation: 'NESTED_PREFIX_L2_RENORMALIZE',
    });
    expect(VectorManifestSchema.parse(getVectorManifest('latent_64')).storage).toMatchObject({
      derivedFrom: 'latent_128',
      derivation: 'NESTED_PREFIX_L2_RENORMALIZE',
    });
  });

  it('binds all nested latent views to one checkpoint and model revision', () => {
    const latent = ['latent_256', 'latent_128', 'latent_64'] as const;
    const manifests = latent.map((name) =>
      VectorManifestSchema.parse(getVectorManifest(name)),
    );
    expect(new Set(manifests.map((manifest) => manifest.model))).toEqual(new Set(['nested-semantic-autoencoder-v3-full01']));
    expect(new Set(manifests.map((manifest) => manifest.modelRevision))).toEqual(new Set(['3.0']));
    expect(new Set(manifests.map((manifest) => manifest.checkpointRevision))).toEqual(
      new Set(['d6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259']),
    );
    expect(VECTOR_MANIFESTS.latent256.dimensions).toBe(256);
    expect(VECTOR_MANIFESTS.latent128.dimensions).toBe(128);
    expect(VECTOR_MANIFESTS.latent64.dimensions).toBe(64);
  });
});
