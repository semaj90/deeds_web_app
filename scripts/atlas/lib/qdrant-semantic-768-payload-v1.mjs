/**
 * Pure contract for revision-qualified semantic_768 Qdrant payloads.
 * Qdrant remains a derived projection; this module only validates payload shape.
 */

const UUID_V4_OR_GENERIC = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/i;

function requiredString(payload, field, errors) {
  const value = payload?.[field];
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${field}:REQUIRED`);
  return typeof value === 'string' ? value.trim() : '';
}

export function validateSemantic768Payload(payload, options = {}) {
  const errors = [];
  const value = payload && typeof payload === 'object' ? payload : {};
  const workspaceId = requiredString(value, 'workspace_id', errors);
  const workspaceRevision = requiredString(value, 'workspace_revision', errors);
  const sourceRevision = requiredString(value, 'source_revision', errors);
  requiredString(value, 'canonical_id', errors);
  requiredString(value, 'packet_key', errors);
  requiredString(value, 'source_ref', errors);
  requiredString(value, 'repository_id', errors);
  requiredString(value, 'chunk_id', errors);
  requiredString(value, 'content_hash', errors);
  requiredString(value, 'representation_revision', errors);
  requiredString(value, 'model_revision', errors);
  requiredString(value, 'projection_revision', errors);

  if (workspaceId && !UUID_V4_OR_GENERIC.test(workspaceId)) errors.push('workspace_id:UUID_REQUIRED');
  if (workspaceRevision && !SHA256_REVISION.test(workspaceRevision)) errors.push('workspace_revision:SHA256_REQUIRED');
  if (sourceRevision && !SHA256_REVISION.test(sourceRevision)) errors.push('source_revision:SHA256_REQUIRED');
  if (value.schema_version !== 'atlas.semantic-768-qdrant-payload.v1') errors.push('schema_version:REQUIRED');
  if (value.representation_id !== 'semantic_768') errors.push('representation_id:SEMANTIC_768_REQUIRED');
  if (Number(value.embedding_dimension) !== 768) errors.push('embedding_dimension:768_REQUIRED');
  if (options.workspaceRevision && workspaceRevision !== options.workspaceRevision) errors.push('workspace_revision:ADMITTED_REVISION_MISMATCH');

  return { valid: errors.length === 0, errors };
}

export function assertSemantic768Payload(payload, options = {}) {
  const result = validateSemantic768Payload(payload, options);
  if (!result.valid) throw new Error(`INVALID_SEMANTIC_768_QDRANT_PAYLOAD:${result.errors.join(',')}`);
  return payload;
}

