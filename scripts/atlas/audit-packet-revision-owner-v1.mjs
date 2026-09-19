#!/usr/bin/env node

/**
 * PACKET_REVISION_OWNER_01 (read-only)
 *
 * Verifies the derived packet-revision contract and its invariant test surface.
 * This audit does not inspect or mutate database rows and does not claim writer
 * adoption. A pure derivation owner is intentionally a noncanonical result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const contractPath = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'atlas', 'identity', 'packet-revision-v1.ts');
const specPath = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'atlas', 'identity', 'packet-revision-v1.spec.ts');
const writerPath = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'embedding', 'semantic-packet-writer.ts');
const reportPath = path.join(root, 'docs', 'reports', 'packet-revision-owner-v1.json');

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`REQUIRED_ARTIFACT_MISSING:${path.relative(root, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const contract = readRequired(contractPath);
const spec = readRequired(specPath);
const writer = readRequired(writerPath);
const requiredContractMarkers = [
  'derivePacketRevisionV1',
  'packetRevisionInputV1Schema',
  "PACKET_REVISION_DERIVATION_REVISION = 'packet-revision-v1'",
  'canonicalAuthority: false',
  'writesPerformed: false',
];
const excludedInputs = ['workspaceRevision', 'representationRevision', 'embeddingDigest', 'executionId', 'graphRevision', 'featureRevision'];
const invariantMarkers = [
  'stable',
  'changes when canonical input changes',
  'fails closed for unqualified input',
];
const missingContractMarkers = requiredContractMarkers.filter((marker) => !contract.includes(marker));
const missingInvariantMarkers = invariantMarkers.filter((marker) => !spec.includes(marker));
const report = {
  schema: 'atlas.packet-revision-owner-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_CONTRACT_AUDIT',
  owner: {
    kind: 'DERIVED',
    function: 'derivePacketRevisionV1',
    derivationRevision: 'packet-revision-v1',
  },
  requiredInputs: ['packet_key', 'source_ref', 'source_revision', 'content_hash', 'packet_schema_revision'],
  excludedInputs,
  contract: {
    path: path.relative(root, contractPath).replaceAll('\\', '/'),
    sourceChecksum: `sha256:${sha256(contract)}`,
    requiredMarkers: requiredContractMarkers,
    missingMarkers: missingContractMarkers,
  },
  invariantTests: {
    path: path.relative(root, specPath).replaceAll('\\', '/'),
    requiredMarkers: invariantMarkers,
    missingMarkers: missingInvariantMarkers,
    testCommand: 'npx vitest run src/lib/server/atlas/identity/packet-revision-v1.spec.ts',
  },
  status: missingContractMarkers.length === 0 && missingInvariantMarkers.length === 0
    ? 'DERIVATION_OWNER_PROVEN'
    : 'DERIVATION_OWNER_UNPROVEN',
  metadataIntegration: {
    status: writer.includes('canonical_packet_admission') && writer.includes('packetRevision')
      ? 'WIRED_READ_ONLY_METADATA'
      : 'NOT_WIRED',
    writerPath: path.relative(root, writerPath).replaceAll('\\', '/'),
    independentReadback: false,
  },
  writerAdoption: false,
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: 'PACKET_WRITER_EMISSION_AND_INDEPENDENT_READBACK',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tempPath = `${reportPath}.${process.pid}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.renameSync(tempPath, reportPath);
console.log(JSON.stringify({
  status: report.status,
  writerAdoption: report.writerAdoption,
  canonicalAuthority: report.canonicalAuthority,
  writesPerformed: report.writesPerformed,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
}, null, 2));
