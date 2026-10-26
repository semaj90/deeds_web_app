import { createHash } from 'node:crypto';

const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

export function resolveSourceBatchLimitsV1(maxSourceFilesValue, maxSourceBytesValue) {
  const maxSourceFiles = Number(maxSourceFilesValue ?? 500);
  const maxSourceBytes = Number(maxSourceBytesValue ?? 64 * 1024 * 1024);
  if (!Number.isSafeInteger(maxSourceFiles) || maxSourceFiles < 1 || maxSourceFiles > 500
    || !Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > 64 * 1024 * 1024) {
    throw new Error('SOURCE_BATCH_LIMIT_OUT_OF_RANGE');
  }
  return { maxSourceFiles, maxSourceBytes };
}

export function assertOneSourceRevisionPerRefV1(rows) {
  const revisionBySourceRef = new Map();
  for (const row of rows) {
    const previous = revisionBySourceRef.get(row.source_ref);
    if (previous !== undefined && previous !== row.source_revision) {
      throw new Error(`SOURCE_REF_HAS_MULTIPLE_SOURCE_REVISIONS:${row.source_ref}`);
    }
    revisionBySourceRef.set(row.source_ref, row.source_revision);
  }
}

export function assertCurrentSourceAuthorityReceiptV1(current, versioned) {
  if (!current || !versioned || current.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN'
    || versioned.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN') {
    throw new Error('CURRENT_SOURCE_AUTHORITY_RECEIPT_NOT_PROVEN');
  }

  const { receiptChecksum: currentChecksum, versionedReceipt: _versionedReceipt, ...currentBody } = current;
  const { receiptChecksum: versionedChecksum, ...versionedBody } = versioned;
  if (!/^sha256:[a-f0-9]{64}$/.test(currentChecksum ?? '')
    || currentChecksum !== digest(JSON.stringify(currentBody))
    || versionedChecksum !== digest(JSON.stringify(versionedBody))
    || currentChecksum !== versionedChecksum) {
    throw new Error('CURRENT_SOURCE_AUTHORITY_RECEIPT_CHECKSUM_MISMATCH');
  }

  const counts = current.counts;
  const proof = current.proof;
  const repositoryCensus = current.blockerCensus?.byRepository;
  const rootCensus = repositoryCensus?.['repo:root'];
  const repositorySourceTotal = repositoryCensus && Object.values(repositoryCensus)
    .reduce((total, row) => total + (Number.isSafeInteger(row?.sources) ? row.sources : 0), 0);
  const zeroBlockerCounts = counts && counts.missingRevision === 0
    && counts.revisionMismatch === 0
    && counts.namespaceAmbiguous === 0
    && counts.notInAdmittedCohort === 0;
  if (!/^sha256:[a-f0-9]{64}$/.test(current.workspaceRevision ?? '')
    || !Number.isSafeInteger(current.sourceCount) || current.sourceCount < 1
    || counts?.qualified !== current.sourceCount || !zeroBlockerCounts
    || repositorySourceTotal !== current.sourceCount
    || !Number.isSafeInteger(rootCensus?.sources) || rootCensus.sources < 1
    || rootCensus.registryExact !== rootCensus.sources
    || rootCensus.registryAbsent !== 0 || rootCensus.registryMismatch !== 0
    || !proof || Object.values(proof).some((value) => value !== true)) {
    throw new Error('CURRENT_SOURCE_AUTHORITY_RECEIPT_INCOMPLETE');
  }

  return { workspaceRevision: current.workspaceRevision, sourceCount: current.sourceCount, rootSourceCount: rootCensus.sources };
}

export function assertRootSourceBindingCensusV1(census, expectedSourceCount) {
  if (!Number.isSafeInteger(expectedSourceCount) || expectedSourceCount < 1
    || census?.membershipRows !== expectedSourceCount
    || census?.mappedBindingRows !== expectedSourceCount
    || census?.mismatchedWorkspaceRows !== 0) {
    throw new Error(`ROOT_SOURCE_BINDING_CENSUS_MISMATCH:${JSON.stringify(census ?? null)}:expected=${expectedSourceCount}`);
  }
}
