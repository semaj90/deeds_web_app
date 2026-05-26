import { describe, expect, it } from 'vitest';
import { isVlmOrMmprojRequestModel } from './request-classifiers.js';

describe('isVlmOrMmprojRequestModel', () => {
  it('flags VLM and mmproj-style model names', () => {
    expect(isVlmOrMmprojRequestModel('gemma4-vlm:latest')).toBe(true);
    expect(isVlmOrMmprojRequestModel('gemma4-vision')).toBe(true);
    expect(isVlmOrMmprojRequestModel('gemma4-mmproj')).toBe(true);
    expect(isVlmOrMmprojRequestModel('image-route-model')).toBe(true);
  });

  it('leaves text-only models alone', () => {
    expect(isVlmOrMmprojRequestModel('gemma4-rotorquant:latest')).toBe(false);
    expect(isVlmOrMmprojRequestModel('embeddinggemma:latest')).toBe(false);
  });
});
