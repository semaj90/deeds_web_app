import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildGraphRevisionV1 } from './lib/graph-revision-v1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const OUT = resolve(REPO_ROOT, 'docs/reports/graph-revision-v1-determinism.json');

function sha(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function kernel(overrides = {}) {
  const base = {
    schema: 'atlas.relationship-kernel.v1',
    relationshipId: 'rel:1',
    authority: 'FEATURE_INTELLIGENCE',
    relationType: 'CALLS',
    participants: [
      {
        canonicalId: 'symbol:A',
        role: 'caller',
        ordinal: 0,
        entityType: 'function',
        entityRevision: 'src:A',
        sourceRef: 'src/a.ts',
      },
      {
        canonicalId: 'symbol:B',
        role: 'callee',
        ordinal: 1,
        entityType: 'function',
        entityRevision: 'src:B',
        sourceRef: 'src/b.ts',
      },
    ],
    evidenceRefs: ['evidence:1'],
    sourceRef: 'src/a.ts',
    sourceRevision: 'source:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    workspaceRevision: 'workspace:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    graphRevision: null,
    relationshipRevision: 'relationship:v1',
    producerRevision: 'producer:v1',
  };
  const payload = { ...base, ...overrides };
  if (!overrides.checksum) {
    const checksumPayload = { ...payload };
    delete checksumPayload.checksum;
    payload.checksum = sha(checksumPayload);
  }
  return payload;
}

const workspaceRevision =
  'workspace:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const common = {
  workspaceRevision,
  relationshipPolicyRevision: 'relationship-policy:v1',
  projectionSchemaRevision: 'incidence-projection:v1',
};

const k1 = kernel();
const k2 = kernel({ relationshipId: 'rel:2', relationType: 'IMPORTS' });
const h1 = buildGraphRevisionV1({ ...common, kernels: [k1, k2] });
const reversed = buildGraphRevisionV1({ ...common, kernels: [k2, k1] });
assert.equal(reversed.graphRevision, h1.graphRevision);

const randomPermutation = buildGraphRevisionV1({ ...common, kernels: [k2, k1] });
assert.equal(randomPermutation.graphRevision, h1.graphRevision);

const changed = kernel({ relationshipId: 'rel:1', relationType: 'REFERENCES' });
const h2 = buildGraphRevisionV1({ ...common, kernels: [changed, k2] });
assert.notEqual(h2.graphRevision, h1.graphRevision);

const added = kernel({ relationshipId: 'rel:3', relationType: 'EXTENDS' });
const h3 = buildGraphRevisionV1({ ...common, kernels: [k1, k2, added] });
assert.notEqual(h3.graphRevision, h1.graphRevision);

const h4 = buildGraphRevisionV1({ ...common, kernels: [k1] });
assert.notEqual(h4.graphRevision, h1.graphRevision);

const changedWorkspace = 'workspace:sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const k1OtherWs = kernel({ workspaceRevision: changedWorkspace });
const k2OtherWs = kernel({ relationshipId: 'rel:2', relationType: 'IMPORTS', workspaceRevision: changedWorkspace });
const h5 = buildGraphRevisionV1({
  ...common,
  workspaceRevision: changedWorkspace,
  kernels: [k1OtherWs, k2OtherWs],
});
assert.notEqual(h5.graphRevision, h1.graphRevision);

const h6 = buildGraphRevisionV1({
  ...common,
  relationshipPolicyRevision: 'relationship-policy:v2',
  kernels: [k1, k2],
});
assert.notEqual(h6.graphRevision, h1.graphRevision);

const h7 = buildGraphRevisionV1({
  ...common,
  projectionSchemaRevision: 'incidence-projection:v2',
  kernels: [k1, k2],
});
assert.notEqual(h7.graphRevision, h1.graphRevision);

assert.throws(
  () => buildGraphRevisionV1({ ...common, kernels: [k1, k1OtherWs] }),
  /GRAPH_REVISION_MIXED_WORKSPACE/,
);

assert.throws(
  () => buildGraphRevisionV1({
    ...common,
    kernels: [{ ...k1, relationshipRevision: null }],
  }),
  /GRAPH_REVISION_RELATIONSHIP_REVISION_REQUIRED/,
);

assert.throws(
  () => buildGraphRevisionV1({
    ...common,
    kernels: [{ ...k1, graphRevision: 'graph:legacy' }],
  }),
  /GRAPH_REVISION_KERNEL_GRAPH_AUTHORITY_REJECTED/,
);

const sameIdDifferent = kernel({ relationshipId: 'rel:1', relationType: 'PART_OF' });
assert.throws(
  () => buildGraphRevisionV1({ ...common, kernels: [k1, sameIdDifferent] }),
  /GRAPH_REVISION_DUPLICATE_RELATIONSHIP_ID_DIFFERENT_CHECKSUM/,
);

const sameChecksumOtherIdentity = {
  ...kernel({ relationshipId: 'rel:9' }),
  checksum: k1.checksum,
};
assert.throws(
  () => buildGraphRevisionV1({ ...common, kernels: [k1, sameChecksumOtherIdentity] }),
  /GRAPH_REVISION_DUPLICATE_CHECKSUM_INCOMPATIBLE_IDENTITY/,
);

const empty = buildGraphRevisionV1({ ...common, kernels: [] });
assert.equal(empty.relationshipCount, 0);

const report = {
  schema: 'atlas.graph-revision-v1.determinism-proof.v1',
  status: 'PROVEN_BOUNDED',
  permutationInvariant: true,
  mutationSensitive: true,
  workspaceSensitive: true,
  policySensitive: true,
  projectionSchemaSensitive: true,
  failClosedMixedWorkspace: true,
  failClosedMissingRelationshipRevision: true,
  failClosedKernelGraphAuthority: true,
  failClosedDuplicateIdentityConflict: true,
  emptyRelationshipSetSupported: true,
  baselineGraphRevision: h1.graphRevision,
  emptyGraphRevision: empty.graphRevision,
  writes: {
    postgres: false,
    qdrant: false,
    neo4j: false,
    valkey: false,
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
