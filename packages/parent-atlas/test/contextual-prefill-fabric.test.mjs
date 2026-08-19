import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHydrationManifest,
  buildInstructionAtom,
  buildPrefillCacheEntry,
  canReusePrefillCache,
  compileInstructionSet,
  contextualFabricChecksum,
  deduplicateContextFragments,
  derivedFeatureRecipeSchema,
  featurePlaneSchema,
  ontologyCollectionProjectionSchema,
  riemannianTopologyProjectionSchema,
} from '../dist/core/contextual-prefill-fabric.js';

const H = (value) => contextualFabricChecksum(value);

test('RDF lists preserve order while role maps preserve named roles', () => {
  const list = ontologyCollectionProjectionSchema.parse({
    collection_id: 'list:1',
    collection_revision: 'r1',
    kind: 'RDF_LIST',
    source_ref: 'docs/.okf/example.md',
    source_revision: 'src-r1',
    member_ids: ['a', 'b', 'c'],
    ordered: true,
  });
  assert.deepEqual(list.member_ids, ['a', 'b', 'c']);

  const roleMap = ontologyCollectionProjectionSchema.parse({
    collection_id: 'roles:1',
    collection_revision: 'r1',
    kind: 'ROLE_MAP',
    source_ref: 'src/lib/permit.ts',
    source_revision: 'src-r1',
    member_ids: ['owner', 'permit', 'update'],
    member_roles: ['actor', 'resource', 'operation'],
    ordered: false,
  });
  assert.deepEqual(roleMap.member_roles, ['actor', 'resource', 'operation']);

  assert.throws(() => ontologyCollectionProjectionSchema.parse({
    collection_id: 'bad', collection_revision: 'r1', kind: 'RDF_LIST',
    source_ref: 'x', source_revision: 'r1', member_ids: ['a'], ordered: false,
  }));
});

test('stochastic derived recipes require an explicit seed', () => {
  assert.throws(() => derivedFeatureRecipeSchema.parse({
    recipe_id: 'node2vec:1', recipe_revision: 'r1', kind: 'NODE2VEC', executor: 'CUGRAPH',
    row_identity_checksum: H('rows'), source_snapshot_revisions: ['s1'], input_artifact_ids: ['graph'],
    output_artifact_id: 'n2v', deterministic_required: true,
  }));

  const recipe = derivedFeatureRecipeSchema.parse({
    recipe_id: 'node2vec:1', recipe_revision: 'r1', kind: 'NODE2VEC', executor: 'CUGRAPH',
    row_identity_checksum: H('rows'), source_snapshot_revisions: ['s1'], input_artifact_ids: ['graph'],
    output_artifact_id: 'n2v', deterministic_required: true, random_seed: 42,
    parameters: { p: 1, q: 0.5, max_depth: 8 },
  });
  assert.equal(recipe.random_seed, 42);
  assert.equal(recipe.canonical_authority, false);
});

test('bit-packed feature planes preserve binary semantics explicitly', () => {
  const plane = featurePlaneSchema.parse({
    plane_id: 'mask:1', plane_revision: 'r1', row_identity_checksum: H('rows'), row_count: 4,
    dimensions: 64, layout: 'BITPACKED', dtype: 'uint8', semantics: 'BINARY_01',
    logical_checksum: H('logical-mask'), transport_checksum: H('packed-bytes'), bit_order: 'LITTLE',
    source_snapshot_revision: 's1',
  });
  assert.equal(plane.bit_order, 'LITTLE');
  assert.notEqual(plane.logical_checksum, plane.transport_checksum);

  assert.throws(() => featurePlaneSchema.parse({
    ...plane,
    dtype: 'float32',
  }));
});

test('S3 topology is a 3D manifold embedded in R4 and mutations create revisions', () => {
  const projection = riemannianTopologyProjectionSchema.parse({
    topology_id: 'quat-topology', topology_revision: 'r12', source_snapshot_revision: 's4',
    row_identity_checksum: H('rows'), manifold: 'SPHERE_S3', ambient_dimension: 4,
    intrinsic_dimension: 3, coordinate_checksum: H('coords'), metric_revision: 'metric-r2',
  });
  assert.equal(projection.mutation_semantics, 'IMMUTABLE_SNAPSHOT_NEW_REVISION_ON_CHANGE');
  assert.equal(projection.canonical_authority, false);

  assert.throws(() => riemannianTopologyProjectionSchema.parse({
    ...projection,
    intrinsic_dimension: 4,
  }));
});

test('hydration identity changes when source evidence changes', () => {
  const base = {
    hydration_revision: 'h1', request_id: 'request:1', workspace_revision: 'w1', source_snapshot_revision: 's1',
    total_bytes: 128, producer_revision: 'producer:1',
  };
  const first = buildHydrationManifest({
    ...base,
    refs: [{
      hydration_id: 'ref:1', artifact_id: 'source:1', artifact_revision: 'a1', artifact_checksum: H('v1'),
      kind: 'SOURCE_SPAN', canonical_id: 'symbol:1', source_ref: 'src/lib/a.ts', source_revision: 'src-r1',
      tree_node_id: 'T10', byte_start: 10, byte_end: 30,
    }],
  });
  const second = buildHydrationManifest({
    ...base,
    hydration_revision: 'h2', source_snapshot_revision: 's2',
    refs: [{
      hydration_id: 'ref:1', artifact_id: 'source:1', artifact_revision: 'a2', artifact_checksum: H('v2'),
      kind: 'SOURCE_SPAN', canonical_id: 'symbol:1', source_ref: 'src/lib/a.ts', source_revision: 'src-r2',
      tree_node_id: 'T10', byte_start: 10, byte_end: 30,
    }],
  });
  assert.notEqual(first.manifest_checksum, second.manifest_checksum);
});

test('instruction compiler removes exact repeated instructions deterministically', () => {
  const a = buildInstructionAtom({
    instruction_id: 'i1', instruction_revision: 'r1', category: 'RETRIEVAL_POLICY',
    text: 'Do not repeat retrieved evidence.', priority: 10, repeat_policy: 'ONCE_PER_PREFILL',
    dependency_checksums: [],
  });
  const b = buildInstructionAtom({
    instruction_id: 'i2', instruction_revision: 'r1', category: 'RETRIEVAL_POLICY',
    text: '  Do not   repeat retrieved evidence. ', priority: 20, repeat_policy: 'ONCE_PER_PREFILL',
    dependency_checksums: [],
  });
  const compiled = compileInstructionSet([b, a], 'compiler:r1');
  assert.equal(compiled.atoms.length, 1);
  assert.deepEqual(compiled.dropped_duplicate_instruction_ids, ['i2']);
});

test('context fragments can deduplicate by exact content or source coordinate', () => {
  const hash = H('same evidence');
  const fragments = deduplicateContextFragments([
    { fragment_id: 'a', kind: 'EVIDENCE', logical_checksum: hash, source_ref: 'src/a.ts', source_revision: 'r1', tree_node_id: 'T1', token_estimate: 10, repeat_policy: 'DEDUP_EXACT', canonical_authority: false },
    { fragment_id: 'b', kind: 'EVIDENCE', logical_checksum: hash, source_ref: 'src/b.ts', source_revision: 'r1', tree_node_id: 'T2', token_estimate: 10, repeat_policy: 'DEDUP_EXACT', canonical_authority: false },
    { fragment_id: 'c', kind: 'EVIDENCE', logical_checksum: H('other'), source_ref: 'src/a.ts', source_revision: 'r1', tree_node_id: 'T1', token_estimate: 10, repeat_policy: 'DEDUP_SOURCE_COORDINATE', canonical_authority: false },
    { fragment_id: 'd', kind: 'EVIDENCE', logical_checksum: H('other'), source_ref: 'src/a.ts', source_revision: 'r1', tree_node_id: 'T1', token_estimate: 10, repeat_policy: 'DEDUP_SOURCE_COORDINATE', canonical_authority: false },
  ]);
  assert.deepEqual(fragments.map((item) => item.fragment_id), ['a', 'c']);
});

test('prefill cache is reusable only for an identical compiled dependency identity', () => {
  const input = {
    prefill_identity_checksum: H('prefill'), instruction_set_checksum: H('instructions'),
    hydration_manifest_checksum: H('hydration'), feature_alignment_checksum: H('features'),
    context_manifest_checksum: H('context'), compiler_revision: 'compiler:r1',
  };
  const entry = buildPrefillCacheEntry({
    ...input,
    compiled_prefill_artifact_id: 'prefill-artifact:1', compiled_prefill_checksum: H('compiled'), status: 'VALID',
  });
  assert.equal(canReusePrefillCache(entry, input), true);
  assert.equal(canReusePrefillCache(entry, { ...input, hydration_manifest_checksum: H('changed') }), false);
  assert.equal(canReusePrefillCache({ ...entry, status: 'STALE' }, input), false);
});
