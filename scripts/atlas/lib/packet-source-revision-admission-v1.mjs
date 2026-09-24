const SHA256_REVISION = /^sha256:[a-f0-9]{64}$/i;
const SHA256_DIGEST = /^(?:sha256:)?([a-f0-9]{64})$/i;

/** Resolve one file-level source revision from exact execution membership rows. */
export function resolvePacketSourceRevisionV1(input) {
  const sourceRef = String(input?.sourceRef ?? '').trim();
  const executionId = String(input?.executionId ?? '').trim();
  const workspaceRevision = String(input?.workspaceRevision ?? '').trim();
  const rows = input?.rows;

  if (!sourceRef || !executionId || !workspaceRevision || !SHA256_REVISION.test(workspaceRevision)) {
    throw new Error('PACKET_SOURCE_SCOPE_REQUIRED');
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('PACKET_SOURCE_MEMBERSHIP_REQUIRED');

  const revisions = new Set();
  const repositoryIds = new Set();
  const bindingRepositoryIds = new Set();
  const bindingChecksums = new Set();
  for (const row of rows) {
    if (String(row?.source_ref ?? '').trim() !== sourceRef) throw new Error('PACKET_SOURCE_REF_MISMATCH');
    if (String(row?.execution_id ?? '').trim() !== executionId) throw new Error('PACKET_SOURCE_EXECUTION_MISMATCH');
    if (String(row?.workspace_revision ?? '').trim() !== workspaceRevision) throw new Error('PACKET_SOURCE_WORKSPACE_MISMATCH');

    const revision = String(row?.code_source_revision ?? row?.source_revision ?? '').trim();
    if (!SHA256_REVISION.test(revision)) throw new Error('PACKET_SOURCE_REVISION_INVALID');
    const digestMatch = String(row?.content_hash ?? '').trim().match(SHA256_DIGEST);
    if (!digestMatch || `sha256:${digestMatch[1]}`.toLowerCase() !== revision.toLowerCase()) {
      throw new Error('PACKET_SOURCE_CONTENT_DIGEST_MISMATCH');
    }
    const bindingRevision = String(row?.binding_source_revision ?? '').trim();
    if (!SHA256_REVISION.test(bindingRevision) || bindingRevision.toLowerCase() !== revision.toLowerCase()) {
      throw new Error('PACKET_SOURCE_BINDING_REVISION_MISMATCH');
    }

    const repositoryId = String(row?.repository_id ?? '').trim();
    if (!repositoryId) throw new Error('PACKET_SOURCE_REPOSITORY_REQUIRED');
    repositoryIds.add(repositoryId);
    const bindingRepositoryId = String(row?.binding_repository_id ?? '').trim();
    if (!bindingRepositoryId) throw new Error('PACKET_SOURCE_BINDING_REPOSITORY_REQUIRED');
    bindingRepositoryIds.add(bindingRepositoryId);
    const bindingChecksum = String(row?.binding_checksum ?? '').trim();
    if (!SHA256_DIGEST.test(bindingChecksum)) throw new Error('PACKET_SOURCE_BINDING_REQUIRED');
    bindingChecksums.add(bindingChecksum.replace(/^sha256:/i, '').toLowerCase());
    revisions.add(revision.toLowerCase());
  }

  if (repositoryIds.size !== 1) throw new Error('PACKET_SOURCE_REPOSITORY_AMBIGUOUS');
  if (bindingRepositoryIds.size !== 1) throw new Error('PACKET_SOURCE_BINDING_REPOSITORY_AMBIGUOUS');
  if (bindingChecksums.size !== 1) throw new Error('PACKET_SOURCE_BINDING_AMBIGUOUS');
  if (revisions.size !== 1) throw new Error('PACKET_SOURCE_REVISION_AMBIGUOUS');
  return [...revisions][0];
}

/** Resolve revision evidence from a bounded, checksum-bearing admitted source binding. */
export function resolveBoundedPacketSourceRevisionV1(input) {
  const sourceRef = String(input?.sourceRef ?? '').trim();
  const workspaceRevision = String(input?.workspaceRevision ?? '').trim();
  const rows = input?.rows;
  if (!sourceRef || !workspaceRevision || !SHA256_REVISION.test(workspaceRevision)) {
    throw new Error('PACKET_SOURCE_SCOPE_REQUIRED');
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('PACKET_SOURCE_MEMBERSHIP_REQUIRED');
  const revisions = new Set();
  const bindingChecksums = new Set();
  for (const row of rows) {
    if (String(row?.sourceRef ?? '').trim() !== sourceRef) throw new Error('PACKET_SOURCE_REF_MISMATCH');
    const revision = String(row?.sourceRevision ?? '').trim();
    if (!SHA256_REVISION.test(revision)) throw new Error('PACKET_SOURCE_REVISION_INVALID');
    if (String(row?.workspaceRevision ?? '').trim() !== workspaceRevision) throw new Error('PACKET_SOURCE_WORKSPACE_MISMATCH');
    const digestMatch = String(row?.contentDigest ?? '').trim().match(SHA256_DIGEST);
    if (!digestMatch || `sha256:${digestMatch[1]}`.toLowerCase() !== revision.toLowerCase()) {
      throw new Error('PACKET_SOURCE_CONTENT_DIGEST_MISMATCH');
    }
    const checksum = String(row?.bindingChecksum ?? '').trim();
    if (!SHA256_DIGEST.test(checksum)) throw new Error('PACKET_SOURCE_BINDING_CHECKSUM_INVALID');
    bindingChecksums.add(checksum.toLowerCase());
    revisions.add(revision.toLowerCase());
  }
  if (bindingChecksums.size !== 1) throw new Error('PACKET_SOURCE_BINDING_AMBIGUOUS');
  if (revisions.size !== 1) throw new Error('PACKET_SOURCE_REVISION_AMBIGUOUS');
  return [...revisions][0];
}
