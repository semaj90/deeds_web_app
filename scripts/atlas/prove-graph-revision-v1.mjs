#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildGraphRevisionV1 } from './lib/graph-revision-v1.mjs';

const workspaceRevision = 'sha256:workspace-r1';
const checksum = (letter) => letter.repeat(64);
const kernels = [
  { relationshipId: 'rel:b', checksum: checksum('b'), authority: 'FEATURE_INTELLIGENCE', producerRevision: 'feature:r1', workspaceRevision },
  { relationshipId: 'rel:a', checksum: checksum('a'), authority: 'KAG_TAXONOMY', producerRevision: 'taxonomy:r1', workspaceRevision },
];

const first = buildGraphRevisionV1({ workspaceRevision, kernels });
const reversed = buildGraphRevisionV1({ workspaceRevision, kernels: [...kernels].reverse() });
assert.equal(first.graphRevision, reversed.graphRevision);
assert.equal(first.relationshipSetChecksum, reversed.relationshipSetChecksum);
assert.notEqual(first.graphRevision, buildGraphRevisionV1({ workspaceRevision, kernels: [...kernels, {
  relationshipId: 'rel:c', checksum: checksum('c'), authority: 'FEATURE_INTELLIGENCE', producerRevision: 'feature:r1', workspaceRevision,
}] }).graphRevision);
const secondWorkspace = 'sha256:workspace-r2';
assert.notEqual(first.graphRevision, buildGraphRevisionV1({
  workspaceRevision: secondWorkspace,
  kernels: kernels.map((kernel) => ({ ...kernel, workspaceRevision: secondWorkspace })),
}).graphRevision);
assert.throws(() => buildGraphRevisionV1({ workspaceRevision, kernels: [{ ...kernels[0], workspaceRevision: 'sha256:old' }] }), /WORKSPACE_MISMATCH/);
assert.throws(() => buildGraphRevisionV1({ workspaceRevision, kernels: [{ ...kernels[0], checksum: 'legacy' }] }), /CHECKSUM_REQUIRED/);

console.log(JSON.stringify({
  schema: 'atlas.graph-revision-proof.v1',
  status: 'PROVEN',
  checks: {
    reversedInputInvariant: true,
    relationshipAdditionChangesRevision: true,
    workspaceChangeChangesRevision: true,
    mixedWorkspaceRejected: true,
    missingChecksumRejected: true,
  },
  graphRevision: first.graphRevision,
  relationshipSetChecksum: first.relationshipSetChecksum,
  relationshipCount: first.relationshipCount,
  canonicalAuthority: false,
}, null, 2));
