#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFreshOntologySourceSpan } from './lib/feature-ontology-fresh-candidate-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_INPUT = 'docs/reports/feature-ontology-fresh-extraction-multilane-v1.json';
const DEFAULT_OBSERVATION = 'docs/reports/workspace-source-binding-observation.json';
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const inputRelative = option('--input', DEFAULT_INPUT);
const observationRelative = option('--observation', DEFAULT_OBSERVATION);
const outputRelative = option('--output', '.tmp/atlas/grounded-span-readback-v1.json');
const receiptRelative = option('--receipt', '.tmp/atlas/grounded-span-readback-receipt-v1.json');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.resolve(ROOT, relative), 'utf8'));
function scratchPath(relative) {
  const absolute = path.resolve(ROOT, relative);
  const scratch = path.resolve(ROOT, '.tmp/atlas');
  if (absolute !== scratch && !absolute.startsWith(`${scratch}${path.sep}`)) throw new Error('OUTPUT_MUST_REMAIN_UNDER_TMP_ATLAS');
  return absolute;
}
function sourcePath(sourceRef) {
  if (!sourceRef || path.isAbsolute(sourceRef) || sourceRef.split(/[\\/]/).includes('..')) return null;
  const absolute = path.resolve(ROOT, sourceRef);
  if (!absolute.startsWith(`${ROOT}${path.sep}`)) return null;
  try {
    const realRoot = fs.realpathSync(ROOT);
    const real = fs.realpathSync(absolute);
    return real.startsWith(`${realRoot}${path.sep}`) ? real : null;
  } catch {
    return null;
  }
}

const input = readJson(inputRelative);
const observation = readJson(observationRelative);
const workspaceRevision = String(observation.record?.workspaceRevision ?? observation.workspaceRevision ?? '');
const bindings = new Map((observation.bindings ?? observation.record?.bindings ?? []).map((row) => [row.sourceRef, row]));
const candidates = [];
for (const candidate of input.candidates ?? []) {
  if (candidate.sourceSpanGrounded !== true) continue;
  const binding = bindings.get(candidate.sourceRef);
  let result;
  const file = sourcePath(candidate.sourceRef);
  if (!file) result = { status: 'REJECTED', reason: 'SOURCE_PATH_UNAVAILABLE' };
  else if (!binding) result = { status: 'REJECTED', reason: 'EXACT_SOURCE_BINDING_MISSING' };
  else if (candidate.workspaceRevision !== workspaceRevision || binding.workspaceRevision !== workspaceRevision) result = { status: 'REJECTED', reason: 'WORKSPACE_REVISION_MISMATCH' };
  else if (binding.sourceRevision !== candidate.sourceRevision || binding.contentDigest !== String(candidate.sourceRevision).replace(/^sha256:/, '')) result = { status: 'REJECTED', reason: 'SOURCE_BINDING_REVISION_MISMATCH' };
  else {
    const bytes = fs.readFileSync(file);
    const sourceRevision = `sha256:${sha(bytes)}`;
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    let source;
    try { source = decoded.decode(bytes); } catch { source = null; }
    if (!source || !Buffer.from(source, 'utf8').equals(bytes)) result = { status: 'REJECTED', reason: 'SOURCE_BYTES_INVALID_UTF8' };
    else if (sourceRevision !== candidate.sourceRevision) result = { status: 'REJECTED', reason: 'SOURCE_BYTES_REVISION_MISMATCH' };
    else {
      const span = candidate.sourceSpan ?? {};
      const verified = verifyFreshOntologySourceSpan(source, span.startChar, span.endChar, span.text);
      if (!verified.valid) result = { status: 'REJECTED', reason: verified.reason };
      else if (Number.isInteger(span.startByte) && Number.isInteger(span.endByte) && (span.startByte !== verified.startByte || span.endByte !== verified.endByte)) result = { status: 'REJECTED', reason: 'EXISTING_BYTE_OFFSETS_MISMATCH' };
      else result = {
        status: 'SOURCE_SPAN_READBACK_MATCH',
        sourceRevision,
        sourceByteLength: bytes.length,
        sourceSpan: { ...span, startByte: verified.startByte, endByte: verified.endByte },
      };
    }
  }
  candidates.push({ candidateId: candidate.candidateId, sourceRef: candidate.sourceRef, sourceRevision: candidate.sourceRevision, result });
}

const payload = {
  schema: 'atlas.feature-ontology-grounded-span-readback.v1',
  mode: 'READ_ONLY_SCRATCH_REVERIFICATION',
  workspaceRevision,
  input: { path: inputRelative, checksum: sha(Buffer.from(JSON.stringify(input))) },
  counts: {
    examined: candidates.length,
    readbackMatch: candidates.filter((row) => row.result.status === 'SOURCE_SPAN_READBACK_MATCH').length,
    rejected: candidates.filter((row) => row.result.status !== 'SOURCE_SPAN_READBACK_MATCH').length,
  },
  candidates,
  canonicalAuthority: false,
  writesPerformed: false,
};
const artifactChecksum = sha(Buffer.from(JSON.stringify(payload)));
const output = { ...payload, artifactChecksum };
const outputPath = scratchPath(outputRelative);
const receiptPath = scratchPath(receiptRelative);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
const writeAtomic = (file, value) => {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
};
writeAtomic(outputPath, output);
const reopened = readJson(outputRelative);
const reopenedPayload = { ...reopened };
delete reopenedPayload.artifactChecksum;
const readbackMatched = sha(Buffer.from(JSON.stringify(reopenedPayload))) === reopened.artifactChecksum;
const receipt = {
  schema: 'atlas.feature-ontology-grounded-span-readback-receipt.v1',
  output: outputRelative,
  artifactChecksum,
  readbackMatched,
  status: readbackMatched ? 'INDEPENDENT_READBACK_MATCH' : 'READBACK_MISMATCH',
  canonicalAuthority: false,
  writesPerformed: false,
};
writeAtomic(receiptPath, receipt);
const receiptReadback = readJson(receiptRelative);
if (!readbackMatched || receiptReadback.status !== 'INDEPENDENT_READBACK_MATCH') process.exitCode = 1;
console.log(JSON.stringify({ status: receipt.status, ...payload.counts, artifactChecksum, output: outputRelative, receipt: receiptRelative, writesPerformed: false }, null, 2));
