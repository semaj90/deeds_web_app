import crypto from 'node:crypto';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const text = (value) => String(value ?? '').trim();

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Derive GraphRevisionV1 from the exact included relationship kernel set.
 * This is pure and does not persist or mutate any projection.
 */
export function buildGraphRevisionV1({
  workspaceRevision,
  kernels,
  projectionSchemaRevision = 'atlas.structural-graph-snapshot.v1',
}) {
  const workspace = text(workspaceRevision);
  if (!workspace) throw new Error('GRAPH_REVISION_WORKSPACE_REQUIRED');
  if (!Array.isArray(kernels)) throw new Error('GRAPH_REVISION_KERNELS_REQUIRED');

  const rows = kernels.map((kernel) => {
    const relationshipId = text(kernel?.relationshipId);
    const checksum = text(kernel?.checksum).toLowerCase();
    const kernelWorkspace = text(kernel?.workspaceRevision);
    if (!relationshipId) throw new Error('GRAPH_REVISION_RELATIONSHIP_ID_REQUIRED');
    if (!kernelWorkspace) throw new Error(`GRAPH_REVISION_WORKSPACE_MISSING:${relationshipId}`);
    if (kernelWorkspace !== workspace) throw new Error(`GRAPH_REVISION_WORKSPACE_MISMATCH:${relationshipId}`);
    if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error(`GRAPH_REVISION_CHECKSUM_REQUIRED:${relationshipId}`);
    return {
      relationshipId,
      checksum,
      authority: text(kernel?.authority) || 'UNKNOWN',
      producerRevision: text(kernel?.producerRevision) || 'UNKNOWN',
    };
  }).sort((a, b) => a.relationshipId.localeCompare(b.relationshipId) || a.checksum.localeCompare(b.checksum));

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].relationshipId === rows[index].relationshipId) {
      throw new Error(`GRAPH_REVISION_DUPLICATE_RELATIONSHIP:${rows[index].relationshipId}`);
    }
  }
  const authoritySet = [...new Set(rows.map((row) => row.authority))].sort();
  const producerRevisions = [...new Set(rows.map((row) => row.producerRevision))].sort();
  const relationshipSet = rows.map(({ relationshipId, checksum }) => ({ relationshipId, checksum }));
  const relationshipSetChecksum = `sha256:${sha256(canonicalJson(relationshipSet))}`;
  const payload = {
    schema: 'atlas.graph-revision.v1',
    workspaceRevision: workspace,
    includedRelationshipIds: relationshipSet.map((row) => row.relationshipId),
    includedRelationshipChecksums: relationshipSet.map((row) => row.checksum),
    authoritySet,
    relationshipCount: rows.length,
    relationshipProducerRevisions: producerRevisions,
    projectionSchemaRevision: text(projectionSchemaRevision),
    relationshipSetChecksum,
  };
  return {
    ...payload,
    graphRevision: `sha256:${sha256(canonicalJson(payload))}`,
  };
}

export { canonicalJson };
