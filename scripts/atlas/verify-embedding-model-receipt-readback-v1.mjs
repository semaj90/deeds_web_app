#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const defaultReceiptPath = path.join(repoRoot, 'docs/reports/emb-prov-01-embedding-provenance-receipt.json');
const checksumPattern = /^(?:sha256:)?[a-f0-9]{64}$/i;

function checksumValue(value) {
  return typeof value === 'string' && checksumPattern.test(value.trim())
    ? value.trim().replace(/^sha256:/i, '').toLowerCase()
    : null;
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function hashFileSha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function check(id, passed, detail) {
  return { id, status: passed ? 'PASS' : 'NOT_PROVEN', detail };
}

export function evaluateModelReceiptReadbackV1({ receipt, artifactReadback, runtimeReadback }) {
  const artifact = receipt?.artifact ?? {};
  const provenance = receipt?.provenanceFields ?? {};
  const parityDimension = receipt?.crossExecutorParity?.parity?.dim;
  const expectedArtifactChecksum = checksumValue(artifact.liveArtifactSha256);
  const recordedRevisionChecksum = checksumValue(artifact.recordedModelArtifactRevision);
  const recordedGgufChecksum = checksumValue(artifact.recordedGgufSha256Var);
  const tokenizerChecksum = checksumValue(provenance.tokenizerSha256);
  const callReceipts = receipt?.perCallReceipts ?? receipt?.calls;
  const runtimeArtifactChecksum = checksumValue(receipt?.runtimeLoadedArtifact?.artifactChecksum);

  const checks = [
    check('RECEIPT_SCHEMA', receipt?.schema === 'atlas.emb-prov-01-embedding-provenance-receipt.v1', 'Expected the existing EMB-PROV-01 receipt schema.'),
    check('MODEL_ID', typeof receipt?.modelId === 'string' && receipt.modelId.trim().length > 0, 'Requires explicit modelId; a server alias is not substituted.'),
    check('ARTIFACT_CHECKSUM', Boolean(artifactReadback?.status === 'PASS' && expectedArtifactChecksum && expectedArtifactChecksum === recordedRevisionChecksum && expectedArtifactChecksum === recordedGgufChecksum && artifactReadback.sha256 === expectedArtifactChecksum), 'Requires independent file hashing and agreement with both recorded artifact checksum fields and file size.'),
    check('DIMENSION_768', parityDimension === 768, 'Requires a measured 768-dimensional receipt value.'),
    check('POOLING', typeof receipt?.pooling === 'string' && receipt.pooling.trim().length > 0, 'Requires an explicit pooling value.'),
    check('TOKENIZER_REVISION', typeof provenance.tokenizerRevision === 'string' && provenance.tokenizerRevision.trim().length > 0 && Boolean(tokenizerChecksum), 'Requires tokenizer revision plus a SHA-256 tokenizer checksum.'),
    check('MODEL_REVISION', Boolean(recordedRevisionChecksum), 'Requires an explicit SHA-256 model/artifact revision.'),
    check('PRODUCER_REVISION', typeof receipt?.producerRevision === 'string' && receipt.producerRevision.trim().length > 0, 'Requires the receipt producer revision.'),
    check('ACTIVE_RUNTIME_PROVIDER_BINDING', runtimeReadback?.status === 'PROVEN' && Boolean(runtimeArtifactChecksum) && runtimeReadback.artifactChecksum === runtimeArtifactChecksum, 'Requires an active runtime/provider readback bound to the receipt artifact checksum; matching path/name is insufficient.'),
    check('PER_CALL_REVISIONS', Array.isArray(callReceipts) && callReceipts.length > 0 && callReceipts.every((call) => call?.tokenizerRevision === provenance.tokenizerRevision && call?.inputPolicyRevision === provenance.inputPolicyRevision && typeof call?.inputPolicyRevision === 'string' && call.inputPolicyRevision.length > 0), 'Requires per-call tokenizerRevision and inputPolicyRevision receipts.'),
  ];
  const artifactEvidenceStatus = checks.some((entry) => entry.id === 'ARTIFACT_CHECKSUM' && entry.status === 'PASS') && checks.some((entry) => entry.id === 'DIMENSION_768' && entry.status === 'PASS')
    ? 'ARTIFACT_PROVEN'
    : 'ARTIFACT_NOT_PROVEN';
  const runtimeBindingStatus = runtimeReadback?.status === 'PROVEN'
    ? 'RUNTIME_BINDING_PROVEN'
    : runtimeReadback?.diagnostics && Object.values(runtimeReadback.diagnostics).some((value) => value === 'OBSERVED')
      ? 'RUNTIME_BINDING_PARTIAL'
      : 'RUNTIME_BINDING_NOT_PROVEN';

  return {
    schema: 'atlas.model-receipt-readback-audit.v1',
    status: checks.every((entry) => entry.status === 'PASS') ? 'PROVEN' : 'NOT_PROVEN',
    artifactEvidenceStatus,
    runtimeBindingStatus,
    canonicalAuthority: false,
    writesPerformed: false,
    checks,
  };
}

async function getJsonV1(baseUrl, route) {
  if (!isLoopbackUrl(baseUrl)) return { status: 'NOT_PROVEN', error: 'NON_LOOPBACK_URL_REFUSED' };
  try {
    const response = await fetch(new URL(route, `${baseUrl.replace(/\/$/, '')}/`), {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
      headers: { accept: 'application/json' },
    });
    const body = await response.text();
    if (!response.ok) return { status: 'NOT_PROVEN', httpStatus: response.status };
    try {
      return { status: 'OBSERVED', httpStatus: response.status, body: JSON.parse(body) };
    } catch {
      return { status: 'NOT_PROVEN', httpStatus: response.status, error: 'INVALID_JSON' };
    }
  } catch (error) {
    return { status: 'NOT_PROVEN', error: error instanceof Error ? error.message : String(error) };
  }
}

async function readArtifactV1(receipt) {
  const artifact = receipt?.artifact ?? {};
  const configuredPath = artifact.modelPath;
  const expectedChecksum = checksumValue(artifact.liveArtifactSha256);
  if (typeof configuredPath !== 'string' || !expectedChecksum) return { status: 'NOT_PROVEN', reason: 'ARTIFACT_PATH_OR_CHECKSUM_MISSING' };

  try {
    const resolvedPath = realpathSync(configuredPath);
    const relativePath = path.relative(repoRoot, resolvedPath);
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      return { status: 'NOT_PROVEN', reason: 'ARTIFACT_PATH_OUTSIDE_REPOSITORY' };
    }
    const bytes = statSync(resolvedPath).size;
    const sha256 = await hashFileSha256(resolvedPath);
    return {
      status: sha256 === expectedChecksum && bytes === artifact.artifactBytes ? 'PASS' : 'NOT_PROVEN',
      path: relativePath,
      bytes,
      sha256,
    };
  } catch (error) {
    return { status: 'NOT_PROVEN', reason: error instanceof Error ? error.message : String(error) };
  }
}

async function readRuntimeV1(receipt) {
  const baseUrl = receipt?.config?.baseUrl;
  const provider = receipt?.config?.provider;
  if (provider !== 'ollama' || typeof baseUrl !== 'string') {
    return { status: 'NOT_PROVEN', reason: 'RECEIPT_PROVIDER_OR_BASE_URL_MISSING' };
  }

  const [tags, processes, version] = await Promise.all([
    getJsonV1(baseUrl, '/api/tags'),
    getJsonV1(baseUrl, '/api/ps'),
    getJsonV1(baseUrl, '/api/version'),
  ]);
  const modelId = receipt.modelId;
  const installed = tags.body?.models?.find((model) => model.name === modelId);
  const loaded = processes.body?.models?.filter((model) => model.name === modelId || model.model === modelId) ?? [];
  const exactLoaded = loaded.length === 1 && Boolean(installed?.digest) && loaded[0]?.digest === installed.digest;
  const runtimeDigestStable = loaded.length === 1 && Boolean(installed?.digest) && loaded[0]?.digest === installed.digest;

  return {
    status: 'NOT_PROVEN',
    provider,
    modelId: modelId ?? null,
    installedDigest: installed?.digest ?? null,
    loadedModelCount: loaded.length,
    runtimeDigestStable,
    runtimeVersion: version.body?.version ?? null,
    artifactChecksum: null,
    reason: exactLoaded ? 'RUNTIME_API_DIGEST_IS_NOT_THE_CONFIGURED_GGUF_FILE_CHECKSUM' : 'EXACT_MODEL_RESIDENCY_UNPROVEN',
    diagnostics: { tags: tags.status, processList: processes.status, version: version.status },
  };
}

async function main() {
  const receiptArgument = process.argv.find((arg) => arg.startsWith('--receipt='))?.slice('--receipt='.length);
  const receiptPath = path.resolve(receiptArgument ?? defaultReceiptPath);
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch (error) {
    console.log(JSON.stringify({ schema: 'atlas.model-receipt-readback-audit.v1', status: 'NOT_PROVEN', canonicalAuthority: false, writesPerformed: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 2;
    return;
  }

  const [artifactReadback, runtimeReadback] = await Promise.all([readArtifactV1(receipt), readRuntimeV1(receipt)]);
  const audit = evaluateModelReceiptReadbackV1({ receipt, artifactReadback, runtimeReadback });
  console.log(JSON.stringify({
    ...audit,
    receiptPath: path.relative(repoRoot, receiptPath),
    artifactReadback,
    runtimeReadback,
    strictEmbeddingRuntime: await getJsonV1(receipt?.strictLane?.strictBaseUrl, '/v1/models').then(({ status, httpStatus, error }) => ({ status, httpStatus: httpStatus ?? null, error: error ?? null })),
  }, null, 2));
  if (audit.status !== 'PROVEN') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
