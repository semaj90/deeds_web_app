import { describe, expect, it } from 'vitest';

import { classifyAceContextPackPointerSource } from './ace-context-pack-cache.js';

describe('classifyAceContextPackPointerSource', () => {
  it('reports Postgres only when the writer returns a persisted key', () => {
    expect(classifyAceContextPackPointerSource(
      { status: 'fulfilled', value: 'ace:key' },
      { status: 'fulfilled', value: undefined },
    )).toBe('postgres');
  });

  it('falls back to Redis when the Postgres writer fulfills with null', () => {
    expect(classifyAceContextPackPointerSource(
      { status: 'fulfilled', value: null },
      { status: 'fulfilled', value: undefined },
    )).toBe('redis');
  });

  it('reports local fallback when both persistence paths fail', () => {
    expect(classifyAceContextPackPointerSource(
      { status: 'rejected', reason: new Error('db unavailable') },
      { status: 'rejected', reason: new Error('redis unavailable') },
    )).toBe('local-json');
  });
});
