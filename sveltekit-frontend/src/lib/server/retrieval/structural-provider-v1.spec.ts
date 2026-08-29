import { describe, expect, it } from 'vitest';
import { buildStructuralProviderResultV1, resolveStructuralRetrievalMode } from './structural-provider-v1.js';

describe('StructuralProviderV1', () => {
  it('defaults safely to legacy mode', () => {
    expect(resolveStructuralRetrievalMode(undefined)).toBe('legacy');
    expect(resolveStructuralRetrievalMode('unknown')).toBe('legacy');
    expect(resolveStructuralRetrievalMode('shadow')).toBe('shadow');
  });

  it('builds a bounded non-authoritative provider receipt', () => {
    const result = buildStructuralProviderResultV1({
      context: { query: 'find parse', workspaceRevision: 'sha256:w', candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'a'.repeat(64), maxSources: 2, maxMatches: 4, timeoutMs: 1000 },
      providerRevision: 'structural-provider:test:v1', candidates: [], sourceCount: 1, observationCount: 2, matchedCount: 0,
    });
    expect(result.schema).toBe('atlas.structural-provider-result.v1');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writes).toBe(false);
    expect(result.acceptedCount).toBe(0);
  });
});
