import { createHash } from 'node:crypto';

const sha256 = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const normalize = (value) => String(value).replaceAll('\\', '/').replace(/^\.\//, '');

function blocked(reason, previous) {
  return {
    schema: 'atlas.incremental-workspace-source-inventory.v1',
    status: 'FULL_RECAPTURE_REQUIRED',
    reason,
    previousSnapshotRevision: previous?.snapshotRevision ?? null,
    sourceCount: 0,
    sources: [],
    rehashedSourceCount: 0,
    reusedSourceCount: 0,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function identityFor(repositoryRelativePath, sourceRef) {
  const repoPath = normalize(repositoryRelativePath);
  const repoId = repoPath ? `repo:${repoPath}` : 'repo:root';
  return `${repoId}:${normalize(sourceRef)}`;
}

function validSource(source) {
  return source && typeof source.sourceIdentityKey === 'string'
    && typeof source.sourceRef === 'string'
    && typeof source.repositoryRelativePath === 'string'
    && typeof source.repositoryId === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(source.sourceRevision ?? '')
    && /^[a-f0-9]{64}$/.test(source.contentDigest ?? '')
    && source.sourceRevision === `sha256:${source.contentDigest}`
    && Number.isSafeInteger(source.byteLength) && source.byteLength >= 0;
}

export function buildIncrementalWorkspaceSourceInventoryV1({
  previousSnapshot,
  previousReadback,
  repositoryDelta,
  changedObservations,
}) {
  if (!previousSnapshot || previousSnapshot.schema !== 'atlas.workspace-source-snapshot-capture.v1'
    || previousSnapshot.status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK'
    || previousSnapshot.canonicalAuthority !== false || previousSnapshot.datastoreWritesPerformed !== false) {
    return blocked('PREVIOUS_SNAPSHOT_NOT_VERIFIED', previousSnapshot);
  }
  if (!Array.isArray(previousSnapshot.sources) || !Array.isArray(previousSnapshot.violations)
    || previousSnapshot.violations.length !== 0 || previousSnapshot.workspaceRevision !== null) {
    return blocked('PREVIOUS_SNAPSHOT_BODY_INVALID', previousSnapshot);
  }
  const previousBody = { ...previousSnapshot };
  for (const field of ['schema', 'snapshotRevision', 'workspaceRevision', 'status', 'canonicalAuthority', 'datastoreWritesPerformed']) {
    delete previousBody[field];
  }
  if (sha256(previousBody) !== previousSnapshot.snapshotRevision) return blocked('PREVIOUS_SNAPSHOT_CHECKSUM_MISMATCH', previousSnapshot);
  const previousMembership = previousSnapshot.sources
    .map((source) => source.sourceIdentityKey ?? `${source.repositoryId}:${source.repositoryRelativePath}`)
    .sort();
  const previousContent = previousSnapshot.sources.map((source) => [
    source.sourceIdentityKey ?? `${source.repositoryId}:${source.repositoryRelativePath}`,
    source.sourceRevision,
    source.byteLength,
  ]);
  if (new Set(previousMembership).size !== previousMembership.length
    || sha256(previousMembership) !== previousSnapshot.sourceMembershipChecksum
    || sha256(previousContent) !== previousSnapshot.sourceContentChecksum) {
    return blocked('PREVIOUS_SNAPSHOT_SOURCE_SET_CHECKSUM_INVALID', previousSnapshot);
  }
  if (!previousReadback || previousReadback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN'
    || previousReadback.snapshotRevision !== previousSnapshot.snapshotRevision
    || previousReadback.sourceCount !== previousSnapshot.sources?.length
    || previousReadback.exactMatches !== previousSnapshot.sources?.length
    || previousReadback.violations?.length !== 0
    || previousReadback.canonicalAuthority !== false
    || previousReadback.datastoreWritesPerformed !== false) {
    return blocked('PREVIOUS_SNAPSHOT_READBACK_INVALID', previousSnapshot);
  }
  if (!repositoryDelta || repositoryDelta.status !== 'GIT_DELTA_READY_NOT_ADMITTED'
    || !Array.isArray(repositoryDelta.changedPaths)) {
    return blocked(repositoryDelta?.reason ?? 'GIT_DELTA_NOT_READY', previousSnapshot);
  }
  const previousRepository = previousSnapshot.repositories?.find((repo) =>
    normalize(repo.relativePath ?? '') === normalize(repositoryDelta.repositoryRelativePath ?? ''));
  if (!previousRepository || previousRepository.head !== repositoryDelta.baselineCommit) {
    return blocked('GIT_BASELINE_DOES_NOT_MATCH_PREVIOUS_SNAPSHOT', previousSnapshot);
  }
  if (!Array.isArray(previousRepository.gitChangedPaths)
    || previousRepository.gitChangedPaths.some((sourceRef) => typeof sourceRef !== 'string' || !sourceRef)
    || previousRepository.dirty !== (previousRepository.gitChangedPaths.length > 0)) {
    return blocked('PREVIOUS_REPOSITORY_DIRTY_PATH_BASIS_INVALID', previousSnapshot);
  }
  if (!Array.isArray(changedObservations)) {
    return blocked('SOURCE_INVENTORY_INPUT_INVALID', previousSnapshot);
  }

  const sourceByIdentity = new Map();
  for (const source of previousSnapshot.sources) {
    if (!validSource(source) || sourceByIdentity.has(source.sourceIdentityKey)) {
      return blocked('PREVIOUS_SOURCE_IDENTITY_INVALID_OR_DUPLICATE', previousSnapshot);
    }
    sourceByIdentity.set(source.sourceIdentityKey, source);
  }
  const previousByIdentity = new Map(sourceByIdentity);

  const paths = new Map();
  for (const change of repositoryDelta.changedPaths) {
    const sourceRef = normalize(change.sourceRef ?? '');
    if (!sourceRef || paths.has(sourceRef)) return blocked('GIT_DELTA_PATH_INVALID_OR_DUPLICATE', previousSnapshot);
    paths.set(sourceRef, change);
  }
  const observedByPath = new Map();
  for (const observation of changedObservations) {
    const sourceRef = normalize(observation?.sourceRef ?? '');
    if (!sourceRef || observedByPath.has(sourceRef)) return blocked('CHANGED_SOURCE_OBSERVATION_DUPLICATE_OR_INVALID', previousSnapshot);
    observedByPath.set(sourceRef, observation);
  }
  if ([...observedByPath.keys()].some((path) => !paths.has(path) || paths.get(path).operation === 'DELETE')) {
    return blocked('OBSERVATION_NOT_BOUND_TO_GIT_DELTA', previousSnapshot);
  }

  const repoPrefix = normalize(repositoryDelta.repositoryRelativePath ?? '');
  const qualifiedRef = (path) => normalize([repoPrefix, path].filter(Boolean).join('/'));
  for (const [path, change] of paths) {
    if (!['ADD', 'MODIFY', 'DELETE', 'RENAME'].includes(change.operation)) {
      return blocked(`GIT_DELTA_OPERATION_UNSUPPORTED:${path}`, previousSnapshot);
    }
    if (change.operation === 'DELETE') {
      sourceByIdentity.delete(identityFor(repoPrefix, path));
      continue;
    }
    const observation = observedByPath.get(path);
    if (!observation) return blocked(`CHANGED_SOURCE_OBSERVATION_MISSING:${path}`, previousSnapshot);
    if (observation.status === 'EXCLUDED') {
      if (typeof observation.reason !== 'string' || !observation.reason) return blocked(`EXCLUSION_REASON_MISSING:${path}`, previousSnapshot);
      sourceByIdentity.delete(identityFor(repoPrefix, path));
      continue;
    }
    if (observation.status !== 'SOURCE' || !validSource(observation.source)) {
      return blocked(`CHANGED_SOURCE_OBSERVATION_INVALID:${path}`, previousSnapshot);
    }
    if (!(Buffer.isBuffer(observation.bytes) || observation.bytes instanceof Uint8Array)) {
      return blocked(`CHANGED_SOURCE_BYTES_MISSING:${path}`, previousSnapshot);
    }
    const source = observation.source;
    if (normalize(source.repositoryPath ?? '') !== repoPrefix
      || normalize(source.repositoryRelativePath) !== path
      || normalize(source.sourceRef) !== qualifiedRef(path)
      || normalize(source.sourceIdentityKey) !== identityFor(repoPrefix, path)
      || source.repositoryId !== (repoPrefix ? `repo:${repoPrefix}` : 'repo:root')) {
      return blocked(`CHANGED_SOURCE_IDENTITY_MISMATCH:${path}`, previousSnapshot);
    }
    const bytes = Buffer.from(observation.bytes);
    const bytesDigest = createHash('sha256').update(bytes).digest('hex');
    const sourceText = bytes.toString('utf8');
    if (!Buffer.from(sourceText, 'utf8').equals(bytes)) return blocked(`CHANGED_SOURCE_NOT_VALID_UTF8:${path}`, previousSnapshot);
    if (bytes.length !== source.byteLength || bytesDigest !== source.contentDigest
      || `sha256:${bytesDigest}` !== source.sourceRevision) {
      return blocked(`CHANGED_SOURCE_BYTES_DIGEST_MISMATCH:${path}`, previousSnapshot);
    }
    sourceByIdentity.set(source.sourceIdentityKey, source);
  }
  const sources = [...sourceByIdentity.values()].sort((a, b) => a.sourceRef < b.sourceRef ? -1 : a.sourceRef > b.sourceRef ? 1 : 0);
  const membershipKeys = sources.map((source) => source.sourceIdentityKey).sort();
  const contentRows = sources.map((source) => [source.sourceIdentityKey, source.sourceRevision, source.byteLength]);
  const changedCount = repositoryDelta.changedPaths.length;
  const changedIdentities = new Set(repositoryDelta.changedPaths.map((change) => identityFor(repoPrefix, change.sourceRef)));
  const reusedSourceCount = [...sourceByIdentity.keys()].filter((identity) =>
    previousByIdentity.has(identity) && !changedIdentities.has(identity)).length;
  return {
    schema: 'atlas.incremental-workspace-source-inventory.v1',
    status: 'INCREMENTAL_SOURCE_INVENTORY_PROPOSAL_NOT_ADMITTED',
    previousSnapshotRevision: previousSnapshot.snapshotRevision,
    baselineCommit: repositoryDelta.baselineCommit,
    currentHead: repositoryDelta.currentHead,
    repositoryRelativePath: repoPrefix,
    sourceCount: sources.length,
    sources,
    sourceMembershipChecksum: sha256(membershipKeys),
    sourceContentChecksum: sha256(contentRows),
    gitChangedPathCount: changedCount,
    rehashedSourceCount: changedObservations.length,
    reusedSourceCount,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
