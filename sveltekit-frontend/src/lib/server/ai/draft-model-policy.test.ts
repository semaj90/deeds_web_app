import { describe, expect, it } from 'vitest';
import { shouldUseDraftModel } from './draft-model-policy.js';

describe('shouldUseDraftModel', () => {
  it('enables draft for TurboQuant text requests', () => {
    expect(shouldUseDraftModel('gemma4-rotorquant:latest', true)).toBe(true);
  });

  it('disables draft for VLM/mmproj-style requests', () => {
    expect(shouldUseDraftModel('gemma4-vlm', true)).toBe(false);
    expect(shouldUseDraftModel('gemma4-mmproj', true)).toBe(false);
  });

  it('disables draft when TurboQuant is unavailable', () => {
    expect(shouldUseDraftModel('gemma4-rotorquant:latest', false)).toBe(false);
  });
});
