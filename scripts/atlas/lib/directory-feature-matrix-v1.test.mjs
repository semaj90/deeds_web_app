import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDirectoryFeatureInputLineageV1, buildDirectoryFeatureMatrixV1 } from './directory-feature-matrix-v1.mjs';

const directoryRows = [
  { directoryPath: 'src', profileLanguageCountsJson: '{"typescript":3}', roleCountsJson: '{"WORKTREE_FILE":3}' },
  { directoryPath: '.', profileLanguageCountsJson: '{"typescript":3,"UNMAPPED":1}', roleCountsJson: '{"WORKTREE_FILE":3,"DEPENDENCY_TREE":1}' },
];
const packageRows = [
  { directoryPath: 'src', ecosystem: 'npm', packageName: 'zod', subtreeReferenceCount: 2 },
];

const lineage = {
  packageManifest: {
    receiptSha256: 'package-receipt',
    referencesArtifactSha256: 'package-reference-artifact',
    sourcePathArtifactSha256: 'path-artifact',
    sourceDirectorySnapshotReceiptSha256: 'snapshot-receipt',
  },
  packageRowsManifest: {
    packageReferencesReceiptSha256: 'package-receipt',
    directoryRollupReceiptSha256: 'rollup-receipt',
    packageReferencesArtifactSha256: 'package-reference-artifact',
    directoryArtifactSha256: 'directory-artifact',
  },
  rollupManifest: {
    receiptSha256: 'rollup-receipt',
    sourceArrowSha256: 'path-artifact',
    pathManifestSha256: 'path-artifact',
    sourcePathManifestReceiptSha256: 'snapshot-receipt',
    sourcePathManifestReceipt: 'snapshot-manifest.json',
    sourceInventorySha256: 'inventory',
    directoriesArtifactSha256: 'directory-artifact',
    directories: 2,
  },
};

test('requires package references, package rows, and rollup to share exact source snapshot artifacts', () => {
  assert.equal(assertDirectoryFeatureInputLineageV1(lineage), true);
  assert.throws(() => assertDirectoryFeatureInputLineageV1({
    ...lineage,
    rollupManifest: { ...lineage.rollupManifest, sourceArrowSha256: 'stale-path-artifact' },
  }), /FEATURE_INPUT_SNAPSHOT_MISMATCH/);
  assert.throws(() => assertDirectoryFeatureInputLineageV1({
    ...lineage,
    rollupManifest: { ...lineage.rollupManifest, sourcePathManifestReceiptSha256: 'stale-snapshot-receipt' },
  }), /FEATURE_INPUT_SNAPSHOT_MISMATCH/);
  assert.throws(() => assertDirectoryFeatureInputLineageV1({
    ...lineage,
    packageRowsManifest: { ...lineage.packageRowsManifest, directoryArtifactSha256: 'stale-directory-artifact' },
  }), /FEATURE_INPUT_SNAPSHOT_MISMATCH/);
});

test('keeps inferred domain proposals separate and rejects stale summary lineage', () => {
  const result = buildDirectoryFeatureMatrixV1({
    directories: directoryRows,
    packageRows,
    domainCandidates: [
      { relativePath: 'src', candidateGroupId: 'frontend', status: 'PROPOSAL_ONLY', score: 3 },
      { relativePath: 'src', candidateGroupId: 'frontend', status: 'PROPOSAL_ONLY', score: 2 },
      { relativePath: '.', candidateGroupId: '', status: 'UNCLASSIFIED_NO_DOMAIN_SIGNAL', score: 0 },
    ],
  });
  const proposal = result.featureRows.find(row => row.featureKey === 'domain-proposal:frontend');
  assert.equal(proposal.evidenceKind, 'ADVISORY_DOMAIN_PROPOSAL_SCORE');
  assert.equal(result.sparseRows.find(row => row.entityOrdinal === 1 && row.featureOrdinal === proposal.ordinal).value, 3);
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows, domainCandidates: [
    { relativePath: 'missing', candidateGroupId: 'frontend', status: 'PROPOSAL_ONLY', score: 3 },
  ] }), /DOMAIN_CANDIDATE_DIRECTORY_NOT_IN_ROLLUP/);
  const summaryManifest = {
    schema: 'atlas.directory-metadata-summaries.v1', canonicalAuthority: false, writesPerformed: false,
    sourceInventorySha256: 'inventory', directoryCount: 2, summaryCount: 2, artifactSha256: 'summary-artifact',
    inputBindings: { directoryRollupArtifactSha256: 'directory-artifact' },
  };
  const domainManifest = {
    schema: 'atlas.directory-domain-candidates-manifest.v1', status: 'ADVISORY_PROPOSALS_ONLY',
    canonicalAuthority: false, productionStoreWrites: false,
    inputs: { directorySummarySha256: 'summary-artifact', directorySummaryManifestSha256: 'summary-manifest' },
    directoryCount: 2, candidateRowCount: 2, outputReadbackRows: 2,
  };
  assert.equal(assertDirectoryFeatureInputLineageV1({ ...lineage, summaryManifest, domainManifest,
    summaryManifestSha256: 'summary-manifest' }), true);
  assert.throws(() => assertDirectoryFeatureInputLineageV1({ ...lineage, summaryManifest,
    domainManifest: { ...domainManifest, inputs: { ...domainManifest.inputs, directorySummaryManifestSha256: 'stale' } },
    summaryManifestSha256: 'summary-manifest',
  }), /DOMAIN_FEATURE_INPUT_SNAPSHOT_MISMATCH/);
});

test('admits only snapshot-aligned declared owner paths as a separate advisory feature', () => {
  const runtimeOwnerManifest = {
    schema: 'atlas.runtime-owner-directory-candidates.v1', status: 'DECLARED_OWNER_PATHS_ADVISORY_ONLY',
    canonicalAuthority: false, executionProven: false, sourceRevisionQualified: false, productionStoreWrites: false,
    inventorySha256: 'inventory', pathArtifactSha256: 'path-artifact', rollupReceiptSha256: 'rollup-receipt',
    directoryArtifactSha256: 'directory-artifact',
  };
  assert.equal(assertDirectoryFeatureInputLineageV1({ ...lineage, runtimeOwnerManifest }), true);
  assert.throws(() => assertDirectoryFeatureInputLineageV1({ ...lineage,
    runtimeOwnerManifest: { ...runtimeOwnerManifest, inventorySha256: 'stale' },
  }), /RUNTIME_OWNER_FEATURE_INPUT_SNAPSHOT_MISMATCH/);
  const result = buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows, runtimeOwnerCandidates: [{
    capabilityId: 'graph-analysis', parentDirectoryPath: 'src', evidenceKind: 'DECLARED_RUNTIME_OWNER_PATH_CANDIDATE',
    executionProven: false, sourceRevisionQualified: false,
  }] });
  assert.deepEqual(result.featureRows.filter(row => row.evidenceKind === 'ADVISORY_DECLARED_RUNTIME_OWNER_PATH').map(row => row.featureKey),
    ['runtime-owner-candidate:graph-analysis']);
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows, runtimeOwnerCandidates: [{
    capabilityId: 'graph-analysis', parentDirectoryPath: 'src', evidenceKind: 'DECLARED_RUNTIME_OWNER_PATH_CANDIDATE',
    executionProven: true, sourceRevisionQualified: false,
  }] }), /RUNTIME_OWNER_CANDIDATE_INVALID/);
});

test('adds source-class inventory counts as a separate non-semantic feature family', () => {
  const sourceClassCounts = [
    { directoryPath: '.', sourceClass: 'FIRST_PARTY_SOURCE', fileCount: 12 },
    { directoryPath: 'src', sourceClass: 'FIRST_PARTY_SOURCE', fileCount: 8 },
    { directoryPath: '.', sourceClass: 'EXTERNAL_DEPENDENCY', fileCount: 4 },
  ];
  const result = buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows, sourceClassCounts });
  const sourceFeatures = result.featureRows.filter(row => row.featureKey.startsWith('source-class:'));
  assert.deepEqual(sourceFeatures.map(row => [row.featureKey, row.evidenceKind]), [
    ['source-class:EXTERNAL_DEPENDENCY', 'PATH_SOURCE_CLASS_INVENTORY_COUNT'],
    ['source-class:FIRST_PARTY_SOURCE', 'PATH_SOURCE_CLASS_INVENTORY_COUNT'],
  ]);
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows,
    sourceClassCounts: [{ directoryPath: 'missing', sourceClass: 'FIRST_PARTY_SOURCE', fileCount: 1 }] }), /SOURCE_CLASS_DIRECTORY_NOT_IN_ROLLUP/);
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows,
    sourceClassCounts: [{ directoryPath: 'src', sourceClass: 'UNTRUSTED', fileCount: 1 }] }), /SOURCE_CLASS_COUNT_ROW_INVALID/);
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows,
    sourceClassCounts: [sourceClassCounts[1], sourceClassCounts[1]] }), /SOURCE_CLASS_COUNT_DUPLICATE/);
});

test('requires source-class counts to share the directory rollup inventory and path snapshot', () => {
  const sourceClassManifest = {
    schema: 'atlas.source-class-split.receipt.v1',
    sourceClassSplitVerdict: 'PASS_CLASSIFICATION_ONLY_WITH_LINEAGE_EXCEPTIONS',
    canonicalAuthority: false,
    writesPerformed: false,
    inputs: { inventorySha256Recorded: 'inventory', snapshotManifestPath: 'snapshot-manifest.json', pathsSha256: 'path-artifact' },
    outputs: { classifiedRows: { rows: 4 } },
  };
  assert.equal(assertDirectoryFeatureInputLineageV1({ ...lineage, sourceClassManifest }), true);
  assert.throws(() => assertDirectoryFeatureInputLineageV1({ ...lineage,
    sourceClassManifest: { ...sourceClassManifest, inputs: { ...sourceClassManifest.inputs, snapshotManifestPath: 'stale' } },
  }), /SOURCE_CLASS_FEATURE_INPUT_SNAPSHOT_MISMATCH/);
});

test('builds deterministic sparse ordinals and keeps evidence families distinct', () => {
  const first = buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows });
  const second = buildDirectoryFeatureMatrixV1({ directories: [...directoryRows].reverse(), packageRows });
  assert.deepEqual(first, second);
  assert.deepEqual(first.directoryRows, [{ ordinal: 0, directoryPath: '.' }, { ordinal: 1, directoryPath: 'src' }]);
  assert.deepEqual(first.featureRows.map(row => [row.featureKey, row.evidenceKind]), [
    ['language-profile:UNMAPPED', 'PROFILE_INVENTORY_COUNT'],
    ['language-profile:typescript', 'PROFILE_INVENTORY_COUNT'],
    ['package:npm:zod', 'ADVISORY_IMPORT_REFERENCE_COUNT'],
    ['path-role:DEPENDENCY_TREE', 'PATH_INVENTORY_COUNT'],
    ['path-role:WORKTREE_FILE', 'PATH_INVENTORY_COUNT'],
  ]);
  assert.equal(first.sparseRows.length, 7);
  assert.ok(first.sparseRows.every(row => row.value > 0));
});

test('rejects duplicate directory ordinals and missing package directories', () => {
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: [...directoryRows, directoryRows[0]], packageRows }), /DIRECTORY_ORDINAL_INPUT_INVALID/);
  assert.throws(() => buildDirectoryFeatureMatrixV1({ directories: directoryRows, packageRows: [{ ...packageRows[0], directoryPath: 'missing' }] }), /PACKAGE_DIRECTORY_NOT_IN_ROLLUP/);
});

test('rejects malformed profile counts and negative values', () => {
  assert.throws(() => buildDirectoryFeatureMatrixV1({
    directories: [{ ...directoryRows[0], profileLanguageCountsJson: '{bad' }, directoryRows[1]], packageRows: [],
  }), /DIRECTORY_COUNT_JSON_INVALID/);
  assert.throws(() => buildDirectoryFeatureMatrixV1({
    directories: [{ ...directoryRows[0], profileLanguageCountsJson: '{"typescript":-1}' }, directoryRows[1]], packageRows: [],
  }), /DIRECTORY_COUNT_VALUE_INVALID/);
});
