#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLangExtractProbeInputV1, validateLangExtractSourceSpansV1 } from './lib/langextract-probe-input-v1.mjs';
import { resolveLangExtractModeV1 } from './lib/langextract-mode-v1.mjs';
import { verifySidecarRuntimeBindingV1 } from './lib/sidecar-runtime-binding-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratchRoot = path.join(root, '.tmp', 'atlas') + path.sep;
const args = process.argv.slice(2);
function argument(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}
function scratchPath(value, label) {
  if (!value) throw new Error(`${label}_REQUIRED`);
  const resolved = path.resolve(root, value);
  if (!resolved.startsWith(scratchRoot)) throw new Error(`${label}_MUST_BE_UNDER_TMP_ATLAS`);
  return resolved;
}
function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const proofPath = scratchPath(argument('--proof'), 'PROOF_PATH');
const outputPath = scratchPath(argument('--output'), 'OUTPUT_PATH');
const extractionMode = resolveLangExtractModeV1(argument('--mode'));
if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
const binding = proof.exactBinding;
const proofPayload = { ...proof };
delete proofPayload.checksum;
const proofChecksumVerified = typeof proof.checksum === 'string'
  && proof.checksum === createHash('sha256').update(JSON.stringify(proofPayload)).digest('hex');
const configuredMaxChars = Number(process.env.ATLAS_GROUNDING_MAX_CHARS ?? 50_000);
const maxChars = Number.isInteger(configuredMaxChars) && configuredMaxChars >= 1
  ? Math.min(200_000, configuredMaxChars)
  : 50_000;
const receipt = {
  schema: 'atlas.live-langextract-source-grounding-receipt.v1',
  mode: 'BOUNDED_PROPOSAL_ONLY',
  extractionMode,
  proofReceipt: path.relative(root, proofPath).replaceAll('\\', '/'),
  proofStatus: proof.status ?? null,
  proofReadback: proofChecksumVerified ? 'MATCH' : 'MISMATCH',
  canonicalAuthority: false,
  factAdmission: 'NOT_PERFORMED',
  writesPerformed: false,
  source: null,
  runtimeBinding: null,
  extraction: null,
  independentReadback: null,
};

let sourceBytes = null;
let probeInput = null;
if (proof.status !== 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH' || !proofChecksumVerified || !binding) {
  receipt.status = 'UNAVAILABLE_LIVE_SYMBOL_PROOF';
} else {
  const sourcePath = path.resolve(root, binding.sourceRef);
  if (!sourcePath.startsWith(root + path.sep)) throw new Error('SOURCE_REF_ESCAPES_REPOSITORY');
  sourceBytes = fs.readFileSync(sourcePath);
  probeInput = buildLangExtractProbeInputV1({
    sourceBytes,
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    workspaceRevision: binding.workspaceRevision,
    packetKey: binding.packetKey,
    maxChars,
  });
  receipt.source = {
    sourceRef: binding.sourceRef,
    packetKey: binding.packetKey,
    symbolVersionId: binding.symbolVersionId,
    sourceRevision: binding.sourceRevision,
    workspaceRevision: binding.workspaceRevision,
    currentSourceRevision: sha256(sourceBytes),
    sourceByteLength: sourceBytes.length,
    inputStatus: probeInput.status,
    inputReason: probeInput.reason ?? null,
  };
  if (probeInput.status !== 'READY_SOURCE_BYTES_BOUND') {
    receipt.status = probeInput.status;
  } else {
    const sidecarUrl = (process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
    const expectedModuleDigests = {
      miniforge_nlp_sidecar_v2: sha256(fs.readFileSync(path.join(root, 'python', 'miniforge_nlp_sidecar_v2.py'))),
      miniforge_nlp_sidecar: sha256(fs.readFileSync(path.join(root, 'python', 'miniforge_nlp_sidecar.py'))),
    };
    let runtimeHealth = null;
    let healthHttpStatus = null;
    let healthRequestError = null;
    try {
      const healthResponse = await fetch(`${sidecarUrl}/health`, {
        signal: AbortSignal.timeout(Math.max(1000, Number(process.env.ATLAS_GROUNDING_HEALTH_TIMEOUT_MS ?? 5000))),
      });
      healthHttpStatus = healthResponse.status;
      if (healthResponse.ok) runtimeHealth = await healthResponse.json();
      else healthRequestError = `HTTP_${healthResponse.status}`;
    } catch (error) {
      healthRequestError = error instanceof Error ? error.name : 'SIDECAR_HEALTH_REQUEST_FAILED';
    }
    const runtimeBinding = verifySidecarRuntimeBindingV1({ health: runtimeHealth, expectedModuleDigests });
    receipt.runtimeBinding = {
      ...runtimeBinding,
      healthHttpStatus,
      healthRequestError,
      expectedModuleDigests,
    };

    if (runtimeBinding.status !== 'RUNTIME_BINDING_MATCH') {
      receipt.extraction = {
        status: 'SKIPPED_RUNTIME_BINDING_GATE',
        requestSkipped: true,
        validatedCount: 0,
      };
      receipt.status = runtimeBinding.status;
    } else {
      let payload = null;
      let httpStatus = null;
      let requestError = null;
      let responseErrorExcerpt = null;
      try {
        const response = await fetch(`${sidecarUrl}/extract`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(Math.max(1000, Number(process.env.ATLAS_GROUNDING_TIMEOUT_MS ?? 90_000))),
          body: JSON.stringify({
            source_type: 'codebase',
            source_ref: binding.sourceRef,
            source_revision: binding.sourceRevision,
            workspace_revision: binding.workspaceRevision,
            packet_key: binding.packetKey,
            language: path.extname(binding.sourceRef).toLowerCase() === '.ts' ? 'typescript' : 'javascript',
            text: probeInput.text,
            max_chars: maxChars,
            extraction_mode: extractionMode,
            grounded_extraction_required: true,
          }),
        });
        httpStatus = response.status;
        const responseText = await response.text();
        try {
          payload = JSON.parse(responseText);
        } catch {
          responseErrorExcerpt = responseText.slice(0, 500);
        }
        if (!response.ok) requestError = `HTTP_${response.status}`;
        else if (!payload) requestError = 'RESPONSE_NOT_JSON';
      } catch (error) {
        requestError = error instanceof Error ? error.name : 'SIDECAR_REQUEST_FAILED';
      }
      const validation = requestError
        ? { status: 'SIDECAR_HTTP_ERROR', validatedCount: 0, spanResults: [] }
        : payload
        ? validateLangExtractSourceSpansV1({ payload, sourceBytes, binding, inputChecksum: probeInput.inputChecksum })
        : { status: 'SIDECAR_UNAVAILABLE', validatedCount: 0, spanResults: [] };
      receipt.extraction = {
        sidecarUrl,
        httpStatus,
        requestError,
        responseErrorExcerpt,
        providerRevision: payload?.metadata?.provider_revision ?? null,
        modelId: payload?.metadata?.model_id ?? null,
        inputChecksum: probeInput.inputChecksum,
        resultCount: Array.isArray(payload?.metadata?.grounded_extractions) ? payload.metadata.grounded_extractions.length : 0,
        validation,
        responseChecksum: payload ? sha256(Buffer.from(JSON.stringify(payload))) : null,
      };
      receipt.status = validation.status;
    }
  }
}

const checksumPayload = { ...receipt };
delete checksumPayload.independentReadback;
receipt.receiptChecksum = sha256(Buffer.from(JSON.stringify(checksumPayload)));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
let readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
let readbackPayload = { ...readback };
delete readbackPayload.receiptChecksum;
delete readbackPayload.independentReadback;
let readbackChecksum = sha256(Buffer.from(JSON.stringify(readbackPayload)));
receipt.independentReadback = {
  status: readbackChecksum === receipt.receiptChecksum ? 'MATCH' : 'MISMATCH',
  receiptChecksum: readbackChecksum,
};
if (receipt.independentReadback.status !== 'MATCH') throw new Error('RECEIPT_READBACK_MISMATCH');
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
readbackPayload = { ...readback };
delete readbackPayload.receiptChecksum;
delete readbackPayload.independentReadback;
readbackChecksum = sha256(Buffer.from(JSON.stringify(readbackPayload)));
if (readbackChecksum !== receipt.receiptChecksum || readback.independentReadback?.status !== 'MATCH') throw new Error('FINAL_RECEIPT_READBACK_MISMATCH');
console.log(JSON.stringify({
  status: receipt.status,
  validatedSpanCount: receipt.extraction?.validation?.validatedCount ?? 0,
  inputStatus: receipt.source?.inputStatus ?? null,
  independentReadback: receipt.independentReadback.status,
  canonicalAuthority: false,
  factAdmission: 'NOT_PERFORMED',
  writesPerformed: false,
  reportPath: path.relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2));
