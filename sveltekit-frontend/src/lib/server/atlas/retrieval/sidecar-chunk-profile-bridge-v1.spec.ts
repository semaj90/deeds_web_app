import { describe, expect, it } from 'vitest';
import {
  bridgeSidecarChunkToRetrievalProfileV1,
} from './sidecar-chunk-profile-bridge-v1.js';

const rev = `sha256:${'a'.repeat(64)}`;

const identity = {
  canonicalChunkId: '550e8400-e29b-41d4-a716-446655440000',
  packetKey: 'packet:1',
  repositoryId: 'repo:1',
  repositoryRelativePath: 'src/a.ts',
  sourceRef: 'src/a.ts',
  workspaceRevision: rev,
  sourceRevision: rev,
};

const structural = {
  schema: 'atlas.sidecar-structural-observation.v1' as const,
  engine: 'treesitter-chunker' as const,
  engineRevision: 'treesitter-chunker:v1',
  producerRevision: 'sidecar:8095:v2',
  sourceRevision: rev,
  language: 'typescript',
  upstreamChunkId: 'chunk:upstream:1',
  nodeType: 'function_declaration',
  symbolKind: 'function',
  symbolName: 'run',
  astPath: ['program', 'function_declaration'],
  calls: ['helper'],
  imports: ['./helper'],
  exports: ['run'],
  evidenceRefs: ['evidence:ast:1'],
  syntaxStatus: 'CLEAN' as const,
  canonicalAuthority: false as const,
};

describe('sidecar chunk profile bridge', () => {
  it('hydrates lexical/structural evidence from treesitter-chunker', () => {
    const result = bridgeSidecarChunkToRetrievalProfileV1({
      schema: 'atlas.sidecar-chunk-profile-bridge-input.v1',
      identity,
      featureRevision: 'feature:v1',
      structural,
      domain: null,
      canonicalAuthority: false,
    });

    expect(result.structuralAccepted).toBe(true);
    expect(result.profile.lexicalStructural?.symbolName).toBe('run');
    expect(result.profile.lexicalStructural?.calls).toEqual(['helper']);
    expect(result.domainAccepted).toBe(false);
  });

  it('does not promote a PyTorch/shadow classifier into domainTopic', () => {
    const result = bridgeSidecarChunkToRetrievalProfileV1({
      schema: 'atlas.sidecar-chunk-profile-bridge-input.v1',
      identity,
      featureRevision: 'feature:v1',
      structural,
      domain: {
        schema: 'atlas.sidecar-domain-observation.v1',
        producerRevision: 'sidecar:8095:v2',
        classifierRevision: 'pytorch:shadow:v1',
        taxonomyRevision: 'taxonomy:v1',
        primaryDomain: 'retrieval',
        confidence: 0.93,
        status: 'SHADOW_ONLY',
        evidenceRefs: ['evidence:domain:1'],
        canonicalAuthority: false,
      },
      canonicalAuthority: false,
    });

    expect(result.domainObservationStatus).toBe('SHADOW_ONLY');
    expect(result.domainAccepted).toBe(false);
    expect(result.profile.domainTopic).toBeUndefined();
    expect(result.rejections).toContain('DOMAIN_SHADOW_ONLY_NOT_ADMITTED');
  });

  it('accepts only an admitted classifier observation into domainTopic', () => {
    const result = bridgeSidecarChunkToRetrievalProfileV1({
      schema: 'atlas.sidecar-chunk-profile-bridge-input.v1',
      identity,
      featureRevision: 'feature:v1',
      structural,
      domain: {
        schema: 'atlas.sidecar-domain-observation.v1',
        producerRevision: 'sidecar:8095:v2',
        classifierRevision: 'sklearn-nb-lr:admitted:v1',
        taxonomyRevision: 'taxonomy:v1',
        primaryDomain: 'retrieval',
        confidence: 0.81,
        status: 'ADMITTED',
        evidenceRefs: ['evidence:domain:1'],
        canonicalAuthority: false,
      },
      canonicalAuthority: false,
    });

    expect(result.domainAccepted).toBe(true);
    expect(result.profile.domainTopic?.primaryDomain).toBe('retrieval');
    expect(result.profile.revisions.classifierRevision).toBe('sklearn-nb-lr:admitted:v1');
  });

  it('fails closed on source revision mismatch', () => {
    expect(() => bridgeSidecarChunkToRetrievalProfileV1({
      schema: 'atlas.sidecar-chunk-profile-bridge-input.v1',
      identity,
      featureRevision: 'feature:v1',
      structural: {
        ...structural,
        sourceRevision: `sha256:${'b'.repeat(64)}`,
      },
      domain: null,
      canonicalAuthority: false,
    })).toThrow('SIDECAR_SOURCE_REVISION_MISMATCH');
  });
});
