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

export function buildDirectoryFeatureMatrixV1({ directories, packageRows }) {
  if (!Array.isArray(directories) || !Array.isArray(packageRows)) throw new TypeError('DIRECTORY_FEATURE_INPUT_INVALID');
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
  for (const packageRow of packageRows) {
    if (!directorySet.has(packageRow.directoryPath)) throw new Error('PACKAGE_DIRECTORY_NOT_IN_ROLLUP');
    if (!Number.isSafeInteger(packageRow.subtreeReferenceCount) || packageRow.subtreeReferenceCount <= 0) {
      throw new Error('PACKAGE_COUNT_INVALID');
    }
    addFeature(features, packageRow.directoryPath,
      `package:${packageRow.ecosystem}:${packageRow.packageName}`,
      packageRow.subtreeReferenceCount, 'ADVISORY_IMPORT_REFERENCE_COUNT');
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
