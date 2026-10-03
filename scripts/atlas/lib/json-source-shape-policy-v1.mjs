/**
 * Bounded structural policy for authored JSON sources. Arrays are data payloads, not lists of
 * synthetic source symbols: the containing property is one observation and array members are
 * opaque. Object keys are observed only through the existing shallow depth-2 contract.
 */
export const JSON_SOURCE_SHAPE_POLICY_V1 = Object.freeze({
  revision: 'atlas.json-source-shape-policy.v1',
  maxSourceBytes: 4 * 1024 * 1024,
  maxObservationsPerFile: 2_000,
  maxObjectDepth: 2,
  arrayTreatment: 'OPAQUE_PROPERTY_VALUE',
  rootArrayTreatment: 'VALID_ZERO_OBSERVATIONS',
});

export function inspectJsonSourceShapeV1(content, filePath, {
  maxSourceBytes = JSON_SOURCE_SHAPE_POLICY_V1.maxSourceBytes,
  maxObservations = JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile,
} = {}) {
  if (typeof content !== 'string') throw new TypeError('JSON_SOURCE_CONTENT_MUST_BE_STRING');
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > JSON_SOURCE_SHAPE_POLICY_V1.maxSourceBytes) {
    throw new Error('JSON_SOURCE_BYTE_LIMIT_INVALID');
  }
  if (!Number.isSafeInteger(maxObservations) || maxObservations < 1 || maxObservations > JSON_SOURCE_SHAPE_POLICY_V1.maxObservationsPerFile) {
    throw new Error('JSON_SOURCE_OBSERVATION_LIMIT_INVALID');
  }

  const sourceBytes = Buffer.byteLength(content, 'utf8');
  if (sourceBytes > maxSourceBytes) {
    throw new Error('STRUCTURAL_RESOURCE_LIMIT_DEFERRED:SOURCE_BYTES_EXCEED_LIMIT');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`JSON_PARSE_FAILED:${filePath}:${error instanceof Error ? error.message : String(error)}`);
  }

  let potentialObservations = 0;
  function countObjectKeys(node, depth) {
    if (depth > JSON_SOURCE_SHAPE_POLICY_V1.maxObjectDepth || node === null || Array.isArray(node) || typeof node !== 'object') return;
    for (const value of Object.values(node)) {
      potentialObservations += 1;
      if (potentialObservations > maxObservations) {
        throw new Error('STRUCTURAL_RESOURCE_LIMIT_DEFERRED:OBSERVATIONS_EXCEED_LIMIT');
      }
      // Arrays and their members are intentionally opaque. Nested objects remain addressable.
      if (!Array.isArray(value)) countObjectKeys(value, depth + 1);
    }
  }
  countObjectKeys(parsed, 0);

  return {
    policyRevision: JSON_SOURCE_SHAPE_POLICY_V1.revision,
    sourceBytes,
    rootKind: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed,
    potentialObservations,
    outcome: potentialObservations === 0 ? 'VALID_ZERO_OBSERVATIONS' : 'COMPLETE',
    parsed,
  };
}
