import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLiveAstObservationProposalV1 } from './lib/compile-live-ast-proposal-v1.mts';
import { sourceBytesMatchRevisionV1 } from './lib/source-byte-revision-v1.mjs';
import { selectRootAstObservationBoundByLiveSymbolProofV1 } from './lib/root-ast-live-observation-alignment-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJsonChecksum(value: Record<string, unknown>): string {
  return sha256(JSON.stringify(value));
}

function resolveScratchPath(key: string): string {
  const value = args.get(key);
  if (!value) throw new Error(`ARGUMENT_REQUIRED:${key}`);
  const resolved = path.resolve(ROOT, value);
  const relative = path.relative(path.join(ROOT, '.tmp', 'atlas'), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`PATH_MUST_BE_UNDER_TMP_ATLAS:${key}`);
  }
  return resolved;
}

const proofPath = resolveScratchPath('proof');
const observationsPath = resolveScratchPath('observations');
const bridgeReceiptPath = resolveScratchPath('bridge-receipt');
const outputPath = resolveScratchPath('output');
if (new Set([proofPath, observationsPath, bridgeReceiptPath, outputPath]).size !== 4) {
  throw new Error('INPUT_OUTPUT_PATHS_MUST_BE_DISTINCT');
}

const [proofBytes, observationBytes, bridgeReceiptBytes] = await Promise.all([
  readFile(proofPath), readFile(observationsPath), readFile(bridgeReceiptPath),
]);
const proof = JSON.parse(proofBytes.toString('utf8')) as Record<string, any>;
const bridgeReceipt = JSON.parse(bridgeReceiptBytes.toString('utf8')) as Record<string, any>;
const observations = observationBytes.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const binding = proof.exactBinding;
const { checksum: proofChecksum, ...proofPayload } = proof;

if (proof.schema !== 'atlas.live-packet-symbol-ast-observation-proof.v1'
  || canonicalJsonChecksum(proofPayload) !== proofChecksum) throw new Error('SOURCE_PROOF_CHECKSUM_INVALID');
if (bridgeReceipt.schema !== 'atlas.ast-prefill-observation-bridge-receipt.v1'
  || bridgeReceipt.status !== 'PROPOSAL_PROJECTION_COMPLETE'
  || bridgeReceipt.inputReadbackMatched !== true
  || bridgeReceipt.inputChecksum !== bridgeReceipt.inputReadbackChecksum
  || bridgeReceipt.canonicalAuthority !== false
  || bridgeReceipt.persistentStoreWritesPerformed !== false
  || bridgeReceipt.outputChecksum !== sha256(observationBytes)
  || bridgeReceipt.readbackChecksum !== bridgeReceipt.outputChecksum
  || bridgeReceipt.readbackMatched !== true) throw new Error('BRIDGE_RECEIPT_INVALID');
if (!binding || binding.admissionStatus !== 'PROPOSAL_ONLY' || binding.canonicalAuthority !== false) {
  throw new Error('SOURCE_BINDING_NOT_PROPOSAL_QUALIFIED');
}
const sourcePath = path.resolve(ROOT, binding.sourceRef);
const sourceRelativePath = path.relative(ROOT, sourcePath);
if (!sourceRelativePath || sourceRelativePath.startsWith('..') || path.isAbsolute(sourceRelativePath)) {
  throw new Error('SOURCE_REF_OUTSIDE_REPOSITORY');
}
const sourceBytes = await readFile(sourcePath);
if (!sourceBytesMatchRevisionV1(sourceBytes, binding.sourceRevision)) throw new Error('SOURCE_REVISION_READBACK_MISMATCH');
if (!Number.isInteger(binding.byteStart) || !Number.isInteger(binding.byteEnd)
  || binding.byteStart < 0 || binding.byteEnd <= binding.byteStart || binding.byteEnd > sourceBytes.byteLength) {
  throw new Error('SOURCE_SPAN_INVALID');
}
const sourceSpanChecksum = sha256(sourceBytes.subarray(binding.byteStart, binding.byteEnd));
if (sourceSpanChecksum !== binding.spanChecksum
  || sourceSpanChecksum !== binding.astObservation?.matched_text_hash) {
  throw new Error('SOURCE_SPAN_CHECKSUM_MISMATCH');
}

const { row: exactObservationRow, identityBindingMode } = selectRootAstObservationBoundByLiveSymbolProofV1(proof, observations);

const compiled = compileLiveAstObservationProposalV1(proof, exactObservationRow.observation);
const payload = {
  schema: 'atlas.root-ast-live-observation-alignment-proof.v1',
  status: 'ROOT_OBSERVATION_AND_LIVE_SYMBOL_PROOF_EXACT_MATCH',
  sourceProofChecksum: proofChecksum,
  unselectedCandidateSpanMismatchCount: proof.spanMismatchCount,
  rootObservationFileChecksum: sha256(observationBytes),
  bridgeReceiptChecksum: sha256(bridgeReceiptBytes),
  packetKey: binding.packetKey,
  symbolVersionId: binding.symbolVersionId,
  identityBindingMode,
  sourceRef: binding.sourceRef,
  sourceRevision: binding.sourceRevision,
  sourceSpanChecksum,
  workspaceRevision: binding.workspaceRevision,
  extractorRevision: binding.astObservation.extractor_revision,
  observationId: binding.astObservation.observation_id,
  rootObservationChecksum: canonicalJsonChecksum(exactObservationRow.observation),
  compiledFeatureRowChecksum: compiled.compiledFeatureRowChecksum,
  compiledFeatureRowProposal: compiled.compiledFeatureRowProposal,
  compiledStatus: compiled.featureRowStatus,
  registryApproval: compiled.registryApproval,
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
};
const receipt = { ...payload, checksum: canonicalJsonChecksum(payload) };
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, any>;
const { checksum: readbackChecksum, ...readbackPayload } = readback;
if (canonicalJsonChecksum(readbackPayload) !== readbackChecksum || !isDeepStrictEqual(readback, receipt)) {
  throw new Error('OUTPUT_RECEIPT_READBACK_MISMATCH');
}
console.log(JSON.stringify({
  status: readback.status,
  packetKey: readback.packetKey,
  symbolVersionId: readback.symbolVersionId,
  identityBindingMode: readback.identityBindingMode,
  unselectedCandidateSpanMismatchCount: readback.unselectedCandidateSpanMismatchCount,
  extractorRevision: readback.extractorRevision,
  observationId: readback.observationId,
  compiledFeatureRowChecksum: readback.compiledFeatureRowChecksum,
  registryApproval: readback.registryApproval,
  readback: 'MATCH',
  canonicalAuthority: false,
  persistentStoreWritesPerformed: false,
  reportPath: path.relative(ROOT, outputPath).replaceAll('\\', '/'),
}, null, 2));
