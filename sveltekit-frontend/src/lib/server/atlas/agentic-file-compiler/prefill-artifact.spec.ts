import { describe, expect, it } from 'vitest';
import { buildCompiledArtifactCacheKey } from './prefill-artifact.js';

describe('compiled prefill identity', () => {
  it('is insensitive to evidence revision input ordering', () => {
    const base = { contextManifestChecksum: 'c', promptPlanChecksum: 'p', modelRevision: 'm', tokenizerRevision: 't', promptTemplateRevision: 'pt', toolSchemaRevision: 'tools' };
    expect(buildCompiledArtifactCacheKey({ ...base, evidenceRevisions: ['b','a'] })).toBe(buildCompiledArtifactCacheKey({ ...base, evidenceRevisions: ['a','b'] }));
  });
});
