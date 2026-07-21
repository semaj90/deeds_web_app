import { describe, expect, it } from 'vitest';

import {
  classifyEmbeddingError,
  resolveEmbeddingBackend,
} from '../src/lib/server/embedding/embedding-backend-resolution.js';

describe('embedding backend resolution', () => {
  it('prefers llama-server when the dedicated embed base is configured', () => {
    expect(
      resolveEmbeddingBackend('embeddinggemma:latest', {
        configuredProvider: 'llama-server',
        configuredBaseUrl: 'http://127.0.0.1:8081',
        fallbackBaseUrl: 'http://127.0.0.1:11434',
      }),
    ).toEqual({
      provider: 'llama-server',
      baseUrl: 'http://127.0.0.1:8081',
      model: 'embeddinggemma:latest',
    });
  });

  it('classifies the physical batch boundary failure', () => {
    expect(
      classifyEmbeddingError('input: 162 tokens physical batch size: 128'),
    ).toBe('SEQUENCE_EXCEEDS_PHYSICAL_BATCH');
  });
});
