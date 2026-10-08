#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const getArg = (name: string): string | null => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
};
const mapPath = path.resolve(root, getArg('--map') ?? '');
const receiptPath = path.resolve(root, getArg('--receipt') ?? '');
const outputPath = path.resolve(root, getArg('--output') ?? '');
const isUnderTmp = (absolutePath: string): boolean => {
  const relative = path.relative(root, absolutePath);
  return relative.startsWith(`.tmp${path.sep}`);
};
if (!getArg('--map') || !getArg('--receipt') || !getArg('--output')
  || !isUnderTmp(mapPath) || !isUnderTmp(receiptPath) || !isUnderTmp(outputPath)) {
  throw new Error('MAP_RECEIPT_AND_OUTPUT_MUST_BE_EXPLICIT_PATHS_UNDER_TMP');
}
if (fs.existsSync(outputPath)) throw new Error('READBACK_OUTPUT_ALREADY_EXISTS');

const sha256 = (value: string | Buffer): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const mapBytes = fs.readFileSync(mapPath);
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
const { receiptChecksum, ...receiptBody } = receipt;
if (receiptChecksum !== sha256(stableJson(receiptBody))) throw new Error('BRIDGE_RECEIPT_CHECKSUM_MISMATCH');
if (receipt.schema !== 'atlas.bridged-candidate-ordinal-receipt.v1'
  || receipt.status !== 'READ_ONLY_EXACT_LINEAGE_ORDINAL_MAP_READY'
  || receipt.mode !== 'REPEATABLE_READ_READ_ONLY_LOCAL_ARTIFACT') {
  throw new Error('BRIDGE_RECEIPT_SCHEMA_OR_STATUS_REJECTED');
}
const mapHash = sha256(mapBytes);
const map = candidateOrdinalMapV1Schema.parse(JSON.parse(mapBytes.toString('utf8')));
assertCandidateOrdinalMapIntegrityV1(map);
const mapReceipt = receipt.ordinalMap as Record<string, unknown> | undefined;
const semanticBindingCount = map.candidates.reduce((total, candidate) => total + candidate.representationBindings.length, 0);
const graphRevisionAvailable = map.candidates.some((candidate) => candidate.graphRevision !== null);
const semanticRevisionAvailable = map.candidates.some((candidate) => candidate.semanticRevision !== null);
if (!mapReceipt || mapReceipt.sha256 !== mapHash
  || mapReceipt.rowCount !== map.rowCount
  || mapReceipt.candidateSnapshotRevision !== map.candidateSnapshotRevision
  || mapReceipt.ordinalMapChecksum !== map.ordinalMapChecksum
  || mapReceipt.identityAuthority !== false
  || receipt.workspaceRevision !== map.workspaceRevision
  || receipt.exactChunkCandidateCount !== map.rowCount
  || semanticBindingCount !== 0
  || graphRevisionAvailable
  || semanticRevisionAvailable) {
  throw new Error('BRIDGED_CANDIDATE_ORDINAL_RECEIPT_READBACK_MISMATCH');
}
const boundaries = receipt.boundaries as Record<string, unknown> | undefined;
if (!boundaries || boundaries.semanticRepresentationBindings !== 0
  || boundaries.semanticVectorPromotion !== false
  || Object.entries(boundaries).some(([key, value]) => /Writes|Publishes|Runs/.test(key) && value !== 0)) {
  throw new Error('BRIDGED_CANDIDATE_ORDINAL_WRITE_BOUNDARY_MISMATCH');
}

const proof = {
  schema: 'atlas.bridged-candidate-ordinal-readback-proof.v1',
  status: 'INDEPENDENT_READBACK_MATCH',
  mapPath: path.relative(root, mapPath).replaceAll('\\', '/'),
  receiptPath: path.relative(root, receiptPath).replaceAll('\\', '/'),
  mapSha256: mapHash,
  sourceReceiptChecksum: receiptChecksum,
  candidateSnapshotRevision: map.candidateSnapshotRevision,
  workspaceRevision: map.workspaceRevision,
  rowCount: map.rowCount,
  ordinalMapChecksum: map.ordinalMapChecksum,
  identityAuthority: map.identityAuthority,
  graphRevision: null,
  graphRevisionAvailable,
  semanticRevisionAvailable,
  semanticRepresentationBindings: 0,
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...proof, outputPath: path.relative(root, outputPath).replaceAll('\\', '/') }, null, 2));
