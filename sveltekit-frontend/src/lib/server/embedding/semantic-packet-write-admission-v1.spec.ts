import { describe, expect, it } from 'vitest';
import {
  buildSemanticPacketWriteAdmissionV1,
  validateSemanticPacketExecutionAuthorityV1,
} from './semantic-packet-write-admission-v1.js';

const digest = 'a'.repeat(64);
const revision = `sha256:${digest}`;
const binding = {
  schema: 'atlas.workspace-source-binding.v1' as const,
  workspaceRevision: revision,
  sourceRef: 'src/example.ts',
  sourceRevision: revision,
  contentDigest: digest,
  byteLength: 10,
  gitObjectFormat: 'sha1' as const,
  baseCommitOid: 'b'.repeat(40),
  gitBlobOid: null,
  trackedAtBaseCommit: false,
  dirtyRelativeToBaseCommit: true,
  sourceManifestOrdinal: 0,
  readOnlyObservation: true as const,
  canonicalAuthority: false as const,
  producerRevision: 'test:binding:v1',
  checksum: 'c'.repeat(64),
};

describe('buildSemanticPacketWriteAdmissionV1', () => {
  it('preserves caller-owned packet identity and exact binding revisions', () => {
    const result = buildSemanticPacketWriteAdmissionV1({
      packetKey: 'packet:example',
      binding,
      admittedWorkspaceRevision: revision,
      executionId: 'exec:example',
    });

    expect(result).toMatchObject({
      packetKey: 'packet:example',
      sourceRef: 'src/example.ts',
      sourceRevision: revision,
      workspaceRevision: revision,
      contentDigest: digest,
      executionId: 'exec:example',
      authorityScope: 'ADMITTED_EXECUTION_SOURCE_BINDING',
      writesPerformed: false,
    });
  });

  it('rejects a binding from a different workspace revision', () => {
    expect(() => buildSemanticPacketWriteAdmissionV1({
      packetKey: 'packet:example',
      binding,
      admittedWorkspaceRevision: `sha256:${'d'.repeat(64)}`,
      executionId: 'exec:example',
    })).toThrow('SEMANTIC_PACKET_WORKSPACE_REVISION_MISMATCH');
  });

  it('rejects an invalid binding/content revision relationship', () => {
    expect(() => buildSemanticPacketWriteAdmissionV1({
      packetKey: 'packet:example',
      binding: { ...binding, sourceRevision: `sha256:${'e'.repeat(64)}` },
      admittedWorkspaceRevision: revision,
      executionId: 'exec:example',
    })).toThrow();
  });

  it('requires a separate execution receipt matching tournament admission', () => {
    const execution = validateSemanticPacketExecutionAuthorityV1({
      tournamentAdmission: {
        schema: 'atlas.workspace-revision-tournament-admission.v1',
        status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
        authority: true,
        workspaceRevision: revision,
        graphifyExecutionAuthorized: false,
        projectionWritesAuthorized: false,
        writesPerformed: false,
      },
      executionReceipt: {
        schema: 'atlas.graphify-workspace-snapshot-binding.v1',
        status: 'GRAPHIFY_SNAPSHOT_BINDING_PROVEN',
        authority: true,
        executionId: 'exec:current',
        workspaceRevision: revision,
        sourceMembershipChecksum: `sha256:${'f'.repeat(64)}`,
        writesPerformed: false,
      },
    });

    expect(execution.executionId).toBe('exec:current');
  });

  it('rejects an execution receipt that is not bound to tournament admission', () => {
    expect(() => validateSemanticPacketExecutionAuthorityV1({
      tournamentAdmission: {
        schema: 'atlas.workspace-revision-tournament-admission.v1',
        status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
        authority: true,
        workspaceRevision: revision,
        graphifyExecutionAuthorized: false,
        projectionWritesAuthorized: false,
        writesPerformed: false,
      },
      executionReceipt: {
        schema: 'atlas.graphify-workspace-snapshot-binding.v1',
        status: 'GRAPHIFY_SNAPSHOT_BINDING_PROVEN',
        authority: true,
        executionId: 'exec:other',
        workspaceRevision: `sha256:${'d'.repeat(64)}`,
        sourceMembershipChecksum: `sha256:${'f'.repeat(64)}`,
        writesPerformed: false,
      },
    })).toThrow('SEMANTIC_PACKET_EXECUTION_WORKSPACE_REVISION_MISMATCH');
  });
});
