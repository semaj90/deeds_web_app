import { describe, expect, it } from 'vitest';
import { resolveParameterArtifactV1 } from './parameter-resolver-v1.js';
import type { ParameterArtifactLookupV1 } from '../../contracts/parameter-artifact-lookup-v1.js';

const artifact = (lookupKey: string, revision = 'semantic_768'): ParameterArtifactLookupV1 => ({
  schema: 'atlas.parameter-artifact-lookup.v1',
  lookupKey,
  kind: 'REPRESENTATION',
  modelRevision: 'embeddinggemma-v1',
  adapterRevision: null,
  tokenizerRevision: 'tokenizer-v1',
  representationRevision: revision,
  producerRevision: 'embedding-executor-v1',
  artifactRef: 'postgres:content_embedding_768',
  artifactChecksum: 'a'.repeat(64),
  dimensions: 768,
  metric: 'COSINE',
  normalization: 'L2_VECTOR',
  parameters: {},
  dependencyRevisions: ['workspace:v1'],
  canonicalAuthority: false,
  status: 'PROVEN',
});

describe('parameter resolver v1', () => {
  it('resolves exactly one compatible proven artifact', () => {
    const result = resolveParameterArtifactV1({ kind: 'REPRESENTATION', representationRevision: 'semantic_768', dimensions: 768 }, [artifact('key:1')]);
    expect(result.status).toBe('RESOLVED');
    expect(result.artifact?.lookupKey).toBe('key:1');
    expect(result.writesPerformed).toBe(false);
  });

  it('fails closed when no compatible artifact exists', () => {
    const result = resolveParameterArtifactV1({ kind: 'REPRESENTATION', representationRevision: 'semantic_mrl_256', dimensions: 256 }, [artifact('key:1')]);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.artifact).toBeNull();
  });

  it('does not silently choose between compatible artifacts', () => {
    const result = resolveParameterArtifactV1({ kind: 'REPRESENTATION', representationRevision: 'semantic_768', dimensions: 768 }, [artifact('key:1'), artifact('key:2')]);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.artifact).toBeNull();
    expect(result.canonicalAuthority).toBe(false);
  });
});
