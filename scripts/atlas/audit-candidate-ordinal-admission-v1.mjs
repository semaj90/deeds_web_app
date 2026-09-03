#!/usr/bin/env node

/**
 * Read-only admission audit for the existing CandidateOrdinal corpus receipt.
 * This does not rebuild the map, query stores, or authorize any executor.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const inputPath = resolve(root, 'docs/reports/candidate-ordinal-corpus-receipt-v1.json');
const mapPath = resolve(root, 'docs/reports/candidate-ordinal-corpus-v1.json');
const outputPath = resolve(root, 'docs/reports/candidate-ordinal-admission-v1.json');

const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const revision = typeof input.candidateSnapshotRevision === 'string' && input.candidateSnapshotRevision.length > 0;
const checksum = typeof input.ordinalMapChecksum === 'string' && /^[a-f0-9]{64}$/.test(input.ordinalMapChecksum);
const rowCount = Number.isInteger(input.rowCount) && input.rowCount > 0 ? input.rowCount : null;
const candidates = Array.isArray(map.candidates) ? map.candidates : [];
const hasFullPopulation = candidates.length === rowCount && rowCount === map.rowCount;
const ordinals = candidates.map((row) => row?.candidateOrdinal);
const uniqueOrdinals = new Set(ordinals).size;
const missingOrdinals = rowCount === null ? null : Array.from({ length: rowCount }, (_, ordinal) => ordinal)
  .filter((ordinal) => !ordinals.includes(ordinal)).length;
const duplicateOrdinalCount = Math.max(0, ordinals.length - uniqueOrdinals);
const denseOrdinals = hasFullPopulation && uniqueOrdinals === rowCount && missingOrdinals === 0
  && Math.min(...ordinals) === 0 && Math.max(...ordinals) === rowCount - 1
  && ordinals.every((ordinal, index) => ordinal === index);
const first = Array.isArray(input.sampleFirst5) ? input.sampleFirst5 : [];
const last = Array.isArray(input.sampleLast5) ? input.sampleLast5 : [];
const sampleShapeValid = [...first, ...last].every((row) => Number.isInteger(row?.ordinal) && typeof row?.id === 'string');
const inputDigest = createHash('sha256').update(readFileSync(inputPath)).digest('hex');
const mapDigest = createHash('sha256').update(readFileSync(mapPath)).digest('hex');

const sourceReceiptLegacyFieldsMissing = [
  'status', 'canonicalAuthority', 'writesPerformed',
].filter((field) => input[field] === undefined);

const report = {
  schema: 'atlas.candidate-ordinal-admission.v1',
  mode: 'READ_ONLY_AUDIT',
  sourceReceipt: 'docs/reports/candidate-ordinal-corpus-receipt-v1.json',
  sourceReceiptDigest: `sha256:${inputDigest}`,
  sourceMap: 'docs/reports/candidate-ordinal-corpus-v1.json',
  sourceMapDigest: `sha256:${mapDigest}`,
  candidateSnapshotRevision: input.candidateSnapshotRevision ?? null,
  ordinalMapChecksum: input.ordinalMapChecksum ?? null,
  rowCount,
  checks: {
    revisionPresent: revision,
    checksumValid: checksum,
    sampledReceiptShapeValid: sampleShapeValid,
    fullPopulationRowsPresent: hasFullPopulation,
    denseOrdinals,
    mapRevisionMatchesReceipt: map.candidateSnapshotRevision === input.candidateSnapshotRevision,
    mapChecksumMatchesReceipt: map.ordinalMapChecksum === input.ordinalMapChecksum,
  },
  population: { actualRows: candidates.length, uniqueOrdinals, missingOrdinals, duplicateOrdinalCount },
  sourceReceiptLegacyFieldsMissing,
  status: revision && checksum && hasFullPopulation && denseOrdinals
    && map.candidateSnapshotRevision === input.candidateSnapshotRevision
    && map.ordinalMapChecksum === input.ordinalMapChecksum
    ? 'CANDIDATE_ORDINAL_ADMISSION_READY'
    : 'CANDIDATE_ORDINAL_ADMISSION_BLOCKED',
  downstreamAllowed: false,
  reason: 'This audit validates the existing full map without rebuilding it; downstream execution remains separately gated by KNN parameter and population receipts.',
  writesPerformed: false,
  canonicalAuthority: false,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/candidate-ordinal-admission-v1.json', status: report.status, rowCount }, null, 2));
