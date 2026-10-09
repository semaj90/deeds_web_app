#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
const proofArg = args.get('proof');
if (!proofArg) throw new Error('PROOF_REQUIRED:--proof=<scratch-proof-json>');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function scratchPath(value, label) {
  const resolved = path.resolve(ROOT, value);
  const relative = path.relative(path.join(ROOT, '.tmp', 'atlas'), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label}_MUST_BE_UNDER_TMP_ATLAS`);
  return resolved;
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const proofPath = scratchPath(proofArg, 'PROOF');
  const outputPath = scratchPath(args.get('output') ?? `.tmp/atlas/ornith-source-qualified-summary-v1-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`, 'OUTPUT');
  const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  const { checksum: proofChecksum, ...proofPayload } = proof;
  if (proof.schema !== 'atlas.live-packet-symbol-ast-observation-proof.v1'
    || proofChecksum !== sha256(JSON.stringify(proofPayload))) throw new Error('SOURCE_PROOF_CHECKSUM_INVALID');

  const binding = proof.exactBinding;
  if (!binding || binding.admissionStatus !== 'PROPOSAL_ONLY' || binding.canonicalAuthority !== false) {
    throw new Error('SOURCE_BINDING_NOT_PROPOSAL_QUALIFIED');
  }
  const sourcePath = path.resolve(ROOT, binding.sourceRef);
  const relativeSourcePath = path.relative(ROOT, sourcePath);
  if (!relativeSourcePath || relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) throw new Error('SOURCE_REF_OUTSIDE_REPOSITORY');
  const sourceBytes = readFileSync(sourcePath);
  const sourceChecksum = sha256(sourceBytes);
  const spanBytes = sourceBytes.subarray(binding.byteStart, binding.byteEnd);
  const spanChecksum = sha256(spanBytes);
  if (binding.sourceRevision !== `sha256:${sourceChecksum}`) throw new Error('SOURCE_REVISION_READBACK_MISMATCH');
  if (binding.spanChecksum !== spanChecksum || binding.astObservation?.matched_text_hash !== spanChecksum) throw new Error('SOURCE_SPAN_READBACK_MISMATCH');

  const modelsResponse = await fetch('http://127.0.0.1:8090/v1/models', { signal: AbortSignal.timeout(4000) });
  if (!modelsResponse.ok) throw new Error(`MODEL_LIST_HTTP_${modelsResponse.status}`);
  const modelsBody = await modelsResponse.json();
  const model = modelsBody.data?.find((item) => item.id === 'ornith-1.5-9b')
    ?? modelsBody.models?.find((item) => item.name === 'ornith-1.5-9b');
  if (!model) throw new Error('ORNITH_1_5_9B_NOT_CURRENTLY_SERVED');
  const propsResponse = await fetch('http://127.0.0.1:8090/props', { signal: AbortSignal.timeout(4000) });
  const props = propsResponse.ok ? await propsResponse.json() : {};
  const modelPath = typeof props.model_path === 'string' ? props.model_path : null;
  const modelArtifactSha256 = modelPath ? await hashFile(modelPath) : null;

  const sourceText = spanBytes.toString('utf8');
  const prompt = `Summarize this source excerpt in concise bullets. Describe only behavior directly supported by the excerpt; distinguish executable code from comments/documentation. Do not infer callers, runtime use, or correctness beyond the excerpt. Do not include hidden reasoning.\n\nSource: ${binding.sourceRef}\nSource revision: ${binding.sourceRevision}\nByte range: [${binding.byteStart}, ${binding.byteEnd})\n\n${sourceText}`;
  const requestBody = {
    model: 'ornith-1.5-9b',
    stream: true,
    temperature: 0,
    seed: 42,
    max_tokens: 512,
    messages: [
      { role: 'system', content: 'Produce only the requested concise source summary. No chain-of-thought.' },
      { role: 'user', content: prompt },
    ],
  };
  const startedAt = performance.now();
  const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok || !response.body) throw new Error(`SUMMARY_HTTP_${response.status}:${await response.text()}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let summary = '';
  let usage = null;
  let firstContentMs = null;
  let finishReason = null;
  let streamDone = false;
  while (!streamDone) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') {
        streamDone = true;
        break;
      }
      const chunk = JSON.parse(data);
      const content = chunk.choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        if (firstContentMs === null) firstContentMs = Math.round(performance.now() - startedAt);
        summary += content;
      }
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
  }
  const totalMs = Math.round(performance.now() - startedAt);
  if (!summary.trim()) throw new Error('EMPTY_MODEL_SUMMARY');
  if (finishReason === 'length') throw new Error('SUMMARY_TRUNCATED_BY_TOKEN_LIMIT');
  if (summary.trim().length > 3000) throw new Error('SUMMARY_EXCEEDS_BOUNDED_OUTPUT');
  const bulletCount = summary.trim().split(/\r?\n/).filter((line) => /^[-*•]\s/.test(line)).length;

  const payload = {
    schema: 'atlas.source-qualified-model-summary.v1',
    status: 'DIAGNOSTIC_SOURCE_SPAN_SUMMARY_NOT_ADMITTED',
    model: {
      id: model.id ?? model.name,
      alias: props.model_alias ?? model.id ?? model.name,
      modelPath,
      modelArtifactSha256: modelArtifactSha256 ? `sha256:${modelArtifactSha256}` : null,
      contextSize: props.n_ctx ?? null,
      modalities: props.modalities ?? null,
      buildInfo: props.build_info ?? null,
      binding: modelArtifactSha256 ? 'RUNNING_MODEL_PATH_FILE_HASHED_NOT_SERVER_ATTESTED' : 'MODEL_FILE_HASH_UNAVAILABLE',
    },
    source: {
      sourceRef: binding.sourceRef,
      sourceRevision: binding.sourceRevision,
      workspaceRevision: binding.workspaceRevision,
      byteStart: binding.byteStart,
      byteEnd: binding.byteEnd,
      spanSha256: `sha256:${spanChecksum}`,
      observationId: binding.astObservation?.observation_id ?? null,
      symbolVersionId: binding.symbolVersionId,
    },
    prompt: {
      sha256: `sha256:${sha256(prompt)}`,
      maxTokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
      seed: requestBody.seed,
      stream: requestBody.stream,
    },
    output: { text: summary.trim(), bulletCount, finishReason, usage },
    benchmark: { totalMs, firstContentMs },
    admission: {
      taskEvidenceAdmitted: false,
      canonicalAuthority: false,
      persistentStoreWrites: false,
      cacheEligibility: 'NOT_EVALUATED',
    },
  };
  const checksum = `sha256:${sha256(canonicalJson(payload))}`;
  const receipt = { ...payload, checksum };
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const readback = JSON.parse(readFileSync(outputPath, 'utf8'));
  const { checksum: readbackChecksum, ...readbackPayload } = readback;
  if (readbackChecksum !== `sha256:${sha256(canonicalJson(readbackPayload))}`) throw new Error('SUMMARY_RECEIPT_READBACK_MISMATCH');
  console.log(JSON.stringify({
    status: readback.status,
    model: readback.model.id,
    modelArtifactSha256: readback.model.modelArtifactSha256,
    sourceRevision: readback.source.sourceRevision,
    spanSha256: readback.source.spanSha256,
    summary: readback.output.text,
    totalMs: readback.benchmark.totalMs,
    firstContentMs: readback.benchmark.firstContentMs,
    checksum: readbackChecksum,
    readback: 'MATCH',
    reportPath: path.relative(ROOT, outputPath).replaceAll('\\', '/'),
    canonicalAuthority: false,
    persistentStoreWrites: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
