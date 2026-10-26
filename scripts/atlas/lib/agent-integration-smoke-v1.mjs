import { createHash } from 'node:crypto';

export const REQUIRED_AGENT_INTEGRATION_SMOKE_OWNERS_V1 = [
  'sveltekit-health',
  'couchdb-health',
  'mastra-tool-agent',
  'copilotkit-ag-ui',
  'opentelemetry-export-readback',
  'firecrawl',
  'mcp-okf-reference-corpus',
  'hyperrag-searchruntime',
  'verified-context',
  'workspace-source-currentness',
  'nes-palette',
  'redis-valkey-capabilities',
  'centroid-retrieval',
  'topk-source-evidence',
  'offline-couchdb-duckdb',
  'offline-postgres-msgpack-diagnostic',
];

export const VALKEY_READ_ONLY_NAMESPACE_PATTERNS_V1 = Object.freeze([
  'bitfrost:*',
  'bifrost:*',
  'hg:*',
  'ace:packet:*',
  'pa:telemetry*',
  'corpus:centroids:*',
  'taxonomy:clusters:*',
  'gpu:karpathy:encoded',
  'code:index*',
]);

export function summarizeTestProcessResultV1(result, countPattern) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = output.match(countPattern);
  return {
    status: result.error || result.status !== 0 ? 'FAIL' : 'PASS',
    testCount: match ? Number(match[1]) : null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: typeof result.signal === 'string' ? result.signal : null,
    spawnErrorCode: typeof result.error?.code === 'string' ? result.error.code : null,
    summaryDetected: Boolean(match),
  };
}

export function classifyMastraToolRegistrationV1({ toolContractPresent, appRuntimeImportPresent, agentToolBindingPresent }) {
  if (!toolContractPresent) return 'NOT_FOUND';
  return appRuntimeImportPresent && agentToolBindingPresent ? 'REGISTERED' : 'FIXTURE_ONLY';
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function sha256CanonicalV1(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export function verifyMastraRouteReadbackReceiptV1(receipt, expectedRequestId = null) {
  const traceFound = receipt?.langfuse?.readbackVerdict === 'REQUEST_TRACE_READBACK_VERIFIED'
    && typeof receipt.langfuse.observationReadback?.traceId === 'string'
    && receipt.langfuse.observationReadback.traceId.length > 0
    && receipt.langfuse.observationReadback.httpStatus === 200
    && Number.isInteger(receipt.langfuse.observationReadback.observationCount)
    && receipt.langfuse.observationReadback.observationCount > 0
    && Number.isInteger(receipt.langfuse.observationReadback.requestIdMatches)
    && receipt.langfuse.observationReadback.requestIdMatches > 0
    && Array.isArray(receipt.langfuse.observationReadback.matchingObservationIds)
    && receipt.langfuse.observationReadback.matchingObservationIds.length === receipt.langfuse.observationReadback.requestIdMatches
    && receipt.langfuse.observationReadback.matchingObservationIds.every((id) => typeof id === 'string' && id.length > 0)
    && Array.isArray(receipt.langfuse.observationReadback.matchingAttributePaths)
    && receipt.langfuse.observationReadback.matchingAttributePaths.includes('metadata.attributes.parent_atlas.request_id')
    && receipt.langfuse.requestIdMatches === 0;
  const traceNotFound = receipt?.langfuse?.readbackVerdict === 'REQUEST_TRACE_NOT_FOUND'
    && receipt.langfuse.requestIdMatches === 0
    && (!receipt.langfuse.observationReadback || receipt.langfuse.observationReadback.requestIdMatches === 0);
  if (receipt?.schema !== 'atlas.mastra-route-otel-paged-readback.v1'
    || receipt.mode !== 'REFUSAL_ONLY_READBACK'
    || typeof receipt.requestId !== 'string'
    || receipt.route?.path !== '/api/atlas/mastra-agent'
    || receipt.route.httpStatus !== 409
    || receipt.route.refusalCode !== 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE'
    || receipt.route.firstFailingBoundary !== 'WORKSPACE_AUTHORITY'
    || receipt.route.agentExecutionStatus !== 'NOT_STARTED'
    || receipt.route.canonicalAdmission !== 'NOT_ADMITTED'
    || receipt.route.writesPerformed !== false
    || receipt.langfuse?.httpStatus !== 200
    || !Number.isInteger(receipt.langfuse?.pagination?.pagesRead)
    || !Number.isInteger(receipt.langfuse?.pagination?.traceRecordsRead)
    || !Number.isInteger(receipt.langfuse.routeNameMatches)
    || (!traceFound && !traceNotFound)
    || receipt.authority?.canonicalAuthority !== false
    || receipt.authority?.operatorPinConfigured !== false
    || !Array.isArray(receipt.limitations)) {
    throw new Error('MASTRA_ROUTE_READBACK_CONTRACT_INVALID');
  }
  if (expectedRequestId !== null && receipt.requestId !== expectedRequestId) {
    throw new Error('MASTRA_ROUTE_READBACK_REQUEST_ID_MISMATCH');
  }
  const { checksumSha256, ...body } = receipt;
  if (typeof checksumSha256 !== 'string' || checksumSha256 !== sha256CanonicalV1(body)) {
    throw new Error('MASTRA_ROUTE_READBACK_CHECKSUM_MISMATCH');
  }
  return true;
}

export function verifyWorkspaceCurrentnessReconciliationReceiptV1(receipt) {
  const { receiptChecksum, ...body } = receipt ?? {};
  const actualChecksum = `sha256:${createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex')}`;
  const admitted = body.liveByteReadback?.admittedSnapshot;
  const scratch = body.liveByteReadback?.latestScratchFrame;
  if (body.schema !== 'atlas.workspace-admission-currentness-reconciliation.v1'
    || body.mode !== 'READ_ONLY_LIVE_SOURCE_BYTE_RECHECK'
    || body.admission?.manifestDigestVerified !== true
    || body.admission?.canonicalAuthority !== false
    || body.admission?.manifestWorkspaceRevision !== null
    || body.latestScratchFrame?.canonicalAuthority !== false
    || body.latestScratchFrame?.workspaceRevision !== null
    || body.verdict?.workspaceAuthority !== 'NOT_ESTABLISHED'
    || body.verdict?.canonicalPromotionAuthorized !== false
    || body.verdict?.operatorPinSet !== false
    || body.verdict?.persistentWrites !== 0
    || !admitted || !scratch
    || !Number.isInteger(admitted.sourceCount) || !Number.isInteger(admitted.exactMatches)
    || !Number.isInteger(admitted.violationCount) || admitted.sourceCount < admitted.exactMatches
    || admitted.violationCount !== admitted.sourceCount - admitted.exactMatches
    || !Number.isInteger(scratch.sourceCount) || !Number.isInteger(scratch.exactMatches)
    || !Number.isInteger(scratch.violationCount) || scratch.sourceCount < scratch.exactMatches
    || scratch.violationCount !== scratch.sourceCount - scratch.exactMatches
    || !Number.isInteger(body.manifestComparison?.exactIdentityOverlap)
    || receiptChecksum !== actualChecksum) {
    throw new Error('WORKSPACE_CURRENTNESS_RECONCILIATION_INVALID');
  }
  return true;
}

export function verifyValkeyKeyCensusReceiptV1(receipt) {
  const { receiptChecksum, ...body } = receipt ?? {};
  const namespaceCounts = body.namespaces;
  const ttl = body.ttl;
  const expectedChecksum = `sha256:${createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex')}`;
  if (body.schema !== 'atlas.valkey-key-census.v1'
    || body.ping !== 'PONG'
    || typeof body.generatedAt !== 'string'
    || typeof body.endpoint?.host !== 'string'
    || !Number.isInteger(body.endpoint?.port)
    || !Number.isInteger(body.keyspace?.scannedKeys)
    || !namespaceCounts || typeof namespaceCounts !== 'object' || Array.isArray(namespaceCounts)
    || Object.values(namespaceCounts).some((count) => !Number.isInteger(count) || count < 0)
    || !Number.isInteger(ttl?.sampleSize) || ttl.sampleSize < 0
    || !Number.isInteger(ttl?.withoutTtl) || ttl.withoutTtl < 0 || ttl.withoutTtl > ttl.sampleSize
    || !ttl.withoutTtlByNamespace || typeof ttl.withoutTtlByNamespace !== 'object' || Array.isArray(ttl.withoutTtlByNamespace)
    || Object.values(ttl.withoutTtlByNamespace).some((count) => !Number.isInteger(count) || count < 0)
    || body.canonicalAuthority !== false
    || body.writesPerformed !== false
    || receiptChecksum !== expectedChecksum) {
    throw new Error('VALKEY_KEY_CENSUS_RECEIPT_INVALID');
  }
  return true;
}

export function verifyFirecrawlSinglePageSmokeReceiptV1(receipt, contentBytes = null) {
  if (receipt?.schema !== 'atlas.firecrawl-single-page-smoke.v1'
    || receipt.mode !== 'READ_ONLY_EXTERNAL_DOCUMENTATION'
    || typeof receipt.capturedAt !== 'string'
    || typeof receipt.requestId !== 'string'
    || receipt.request?.url !== 'https://docs.firecrawl.dev/api-reference/endpoint/scrape'
    || JSON.stringify(receipt.request?.formats) !== JSON.stringify(['markdown'])
    || receipt.request.onlyMainContent !== true
    || receipt.request.maxAge !== 0
    || receipt.request.storeInCache !== false
    || receipt.request.crawl !== false
    || receipt.request.followLinks !== false
    || receipt.observed?.sourceURL !== receipt.request.url
    || receipt.observed?.resolvedURL !== receipt.request.url
    || receipt.observed?.statusCode !== 200
    || typeof receipt.observed?.title !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(receipt.observed?.contentSha256 ?? '')
    || !Number.isInteger(receipt.observed?.contentBytes)
    || receipt.observed.contentBytes <= 0
    || !Number.isInteger(receipt.observed?.characterCount)
    || receipt.observed.characterCount <= 0
    || typeof receipt.observed?.scrapeId !== 'string'
    || typeof receipt.contentArtifact?.path !== 'string'
    || !receipt.contentArtifact.path.startsWith('.tmp/atlas/firecrawl-smoke/raw/')
    || receipt.contentArtifact.path.split(/[\\/]/).includes('..')
    || receipt.contentArtifact.sha256 !== receipt.observed.contentSha256
    || receipt.contentArtifact.byteLength !== receipt.observed.contentBytes
    || receipt.authority?.sourceIdentity !== 'UNBOUND_EXTERNAL_SOURCE'
    || receipt.authority.canonicalAuthority !== false
    || receipt.authority.admitted !== false
    || receipt.sideEffects?.scratchArtifactWritten !== true
    || ['externalArchiveWrites', 'postgresWrites', 'qdrantWrites', 'neo4jWrites', 'valkeyWrites', 'canonicalPromotion']
      .some((key) => receipt.sideEffects?.[key] !== false)
    || receipt.checks?.singleRequestedUrl !== true
    || receipt.checks?.http200 !== true
    || receipt.checks?.contentPresent !== true
    || receipt.checks?.sourceUrlMatches !== true
    || receipt.checks?.digestComputed !== true) {
    throw new Error('FIRECRAWL_SINGLE_PAGE_RECEIPT_CONTRACT_INVALID');
  }
  if (contentBytes !== null
    && (!Buffer.isBuffer(contentBytes)
      || contentBytes.byteLength !== receipt.contentArtifact.byteLength
      || `sha256:${createHash('sha256').update(contentBytes).digest('hex')}` !== receipt.contentArtifact.sha256
      || contentBytes.toString('utf8').length !== receipt.observed.characterCount)) {
    throw new Error('FIRECRAWL_CONTENT_ARTIFACT_DIGEST_MISMATCH');
  }
  const { receiptSha256, ...body } = receipt;
  if (typeof receiptSha256 !== 'string' || receiptSha256 !== sha256CanonicalV1(body)) {
    throw new Error('FIRECRAWL_SINGLE_PAGE_RECEIPT_CHECKSUM_MISMATCH');
  }
  return true;
}

export function compareOkfTaxonomyWithPostgresV1(groups, ontologyRows, legacyRows) {
  if (![groups, ontologyRows, legacyRows].every(Array.isArray)) throw new Error('TAXONOMY_CROSSWALK_ARRAYS_REQUIRED');
  const sourceById = new Map();
  for (const group of groups) {
    if (!group?.group_id || sourceById.has(group.group_id)) throw new Error('OKF_GROUP_ID_INVALID_OR_DUPLICATE');
    sourceById.set(group.group_id, group);
  }
  const compare = (rows, idKey, labelKey, parentKey, includeLevel) => {
    const dbById = new Map();
    for (const row of rows) {
      const id = row?.[idKey];
      if (!id || dbById.has(id)) throw new Error(`POSTGRES_TAXONOMY_ID_INVALID_OR_DUPLICATE:${idKey}`);
      dbById.set(id, row);
    }
    const mismatches = [];
    for (const group of groups) {
      const row = dbById.get(group.group_id);
      if (!row) {
        mismatches.push({ groupId: group.group_id, reason: 'MISSING_EXACT_ID' });
        continue;
      }
      const reasons = [];
      if (row[labelKey] !== group.label) reasons.push('LABEL_MISMATCH');
      if (row[parentKey] !== group.parent_group_id) reasons.push('PARENT_MISMATCH');
      if (includeLevel && row.taxonomyLevel !== group.taxonomy_level) reasons.push('LEVEL_MISMATCH');
      if (reasons.length) mismatches.push({ groupId: group.group_id, reason: reasons.join('+') });
    }
    const dbOnly = [...dbById.keys()].filter((id) => !sourceById.has(id)).sort();
    return { rowCount: rows.length, exactIdentityAndStructure: mismatches.length === 0 && dbOnly.length === 0 && rows.length === groups.length, mismatches, dbOnly };
  };
  return {
    sourceGroupCount: groups.length,
    atlasDomainOntology: compare(ontologyRows, 'groupId', 'groupLabel', 'parentGroupId', true),
    domainTaxonomyV1: compare(legacyRows, 'domainId', 'label', 'parentDomainId', false),
    semanticCrosswalk: 'REVIEW_REQUIRED',
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

export function buildAgentIntegrationSmokeReceiptV1(input) {
  if (!input.requestId || !Array.isArray(input.checks)) throw new Error('SMOKE_RECEIPT_INPUT_INVALID');
  const owners = input.checks.map((check) => check.owner);
  if (new Set(owners).size !== owners.length
    || REQUIRED_AGENT_INTEGRATION_SMOKE_OWNERS_V1.some((owner) => !owners.includes(owner))) {
    throw new Error('SMOKE_RECEIPT_OWNER_MATRIX_INCOMPLETE');
  }
  const body = {
    schema: 'atlas.agent-integration-smoke.v1',
    mode: 'READ_ONLY',
    requestId: input.requestId,
    capturedAt: input.capturedAt,
    checks: input.checks.map((check) => {
      const probe = {
        owner: check.owner,
        registration: check.registration,
        serviceHealth: check.serviceHealth,
        invocation: check.invocation,
        evidenceValidity: check.evidenceValidity,
        probeDetails: check.probeDetails ?? null,
        evidenceRefs: [...(check.evidenceRefs ?? [])],
        firstFailingBoundary: check.firstFailingBoundary ?? null,
        persistentWrites: 0,
      };
      return { ...probe, checkDigestSha256: sha256CanonicalV1(probe) };
    }),
    serviceHealth: input.serviceHealth,
    agentExecutionStatus: input.agentExecutionStatus,
    canonicalEvidenceValidity: input.canonicalEvidenceValidity,
    firstFailingBoundary: input.firstFailingBoundary,
    productionWritesAuthorized: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  const receipt = { ...body, checksumSha256: sha256CanonicalV1(body) };
  verifyAgentIntegrationSmokeReceiptV1(receipt);
  return receipt;
}

export function verifyAgentIntegrationSmokeReceiptV1(receipt) {
  if (receipt?.schema !== 'atlas.agent-integration-smoke.v1'
    || receipt.mode !== 'READ_ONLY'
    || receipt.canonicalAuthority !== false
    || receipt.writesPerformed !== false
    || receipt.productionWritesAuthorized !== false
    || !Array.isArray(receipt.checks)
    || new Set(receipt.checks.map((check) => check.owner)).size !== receipt.checks.length
    || REQUIRED_AGENT_INTEGRATION_SMOKE_OWNERS_V1.some((owner) => !receipt.checks.some((check) => check.owner === owner))
    || receipt.checks.some((check) => {
      if (check.persistentWrites !== 0 || typeof check.checkDigestSha256 !== 'string') return true;
      const { checkDigestSha256, ...probe } = check;
      return checkDigestSha256 !== sha256CanonicalV1(probe);
    })) {
    throw new Error('SMOKE_RECEIPT_CONTRACT_INVALID');
  }
  const { checksumSha256, ...body } = receipt;
  if (typeof checksumSha256 !== 'string' || checksumSha256 !== sha256CanonicalV1(body)) {
    throw new Error('SMOKE_RECEIPT_CHECKSUM_MISMATCH');
  }
  return true;
}

export function verifyPostgresMessagePackDiagnosticArtifactsV1({
  receipt,
  receiptBytes,
  receiptArtifactSha256,
  snapshotBytes,
  snapshotReceiptBytes,
  reduceReceiptBytes,
  reduceOutputBytes,
  descriptorBytes,
  decodeMessagePack,
  mapTelemetry,
}) {
  const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (!receipt || receipt.schema !== 'atlas.omr-msgpack-e2e-receipt.v1'
    || receipt.overallAuthority !== 'DIAGNOSTIC_ONLY_NOT_ADMITTED'
    || receipt.canonicalAuthority !== false || receipt.writesPerformed !== false
    || receipt.canonicalWrites !== 'DISABLED' || receipt.workspace_revision !== 'NOT_ADMITTED'
    || receipt.firstFailingBoundary !== null || typeof mapTelemetry !== 'function') {
    throw new Error('OMR_DIAGNOSTIC_AUTHORITY_INVALID');
  }
  if (digest(receiptBytes) !== receiptArtifactSha256) throw new Error('OMR_RECEIPT_ARTIFACT_DIGEST_MISMATCH');
  if (digest(snapshotReceiptBytes) !== receipt.links?.snapshot?.receiptDigest) throw new Error('OMR_SNAPSHOT_RECEIPT_DIGEST_MISMATCH');
  let snapshotReceipt;
  try { snapshotReceipt = JSON.parse(snapshotReceiptBytes.toString('utf8')); }
  catch { throw new Error('OMR_SNAPSHOT_RECEIPT_INVALID'); }
  if (snapshotReceipt?.schema !== 'atlas.omr-msgpack.packet-snapshot-receipt.v1'
    || snapshotReceipt.status !== 'CAPTURED_NOT_ADMITTED'
    || snapshotReceipt.source?.database !== 'legal_ai_db'
    || snapshotReceipt.source?.table !== 'atlas_packets'
    || snapshotReceipt.writesPerformed !== false
    || snapshotReceipt.canonicalWrites !== 'DISABLED'
    || snapshotReceipt.artifact?.file !== receipt.links?.snapshot?.file
    || snapshotReceipt.artifact?.digest !== digest(snapshotBytes)
    || snapshotReceipt.artifact?.rows !== 61718) {
    throw new Error('OMR_SNAPSHOT_RECEIPT_CONTENT_INVALID');
  }
  if (receipt.links?.snapshot?.digest !== digest(snapshotBytes)
    || receipt.links.snapshot.receiptDigest !== digest(snapshotReceiptBytes)) {
    throw new Error('OMR_SNAPSHOT_DIGEST_MISMATCH');
  }
  const snapshotRows = snapshotBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const uniquePacketKeys = new Set(snapshotRows.map((row) => row.packet_key).filter((key) => typeof key === 'string'));
  const sourceQualifiedCount = snapshotRows.filter((row) => /^sha256:[a-f0-9]{64}$/.test(String(row.source_revision))).length;
  if (snapshotRows.length !== 61718 || uniquePacketKeys.size !== snapshotRows.length
    || sourceQualifiedCount !== 16151 || snapshotRows.length - sourceQualifiedCount !== 45567) {
    throw new Error('OMR_SNAPSHOT_CENSUS_MISMATCH');
  }
  const reduceReceipt = JSON.parse(reduceReceiptBytes.toString('utf8'));
  const reduceReceiptDigest = digest(reduceReceiptBytes);
  if (!reduceReceipt || reduceReceipt.schema !== 'atlas.omr-duckdb-reduce-receipt.v1'
    || reduceReceipt.inputDigest !== digest(snapshotBytes)
    || reduceReceipt.outputDigest !== receipt.links?.reduce?.outputDigest
    || digest(reduceOutputBytes) !== reduceReceipt.outputDigest
    || reduceReceipt.counts?.snapshotRows !== snapshotRows.length
    || reduceReceipt.counts?.qualifiedRows !== sourceQualifiedCount
    || reduceReceipt.rejections?.MISSING_SOURCE_REVISION !== 45567
    || reduceReceipt.readback?.outputDigestReread !== true
    || reduceReceipt.writesPerformed !== false
    || reduceReceipt.canonicalWrites !== 'DISABLED') {
    throw new Error('OMR_REDUCE_READBACK_MISMATCH');
  }
  let decoded;
  try { decoded = decodeMessagePack(descriptorBytes); }
  catch { throw new Error('OMR_DESCRIPTOR_READBACK_MISMATCH'); }
  const entries = new Map((decoded?.entries ?? []).map((entry) => [entry.key, entry.value]));
  const packetRow = snapshotRows.find((row) => row.packet_key === receipt.links?.messagepack?.packetKey);
  if (digest(descriptorBytes) !== receipt.links?.messagepack?.descriptorDigest
    || descriptorBytes.byteLength !== receipt.links?.messagepack?.byteLength
    || decoded?.schema_id !== 'atlas.okf.tensor-kv-rpc-packet'
    || decoded?.canonical_authority !== false || decoded?.workspace_revision !== null
    || decoded?.tensors?.length !== 0 || decoded?.relations?.length !== 0
    || !packetRow || packetRow.source_revision !== decoded.source_revision
    || entries.get('packet.source_revision') !== packetRow.source_revision
    || entries.get('packet.source_ref') !== packetRow.source_ref
    || entries.get('snapshot.digest') !== digest(snapshotBytes)
    || entries.get('reduce.artifact_digest') !== digest(reduceOutputBytes)
    || entries.get('reduce.receipt_digest') !== reduceReceiptDigest
    || entries.get('reduce.artifact_ref') !== receipt.links?.reduce?.outputFile) {
    throw new Error('OMR_DESCRIPTOR_READBACK_MISMATCH');
  }
  const telemetry = mapTelemetry(receipt);
  if (telemetry.executionStatus !== 'SUCCEEDED' || telemetry.evidenceValidity !== 'DIGEST_VERIFIED'
    || telemetry.canonicalAdmission !== 'NOT_ADMITTED' || telemetry.agentRunId !== null
    || telemetry.receiptDigest !== receipt.checksumSha256) {
    throw new Error('OMR_TELEMETRY_MAPPING_INVALID');
  }
  return {
    snapshotRows: snapshotRows.length,
    uniquePacketKeys: uniquePacketKeys.size,
    sourceQualifiedRows: sourceQualifiedCount,
    excludedMissingSourceRevision: snapshotRows.length - sourceQualifiedCount,
    qualifiedRows: reduceReceipt.counts.qualifiedRows,
    distinctFeatures: reduceReceipt.counts.distinctFeatures,
    snapshotDigest: digest(snapshotBytes),
    snapshotReceiptDigest: digest(snapshotReceiptBytes),
    reduceOutputDigest: digest(reduceOutputBytes),
    reduceReceiptDigest,
    descriptorDigest: digest(descriptorBytes),
    descriptorByteLength: descriptorBytes.byteLength,
    packetKey: packetRow.packet_key,
    receiptArtifactSha256,
    receiptChecksum: receipt.checksumSha256,
    telemetry,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
