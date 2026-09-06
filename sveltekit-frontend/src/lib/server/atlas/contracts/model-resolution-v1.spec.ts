// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  ModelResolutionV1Schema,
  assertRuntimeIdentityIsMocked,
} from './model-resolution-v1.js';

describe('ModelResolutionV1', () => {
  it('accepts a fully-discovered resolution', () => {
    const parsed = ModelResolutionV1Schema.parse({
      requestedModel: 'yorha-legal',
      internalModel: 'ornith-1.5-profile',
      runtimeModelId: 'ornith-1.5-9b',
      runtimeModelPath: '/models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf',
      resolutionSource: 'LLAMA_PROPS',
      runtimeDiscovered: true,
    });
    expect(parsed.internalModel).toBe('ornith-1.5-profile');
  });

  it('accepts a not-yet-discovered resolution (nulls allowed)', () => {
    expect(() =>
      ModelResolutionV1Schema.parse({
        requestedModel: 'yorha-legal',
        internalModel: 'ornith-1.5-profile',
        runtimeModelId: null,
        runtimeModelPath: null,
        resolutionSource: 'CONFIG',
        runtimeDiscovered: false,
      })
    ).not.toThrow();
  });

  it('rejects runtimeDiscovered=true with a null runtimeModelId (inconsistent state)', () => {
    expect(() =>
      ModelResolutionV1Schema.parse({
        requestedModel: 'yorha-legal',
        internalModel: 'ornith-1.5-profile',
        runtimeModelId: null,
        runtimeModelPath: null,
        resolutionSource: 'LLAMA_V1_MODELS',
        runtimeDiscovered: true,
      })
    ).toThrow();
  });

  it('rejects an unknown resolutionSource', () => {
    expect(() =>
      ModelResolutionV1Schema.parse({
        requestedModel: 'yorha-legal',
        internalModel: 'ornith-1.5-profile',
        runtimeModelId: 'x',
        runtimeModelPath: null,
        resolutionSource: 'GUESS',
        runtimeDiscovered: true,
      })
    ).toThrow();
  });
});

describe('assertRuntimeIdentityIsMocked — the actual bug this contract prevents', () => {
  it('passes when the mocked runtime id matches', () => {
    const resolution = ModelResolutionV1Schema.parse({
      requestedModel: 'yorha-legal',
      internalModel: 'ornith-1.5-profile',
      runtimeModelId: 'runtime-model-under-test',
      runtimeModelPath: null,
      resolutionSource: 'LLAMA_PROPS',
      runtimeDiscovered: true,
    });
    expect(() => assertRuntimeIdentityIsMocked(resolution, 'runtime-model-under-test')).not.toThrow();
  });

  it('fails when the mocked runtime id does not match', () => {
    const resolution = ModelResolutionV1Schema.parse({
      requestedModel: 'yorha-legal',
      internalModel: 'ornith-1.5-profile',
      runtimeModelId: 'runtime-model-under-test',
      runtimeModelPath: null,
      resolutionSource: 'LLAMA_PROPS',
      runtimeDiscovered: true,
    });
    expect(() => assertRuntimeIdentityIsMocked(resolution, 'gemma4-rotorquant:latest')).toThrow();
  });

  it('refuses to assert against an undiscovered (unmocked) resolution', () => {
    const resolution = ModelResolutionV1Schema.parse({
      requestedModel: 'yorha-legal',
      internalModel: 'ornith-1.5-profile',
      runtimeModelId: null,
      runtimeModelPath: null,
      resolutionSource: 'CONFIG',
      runtimeDiscovered: false,
    });
    expect(() => assertRuntimeIdentityIsMocked(resolution, 'anything')).toThrow(/runtimeDiscovered=false/);
  });
});
