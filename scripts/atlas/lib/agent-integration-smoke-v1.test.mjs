import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentIntegrationSmokeReceiptV1,
  classifyMastraToolRegistrationV1,
  compareOkfTaxonomyWithPostgresV1,
  REQUIRED_AGENT_INTEGRATION_SMOKE_OWNERS_V1,
  VALKEY_READ_ONLY_NAMESPACE_PATTERNS_V1,
  sha256CanonicalV1,
  summarizeTestProcessResultV1,
  verifyPostgresMessagePackDiagnosticArtifactsV1,
  verifyFirecrawlSinglePageSmokeReceiptV1,
  verifyMastraRouteReadbackReceiptV1,
  verifyWorkspaceCurrentnessReconciliationReceiptV1,
  verifyValkeyKeyCensusReceiptV1,
  verifyAgentIntegrationSmokeReceiptV1,
} from './agent-integration-smoke-v1.mjs';

test('preserves bounded child-test exit diagnostics without retaining raw output', () => {
  assert.deepEqual(summarizeTestProcessResultV1({
    status: 0,
    signal: null,
    stdout: 'Test Files  6 passed (6)\n      Tests  46 passed (46)',
    stderr: '',
  }, /Tests\s+(\d+) passed/), {
    status: 'PASS',
    testCount: 46,
    timedOut: false,
    exitCode: 0,
    signal: null,
    spawnErrorCode: null,
    summaryDetected: true,
  });
  assert.deepEqual(summarizeTestProcessResultV1({
    status: null,
    signal: null,
    error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    stdout: '',
    stderr: '',
  }, /Tests\s+(\d+) passed/), {
    status: 'FAIL',
    testCount: null,
    timedOut: true,
    exitCode: null,
    signal: null,
    spawnErrorCode: 'ETIMEDOUT',
    summaryDetected: false,
  });
});
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const msgpack = createRequire(path.join(root, 'sveltekit-frontend', 'package.json'))('@msgpack/msgpack');

test('does not call a fixture Mastra tool live-registered without app runtime and agent binding', () => {
  assert.equal(classifyMastraToolRegistrationV1({
    toolContractPresent: true,
    appRuntimeImportPresent: false,
    agentToolBindingPresent: false,
  }), 'FIXTURE_ONLY');
  assert.equal(classifyMastraToolRegistrationV1({
    toolContractPresent: true,
    appRuntimeImportPresent: true,
    agentToolBindingPresent: false,
  }), 'FIXTURE_ONLY');
  assert.equal(classifyMastraToolRegistrationV1({
    toolContractPresent: true,
    appRuntimeImportPresent: true,
    agentToolBindingPresent: true,
  }), 'REGISTERED');
  assert.equal(classifyMastraToolRegistrationV1({
    toolContractPresent: false,
    appRuntimeImportPresent: true,
    agentToolBindingPresent: true,
  }), 'NOT_FOUND');
});

const input = {
  requestId: 'smoke:fixture-1',
  capturedAt: '2026-10-23T00:00:00.000Z',
  serviceHealth: 'PARTIAL',
  agentExecutionStatus: 'NOT_STARTED',
  canonicalEvidenceValidity: 'NOT_ADMITTED',
  firstFailingBoundary: 'WORKSPACE_AUTHORITY',
  checks: REQUIRED_AGENT_INTEGRATION_SMOKE_OWNERS_V1.map((owner) => ({
    owner,
    registration: 'INVENTORIED',
    serviceHealth: 'NOT_PROBED',
    invocation: owner === 'verified-context' ? 'NOT_INVOKED' : 'NOT_APPLICABLE',
    evidenceValidity: owner === 'verified-context' ? 'NOT_ADMITTED' : 'NOT_VERIFIED',
    evidenceRefs: ['fixture:smoke-test'],
    firstFailingBoundary: owner === 'verified-context' ? 'WORKSPACE_AUTHORITY' : null,
  })),
};

test('builds a stable read-only integration receipt with independent verdicts', () => {
  const receipt = buildAgentIntegrationSmokeReceiptV1(input);
  assert.equal(verifyAgentIntegrationSmokeReceiptV1(receipt), true);
  assert.equal(receipt.serviceHealth, 'PARTIAL');
  assert.equal(receipt.agentExecutionStatus, 'NOT_STARTED');
  assert.equal(receipt.canonicalEvidenceValidity, 'NOT_ADMITTED');
  const contextCheck = receipt.checks.find((check) => check.owner === 'verified-context');
  assert.equal(contextCheck.invocation, 'NOT_INVOKED');
  assert.equal(contextCheck.persistentWrites, 0);
  assert.match(contextCheck.checkDigestSha256, /^[a-f0-9]{64}$/);
});

test('rejects receipt tampering', () => {
  const receipt = buildAgentIntegrationSmokeReceiptV1(input);
  assert.throws(() => verifyAgentIntegrationSmokeReceiptV1({ ...receipt, firstFailingBoundary: 'NONE' }), /CHECKSUM_MISMATCH/);
});

test('rejects claims of canonical authority or persistent writes', () => {
  const receipt = buildAgentIntegrationSmokeReceiptV1(input);
  assert.throws(() => verifyAgentIntegrationSmokeReceiptV1({ ...receipt, writesPerformed: true }), /CONTRACT_INVALID/);
});

test('requires every smoke-matrix owner exactly once', () => {
  assert.throws(() => buildAgentIntegrationSmokeReceiptV1({ ...input, checks: input.checks.slice(1) }), /OWNER_MATRIX_INCOMPLETE/);
});

test('censuses the actual centroid and topology-cache namespaces without value reads', () => {
  assert.ok(VALKEY_READ_ONLY_NAMESPACE_PATTERNS_V1.includes('taxonomy:clusters:*'));
  assert.ok(VALKEY_READ_ONLY_NAMESPACE_PATTERNS_V1.includes('gpu:karpathy:encoded'));
  assert.equal(VALKEY_READ_ONLY_NAMESPACE_PATTERNS_V1.includes('*'), false);
});

test('verifies a refusal-only Mastra route readback without claiming a trace exists', () => {
  const body = {
    schema: 'atlas.mastra-route-otel-paged-readback.v1',
    mode: 'REFUSAL_ONLY_READBACK',
    requestId: '69659a03-e1b6-4c57-a82c-7afe4128f2f3',
    route: { path: '/api/atlas/mastra-agent', httpStatus: 409, refusalCode: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', firstFailingBoundary: 'WORKSPACE_AUTHORITY', agentExecutionStatus: 'NOT_STARTED', canonicalAdmission: 'NOT_ADMITTED', writesPerformed: false },
    langfuse: { httpStatus: 200, pagination: { pagesRead: 20, traceRecordsRead: 2000 }, requestIdMatches: 0, routeNameMatches: 0, readbackVerdict: 'REQUEST_TRACE_NOT_FOUND' },
    authority: { canonicalAuthority: false, operatorPinConfigured: false },
    limitations: ['No matching request trace was found.'],
  };
  const receipt = { ...body, checksumSha256: sha256CanonicalV1(body) };
  assert.equal(verifyMastraRouteReadbackReceiptV1(receipt), true);
  assert.throws(() => verifyMastraRouteReadbackReceiptV1({ ...receipt, route: { ...receipt.route, httpStatus: 200 } }), /CONTRACT_INVALID/);
  assert.throws(() => verifyMastraRouteReadbackReceiptV1({ ...receipt, langfuse: { ...receipt.langfuse, requestIdMatches: 1 } }), /CONTRACT_INVALID/);
});

test('verifies a request-ID match inside an independently read-back Langfuse observation', () => {
  const body = {
    schema: 'atlas.mastra-route-otel-paged-readback.v1',
    mode: 'REFUSAL_ONLY_READBACK',
    requestId: 'ea7da43f-6c44-4619-b520-b8c547d5c8f7',
    route: { path: '/api/atlas/mastra-agent', httpStatus: 409, refusalCode: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', firstFailingBoundary: 'WORKSPACE_AUTHORITY', agentExecutionStatus: 'NOT_STARTED', canonicalAdmission: 'NOT_ADMITTED', writesPerformed: false },
    langfuse: {
      httpStatus: 200,
      pagination: { pagesRead: 20, traceRecordsRead: 2000 },
      requestIdMatches: 0,
      routeNameMatches: 1,
      readbackVerdict: 'REQUEST_TRACE_READBACK_VERIFIED',
      observationReadback: {
        httpStatus: 200,
        traceId: '735ce43ff8d7ad33e16ab2d5f64ef1df',
        observationCount: 3,
        requestIdMatches: 1,
        matchingObservationIds: ['2242a591e5726890'],
        matchingAttributePaths: ['metadata.attributes.parent_atlas.request_id'],
      },
    },
    authority: { canonicalAuthority: false, operatorPinConfigured: false },
    limitations: ['Smoke and route request IDs are distinct.'],
  };
  assert.equal(verifyMastraRouteReadbackReceiptV1({ ...body, checksumSha256: sha256CanonicalV1(body) }), true);
  const tampered = { ...body, langfuse: { ...body.langfuse, observationReadback: { ...body.langfuse.observationReadback, matchingObservationIds: [] } } };
  assert.throws(() => verifyMastraRouteReadbackReceiptV1({ ...tampered, checksumSha256: sha256CanonicalV1(tampered) }), /CONTRACT_INVALID/);
});

test('rejects a valid route readback receipt from a different smoke request', () => {
  const body = {
    schema: 'atlas.mastra-route-otel-paged-readback.v1',
    mode: 'REFUSAL_ONLY_READBACK',
    requestId: 'route-request-1',
    route: { path: '/api/atlas/mastra-agent', httpStatus: 409, refusalCode: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', firstFailingBoundary: 'WORKSPACE_AUTHORITY', agentExecutionStatus: 'NOT_STARTED', canonicalAdmission: 'NOT_ADMITTED', writesPerformed: false },
    langfuse: { httpStatus: 200, pagination: { pagesRead: 1, traceRecordsRead: 1 }, requestIdMatches: 0, routeNameMatches: 1, readbackVerdict: 'REQUEST_TRACE_NOT_FOUND' },
    authority: { canonicalAuthority: false, operatorPinConfigured: false },
    limitations: [],
  };
  const receipt = { ...body, checksumSha256: sha256CanonicalV1(body) };
  assert.equal(verifyMastraRouteReadbackReceiptV1(receipt, 'route-request-1'), true);
  assert.throws(() => verifyMastraRouteReadbackReceiptV1(receipt, 'smoke-request-2'), /REQUEST_ID_MISMATCH/);
});

test('verifies currentness readback as diagnostic evidence without granting authority', () => {
  const body = {
    schema: 'atlas.workspace-admission-currentness-reconciliation.v1',
    mode: 'READ_ONLY_LIVE_SOURCE_BYTE_RECHECK',
    admission: { manifestDigestVerified: true, canonicalAuthority: false, manifestWorkspaceRevision: null },
    latestScratchFrame: { canonicalAuthority: false, workspaceRevision: null },
    liveByteReadback: {
      admittedSnapshot: { sourceCount: 30046, exactMatches: 29935, violationCount: 111 },
      latestScratchFrame: { sourceCount: 30067, exactMatches: 30006, violationCount: 61 },
    },
    manifestComparison: { exactIdentityOverlap: 30046 },
    verdict: { workspaceAuthority: 'NOT_ESTABLISHED', canonicalPromotionAuthorized: false, operatorPinSet: false, persistentWrites: 0 },
  };
  const receipt = { ...body, receiptChecksum: `sha256:${createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex')}` };
  assert.equal(verifyWorkspaceCurrentnessReconciliationReceiptV1(receipt), true);
  assert.throws(() => verifyWorkspaceCurrentnessReconciliationReceiptV1({ ...receipt, verdict: { ...receipt.verdict, canonicalPromotionAuthorized: true } }), /WORKSPACE_CURRENTNESS_RECONCILIATION_INVALID/);
});

test('verifies a bounded Valkey census receipt and rejects authority or checksum tampering', () => {
  const body = {
    schema: 'atlas.valkey-key-census.v1',
    generatedAt: '2026-10-24T03:34:00.000Z',
    ping: 'PONG',
    endpoint: { host: '127.0.0.1', port: 6379 },
    keyspace: { dbs: {}, scannedKeys: 90991, truncatedAt: null },
    namespaces: { 'code:index': 86499, 'ace:packet': 3 },
    ttl: { sampleSize: 2000, withoutTtl: 7, withoutTtlByNamespace: { analytics: 1 } },
    memory: { usedMemoryHuman: '55M', maxmemoryHuman: '2G', maxmemoryPolicy: 'noeviction' },
    counters: { keyspaceHits: 1281, keyspaceMisses: 8719, hitRatio: 0.1281, note: 'Server-wide only.' },
    canonicalAuthority: false,
    writesPerformed: false,
  };
  const receipt = { ...body, receiptChecksum: `sha256:${createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex')}` };
  assert.equal(verifyValkeyKeyCensusReceiptV1(receipt), true);
  assert.throws(() => verifyValkeyKeyCensusReceiptV1({ ...receipt, writesPerformed: true }), /VALKEY_KEY_CENSUS_RECEIPT_INVALID/);
  assert.throws(() => verifyValkeyKeyCensusReceiptV1({ ...receipt, receiptChecksum: 'sha256:' + '0'.repeat(64) }), /VALKEY_KEY_CENSUS_RECEIPT_INVALID/);
});

test('verifies a bounded Firecrawl page receipt without granting source admission', () => {
  const contentBytes = Buffer.from('public documentation fixture', 'utf8');
  const contentSha256 = `sha256:${createHash('sha256').update(contentBytes).digest('hex')}`;
  const body = {
    schema: 'atlas.firecrawl-single-page-smoke.v1',
    mode: 'READ_ONLY_EXTERNAL_DOCUMENTATION',
    capturedAt: '2026-10-24T00:42:12.443Z',
    requestId: 'firecrawl-smoke:fixture',
    request: { url: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape', formats: ['markdown'], onlyMainContent: true, maxAge: 0, storeInCache: false, crawl: false, followLinks: false },
    observed: { sourceURL: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape', resolvedURL: 'https://docs.firecrawl.dev/api-reference/endpoint/scrape', title: 'Scrape - Firecrawl Docs', statusCode: 200, contentType: 'text/html; charset=utf-8', language: 'en', scrapeId: 'scrape-fixture', contentSha256, contentBytes: contentBytes.byteLength, characterCount: contentBytes.toString('utf8').length },
    contentArtifact: { path: '.tmp/atlas/firecrawl-smoke/raw/firecrawl-scrape-fixture.md', sha256: contentSha256, byteLength: contentBytes.byteLength },
    checks: { singleRequestedUrl: true, http200: true, contentPresent: true, sourceUrlMatches: true, digestComputed: true },
    authority: { sourceIdentity: 'UNBOUND_EXTERNAL_SOURCE', canonicalAuthority: false, admitted: false },
    sideEffects: { scratchArtifactWritten: true, externalArchiveWrites: false, postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, canonicalPromotion: false },
  };
  const receipt = { ...body, receiptSha256: sha256CanonicalV1(body) };
  assert.equal(verifyFirecrawlSinglePageSmokeReceiptV1(receipt, contentBytes), true);
  assert.throws(() => verifyFirecrawlSinglePageSmokeReceiptV1(receipt, Buffer.from('tampered')), /CONTENT_ARTIFACT_DIGEST_MISMATCH/);
  assert.throws(() => verifyFirecrawlSinglePageSmokeReceiptV1({ ...receipt, observed: { ...receipt.observed, statusCode: 500 } }), /CONTRACT_INVALID/);
  assert.throws(() => verifyFirecrawlSinglePageSmokeReceiptV1({ ...receipt, authority: { ...receipt.authority, admitted: true } }), /CONTRACT_INVALID/);
  assert.throws(() => verifyFirecrawlSinglePageSmokeReceiptV1({ ...receipt, observed: { ...receipt.observed, contentSha256: `sha256:${'b'.repeat(64)}` } }), /CONTRACT_INVALID/);
  assert.throws(() => verifyFirecrawlSinglePageSmokeReceiptV1({ ...receipt, receiptSha256: '0'.repeat(64) }, contentBytes), /CHECKSUM_MISMATCH/);
});

test('crosswalks exact .okf taxonomy identity and hierarchy without claiming semantic authority', () => {
  const groups = [{ group_id: 'api', label: 'API', parent_group_id: null, taxonomy_level: 0 }];
  const result = compareOkfTaxonomyWithPostgresV1(
    groups,
    [{ groupId: 'api', groupLabel: 'API', parentGroupId: null, taxonomyLevel: 0 }],
    [{ domainId: 'api', label: 'API', parentDomainId: null }],
  );
  assert.equal(result.atlasDomainOntology.exactIdentityAndStructure, true);
  assert.equal(result.domainTaxonomyV1.exactIdentityAndStructure, true);
  assert.equal(result.semanticCrosswalk, 'REVIEW_REQUIRED');
  assert.equal(result.canonicalAuthority, false);
});

test('reports missing, mismatched, and additional PostgreSQL taxonomy rows', () => {
  const groups = [{ group_id: 'api', label: 'API', parent_group_id: null, taxonomy_level: 0 }];
  const result = compareOkfTaxonomyWithPostgresV1(
    groups,
    [{ groupId: 'other', groupLabel: 'Other', parentGroupId: null, taxonomyLevel: 0 }],
    [{ domainId: 'api', label: 'API v2', parentDomainId: 'other' }],
  );
  assert.deepEqual(result.atlasDomainOntology.mismatches, [{ groupId: 'api', reason: 'MISSING_EXACT_ID' }]);
  assert.deepEqual(result.atlasDomainOntology.dbOnly, ['other']);
  assert.deepEqual(result.domainTaxonomyV1.mismatches, [{ groupId: 'api', reason: 'LABEL_MISMATCH+PARENT_MISMATCH' }]);
});

function buildDiagnosticChainFixture() {
  const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const packetRows = Array.from({ length: 61718 }, (_, index) => ({
    packet_key: `packet:${String(index).padStart(5, '0')}`,
    source_revision: index < 16151 ? `sha256:${'a'.repeat(64)}` : null,
    source_ref: `docs/source-${index}.md`,
    feature_id: 'fixture-feature',
  }));
  const snapshotBytes = Buffer.from(`${packetRows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const snapshotReceipt = {
    schema: 'atlas.omr-msgpack.packet-snapshot-receipt.v1',
    status: 'CAPTURED_NOT_ADMITTED',
    source: { database: 'legal_ai_db', table: 'atlas_packets' },
    artifact: { file: '.tmp/atlas/omr-msgpack/snapshot.ndjson', rows: 61718, digest: hash(snapshotBytes) },
    writesPerformed: false,
    canonicalWrites: 'DISABLED',
  };
  const snapshotReceiptBytes = Buffer.from(JSON.stringify(snapshotReceipt));
  const reduceOutputBytes = Buffer.from('{"qualifiedRows":16151,"distinctFeatures":12650}\n');
  const reduceReceipt = {
    schema: 'atlas.omr-duckdb-reduce-receipt.v1',
    inputDigest: hash(snapshotBytes),
    outputDigest: hash(reduceOutputBytes),
    counts: { snapshotRows: 61718, qualifiedRows: 16151, distinctFeatures: 12650 },
    rejections: { MISSING_SOURCE_REVISION: 45567 },
    readback: { outputDigestReread: true },
    writesPerformed: false,
    canonicalWrites: 'DISABLED',
  };
  const reduceReceiptBytes = Buffer.from(JSON.stringify(reduceReceipt));
  const reduceReceiptDigest = hash(reduceReceiptBytes);
  const descriptor = {
    schema_id: 'atlas.okf.tensor-kv-rpc-packet',
    canonical_authority: false,
    workspace_revision: null,
    source_revision: packetRows[0].source_revision,
    entries: [
      { key: 'packet.source_revision', value: packetRows[0].source_revision },
      { key: 'packet.source_ref', value: packetRows[0].source_ref },
      { key: 'snapshot.digest', value: hash(snapshotBytes) },
      { key: 'reduce.artifact_digest', value: hash(reduceOutputBytes) },
      { key: 'reduce.receipt_digest', value: reduceReceiptDigest },
      { key: 'reduce.artifact_ref', value: '.tmp/atlas/omr-msgpack/reduce/output.json' },
    ],
    tensors: [],
    relations: [],
  };
  const descriptorBytes = Buffer.from(msgpack.encode(descriptor));
  const receipt = {
    schema: 'atlas.omr-msgpack-e2e-receipt.v1',
    runId: 'fixture-run',
    overallAuthority: 'DIAGNOSTIC_ONLY_NOT_ADMITTED',
    firstFailingBoundary: null,
    stages: {
      C_DUCKDB_REDUCE: { verdict: 'DIAGNOSTIC_REDUCE_VERIFIED', checks: { output: true } },
      D_MSGPACK: { verdict: 'MSGPACK_ROUNDTRIP_VERIFIED', checks: { decode: true } },
      E_CHAIN: { verdict: 'DIAGNOSTIC_CHAIN_VERIFIED', checks: { artifact: true } },
    },
    links: {
      snapshot: { file: '.tmp/atlas/omr-msgpack/snapshot.ndjson', digest: hash(snapshotBytes), receiptFile: '.tmp/atlas/omr-msgpack/snapshot-receipt.json', receiptDigest: hash(snapshotReceiptBytes) },
      reduce: { file: '.tmp/atlas/omr-msgpack/reduce/receipt.json', outputFile: '.tmp/atlas/omr-msgpack/reduce/output.json', outputDigest: hash(reduceOutputBytes) },
      messagepack: { descriptorFile: '.tmp/atlas/omr-msgpack/descriptor.msgpack', descriptorDigest: hash(descriptorBytes), envelopePayloadBytesDigest: hash(descriptorBytes), byteLength: descriptorBytes.byteLength, packetKey: packetRows[0].packet_key },
    },
    workspace_revision: 'NOT_ADMITTED',
    canonicalAuthority: false,
    writesPerformed: false,
    canonicalWrites: 'DISABLED',
    graphifyPromotion: 'NOT_PERFORMED',
    mastraSynthesis: 'NOT_PERFORMED',
  };
  const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
  const checksumBody = JSON.stringify(canonicalize(receipt));
  receipt.checksumSha256 = hash(Buffer.from(checksumBody));
  const receiptBytes = Buffer.from(JSON.stringify(receipt));
  return { receipt, receiptBytes, receiptArtifactSha256: hash(receiptBytes), snapshotBytes, snapshotReceiptBytes, reduceReceiptBytes, reduceOutputBytes, descriptorBytes };
}

const diagnosticFixture = buildDiagnosticChainFixture();

test('verifies diagnostic PostgreSQL-to-MessagePack artifacts without admitting them', async () => {
  const { mapDiagnosticChainReceiptV1 } = await import('../../../sveltekit-frontend/src/lib/server/observability/offline-receipt-telemetry-v1.ts');
  const result = verifyPostgresMessagePackDiagnosticArtifactsV1({
    ...diagnosticFixture,
    decodeMessagePack: (bytes) => msgpack.decode(bytes),
    mapTelemetry: mapDiagnosticChainReceiptV1,
  });
  assert.equal(result.snapshotRows, 61718);
  assert.equal(result.sourceQualifiedRows, 16151);
  assert.equal(result.excludedMissingSourceRevision, 45567);
  assert.equal(result.qualifiedRows, 16151);
  assert.equal(result.telemetry.executionStatus, 'SUCCEEDED');
  assert.equal(result.telemetry.evidenceValidity, 'DIGEST_VERIFIED');
  assert.equal(result.telemetry.canonicalAdmission, 'NOT_ADMITTED');
  assert.equal(result.telemetry.agentRunId, null);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('rejects a changed persisted descriptor in diagnostic artifact readback', () => {
  const changed = Buffer.from(diagnosticFixture.descriptorBytes);
  changed[0] ^= 0xff;
  assert.throws(() => verifyPostgresMessagePackDiagnosticArtifactsV1({
    ...diagnosticFixture,
    descriptorBytes: changed,
    decodeMessagePack: (bytes) => msgpack.decode(bytes),
    mapTelemetry: () => ({}),
  }), /OMR_DESCRIPTOR_READBACK_MISMATCH/);
});

test('rejects a changed source snapshot receipt before validating the diagnostic chain', () => {
  const changed = Buffer.from(diagnosticFixture.snapshotReceiptBytes);
  changed[0] ^= 0x01;
  assert.throws(() => verifyPostgresMessagePackDiagnosticArtifactsV1({
    ...diagnosticFixture,
    snapshotReceiptBytes: changed,
    decodeMessagePack: (bytes) => msgpack.decode(bytes),
    mapTelemetry: () => ({}),
  }), /OMR_SNAPSHOT_RECEIPT_DIGEST_MISMATCH/);
});

test('rejects diagnostic receipts that claim authority', () => {
  assert.throws(() => verifyPostgresMessagePackDiagnosticArtifactsV1({
    ...diagnosticFixture,
    receipt: { ...diagnosticFixture.receipt, canonicalAuthority: true },
    decodeMessagePack: (bytes) => msgpack.decode(bytes),
    mapTelemetry: () => ({}),
  }), /OMR_DIAGNOSTIC_AUTHORITY_INVALID/);
});
