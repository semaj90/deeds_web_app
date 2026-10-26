const byteOrder = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));

function addFeature(features, entityPath, featureKey, value, evidenceKind) {
  if (!Number.isInteger(value) || value <= 0) return;
  const key = `${entityPath}\u0000${featureKey}`;
  const current = features.get(key);
  if (current) {
    current.value += value;
    if (current.evidenceKind !== evidenceKind) throw new Error('FEATURE_EVIDENCE_KIND_CONFLICT');
  } else {
    features.set(key, { entityPath, featureKey, value, evidenceKind });
  }
}

export function assertDirectoryFeatureInputLineageV1({ packageManifest, packageRowsManifest, rollupManifest,
  summaryManifest = null, domainManifest = null, summaryManifestSha256 = null, runtimeOwnerManifest = null,
  sourceClassManifest = null }) {
  if (!packageManifest || !packageRowsManifest || !rollupManifest) throw new Error('FEATURE_LINEAGE_INPUT_INVALID');
  if (packageRowsManifest.packageReferencesReceiptSha256 !== packageManifest.receiptSha256
    || packageRowsManifest.directoryRollupReceiptSha256 !== rollupManifest.receiptSha256) {
    throw new Error('FEATURE_INPUT_RECEIPT_MISMATCH');
  }
  if (packageManifest.sourcePathArtifactSha256 !== rollupManifest.sourceArrowSha256
    || packageManifest.sourceDirectorySnapshotReceiptSha256 !== rollupManifest.sourcePathManifestReceiptSha256
    || packageRowsManifest.packageReferencesArtifactSha256 !== packageManifest.referencesArtifactSha256
    || packageRowsManifest.directoryArtifactSha256 !== rollupManifest.directoriesArtifactSha256) {
    throw new Error('FEATURE_INPUT_SNAPSHOT_MISMATCH');
  }
  if (Boolean(summaryManifest) !== Boolean(domainManifest)) throw new Error('DOMAIN_FEATURE_INPUT_PAIR_REQUIRED');
  if (domainManifest && (summaryManifest.schema !== 'atlas.directory-metadata-summaries.v1'
    || summaryManifest.canonicalAuthority !== false || summaryManifest.writesPerformed !== false
    || summaryManifest.sourceInventorySha256 !== rollupManifest.sourceInventorySha256
    || summaryManifest.directoryCount !== rollupManifest.directories
    || summaryManifest.summaryCount !== rollupManifest.directories
    || summaryManifest.inputBindings?.directoryRollupArtifactSha256 !== rollupManifest.directoriesArtifactSha256
    || domainManifest.schema !== 'atlas.directory-domain-candidates-manifest.v1'
    || domainManifest.status !== 'ADVISORY_PROPOSALS_ONLY' || domainManifest.canonicalAuthority !== false
    || domainManifest.productionStoreWrites !== false
    || domainManifest.inputs?.directorySummarySha256 !== summaryManifest.artifactSha256
    || domainManifest.inputs?.directorySummaryManifestSha256 !== summaryManifestSha256
    || domainManifest.directoryCount !== rollupManifest.directories
    || domainManifest.outputReadbackRows !== domainManifest.candidateRowCount)) {
    throw new Error('DOMAIN_FEATURE_INPUT_SNAPSHOT_MISMATCH');
  }
  if (runtimeOwnerManifest && (runtimeOwnerManifest.schema !== 'atlas.runtime-owner-directory-candidates.v1'
    || runtimeOwnerManifest.status !== 'DECLARED_OWNER_PATHS_ADVISORY_ONLY'
    || runtimeOwnerManifest.canonicalAuthority !== false || runtimeOwnerManifest.executionProven !== false
    || runtimeOwnerManifest.sourceRevisionQualified !== false || runtimeOwnerManifest.productionStoreWrites !== false
    || runtimeOwnerManifest.inventorySha256 !== rollupManifest.sourceInventorySha256
    || runtimeOwnerManifest.pathArtifactSha256 !== rollupManifest.sourceArrowSha256
    || runtimeOwnerManifest.rollupReceiptSha256 !== rollupManifest.receiptSha256
    || runtimeOwnerManifest.directoryArtifactSha256 !== rollupManifest.directoriesArtifactSha256)) {
    throw new Error('RUNTIME_OWNER_FEATURE_INPUT_SNAPSHOT_MISMATCH');
  }
  if (sourceClassManifest && (sourceClassManifest.schema !== 'atlas.source-class-split.receipt.v1'
    || sourceClassManifest.sourceClassSplitVerdict !== 'PASS_CLASSIFICATION_ONLY_WITH_LINEAGE_EXCEPTIONS'
    || sourceClassManifest.canonicalAuthority !== false || sourceClassManifest.writesPerformed !== false
    || sourceClassManifest.inputs?.inventorySha256Recorded !== rollupManifest.sourceInventorySha256
    || sourceClassManifest.inputs?.snapshotManifestPath !== rollupManifest.sourcePathManifestReceipt
    || !Number.isSafeInteger(sourceClassManifest.outputs?.classifiedRows?.rows))) {
    throw new Error('SOURCE_CLASS_FEATURE_INPUT_SNAPSHOT_MISMATCH');
  }
  return true;
}

function addJsonCountFeatures(features, entityPath, json, prefix, evidenceKind) {
  let counts;
  try {
    counts = JSON.parse(json || '{}');
  } catch {
    throw new Error('DIRECTORY_COUNT_JSON_INVALID');
  }
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new Error('DIRECTORY_COUNT_JSON_INVALID');
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('DIRECTORY_COUNT_VALUE_INVALID');
    addFeature(features, entityPath, `${prefix}:${name}`, value, evidenceKind);
  }
}

export function addDirectorySourceClassFeaturesV1(features, directorySet, sourceClassCounts) {
  if (!(features instanceof Map) || !(directorySet instanceof Set) || !Array.isArray(sourceClassCounts)) {
    throw new TypeError('SOURCE_CLASS_FEATURE_INPUT_INVALID');
  }
  const allowedClasses = new Set([
    'FIRST_PARTY_SOURCE', 'OPENSPEC_REQUIREMENTS', 'EXTERNAL_DEPENDENCY', 'GENERATED_SOURCE',
    'TELEMETRY_REPORT', 'MODEL_ARTIFACT', 'BINARY_ASSET', 'ENVIRONMENT_CACHE', 'UNKNOWN',
  ]);
  const seen = new Set();
  for (const row of sourceClassCounts) {
    if (!row || !directorySet.has(row.directoryPath)) throw new Error('SOURCE_CLASS_DIRECTORY_NOT_IN_ROLLUP');
    if (!allowedClasses.has(row.sourceClass) || !Number.isSafeInteger(row.fileCount) || row.fileCount <= 0) {
      throw new Error('SOURCE_CLASS_COUNT_ROW_INVALID');
    }
    const key = `${row.directoryPath}\u0000${row.sourceClass}`;
    if (seen.has(key)) throw new Error('SOURCE_CLASS_COUNT_DUPLICATE');
    seen.add(key);
    addFeature(features, row.directoryPath, `source-class:${row.sourceClass}`, row.fileCount,
      'PATH_SOURCE_CLASS_INVENTORY_COUNT');
  }
}

export function buildDirectoryFeatureMatrixV1({ directories, packageRows, domainCandidates = [], runtimeOwnerCandidates = [], sourceClassCounts = [] }) {
  if (!Array.isArray(directories) || !Array.isArray(packageRows) || !Array.isArray(domainCandidates)
    || !Array.isArray(runtimeOwnerCandidates) || !Array.isArray(sourceClassCounts)) {
    throw new TypeError('DIRECTORY_FEATURE_INPUT_INVALID');
  }
  const directoryPaths = directories.map(row => row.directoryPath).sort(byteOrder);
  if (new Set(directoryPaths).size !== directoryPaths.length || !directoryPaths.includes('.')) {
    throw new Error('DIRECTORY_ORDINAL_INPUT_INVALID');
  }
  const directorySet = new Set(directoryPaths);
  const features = new Map();
  for (const directory of directories) {
    addJsonCountFeatures(features, directory.directoryPath, directory.profileLanguageCountsJson,
      'language-profile', 'PROFILE_INVENTORY_COUNT');
    addJsonCountFeatures(features, directory.directoryPath, directory.roleCountsJson,
      'path-role', 'PATH_INVENTORY_COUNT');
  }
  addDirectorySourceClassFeaturesV1(features, directorySet, sourceClassCounts);
  for (const packageRow of packageRows) {
    if (!directorySet.has(packageRow.directoryPath)) throw new Error('PACKAGE_DIRECTORY_NOT_IN_ROLLUP');
    if (!Number.isSafeInteger(packageRow.subtreeReferenceCount) || packageRow.subtreeReferenceCount <= 0) {
      throw new Error('PACKAGE_COUNT_INVALID');
    }
    addFeature(features, packageRow.directoryPath,
      `package:${packageRow.ecosystem}:${packageRow.packageName}`,
      packageRow.subtreeReferenceCount, 'ADVISORY_IMPORT_REFERENCE_COUNT');
  }
  const domainScores = new Map();
  for (const candidate of domainCandidates) {
    if (!directorySet.has(candidate.relativePath)) throw new Error('DOMAIN_CANDIDATE_DIRECTORY_NOT_IN_ROLLUP');
    if (candidate.status === 'UNCLASSIFIED_NO_DOMAIN_SIGNAL') continue;
    if (candidate.status !== 'PROPOSAL_ONLY' || typeof candidate.candidateGroupId !== 'string'
      || !candidate.candidateGroupId || !Number.isSafeInteger(candidate.score) || candidate.score <= 0) {
      throw new Error('DOMAIN_CANDIDATE_ROW_INVALID');
    }
    const key = `${candidate.relativePath}\u0000${candidate.candidateGroupId}`;
    domainScores.set(key, Math.max(domainScores.get(key) ?? 0, candidate.score));
  }
  for (const [key, score] of domainScores) {
    const separator = key.indexOf('\u0000');
    addFeature(features, key.slice(0, separator), `domain-proposal:${key.slice(separator + 1)}`,
      score, 'ADVISORY_DOMAIN_PROPOSAL_SCORE');
  }
  const runtimeKeys = new Set();
  for (const candidate of runtimeOwnerCandidates) {
    if (!directorySet.has(candidate.parentDirectoryPath)) throw new Error('RUNTIME_OWNER_DIRECTORY_NOT_IN_ROLLUP');
    if (candidate.evidenceKind !== 'DECLARED_RUNTIME_OWNER_PATH_CANDIDATE' || candidate.executionProven !== false
      || candidate.sourceRevisionQualified !== false || typeof candidate.capabilityId !== 'string' || !candidate.capabilityId) {
      throw new Error('RUNTIME_OWNER_CANDIDATE_INVALID');
    }
    runtimeKeys.add(`${candidate.parentDirectoryPath}\u0000${candidate.capabilityId}`);
  }
  for (const key of runtimeKeys) {
    const separator = key.indexOf('\u0000');
    addFeature(features, key.slice(0, separator), `runtime-owner-candidate:${key.slice(separator + 1)}`,
      1, 'ADVISORY_DECLARED_RUNTIME_OWNER_PATH');
  }
  const featureKeys = [...new Set([...features.values()].map(row => row.featureKey))].sort(byteOrder);
  const evidenceKinds = new Map();
  for (const row of features.values()) {
    const existing = evidenceKinds.get(row.featureKey);
    if (existing && existing !== row.evidenceKind) throw new Error('FEATURE_EVIDENCE_KIND_CONFLICT');
    evidenceKinds.set(row.featureKey, row.evidenceKind);
  }
  const directoryOrdinalByPath = new Map(directoryPaths.map((value, ordinal) => [value, ordinal]));
  const featureOrdinalByKey = new Map(featureKeys.map((value, ordinal) => [value, ordinal]));
  const sparseRows = [...features.values()].map(row => ({
    entityOrdinal: directoryOrdinalByPath.get(row.entityPath),
    featureOrdinal: featureOrdinalByKey.get(row.featureKey),
    value: row.value,
  })).sort((left, right) => left.entityOrdinal - right.entityOrdinal || left.featureOrdinal - right.featureOrdinal);
  const directoryRows = directoryPaths.map((directoryPath, ordinal) => ({ ordinal, directoryPath }));
  const featureRows = featureKeys.map((featureKey, ordinal) => ({
    ordinal,
    featureKey,
    evidenceKind: evidenceKinds.get(featureKey) ?? 'UNCLASSIFIED',
  }));
  return { directoryRows, featureRows, sparseRows };
}
