import { describe, expect, it } from 'vitest';
import { classifyRevisionOwnerProofV1, type RevisionSurfaceObservationV1 } from './revision-owner-proof-v1.js';

function observation(overrides: Partial<RevisionSurfaceObservationV1> & Pick<RevisionSurfaceObservationV1, 'surfaceId' | 'role'>): RevisionSurfaceObservationV1 {
  return {
    surfaceId: overrides.surfaceId,
    table: null,
    column: null,
    role: overrides.role,
    exists: true,
    totalRows: 100,
    populatedRows: 100,
    meaningfulRows: 100,
    meaningfulCoveragePct: 100,
    writerPath: null,
    writerPresent: false,
    writerCreatesRevision: false,
    writerPassesRevisionThrough: false,
    writerEvidence: [],
    notes: [],
    ...overrides,
  };
}

describe('RevisionOwnerProofV1', () => {
  it('does not treat populated sinks as revision authority', () => {
    const proof = classifyRevisionOwnerProofV1({
      producerRevision: 'test:v1',
      observations: [
        observation({
          surfaceId: 'workspace:atlas_packets.workspace_revision',
          role: 'DEFAULTED_SINK',
          writerPresent: true,
          writerPassesRevisionThrough: false,
          meaningfulRows: 99,
          meaningfulCoveragePct: 99,
        }),
        observation({
          surfaceId: 'source:atlas_ast_nodes.source_revision',
          role: 'UNPOPULATED_SINK',
          meaningfulRows: 0,
          meaningfulCoveragePct: 0,
        }),
        observation({
          surfaceId: 'source:atlas_symbol_versions.source_revision',
          role: 'PASS_THROUGH_SINK',
          writerPresent: true,
          writerPassesRevisionThrough: true,
        }),
      ],
    });

    expect(proof.status).toBe('REVISION_OWNER_NOT_PROVEN');
    expect(proof.workspaceRevisionOwner).toBeNull();
    expect(proof.sourceRevisionOwner).toBeNull();
  });

  it('requires an origin writer plus populated meaningful data', () => {
    const proof = classifyRevisionOwnerProofV1({
      producerRevision: 'test:v1',
      observations: [
        observation({
          surfaceId: 'workspace:workspace_manifest.revision',
          role: 'ORIGIN_CANDIDATE',
          writerPath: 'writer.ts',
          writerPresent: true,
          writerCreatesRevision: true,
        }),
        observation({
          surfaceId: 'source:atlas_source_refs.commit_sha',
          role: 'ORIGIN_CANDIDATE',
          writerPath: 'source-writer.ts',
          writerPresent: true,
          writerCreatesRevision: true,
        }),
      ],
    });

    expect(proof.status).toBe('REVISION_OWNER_PROVEN');
    expect(proof.workspaceRevisionProven).toBe(true);
    expect(proof.sourceRevisionProven).toBe(true);
  });

  it('does not prove an origin candidate when the column is unpopulated', () => {
    const proof = classifyRevisionOwnerProofV1({
      producerRevision: 'test:v1',
      observations: [
        observation({
          surfaceId: 'source:atlas_source_refs.commit_sha',
          role: 'ORIGIN_CANDIDATE',
          writerPath: 'source-writer.ts',
          writerPresent: true,
          writerCreatesRevision: true,
          populatedRows: 0,
          meaningfulRows: 0,
          meaningfulCoveragePct: 0,
        }),
      ],
    });

    expect(proof.status).toBe('REVISION_OWNER_NOT_PROVEN');
    expect(proof.sourceRevisionProven).toBe(false);
  });
});
