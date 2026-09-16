import { describe, expect, it } from 'vitest';
import { buildWorkspaceEventV1, createWorkspaceHeadV1, deriveWorkspaceHeadRevisionV1 } from './workspace-event-sourcing-v1.js';
import { projectWorkspaceInvalidationsV1 } from './workspace-invalidation-projector-v1.js';

const checksum = (n: string) => `sha256:${n.repeat(64)}`;

function sourceEvent() {
  const base = checksum('1');
  const head = createWorkspaceHeadV1({ workspaceId: 'repo:deeds-web-app', baseSnapshotRevision: base, deltaRootChecksum: checksum('2') });
  return buildWorkspaceEventV1({
    eventId: '00000000-0000-4000-8000-000000000021', workspaceId: head.workspaceId, sequence: 1n,
    baseSnapshotRevision: base, previousHeadRevision: head.workspaceHeadRevision,
    workspaceHeadRevision: deriveWorkspaceHeadRevisionV1(base, 1n, checksum('3')), deltaRootChecksum: checksum('3'),
    eventType: 'SOURCE_UPDATED', occurredAt: '2026-09-16T12:00:00.000Z',
    correlationId: '00000000-0000-4000-8000-000000000022', causationId: null, producerRevision: 'graphify-delta-v1',
    beforeStateChecksum: checksum('4'), afterStateChecksum: checksum('5'),
    participants: [{ role: 'SOURCE', canonicalId: 'repo:root:src/claude.md', revision: checksum('6'), relation: 'SUBJECT' }],
  });
}

describe('workspace invalidation projector v1', () => {
  it('invalidates only descendants of the changed source', () => {
    const result = projectWorkspaceInvalidationsV1({
      event: sourceEvent(), sourceRef: 'repo:root:src/claude.md', sourceRevision: 'sha256:' + '7'.repeat(64),
      dependencies: [
        { dependencySourceRef: 'repo:root:src/claude.md', dependencySourceRevision: checksum('6'), dependentCanonicalId: 'packet:p17', dependentKind: 'PACKET', dependentRevision: 'packet-r1' },
        { dependencySourceRef: 'repo:root:src/claude.md', dependencySourceRevision: checksum('6'), dependentCanonicalId: 'chunk:c1', dependentKind: 'CHUNK', dependentRevision: 'chunk-r1' },
        { dependencySourceRef: 'repo:root:src/index.ts', dependencySourceRevision: checksum('8'), dependentCanonicalId: 'packet:p18', dependentKind: 'PACKET', dependentRevision: 'packet-r1' },
      ],
    });
    expect(result.affectedCount).toBe(2);
    expect(result.unrelatedDependencyCount).toBe(1);
    expect(result.invalidations.map((item) => item.canonicalId)).toEqual(['packet:p17', 'chunk:c1']);
    expect(result.writesPerformed).toBe(false);
  });

  it('does not invalidate a matching source revision', () => {
    const revision = checksum('6');
    const result = projectWorkspaceInvalidationsV1({
      event: sourceEvent(), sourceRef: 'repo:root:src/claude.md', sourceRevision: revision,
      dependencies: [{ dependencySourceRef: 'repo:root:src/claude.md', dependencySourceRevision: revision, dependentCanonicalId: 'packet:p17', dependentKind: 'PACKET', dependentRevision: 'packet-r1' }],
    });
    expect(result.affectedCount).toBe(0);
    expect(result.invalidations).toEqual([]);
  });
});
