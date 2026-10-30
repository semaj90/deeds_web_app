const REQUIRED_LINEAGE_FIELDS = [
  'id',
  'qdrant_id',
  'packet_key',
  'source_ref',
  'chunk_id',
  'content_hash',
  'source_revision',
  'workspace_revision',
  'embedding_model',
  'embedding_version',
  'model_artifact_revision',
];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

export function auditQdrantProjectionRowsV1(rows) {
  const pointIdCounts = new Map();
  for (const row of rows) {
    if (!hasValue(row.qdrant_id)) continue;
    const pointId = String(row.qdrant_id).trim();
    pointIdCounts.set(pointId, (pointIdCounts.get(pointId) ?? 0) + 1);
  }

  return rows.map((row) => {
    const missingFields = REQUIRED_LINEAGE_FIELDS.filter((field) => !hasValue(row[field]));
    const pointId = hasValue(row.qdrant_id) ? String(row.qdrant_id).trim() : null;
    if (pointId && pointIdCounts.get(pointId) > 1) missingFields.push('unique_qdrant_id');
    return {
      admitted: missingFields.length === 0,
      rowId: hasValue(row.id) ? String(row.id).trim() : null,
      qdrantId: pointId,
      missingFields,
    };
  });
}

function artifactDigest(value) {
  const revision = String(value ?? '').trim();
  const match = revision.match(/^(?:sha256:|[a-z0-9._/-]+@sha256:)?([a-f0-9]{64})$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function isPinnedModelRevisionV1(value) {
  return artifactDigest(value) !== null;
}

export function auditModelArtifactBindingsV1(rows, expectedModelRevision) {
  const expectedDigest = artifactDigest(expectedModelRevision);
  return rows.map((row, index) => {
    const rowDigest = artifactDigest(row.model_artifact_revision);
    return {
      rowIndex: index,
      admitted: expectedDigest !== null && rowDigest !== null && rowDigest === expectedDigest,
      reason: expectedDigest === null
        ? 'EXPECTED_MODEL_ARTIFACT_REVISION_INVALID'
        : rowDigest === null
          ? 'ROW_MODEL_ARTIFACT_REVISION_INVALID'
          : rowDigest !== expectedDigest
            ? 'MODEL_ARTIFACT_REVISION_MISMATCH'
            : null,
    };
  });
}
