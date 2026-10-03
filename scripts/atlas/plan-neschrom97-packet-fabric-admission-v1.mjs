#!/usr/bin/env node
/**
 * Read-only NES/CHROM97 packet-fabric admission planner.
 *
 * JSONL is ingress evidence. This planner never invents source/workspace
 * revisions, derives packet identity from position, or writes a projection.
 * It reports exactly which records can proceed to a separately authorized
 * canonical PacketSummaryV1 builder.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};
const inputPath = path.resolve(root, value('--input', 'memory/packets/nes-chrom-packets.jsonl'));
const reportPath = path.resolve(root, value('--out', 'docs/reports/neschrom97-packet-fabric-admission-v1.json'));
const limit = Math.min(500, Math.max(1, Number(value('--limit', '45'))));
const resolveSourceEvidence = args.includes('--resolve-source-evidence');
if (!Number.isInteger(limit)) throw new Error('BOUNDED_LIMIT_REQUIRED');

if (!existsSync(inputPath)) {
  const report = {
    schema: 'atlas.neschrom97-packet-fabric-admission.v1',
    input: path.relative(root, inputPath).replaceAll('\\', '/'),
    inputChecksum: null,
    requestedLimit: limit,
    counts: { inputRecords: 0, validRecords: 0, malformedRecords: 0, missingCanonicalLineage: 0, duplicatePacketIds: 0 },
    observations: [],
    status: 'INPUT_ARTIFACT_MISSING',
    canonicalPacketIdentityAdmission: 'NOT_PROVEN',
    canonicalAuthority: false,
    promotionEligible: false,
    writesPerformed: false,
    prohibitedActions: ['no revision synthesis', 'no packet identity from ordinal or JSON order', 'no Postgres/Qdrant/Redis/ACE writes'],
    nextGate: 'CANONICAL_SOURCE_PACKET_LINEAGE_PRODUCER',
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, promotionEligible: false, writesPerformed: false, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
  process.exit(0);
}

const digest = createHash('sha256');
const counts = { inputRecords: 0, validRecords: 0, malformedRecords: 0, missingCanonicalLineage: 0, duplicatePacketIds: 0 };
const observations = [];
const seen = new Set();
const input = createReadStream(inputPath, { encoding: 'utf8' });
const lines = readline.createInterface({ input, crlfDelay: Infinity });

for await (const line of lines) {
  if (!line.trim()) continue;
  if (counts.inputRecords >= limit) break;
  digest.update(`${line}\n`, 'utf8');
  counts.inputRecords += 1;
  let record;
  try { record = JSON.parse(line); } catch {
    counts.malformedRecords += 1;
    observations.push({ ordinal: counts.inputRecords - 1, status: 'MALFORMED_JSON' });
    continue;
  }
  const packetId = typeof record.packet_id === 'string' && record.packet_id.trim() ? record.packet_id.trim() : null;
  if (!packetId) {
    counts.malformedRecords += 1;
    observations.push({ ordinal: counts.inputRecords - 1, status: 'PACKET_ID_MISSING' });
    continue;
  }
  counts.validRecords += 1;
  if (seen.has(packetId)) counts.duplicatePacketIds += 1;
  seen.add(packetId);
  const hasCanonicalLineage = [record.workspace_revision, record.source_revision, record.source_ref, record.content_digest]
    .every((value) => typeof value === 'string' && value.length > 0);
  if (!hasCanonicalLineage) counts.missingCanonicalLineage += 1;
  const sourceRefs = Array.isArray(record.source_refs) ? [...new Set(record.source_refs.filter((ref) => typeof ref === 'string' && ref.trim()))] : [];
  const sourceEvidence = resolveSourceEvidence ? sourceRefs.map((sourceRef) => {
    const absolute = path.resolve(root, sourceRef.replaceAll('\\', '/'));
    if (!absolute.startsWith(`${root}${path.sep}`) || !existsSync(absolute)) return { sourceRef, status: 'SOURCE_UNREADABLE', contentDigest: null };
    const bytes = readFileSync(absolute);
    return { sourceRef, status: 'SOURCE_BYTES_READ', contentDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  }) : [];
  observations.push({
    ordinal: counts.inputRecords - 1,
    packetId,
    identityStatus: 'OBSERVED_UNADMITTED',
    status: hasCanonicalLineage ? 'READY_FOR_PACKET_SUMMARY_VALIDATION' : 'MISSING_CANONICAL_LINEAGE',
    sourceRef: typeof record.source_ref === 'string' ? record.source_ref : null,
    workspaceRevision: typeof record.workspace_revision === 'string' ? record.workspace_revision : null,
    sourceRevision: typeof record.source_revision === 'string' ? record.source_revision : null,
    contentDigest: typeof record.content_digest === 'string' ? record.content_digest : null,
    sourceEvidenceStatus: resolveSourceEvidence ? (sourceEvidence.every((item) => item.status === 'SOURCE_BYTES_READ') ? 'READABLE_UNADMITTED' : 'PARTIAL_UNREADABLE') : 'NOT_REQUESTED',
    sourceEvidenceChecksum: resolveSourceEvidence ? `sha256:${createHash('sha256').update(JSON.stringify(sourceEvidence), 'utf8').digest('hex')}` : null,
    sourceEvidence,
  });
}

const inputChecksum = `sha256:${digest.digest('hex')}`;
const admissionEligible = counts.validRecords === limit && counts.duplicatePacketIds === 0 && counts.missingCanonicalLineage === 0;
const report = {
  schema: 'atlas.neschrom97-packet-fabric-admission.v1',
  input: path.relative(root, inputPath).replaceAll('\\', '/'),
  inputChecksum,
  requestedLimit: limit,
  counts,
  observations,
  status: admissionEligible ? 'READY_FOR_EXPLICIT_CANONICAL_PACKET_ADMISSION' : 'PACKET_FABRIC_ADMISSION_BLOCKED',
  canonicalPacketIdentityAdmission: 'NOT_PROVEN',
  canonicalAuthority: false,
  promotionEligible: false,
  writesPerformed: false,
  prohibitedActions: ['no revision synthesis', 'no packet identity from ordinal or JSON order', 'no Postgres/Qdrant/Redis/ACE writes'],
  nextGate: admissionEligible ? 'CANONICAL_PACKET_SUMMARY_TRANSACTION_READBACK' : 'CANONICAL_SOURCE_PACKET_LINEAGE_PRODUCER',
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts, inputChecksum, promotionEligible: false, writesPerformed: false, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
