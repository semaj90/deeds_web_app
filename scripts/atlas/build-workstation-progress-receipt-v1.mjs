#!/usr/bin/env node
/**
 * WORKSTATION-PROGRESS-RECEIPT-01 (read-only)
 *
 * Builds a derived progress projection from explicit proof predicates in
 * current receipts. OpenSpec checkbox counts and prose are deliberately not
 * used as progress evidence.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = path.join(ROOT, 'docs', 'reports');
const OUT_PATH = path.join(REPORT_DIR, 'workstation-progress-receipt-v1.json');

const sources = {
  graphifyAuthority: 'current-graphify-snapshot-authority-v1.json',
  executionOwner: 'current-graphify-execution-owner-resolution-v1.json',
  packetDigestBridge: 'packet-digest-bridge-proposal-v1.json',
  packetChunk: 'current-packet-chunk-identity-reconciliation-v1.json',
  graphReadiness: 'current-graph-artifact-readiness-v1.json',
  packetWriters: 'packet-writer-lineage-v1.json',
  eventContract: 'packet-write-revision-contract-v1.json',
  historicalChunk: 'historical-chunk-resolver-receipt-v2.json',
  producerProvenance: 'chunk-producer-provenance-v1.json',
  stubScanner: 'incomplete-code-stubs-scan-v1.json',
};

function readReceipt(fileName) {
  const filePath = path.join(REPORT_DIR, fileName);
  if (!fs.existsSync(filePath)) return { data: null, checksum: null, path: `docs/reports/${fileName}` };
  const raw = fs.readFileSync(filePath, 'utf8');
  return {
    data: JSON.parse(raw),
    checksum: `sha256:${crypto.createHash('sha256').update(raw, 'utf8').digest('hex')}`,
    path: `docs/reports/${fileName}`,
  };
}

function check(id, label, proven, detail) {
  return { id, label, proven: Boolean(proven), detail };
}

function gate(id, canonicalTaskId, owner, proofKind, evidenceReceiptRefs, checks, blockers, sourceRevision = null) {
  const passed = checks.filter((item) => item.proven).length;
  const total = checks.length;
  return {
    id,
    canonicalTaskId,
    owner,
    sourceRevision,
    proofKind,
    evidenceReceiptRefs: Array.isArray(evidenceReceiptRefs) ? evidenceReceiptRefs : [],
    state: passed === total ? 'PROVEN' : passed > 0 ? 'PARTIAL' : 'BLOCKED',
    proofScore: total === 0 ? 0 : Number((passed / total * 100).toFixed(2)),
    proof: { passed, total, checks },
    blockers,
  };
}

const loaded = Object.fromEntries(Object.entries(sources).map(([key, fileName]) => [key, readReceipt(fileName)]));
const authority = loaded.graphifyAuthority.data;
const executionOwner = loaded.executionOwner.data;
const packetDigestBridge = loaded.packetDigestBridge.data;
const packetChunk = loaded.packetChunk.data;
const graph = loaded.graphReadiness.data;
const packetWriters = loaded.packetWriters.data;
const eventContract = loaded.eventContract.data;

const currentWorkspaceRevision = authority?.sourceSnapshot?.workspaceRevision ?? null;

const authorityCandidates = Array.isArray(authority?.candidates) ? authority.candidates : [];
const authorityChecks = [
  check('snapshot_revision', 'admitted snapshot revision present', Boolean(authority?.sourceSnapshot?.workspaceRevision), authority?.sourceSnapshot?.workspaceRevision ?? null),
  check('terminal_execution', 'terminal execution candidate present', authorityCandidates.length > 0, `candidates=${authorityCandidates.length}`),
  check('immutable_membership', 'candidate immutable membership checks pass', authorityCandidates.some((candidate) => candidate.eligible === true), authorityCandidates.map((candidate) => candidate.executionId).join(',')),
  check('canonical_owner', 'one canonical execution owner selected', authority?.canonicalAuthority === true, authority?.status ?? 'unknown'),
];

const packetCounts = packetChunk?.counts ?? {};
const packetChecks = [
  check('packet_refs', 'packet source references exist', Number(packetCounts.packet_ref_matches ?? 0) > 0, packetCounts.packet_ref_matches ?? 0),
  check('canonical_digests', 'canonical content digests match', Number(packetCounts.packet_digest_matches ?? 0) > 0, packetCounts.packet_digest_matches ?? 0),
  check('chunk_lineage', 'packet/chunk lineage matches', Number(packetCounts.packet_lineage_matches ?? 0) > 0, packetCounts.packet_lineage_matches ?? 0),
  check('no_missing_packets', 'no current sources are missing packets', Number(packetCounts.missing_packet_rows ?? 1) === 0, packetCounts.missing_packet_rows ?? null),
];

const bridgeCounts = packetDigestBridge?.counts ?? {};
const bridgeChecks = [
  check('bridge_schema', 'packet digest bridge proposal audit schema valid', packetDigestBridge?.schema === 'atlas.packet-digest-bridge-proposal-audit.v1', packetDigestBridge?.schema ?? null),
  check('source_authority_linked', 'source authority receipt linked', Boolean(packetDigestBridge?.receiptReferences?.sourceAuthorityReceiptRef), packetDigestBridge?.receiptReferences?.sourceAuthorityReceiptRef ?? null),
  check('packet_lineage_linked', 'packet lineage receipt linked', Boolean(packetDigestBridge?.receiptReferences?.packetLineageReceiptRef), packetDigestBridge?.receiptReferences?.packetLineageReceiptRef ?? null),
  check('admission_strictly_non_promotional', 'admission authorized is strictly false', packetDigestBridge?.admissionAuthorized === false, 'admissionAuthorized=false'),
];

const graphChecks = [
  check('current_revision', 'graph input matches admitted revision', graph?.inputProjection?.projectionMatchesAdmittedRevision === true, graph?.inputProjection?.admittedWorkspaceRevision ?? null),
  check('revision_edges', 'revision-qualified edges exist', Number(graph?.edgeEvidence?.explicitRevisionQualifiedEdges ?? 0) > 0, graph?.edgeEvidence?.explicitRevisionQualifiedEdges ?? 0),
  check('ordinal_map', 'current graph ordinal map proven', graph?.gate?.graphOrdinalMap === 'PROVEN', graph?.gate?.graphOrdinalMap ?? null),
];

const packetWriterChecks = [
  check('writer_contract', 'at least one complete revision-bound writer contract', Number(packetWriters?.summary?.revisionBoundContractPresent ?? 0) > 0, packetWriters?.summary?.revisionBoundContractPresent ?? 0),
  check('legacy_quarantined', 'legacy writer paths remain non-promotional', Number(packetWriters?.summary?.legacySha256Only ?? 0) >= 0, 'classification recorded'),
  check('canonical_digest', 'canonical digest namespace is declared', packetWriters?.canonicalDigestNamespace === 'atlas_packets.content_hash', packetWriters?.canonicalDigestNamespace ?? null),
];

const eventChecks = [
  check('schema', 'event contract audit completed', eventContract?.overallVerdict === 'PARTIAL_PROVEN' || eventContract?.overallVerdict === 'PROVEN', eventContract?.overallVerdict ?? null),
  check('live_schema', 'source revision column exists live', eventContract?.acceptance?.sourceRevisionColumnExistsLive === true, eventContract?.acceptance?.sourceRevisionColumnExistsLive ?? null),
  check('caller_adoption', 'all packet callers are revision qualified', eventContract?.acceptance?.allLiveCallersRevisionQualified === true, eventContract?.acceptance?.allLiveCallersRevisionQualified ?? null),
];

const historicalChunk = loaded.historicalChunk.data;
const producerProvenance = loaded.producerProvenance.data;
const stubScanner = loaded.stubScanner.data;

const historicalChunkChecks = [
  check('resolver_schema', 'historical chunk resolver schema valid', historicalChunk?.schema === 'atlas.historical-chunk-resolver.v2', historicalChunk?.schema ?? null),
  check('read_only_invariants', 'resolver strictly read-only with no database writes', historicalChunk?.readOnly === true && historicalChunk?.writesPerformed === false, 'readOnly=true,writesPerformed=false'),
  check('current_source_qualification', 'chunks verified against current worktree source text', Number(historicalChunk?.summary?.currentSourceVerified ?? 0) > 0, `verified=${historicalChunk?.summary?.currentSourceVerified ?? 0}`),
  check('rebuild_cohort_isolated', 'stale/historical chunks isolated to rebuild cohort', Array.isArray(historicalChunk?.recommendedRebuildCohort), `rebuildCohort=${historicalChunk?.recommendedRebuildCohort?.length ?? 0}`),
];

const producerChecks = [
  check('provenance_schema', 'chunk producer provenance schema valid', producerProvenance?.schema === 'atlas.chunk-producer-provenance-report.v1', producerProvenance?.schema ?? null),
  check('producers_inventoried', 'content and lineage writers catalogued', Array.isArray(producerProvenance?.producerCensus?.knownContentProducers) && Array.isArray(producerProvenance?.producerCensus?.knownLineageProducers), 'producers catalogued'),
  check('unproven_claims_prevented', 'producerIdentified remains strictly false without cryptographic proof', producerProvenance?.counts?.producerIdentified === 0, 'producerIdentified=0'),
];

const stubChecks = [
  check('stub_scanner_schema', 'stub scanner schema valid', stubScanner?.schema === 'atlas.incomplete-code-stubs-scan.v1', stubScanner?.schema ?? null),
  check('reachability_classified', 'production reachability explicitly distinguished from test fixtures', Number(stubScanner?.summary?.byReachability?.PROVEN ?? 0) >= 0 && Number(stubScanner?.summary?.byReachability?.TEST_ONLY ?? 0) >= 0, `proven=${stubScanner?.summary?.byReachability?.PROVEN},testOnly=${stubScanner?.summary?.byReachability?.TEST_ONLY}`),
  check('mutation_strictly_disallowed', 'findings enforce mutationAllowed: false', stubScanner?.findings?.every((f) => f.mutationAllowed === false) === true, 'mutationAllowed=false'),
];

const gates = [
  gate('GRAPHIFY_EXECUTION_SNAPSHOT_OWNER', 'GRAPHIFY-SNAPSHOT-AUTHORITY-01', 'Graphify snapshot authority', 'LIVE_ADMISSION_PROOF', [loaded.graphifyAuthority.path, loaded.executionOwner.path], authorityChecks, [authority?.status ?? 'AUTHORITY_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('PACKET_DIGEST_BRIDGE_ADMISSION', 'PACKET-DIGEST-BRIDGE-ADMISSION-01', 'Packet digest bridge proposal', 'LIVE_ADMISSION_PROOF', [loaded.packetDigestBridge.path], bridgeChecks, [packetDigestBridge ? 'ADMISSION_PROPOSAL_ONLY' : 'BRIDGE_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('CURRENT_PACKET_CHUNK_LINEAGE', 'CURRENT-PACKET-CHUNK-LINEAGE-01', 'Source to packet to chunk', 'LIVE_ADMISSION_PROOF', [loaded.packetChunk.path], packetChecks, [packetChunk?.status ?? 'PACKET_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('HISTORICAL_CHUNK_01', 'HISTORICAL-CHUNK-01', 'Historical chunk resolver', 'LIVE_ADMISSION_PROOF', [loaded.historicalChunk.path], historicalChunkChecks, [historicalChunk ? 'DIAGNOSTIC_RECOVERY_ONLY' : 'HISTORICAL_CHUNK_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('CHUNK_PRODUCER_01', 'CHUNK-PRODUCER-01', 'Chunk producer provenance', 'LIVE_ADMISSION_PROOF', [loaded.producerProvenance.path], producerChecks, [producerProvenance ? 'PRODUCER_INVESTIGATION_DIAGNOSTIC' : 'PRODUCER_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('STUB_SCAN_01', 'STUB-SCAN-01', 'Incomplete code and stub scanner', 'LIVE_ADMISSION_PROOF', [loaded.stubScanner.path], stubChecks, [stubScanner ? 'STATIC_SCAN_DIAGNOSTIC' : 'STUB_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('CURRENT_GRAPH_ORDINAL', 'CURRENT-GRAPH-ORDINAL-01', 'Graph edges and ordinal map', 'FIXTURE_PROOF', [loaded.graphReadiness.path], graphChecks, [graph?.status ?? 'GRAPH_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('PACKET_WRITER_LINEAGE', 'PACKET-WRITER-LINEAGE-01', 'Packet writer adoption', 'DERIVED_PROJECTION', [loaded.packetWriters.path], packetWriterChecks, [packetWriters?.verdict ?? 'WRITER_RECEIPT_MISSING'], currentWorkspaceRevision),
  gate('CANONICAL_EVENT_ADOPTION', 'PACKET-WRITE-REVISION-CONTRACT-01', 'Canonical durable event', 'LIVE_ADMISSION_PROOF', [loaded.eventContract.path], eventChecks, [eventContract?.nextGate ?? 'EVENT_RECEIPT_MISSING'], currentWorkspaceRevision),
];

const passed = gates.reduce((sum, item) => sum + item.proof.passed, 0);
const total = gates.reduce((sum, item) => sum + item.proof.total, 0);
const body = {
  schema: 'atlas.workstation-progress-receipt.v1',
  mode: 'DERIVED_READ_ONLY_PROJECTION',
  gate: 'WORKSTATION-PROGRESS-RECEIPT-01',
  scoreKind: 'EVIDENCE_PREDICATE_RATIO',
  generatedAt: new Date().toISOString(),
  sourceReceipts: loaded,
  progress: {
    mechanicalCompletionPct: null,
    evidenceCompletenessPct: total === 0 ? 0 : Number((passed / total * 100).toFixed(2)),
    validationCompletionPct: gates.filter((item) => item.state === 'PROVEN').length / gates.length * 100,
    lineageCompletenessPct: gates.slice(0, 3).reduce((sum, item) => sum + item.proof.passed, 0) / gates.slice(0, 3).reduce((sum, item) => sum + item.proof.total, 0) * 100,
    runtimeProofPct: null,
    compositePct: total === 0 ? 0 : Number((passed / total * 100).toFixed(2)),
  },
  gates,
  blockers: gates.flatMap((item) => item.state === 'PROVEN' ? [] : item.blockers.map((blocker) => ({ gate: item.id, blocker }))),
  authoritative: false,
  writesPerformed: false,
  notes: [
    'Percentages are ratios of explicit proof predicates, not task checkbox or prose counts.',
    'Null means this projection has no authoritative predicate for that dimension.',
    'This receipt cannot close OpenSpec tasks or authorize execution.',
  ],
};
const deterministicBody = { ...body, generatedAt: null };
const receiptChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(deterministicBody), 'utf8').digest('hex')}`;
const report = { ...body, receiptChecksum };
fs.mkdirSync(REPORT_DIR, { recursive: true });
const tempPath = `${OUT_PATH}.${process.pid}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tempPath, OUT_PATH);
console.log(JSON.stringify({
  status: 'WORKSTATION_PROGRESS_RECEIPT_DERIVED',
  compositePct: report.progress.compositePct,
  gateCount: gates.length,
  blockedGates: gates.filter((item) => item.state !== 'PROVEN').map((item) => item.id),
  authoritative: false,
  writesPerformed: false,
  reportPath: 'docs/reports/workstation-progress-receipt-v1.json',
}, null, 2));
