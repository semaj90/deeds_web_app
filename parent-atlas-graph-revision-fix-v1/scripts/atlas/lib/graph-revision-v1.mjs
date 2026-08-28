import { createHash } from 'node:crypto';

export const GRAPH_REVISION_SCHEMA = 'atlas.graph-revision.v1';
const SHA256_HEX = /^[a-f0-9]{64}$/;

function clean(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`GRAPH_REVISION_${name}_REQUIRED`);
  }
  return value.trim();
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(
    typeof value === 'string' ? value : canonicalJson(value),
  ).digest('hex');
}

function validateKernel(kernel, workspaceRevision) {
  if (!kernel || kernel.schema !== 'atlas.relationship-kernel.v1') {
    throw new Error('GRAPH_REVISION_RELATIONSHIP_KERNEL_SCHEMA_INVALID');
  }
  const relationshipId = clean(kernel.relationshipId, 'RELATIONSHIP_ID');
  const authority = clean(kernel.authority, 'RELATIONSHIP_AUTHORITY');
  if (authority !== 'KAG_TAXONOMY' && authority !== 'FEATURE_INTELLIGENCE') {
    throw new Error(`GRAPH_REVISION_UNKNOWN_AUTHORITY:${authority}`);
  }
  const checksum = clean(kernel.checksum, 'RELATIONSHIP_CHECKSUM');
  if (!SHA256_HEX.test(checksum)) {
    throw new Error(`GRAPH_REVISION_RELATIONSHIP_CHECKSUM_INVALID:${relationshipId}`);
  }
  const kernelWorkspace = clean(kernel.workspaceRevision, 'RELATIONSHIP_WORKSPACE_REVISION');
  if (kernelWorkspace !== workspaceRevision) {
    throw new Error(
      `GRAPH_REVISION_MIXED_WORKSPACE:${relationshipId}:${kernelWorkspace}:${workspaceRevision}`,
    );
  }
  clean(kernel.sourceRevision, 'RELATIONSHIP_SOURCE_REVISION');
  const relationshipRevision = clean(
    kernel.relationshipRevision,
    'RELATIONSHIP_REVISION',
  );
  const producerRevision = clean(kernel.producerRevision, 'PRODUCER_REVISION');

  // Individual relationship writers are not graph-revision authorities.
  if (kernel.graphRevision !== null && kernel.graphRevision !== undefined && String(kernel.graphRevision).trim()) {
    throw new Error(
      `GRAPH_REVISION_KERNEL_GRAPH_AUTHORITY_REJECTED:${relationshipId}:${kernel.graphRevision}`,
    );
  }

  if (!Array.isArray(kernel.participants) || kernel.participants.length < 1) {
    throw new Error(`GRAPH_REVISION_PARTICIPANTS_REQUIRED:${relationshipId}`);
  }

  const ordinals = new Set();
  kernel.participants.forEach((participant, index) => {
    if (!participant || !Number.isInteger(participant.ordinal) || participant.ordinal < 0) {
      throw new Error(`GRAPH_REVISION_PARTICIPANT_ORDINAL_INVALID:${relationshipId}:${index}`);
    }
    if (ordinals.has(participant.ordinal)) {
      throw new Error(
        `GRAPH_REVISION_PARTICIPANT_ORDINAL_DUPLICATE:${relationshipId}:${participant.ordinal}`,
      );
    }
    ordinals.add(participant.ordinal);
    if (participant.ordinal !== index) {
      throw new Error(
        `GRAPH_REVISION_PARTICIPANT_ORDER_NON_CANONICAL:${relationshipId}:${participant.ordinal}:${index}`,
      );
    }
    clean(participant.canonicalId, 'PARTICIPANT_CANONICAL_ID');
    clean(participant.role, 'PARTICIPANT_ROLE');
  });

  return {
    relationshipId,
    relationshipChecksum: checksum,
    authority,
    relationshipRevision,
    producerRevision,
  };
}

/**
 * GraphRevisionV1 owns only the identity of one selected, revision-qualified
 * relationship set. It does not own relationship truth, source truth, or
 * candidate identity.
 *
 * Empty relationship sets are valid and content-addressed.
 */
export function buildGraphRevisionV1(input) {
  const workspaceRevision = clean(input?.workspaceRevision, 'WORKSPACE_REVISION');
  const relationshipPolicyRevision = clean(
    input?.relationshipPolicyRevision,
    'RELATIONSHIP_POLICY_REVISION',
  );
  const projectionSchemaRevision = clean(
    input?.projectionSchemaRevision,
    'PROJECTION_SCHEMA_REVISION',
  );
  if (!Array.isArray(input?.kernels)) {
    throw new Error('GRAPH_REVISION_KERNELS_REQUIRED');
  }

  const byRelationshipId = new Map();
  const byChecksum = new Map();
  let duplicateExactCount = 0;

  for (const kernel of input.kernels) {
    const entry = validateKernel(kernel, workspaceRevision);

    const existingById = byRelationshipId.get(entry.relationshipId);
    if (existingById) {
      if (existingById.relationshipChecksum !== entry.relationshipChecksum) {
        throw new Error(
          `GRAPH_REVISION_DUPLICATE_RELATIONSHIP_ID_DIFFERENT_CHECKSUM:${entry.relationshipId}`,
        );
      }
      if (canonicalJson(existingById) !== canonicalJson(entry)) {
        throw new Error(
          `GRAPH_REVISION_DUPLICATE_RELATIONSHIP_ID_INCOMPATIBLE_IDENTITY:${entry.relationshipId}`,
        );
      }
      duplicateExactCount += 1;
      continue;
    }

    const checksumIdentity = [
      entry.authority,
      entry.relationshipId,
      entry.relationshipRevision,
      entry.producerRevision,
    ].join('\u001f');
    const priorChecksumIdentity = byChecksum.get(entry.relationshipChecksum);
    if (priorChecksumIdentity && priorChecksumIdentity !== checksumIdentity) {
      throw new Error(
        `GRAPH_REVISION_DUPLICATE_CHECKSUM_INCOMPATIBLE_IDENTITY:${entry.relationshipChecksum}`,
      );
    }

    byRelationshipId.set(entry.relationshipId, entry);
    byChecksum.set(entry.relationshipChecksum, checksumIdentity);
  }

  const relationships = [...byRelationshipId.values()].sort((a, b) =>
    a.authority.localeCompare(b.authority) ||
    a.relationshipId.localeCompare(b.relationshipId) ||
    a.relationshipRevision.localeCompare(b.relationshipRevision) ||
    a.relationshipChecksum.localeCompare(b.relationshipChecksum) ||
    a.producerRevision.localeCompare(b.producerRevision)
  );

  const relationshipSetChecksum = sha256(relationships);
  const graphPayload = {
    schema: GRAPH_REVISION_SCHEMA,
    workspaceRevision,
    relationshipCount: relationships.length,
    relationshipSetChecksum,
    relationshipPolicyRevision,
    projectionSchemaRevision,
  };
  const graphRevision = `graph:sha256:${sha256(graphPayload)}`;

  return Object.freeze({
    ...graphPayload,
    graphRevision,
    inputRelationshipCount: input.kernels.length,
    duplicateExactCount,
    graphRevisionAuthority: true,
    relationshipAuthority: false,
  });
}

export function assertGraphRevisionV1(value) {
  if (!value || value.schema !== GRAPH_REVISION_SCHEMA) {
    throw new Error('GRAPH_REVISION_RECEIPT_SCHEMA_INVALID');
  }
  clean(value.workspaceRevision, 'WORKSPACE_REVISION');
  clean(value.relationshipPolicyRevision, 'RELATIONSHIP_POLICY_REVISION');
  clean(value.projectionSchemaRevision, 'PROJECTION_SCHEMA_REVISION');
  if (!Number.isInteger(value.relationshipCount) || value.relationshipCount < 0) {
    throw new Error('GRAPH_REVISION_RELATIONSHIP_COUNT_INVALID');
  }
  if (!SHA256_HEX.test(String(value.relationshipSetChecksum ?? ''))) {
    throw new Error('GRAPH_REVISION_SET_CHECKSUM_INVALID');
  }
  if (!/^graph:sha256:[a-f0-9]{64}$/.test(String(value.graphRevision ?? ''))) {
    throw new Error('GRAPH_REVISION_VALUE_INVALID');
  }
  return value;
}
