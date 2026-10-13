import { describe, expect, it } from 'vitest';
import { SERVER_CHAT_MODEL } from '$lib/ai/model-ids.js';
import { getExperiment, getVariant, listExperiments, registerExperiment } from './ab-test.js';

describe('A/B model authority', () => {
  it('keeps legacy model comparisons inactive and on the canonical model only', async () => {
    for (const experiment of listExperiments()) {
      expect(experiment.active).toBe(false);
      expect(experiment.variants).toHaveLength(1);
      expect(experiment.variants[0]?.model).toBe(SERVER_CHAT_MODEL);
      expect(experiment.variants[0]?.pct).toBe(100);
      expect(experiment.variants[0]).not.toHaveProperty('backendHint');
      await expect(getVariant(experiment.experimentId, 'test-user')).resolves.toBeNull();
    }
  });

  it('rejects experiments selecting another model', () => {
    expect(() => registerExperiment({
      experimentId: 'unauthorized-model',
      description: 'test',
      active: true,
      variants: [{ variantId: 'other', label: 'other', model: 'not-ornith', pct: 100 }],
    })).toThrow('AB_EXPERIMENT_MODEL_AUTHORITY_VIOLATION');
  });

  it('rejects backend overrides even when the model identifier matches', () => {
    expect(() => registerExperiment({
      experimentId: 'unauthorized-backend',
      description: 'test',
      active: true,
      variants: [{ variantId: 'override', label: 'override', model: SERVER_CHAT_MODEL, pct: 100, backendHint: 'ollama' }],
    })).toThrow('AB_EXPERIMENT_MODEL_AUTHORITY_VIOLATION');
  });

  it('retains the retired experiment definitions for status inspection', () => {
    expect(getExperiment('legal-model-test')?.active).toBe(false);
    expect(getExperiment('turbo-vs-ollama')?.active).toBe(false);
  });
});
