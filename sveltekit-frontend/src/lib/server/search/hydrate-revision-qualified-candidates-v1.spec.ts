// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  joinRevisionQualifiedCandidatesV1,
  type RevisionQualifiedHydrationDbRowV1,
} from './hydrate-revision-qualified-candidates-v1.js';
import type { StrictSemanticProjectionCandidateV1 } from './strict-semantic-projection-candidate-v1.js';

const workspaceRevision = `sha256:${'1'.repeat(64)}`;
const sourceRevision = `sha256:${'2'.repeat(64)}`;
const postgresId = '11111111-1111-4111-8111-111111111111';

const candidate: StrictSemanticProjectionCandidateV1 = {
  schema: 'atlas.strict-semantic-projection-candidate.v1',
  physicalPointId: 'qdrant-point-1',
  postgresId,
  chunkId: 'chunk:one',
  sourceRef: 'src/lib/example.ts',
  contentHash: 'chunk-hash-1',
  score: 0.91,
  representationName: 'semantic_768',
  representationRevision: 'semantic_768:rev:current',
  projectionRevision: 'qdrant-projection:rev:current',
  modelRevision: 'embeddinggemma:model:current',
  modelRevisionState: 'VERIFIED',
  identityMissing: false,
};

const row: RevisionQualifiedHydrationDbRowV1 = {
  chunk_row_id: postgresId,
  canonical_chunk_id: 'chunk:one',
  chunk_id: 'chunk:one',
  packet_key: 'packet:one',
  source_ref: 'src/lib/example.ts',
  source_revision: sourceRevision,
  workspace_revision: workspaceRevision,
  binding_checksum: 'a'.repeat(64),
  content_hash: 'chunk-hash-1',
  content: 'export const one = 1;',
  lineage_producer_revision: 'packet-chunk-lineage:v1',
  evidence_refs: ['lineage:one', 'binding:one'],
};

describe('joinRevisionQualifiedCandidatesV1', () => {
  it('hydrates exact current lineage and preserves semantic rank order', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [candidate],
      rows: [row],
      workspaceRevision,
    });

    expect(result.failures).toEqual([]);
    expect(result.hydrated).toHaveLength(1);
    expect(result.hydrated[0]).toMatchObject({
      postgresId,
      canonicalChunkId: 'chunk:one',
      packetKey: 'packet:one',
      workspaceRevision,
      sourceRevision,
      semanticScore: 0.91,
      representationName: 'semantic_768',
    });
    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
  });

  it('fails closed when the current workspace has no exact lineage row', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [candidate],
      rows: [],
      workspaceRevision,
    });
    expect(result.hydrated).toEqual([]);
    expect(result.failures[0]?.reason).toBe('CURRENT_LINEAGE_NOT_FOUND');
  });

  it('fails closed on ambiguous canonical lineage', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [candidate],
      rows: [row, { ...row, packet_key: 'packet:duplicate' }],
      workspaceRevision,
    });
    expect(result.hydrated).toEqual([]);
    expect(result.failures[0]?.reason).toBe('CURRENT_LINEAGE_AMBIGUOUS');
  });

  it('rejects projection metadata that disagrees with canonical source identity', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [{ ...candidate, sourceRef: 'src/lib/other.ts' }],
      rows: [row],
      workspaceRevision,
    });
    expect(result.failures[0]?.reason).toBe('SOURCE_REF_MISMATCH');
  });

  it('requires semantic_768 representation lineage from the projection', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [{ ...candidate, representationName: 'semantic_mrl_128' }],
      rows: [row],
      workspaceRevision,
    });
    expect(result.failures[0]?.reason).toBe('REPRESENTATION_NAME_MISMATCH');
  });
});
