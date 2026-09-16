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
const packetChunk = readReport('current-workspace-packet-chunk-join-v1.json');
const eventHead = readReport('workspace-event-head-schema-audit-v1.json');
const classifier = readReport('domain-classifier-cohort-admission-v1.json');
const ace = readReport('ace-live-dry-input-readiness-v2.json');

const ownerValue = owner.value ?? {};
const packetValue = packetChunk.value ?? {};
const packetCounts = packetValue.counts ?? {};
const eventValue = eventHead.value ?? {};
const classifierValue = classifier.value ?? {};
const aceValue = ace.value ?? {};

const gates = {
  workspaceSnapshot: gate(
    'READY_NON_AUTHORITATIVE',
    'A stable capture may be used for planning, but it is not itself an admitted promotion authority.',
    'workspace-snapshot-quiescence-v1.json',
    false,
  ),
  graphifyExecutionOwner: gate(
    ownerValue.status === 'DUPLICATE_EQUIVALENT_EXECUTIONS' ? 'BLOCKED_DUPLICATE_OWNER' : 'BLOCKED_OWNER_NOT_PROVEN',
    ownerValue.status ?? owner.status,
    owner.fileName,
  ),
  packetChunkLineage: gate(
    Number(packetCounts.packet_chunk_exact_sources ?? 0) > 0 &&
      Number(packetCounts.packet_chunk_exact_sources) === Number(packetCounts.binding_sources)
      ? 'PROVEN'
      : 'BLOCKED_PARTIAL_LINEAGE',
    {
      bindingSources: packetCounts.binding_sources ?? null,
      exactSources: packetCounts.packet_chunk_exact_sources ?? null,
      packetContentMatches: packetCounts.packet_content_matches ?? null,
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
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  promotionEligible: report.promotionEligible,
  writesPerformed: report.writesPerformed,
  nextGate: report.nextGate,
  reportPath: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
}, null, 2));
