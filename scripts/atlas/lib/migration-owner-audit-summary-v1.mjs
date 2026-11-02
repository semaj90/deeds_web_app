export function summarizeMigrationOwnerResultsV1(results) {
  const ids = (classification) => results
    .filter((item) => item.classification === classification)
    .map((item) => item.id);

  return {
    missingManifestRegistration: ids('MISSING_MANIFEST_REGISTRATION'),
    sidecarUnapplied: ids('SIDECAR_UNAPPLIED'),
    journaledObjectAbsent: ids('JOURNALED_OBJECT_ABSENT'),
    liveShapeAligned: ids('LIVE_SHAPE_ALIGNED'),
    liveShapeDrift: results
      .filter((item) => ['LIVE_SHAPE_MISMATCH', 'LIVE_COLUMN_MISMATCH'].includes(item.classification))
      .map((item) => item.id),
    superseded: results
      .filter((item) => item.classification.startsWith('SUPERSEDED'))
      .map((item) => item.id),
  };
}

export function migrationOwnerAuditHasBlockerV1(results) {
  return results.some((item) => [
    'MISSING_MANIFEST_REGISTRATION',
    'JOURNALED_OBJECT_ABSENT',
    'LIVE_SHAPE_MISMATCH',
    'LIVE_COLUMN_MISMATCH',
    'SUPERSEDED_REQUIRES_REVIEW',
  ].includes(item.classification));
}
