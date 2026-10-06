import { createHash } from 'node:crypto';

const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
  }
  return value;
}

export function supersessionLinkChecksumV1(link) {
  const { checksum, ...payload } = link;
  return sha256(JSON.stringify(stableJsonValue(payload)));
}

const supersessionBases = new Set([
  'EXPLICIT_REPLACEMENT',
  'OWNER_CONSOLIDATION',
  'MIGRATION',
  'DUPLICATE_SCOPE',
  'IMPLEMENTATION_REPLACED',
]);

function verifyReviewedSupersessionLinkV1(link, taskCardByKey, workspaceHead, taskPopulationRevision) {
  if (link?.schema !== 'atlas.openspec-supersession-link.v1') throw new Error('SUPERSESSION_RECEIPT_SCHEMA_UNSUPPORTED');
  if (link.reviewState !== 'CONFIRMED' || link.confirmed !== true || link.relation !== 'SUPERSEDED_BY') {
    throw new Error('SUPERSESSION_RECEIPT_NOT_CONFIRMED');
  }
  if (link.canonicalAuthority !== false || link.mutationAuthorized !== false || link.retrievalSuppressed !== true) {
    throw new Error('SUPERSESSION_RECEIPT_AUTHORITY_FLAGS_INVALID');
  }
  if (link.workspaceHead !== workspaceHead || link.taskPopulationRevision !== taskPopulationRevision) {
    throw new Error('SUPERSESSION_RECEIPT_CORPUS_REVISION_MISMATCH');
  }
  if (!supersessionBases.has(link.basis)) throw new Error('SUPERSESSION_RECEIPT_BASIS_INVALID');
  if (typeof link.reason !== 'string' || !link.reason.trim()) throw new Error('SUPERSESSION_RECEIPT_REASON_REQUIRED');
  if (!Array.isArray(link.evidenceRefs) || link.evidenceRefs.length === 0
    || link.evidenceRefs.some((reference) => typeof reference !== 'string' || !reference.trim())
    || new Set(link.evidenceRefs).size !== link.evidenceRefs.length) {
    throw new Error('SUPERSESSION_RECEIPT_EVIDENCE_INVALID');
  }
  if (typeof link.reviewedBy !== 'string' || !link.reviewedBy.trim()) throw new Error('SUPERSESSION_RECEIPT_REVIEWER_REQUIRED');
  const reviewedAt = typeof link.reviewedAt === 'string' ? Date.parse(link.reviewedAt) : Number.NaN;
  if (!Number.isFinite(reviewedAt) || new Date(reviewedAt).toISOString() !== link.reviewedAt) {
    throw new Error('SUPERSESSION_RECEIPT_REVIEW_TIME_INVALID');
  }
  if (link.checksum !== supersessionLinkChecksumV1(link)) throw new Error('SUPERSESSION_RECEIPT_CHECKSUM_MISMATCH');

  const predecessor = taskCardByKey.get(link.sourceTaskKey);
  const successor = taskCardByKey.get(link.successorTaskKey);
  if (!predecessor || !successor || link.sourceTaskKey === link.successorTaskKey) {
    throw new Error('SUPERSESSION_RECEIPT_TASK_IDENTITY_UNRESOLVED');
  }
  if (predecessor.taskRevision !== link.sourceTaskRevision
    || predecessor.sourceFileRevision !== link.sourceFileRevision
    || successor.taskRevision !== link.successorRevision
    || successor.sourceFileRevision !== link.successorSourceFileRevision) {
    throw new Error('SUPERSESSION_RECEIPT_TASK_REVISION_MISMATCH');
  }
  if (link.sourceRef !== `${predecessor.sourcePath}#L${predecessor.sourceLine}`
    || link.successorSourceRef !== `${successor.sourcePath}#L${successor.sourceLine}`) {
    throw new Error('SUPERSESSION_RECEIPT_SOURCE_REF_MISMATCH');
  }
  if (!link.evidenceRefs.includes(link.sourceRef) || !link.evidenceRefs.includes(link.successorSourceRef)) {
    throw new Error('SUPERSESSION_RECEIPT_SOURCE_EVIDENCE_REQUIRED');
  }
  if (link.lastValidRevision !== predecessor.taskRevision) throw new Error('SUPERSESSION_RECEIPT_LAST_VALID_REVISION_MISMATCH');
  if (link.archiveManifestRef !== null || link.rawArtifactPointer !== null) {
    throw new Error('SUPERSESSION_ARCHIVE_POINTER_UNVERIFIED');
  }
  return { predecessor, successor };
}

function assertSupersessionGraphAcyclic(links) {
  const nextBySource = new Map(links.map((link) => [link.sourceTaskKey, link.successorTaskKey]));
  for (const source of nextBySource.keys()) {
    const visited = new Set();
    let current = source;
    while (nextBySource.has(current)) {
      if (visited.has(current)) throw new Error('SUPERSESSION_RECEIPT_CYCLE');
      visited.add(current);
      current = nextBySource.get(current);
    }
  }
}

export function buildReportArtifactManifestV1({ path, sizeBytes, modifiedAt, priorEntry, sha256, checksumState }) {
  if (!path || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !checksumState) {
    throw new Error('REPORT_MANIFEST_REQUIRED_FIELD_MISSING');
  }
  return {
    schema: 'atlas.report-artifact-manifest.v1',
    artifactId: path,
    sha256: sha256 ?? null,
    checksumState,
    producer: priorEntry?.metadata?.producer ?? null,
    producerRevision: priorEntry?.metadata?.sourceCommit ?? null,
    sizeBytes,
    mediaType: mediaTypeFor(path),
    createdAt: priorEntry?.metadata?.createdAt ?? null,
    modifiedAt: modifiedAt ?? null,
    associatedTaskKeys: [],
    taskAssociationState: 'NOT_JOINED',
    storageClass: 'WARM_LOCAL',
    localDisposition: 'REVIEW_REQUIRED_RETAIN_LOCAL',
    replayRequired: null,
    replayReviewState: 'UNASSESSED',
    sensitivityClass: 'UNASSESSED',
    seaweedRef: null,
    archiveCopyState: 'NOT_COPIED',
    archiveEligible: false,
  };
}

export function attachVerifiedSeaweedCopyV1({ manifest, artifactRef, hydrationReceipt }) {
  if (manifest?.schema !== 'atlas.report-artifact-manifest.v1') throw new Error('REPORT_COPY_MANIFEST_SCHEMA_UNSUPPORTED');
  const checksum = String(manifest.sha256 ?? '').replace(/^sha256:/i, '').toLowerCase();
  const artifact = artifactRef?.artifact;
  if (manifest.checksumState !== 'FRESH_SHA256' || !/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error('REPORT_COPY_REQUIRES_FRESH_SOURCE_CHECKSUM');
  }
  if (artifactRef?.canonical_authority !== false || artifact?.canonical_authority !== false) {
    throw new Error('REPORT_COPY_ARTIFACT_AUTHORITY_INVALID');
  }
  if (artifact?.backend !== 'SEAWEEDFS_S3' || artifact.content_checksum !== checksum || artifact.content_length_bytes !== manifest.sizeBytes) {
    throw new Error('REPORT_COPY_ARTIFACT_BINDING_MISMATCH');
  }
  if (
    hydrationReceipt?.status !== 'VERIFIED_READY'
    || hydrationReceipt.expected_checksum !== checksum
    || hydrationReceipt.observed_checksum !== checksum
    || hydrationReceipt.hydrated_bytes !== manifest.sizeBytes
    || hydrationReceipt.artifact_id !== artifact.artifact_id
  ) {
    throw new Error('REPORT_COPY_READBACK_UNPROVEN');
  }
  if (!artifact.bucket || !artifact.object_key || artifact.object_key.startsWith('/') || artifact.object_key.split('/').includes('..')) {
    throw new Error('REPORT_COPY_POINTER_INVALID');
  }
  return {
    ...manifest,
    storageClass: 'COLD_SEAWEEDFS',
    localDisposition: 'RETAIN_LOCAL',
    seaweedRef: `seaweedfs://${artifact.bucket}/${artifact.object_key}`,
    archiveCopyState: 'COPY_READBACK_VERIFIED',
    archiveEligible: false,
  };
}

export function mediaTypeFor(path) {
  const extension = path.toLowerCase().split('.').pop();
  return ({
    json: 'application/json',
    jsonl: 'application/x-ndjson',
    ndjson: 'application/x-ndjson',
    md: 'text/markdown',
    yaml: 'application/yaml',
    yml: 'application/yaml',
  })[extension] ?? 'application/octet-stream';
}

export function buildReportManifestCorpusV1({ workspaceHead, workspaceRevision = null, previousAudit, manifests, metadataOnlyFiles, hashedBytes }) {
  const verifiedColdCopies = manifests.filter((item) => item.archiveCopyState === 'COPY_READBACK_VERIFIED').length;
  return {
    schema: 'atlas.report-artifact-manifest-corpus.v1',
    generatedAt: new Date().toISOString(),
    workspaceHead,
    workspaceRevision,
    previousAudit: {
      generatedAt: previousAudit?.generatedAt ?? null,
      auditHead: previousAudit?.auditHead ?? null,
      reusePolicy: 'Reuse SHA-256 only when both size and modifiedAt exactly match the prior audited entry; this is a cache hit, not fresh checksum proof.',
    },
    summary: {
      artifactCount: manifests.length,
      metadataOnlyFiles,
      freshlyHashedBytes: hashedBytes,
      cachedChecksumCount: manifests.filter((item) => item.checksumState === 'CACHED_PRIOR_AUDIT_STAT_MATCH').length,
      freshChecksumCount: manifests.filter((item) => item.checksumState === 'FRESH_SHA256').length,
      checksumReviewRequiredCount: manifests.filter((item) => item.checksumState === 'REVIEW_REQUIRED_UNHASHED').length,
      associatedTaskCount: manifests.reduce((count, item) => count + item.associatedTaskKeys.length, 0),
      coldCandidateCount: 0,
      verifiedColdCopies,
      archiveWrites: false,
      localSourcesRetained: manifests.every((item) => item.localDisposition === 'RETAIN_LOCAL' || item.localDisposition === 'REVIEW_REQUIRED_RETAIN_LOCAL'),
    },
    policy: {
      archiveNeedsCurrentReferencesReplaySensitivityCanonicalStatusAndReviewedSupersession: true,
      sizeAloneDoesNotQualify: true,
      canonicalAuthority: false,
      mutationAuthorized: false,
    },
    artifacts: manifests,
    writesPerformed: false,
  };
}

export function joinCurrentReceiptOutputsToReportManifestV1({
  taskCardCorpus,
  reportManifestCorpus,
  validatedReceiptsByUri,
  freshOutputChecksumsByPath,
}) {
  if (taskCardCorpus?.schema !== 'atlas.openspec-task-card-corpus.v1') throw new Error('REPORT_JOIN_TASK_CARD_SCHEMA_UNSUPPORTED');
  if (reportManifestCorpus?.schema !== 'atlas.report-artifact-manifest-corpus.v1') throw new Error('REPORT_JOIN_MANIFEST_SCHEMA_UNSUPPORTED');
  if (taskCardCorpus.source?.workspaceHead !== reportManifestCorpus.workspaceHead
    || !taskCardCorpus.source?.workspaceRevision
    || taskCardCorpus.source.workspaceRevision !== reportManifestCorpus.workspaceRevision) {
    throw new Error('REPORT_JOIN_WORKSPACE_REVISION_MISMATCH');
  }

  const cardsByRefAndRevision = new Map();
  for (const card of taskCardCorpus.cards ?? []) {
    const key = `${card.sourcePath}#L${card.sourceLine}\0${card.taskRevision}`;
    const cards = cardsByRefAndRevision.get(key) ?? [];
    cards.push(card);
    cardsByRefAndRevision.set(key, cards);
  }
  const artifactsByPath = new Map((reportManifestCorpus.artifacts ?? []).map((artifact) => [artifact.artifactId, artifact]));
  const joined = new Map();
  let receiptOutputCandidateCount = 0;
  let rejectedReceiptCount = 0;
  let rejectedOutputCount = 0;

  for (const card of taskCardCorpus.cards ?? []) {
    for (const receiptOutput of card.receiptOutputRefs ?? []) {
      receiptOutputCandidateCount += 1;
      const expectedTaskRef = `${card.sourcePath}#L${card.sourceLine}`;
      const receipt = validatedReceiptsByUri?.[receiptOutput.receiptUri];
      const receiptSourceBoundToTask = (receipt?.sourceRefs ?? []).some((sourceRef) => {
        const sourcePath = String(sourceRef.file ?? '').replaceAll('\\', '/');
        return sourcePath === card.sourcePath
          && Number.isInteger(sourceRef.lineStart)
          && Number.isInteger(sourceRef.lineEnd)
          && sourceRef.lineStart <= card.sourceLine
          && sourceRef.lineEnd >= card.sourceLine;
      });
      const outputBoundToReceipt = (receipt?.outputs ?? []).some((output) => String(output.uri ?? '').replaceAll('\\', '/') === receiptOutput.artifactId
        && output.checksum === receiptOutput.sha256);
      if (!receipt || receipt.evidenceId !== receiptOutput.receiptRef
        || receipt.changeId !== card.changeId
        || (card.declaredTaskId != null && receipt.taskId !== card.declaredTaskId)
        || !receiptSourceBoundToTask
        || receipt.sourceRevision !== receiptOutput.taskRevision || receipt.workspaceRevision !== receiptOutput.workspaceRevision
      || !outputBoundToReceipt || !receiptOutput.receiptRef || receiptOutput.taskKey !== card.stableKey
      || receiptOutput.taskRef !== expectedTaskRef || receiptOutput.taskRevision !== card.taskRevision
      || receiptOutput.workspaceRevision !== taskCardCorpus.source.workspaceRevision) {
      rejectedReceiptCount += 1;
      continue;
    }
    const taskKey = `${receiptOutput.taskRef}\0${receiptOutput.taskRevision}`;
    const matchingCards = cardsByRefAndRevision.get(taskKey) ?? [];
    if (matchingCards.length !== 1) {
      rejectedReceiptCount += 1;
      continue;
    }
    if (matchingCards[0].stableKey !== card.stableKey) {
      rejectedReceiptCount += 1;
      continue;
    }
    const artifactPath = String(receiptOutput.artifactId ?? '').replaceAll('\\', '/');
    const artifact = artifactsByPath.get(artifactPath);
    const freshChecksum = freshOutputChecksumsByPath?.[artifactPath];
    if (!artifact || !receiptOutput.sha256 || !freshChecksum || receiptOutput.sha256 !== freshChecksum || artifact.sizeBytes >= 10_000_000) {
      rejectedOutputCount += 1;
      continue;
    }
    const associations = joined.get(artifactPath) ?? [];
    associations.push({
      taskKey: card.stableKey,
      taskRevision: card.taskRevision,
      receiptRef: receiptOutput.receiptRef,
      workspaceRevision: taskCardCorpus.source.workspaceRevision,
      artifactSha256: freshChecksum,
    });
    joined.set(artifactPath, associations);
    }
  }

  const artifacts = (reportManifestCorpus.artifacts ?? []).map((artifact) => {
    const associations = joined.get(artifact.artifactId) ?? [];
    if (associations.length === 0) return artifact;
    const uniqueAssociations = [...new Map(associations.map((item) => [`${item.taskKey}\0${item.taskRevision}\0${item.receiptRef}`, item])).values()];
    return {
      ...artifact,
      associatedTaskKeys: [...new Set(uniqueAssociations.map((item) => item.taskKey))].sort(),
      taskAssociationState: 'JOINED_CURRENT_RECEIPT_OUTPUT',
      taskAssociationRefs: uniqueAssociations,
      sha256: uniqueAssociations[0].artifactSha256,
      checksumState: 'FRESH_SHA256',
    };
  });
  const associatedTaskCount = artifacts.reduce((count, artifact) => count + artifact.associatedTaskKeys.length, 0);
  return {
    ...reportManifestCorpus,
    summary: {
      ...reportManifestCorpus.summary,
      associatedTaskCount,
      receiptOutputCandidateCount,
      rejectedCurrentReceiptCount: rejectedReceiptCount,
      rejectedReceiptOutputCount: rejectedOutputCount,
    },
    artifacts,
    associationPolicy: {
      owner: 'REVISION_BOUND_EVIDENCE_RECEIPT_OUTPUTS',
      requiresCurrentTaskSourceWorkspaceAndReceipt: true,
      requiresFreshOutputChecksumMatch: true,
      historicalAndStaleReceiptsExcluded: true,
      canonicalAuthority: false,
    },
    writesPerformed: false,
  };
}

export function buildSupersessionLinkV1(card) {
  if (!(card.reviewReasons ?? []).some((reason) => ['SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED', 'SUPERSESSION_HEURISTIC_REQUIRES_REVIEW'].includes(reason))) return null;
  if (!card.stableKey || !card.taskRevision || !card.sourceFileRevision || !card.sourcePath
    || !Number.isSafeInteger(card.sourceLine) || card.sourceLine < 1) {
    throw new Error('SUPERSESSION_CANDIDATE_SOURCE_BINDING_REQUIRED');
  }
  return {
    schema: 'atlas.openspec-supersession-link.v1',
    sourceTaskKey: card.stableKey,
    sourceTaskRevision: card.taskRevision,
    sourceFileRevision: card.sourceFileRevision,
    sourceRef: `${card.sourcePath}#L${card.sourceLine}`,
    successorTaskKey: null,
    successorRevision: null,
    relation: 'SUPERSESSION_REVIEW_CANDIDATE',
    reason: 'Supersession candidate only; no exact successor link or reviewed revision-bound receipt is bound.',
    reviewState: 'REVIEW_REQUIRED',
    confirmed: false,
    retrievalSuppressed: false,
    mutationAuthorized: false,
    archiveManifestRef: null,
    rawArtifactPointer: null,
    canonicalAuthority: false,
  };
}

export function buildTaskTriageCorpusV1({ taskCardCorpus, reportManifestCorpus, workspaceHead, reviewedSupersessionLinks = [] }) {
  if (taskCardCorpus?.schema !== 'atlas.openspec-task-card-corpus.v1') throw new Error('TRIAGE_TASK_CARD_SCHEMA_UNSUPPORTED');
  if (reportManifestCorpus?.schema !== 'atlas.report-artifact-manifest-corpus.v1') throw new Error('TRIAGE_REPORT_MANIFEST_SCHEMA_UNSUPPORTED');
  if (taskCardCorpus.source?.workspaceHead !== workspaceHead || reportManifestCorpus.workspaceHead !== workspaceHead) {
    throw new Error('TRIAGE_WORKSPACE_HEAD_MISMATCH');
  }
  if (!Array.isArray(taskCardCorpus.cards)) throw new Error('TRIAGE_TASK_CARD_ARRAY_REQUIRED');
  if (!Array.isArray(reviewedSupersessionLinks)) throw new Error('SUPERSESSION_RECEIPTS_MUST_BE_ARRAY');
  const taskPopulationRevision = taskCardCorpus.source.sourcePopulationChecksum;
  if (reviewedSupersessionLinks.length > 0 && !taskPopulationRevision) throw new Error('SUPERSESSION_TASK_POPULATION_REVISION_REQUIRED');

  const taskCardByKey = new Map();
  for (const card of taskCardCorpus.cards) {
    if (!card.stableKey || taskCardByKey.has(card.stableKey)) throw new Error('TRIAGE_TASK_CARD_IDENTITY_AMBIGUOUS');
    taskCardByKey.set(card.stableKey, card);
  }

  const confirmedBySource = new Map();
  const confirmedLinks = [];
  for (const link of reviewedSupersessionLinks) {
    const { predecessor, successor } = verifyReviewedSupersessionLinkV1(link, taskCardByKey, workspaceHead, taskPopulationRevision);
    if (confirmedBySource.has(link.sourceTaskKey)) throw new Error('SUPERSESSION_RECEIPT_AMBIGUOUS_SUCCESSOR');
    confirmedBySource.set(link.sourceTaskKey, link);
    confirmedLinks.push({
      ...link,
      sourceRef: `${predecessor.sourcePath}#L${predecessor.sourceLine}`,
      successorSourceRef: `${successor.sourcePath}#L${successor.sourceLine}`,
      lastValidRevision: predecessor.taskRevision,
      archiveManifestRef: null,
      rawArtifactPointer: null,
    });
  }
  assertSupersessionGraphAcyclic(confirmedLinks);

  const derivedCards = taskCardCorpus.cards.map((card) => {
    const link = confirmedBySource.get(card.stableKey);
    if (!link) return card;
    const reviewReasons = (card.reviewReasons ?? []).filter((reason) => ![
      'SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED',
      'SUPERSESSION_HEURISTIC_REQUIRES_REVIEW',
    ].includes(reason));
    return {
      ...card,
      lifecycleState: 'SUPERSEDED',
      retrievalState: 'SUPERSEDED',
      reviewReasons,
      authorityReviewState: 'CONFIRMED_SUPERSESSION',
      supersededBy: {
        taskKey: link.successorTaskKey,
        taskRevision: link.successorRevision,
        receiptChecksum: link.checksum,
      },
      canonicalAuthority: false,
      mutationAuthorized: false,
    };
  });
  const retrievalStateCounts = Object.fromEntries([...new Set(derivedCards.map((card) => card.retrievalState))]
    .sort().map((state) => [state, derivedCards.filter((card) => card.retrievalState === state).length]));
  const derivedTaskCardCorpus = {
    ...taskCardCorpus,
    cards: derivedCards,
    summary: { ...taskCardCorpus.summary, retrievalStateCounts },
  };
  const supersessionCandidates = taskCardCorpus.cards
    .filter((card) => !confirmedBySource.has(card.stableKey))
    .map(buildSupersessionLinkV1).filter(Boolean);
  const supersessionLinks = [...supersessionCandidates, ...confirmedLinks];
  return {
    schema: 'atlas.openspec-task-triage-corpus.v1',
    generatedAt: new Date().toISOString(),
    workspaceHead,
    taskPopulationRevision,
    taskCardCorpus: derivedTaskCardCorpus,
    reportManifestCorpus,
    supersessionLinks,
    retrievalPolicy: {
      defaultStates: ['CURRENT', 'WAITING', 'REVIEW_REQUIRED'],
      historyOnlyStates: ['SUPERSEDED', 'HISTORICAL'],
      explicitHistoryQueryRequired: true,
      confirmedSupersededCount: confirmedLinks.length,
      supersessionReceiptChecksum: confirmedLinks.length
        ? sha256(JSON.stringify(confirmedLinks.map((link) => link.checksum).sort()))
        : null,
    },
    summary: {
      taskCount: taskCardCorpus.summary.taskCount,
      reportArtifactCount: reportManifestCorpus.summary.artifactCount,
      supersessionReviewCandidateCount: supersessionCandidates.length,
      confirmedSupersededCount: confirmedLinks.length,
      archiveEligibleCount: reportManifestCorpus.artifacts.filter((item) => item.archiveEligible).length,
      retrievalStateCounts: taskCardCorpus.summary.retrievalStateCounts,
      canonicalAuthority: false,
      mutationAuthorized: false,
    },
    writesPerformed: false,
  };
}

export function selectOpenSpecTaskCardsV1({ corpus, includeHistory = false, cardStates = null, limit = 100 }) {
  if (corpus?.schema !== 'atlas.openspec-task-triage-corpus.v1') throw new Error('TRIAGE_CORPUS_SCHEMA_UNSUPPORTED');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) throw new Error('TRIAGE_RETRIEVAL_LIMIT_INVALID');
  if (cardStates !== null && (!Array.isArray(cardStates) || cardStates.some((state) => typeof state !== 'string'))) {
    throw new Error('TRIAGE_CARD_STATES_INVALID');
  }
  const allowedStates = new Set([
    ...(corpus.retrievalPolicy?.defaultStates ?? []),
    ...(includeHistory ? corpus.retrievalPolicy?.historyOnlyStates ?? [] : []),
  ]);
  const allowedCardStates = cardStates === null ? null : new Set(cardStates);
  const eligible = corpus.taskCardCorpus?.cards?.filter((card) => allowedStates.has(card.retrievalState)
    && (allowedCardStates === null || allowedCardStates.has(card.state))) ?? [];
  const cards = eligible.slice(0, limit);
  const candidateChecksum = sha256(JSON.stringify(cards));
  return {
    schema: 'atlas.openspec-task-retrieval-result.v1',
    workspaceHead: corpus.workspaceHead,
    taskPopulationRevision: corpus.taskPopulationRevision,
    includeHistory,
    selectedCardStates: allowedCardStates === null ? null : [...allowedCardStates].sort(),
    orderingOwner: 'TASK_CARD_COMPILER_INPUT_ORDER',
    candidateChecksum,
    rankerApplied: false,
    eligibleCount: eligible.length,
    returnedCount: cards.length,
    truncated: eligible.length > cards.length,
    cards,
    canonicalAuthority: false,
    mutationAuthorized: false,
    writesPerformed: false,
  };
}
