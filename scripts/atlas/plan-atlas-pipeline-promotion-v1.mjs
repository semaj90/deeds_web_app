#!/usr/bin/env node

/**
 * Read-only Parent Atlas promotion planner.
 *
 * This is a derived gate report. It does not select an execution, apply a
 * migration, repair packets, warm ACE, write Qdrant, or promote a model.
 * Missing reports remain BLOCKED; no status is inferred from filenames or
 * from the existence of a table/index.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const outputArgIndex = process.argv.indexOf('--output');
const outputPath = outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
  ? path.resolve(process.cwd(), process.argv[outputArgIndex + 1])
  : path.join(REPORT_DIR, 'atlas-pipeline-promotion-v1.json');

function readReport(fileName) {
  const reportPath = path.join(REPORT_DIR, fileName);
  if (!fs.existsSync(reportPath)) return { fileName, status: 'REPORT_UNAVAILABLE', reportPath };
  try {
    return { fileName, reportPath, value: JSON.parse(fs.readFileSync(reportPath, 'utf8')) };
  } catch (error) {
    return { fileName, reportPath, status: 'REPORT_INVALID', error: String(error?.message ?? error) };
  }
}

function gate(status, evidence, report, blocking = true) {
  return { status, evidence, report, blocking };
}

const owner = readReport('current-graphify-execution-owner-resolution-v1.json');
// Prefer the execution-bound preflight. The older join report is retained as
// historical evidence but must not drive the current promotion gate.
const packetChunkPreflight = readReport('packet-chunk-lineage-promotion-preflight-v1.json');
const packetChunk = packetChunkPreflight.value
  ? packetChunkPreflight
  : readReport('current-workspace-packet-chunk-join-v1.json');
const eventHead = readReport('workspace-event-head-schema-audit-v1.json');
const classifier = readReport('domain-classifier-cohort-admission-v1.json');
const ace = readReport('ace-live-dry-input-readiness-v2.json');

const ownerValue = owner.value ?? {};
const packetValue = packetChunk.value ?? {};
const packetCounts = packetValue.counts ?? {};
const eventValue = eventHead.value ?? {};
const classifierValue = classifier.value ?? {};
const aceValue = ace.value ?? {};
const canonicalOwnerReadback = ownerValue.existingCanonicalOwner?.executionId
  && ownerValue.recommendation?.requiresExplicitAuthorityDecision === false;

const gates = {
  workspaceSnapshot: gate(
    'READY_NON_AUTHORITATIVE',
    'A stable capture may be used for planning, but it is not itself an admitted promotion authority.',
    'workspace-snapshot-quiescence-v1.json',
    false,
  ),
  graphifyExecutionOwner: gate(
    canonicalOwnerReadback
      ? 'PROVEN_CANONICAL_OWNER_READBACK'
      : ownerValue.status === 'DUPLICATE_EQUIVALENT_EXECUTIONS'
        ? 'BLOCKED_DUPLICATE_OWNER'
        : 'BLOCKED_OWNER_NOT_PROVEN',
    canonicalOwnerReadback
      ? `canonical execution ${ownerValue.existingCanonicalOwner.executionId} read back from graphify_executions.canonical_authority`
      : ownerValue.status ?? owner.status,
    owner.fileName,
    !canonicalOwnerReadback,
  ),
  packetChunkLineage: gate(
    packetValue.verdict === 'LINEAGE_READBACK_PROVEN'
      ? 'PROVEN'
      : 'BLOCKED_PARTIAL_LINEAGE',
    {
      verdict: packetValue.verdict ?? null,
      bindingSources: packetCounts.binding_sources ?? packetValue.sourceMemberCount ?? null,
      exactSources: packetCounts.packet_chunk_exact_sources ?? packetValue.eligibleCandidateCount ?? null,
      packetContentMatches: packetCounts.packet_content_matches ?? null,
      executionBridge: packetValue.executionBridge?.status ?? null,
    },
    packetChunk.fileName,
  ),
  eventHeadDurability: gate(
    eventValue.status === 'APPLIED_READBACK_PROVEN' ? 'PROVEN' : 'BLOCKED_DURABLE_READBACK',
    eventValue.status ?? eventHead.status,
    eventHead.fileName,
  ),
  semanticClassifierAdmission: gate(
    classifierValue.promotionEligible === true ? 'PROVEN' : 'BLOCKED_CURRENT_COHORT',
    classifierValue.status ?? classifier.status,
    classifier.fileName,
  ),
  aceRevisionQualifiedAdmission: gate(
    aceValue.promotionEligible === true ? 'PROVEN' : 'BLOCKED_LIVE_CACHE_READBACK',
    aceValue.status ?? ace.status,
    ace.fileName,
  ),
};

const promotionEligible = Object.values(gates).every((item) => item.status === 'PROVEN');
const report = {
  schema: 'atlas.pipeline-promotion-plan.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_DERIVED_GATE_PLAN',
  promotionEligible,
  writesPerformed: false,
  canonicalAuthority: false,
  gates,
  policy: {
    postgresIsCanonical: true,
    projectionsAreNonCanonical: true,
    semanticLaneMaxVotes: 1,
    missingEvidenceFailsClosed: true,
  },
  nextGate: promotionEligible
    ? 'FULL_PROMOTION_REHEARSAL'
    : Object.entries(gates).find(([, value]) => value.blocking && value.status !== 'PROVEN')?.[0] ?? 'UNKNOWN',
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryOutputPath = `${outputPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(temporaryOutputPath, outputPath);
console.log(JSON.stringify({
  schema: report.schema,
  promotionEligible: report.promotionEligible,
  writesPerformed: report.writesPerformed,
  nextGate: report.nextGate,
  reportPath: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
}, null, 2));
