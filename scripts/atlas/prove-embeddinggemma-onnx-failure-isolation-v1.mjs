#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const SOURCE_MODEL_DIR = path.join(ROOT, 'models/embeddinggemma_300m');
const EXPORTER_PATH = path.join(ROOT, 'scripts/export-embeddinggemma-client-onnx.py');
const RUNTIME_PATH = path.join(FRONTEND, 'src/lib/server/embedding/onnx-embed.ts');
const MODEL_DIR_CANDIDATES = [
  path.join(FRONTEND, 'static/embeddinggemma_300m_onnx'),
  path.join(FRONTEND, 'static/models/embeddinggemma_300m_onnx'),
  path.join(ROOT, 'models/embeddinggemma_300m_onnx'),
];
const MODEL_DIR = MODEL_DIR_CANDIDATES.find((directory) => fs.existsSync(path.join(directory, 'model.onnx')) && fs.existsSync(path.join(directory, 'tokenizer.json')));
if (!MODEL_DIR) throw new Error('EMBEDDINGGEMMA_ONNX_MODEL_AND_TOKENIZER_NOT_FOUND');
const MODEL_PATH = path.join(MODEL_DIR, 'model.onnx');
const TOKENIZER_PATH = path.join(MODEL_DIR, 'tokenizer.json');
const INFO_PATH = path.join(MODEL_DIR, 'model_info.json');
const ROOT_MODEL_PATH = path.join(ROOT, 'models/embeddinggemma_300m_onnx/model.onnx');
const ROOT_TOKENIZER_PATH = path.join(ROOT, 'models/embeddinggemma_300m_onnx/tokenizer.json');
const Q8_PATH = path.join(ROOT, 'models/embeddinggemma-300m-q8_0.gguf');
const Q8_MANIFEST_PATH = path.join(ROOT, 'docs/reports/semantic-doc-01-embedding-cohort-manifest-v1.json');
const Q8_PARITY_PATH = path.join(ROOT, 'docs/reports/semantic-doc-01-embedding-parity-v1.json');
const PRIOR_FAILURE_PATH = path.join(ROOT, 'docs/reports/ort-cpu-semantic-parity-01.json');
const DEFAULT_OUTPUT = `.tmp/atlas/embeddinggemma-onnx-failure-isolation-v1-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`;
const DIMENSIONS = 768;
const MAX_LENGTH = 512;
const REFERENCE_URL = process.env.ATLAS_Q8_REFERENCE_URL ?? 'http://127.0.0.1:8081';
const frontendRequire = createRequire(path.join(FRONTEND, 'package.json'));

const inputs = [
  { id: 'exact-a', group: 'exact_duplicate', text: 'PostgreSQL stores chunk vectors with source and workspace revision metadata.' },
  { id: 'exact-b', group: 'exact_duplicate', text: 'PostgreSQL stores chunk vectors with source and workspace revision metadata.' },
  { id: 'paraphrase', group: 'paraphrase', text: 'Chunk embeddings are persisted in PostgreSQL alongside source and workspace revision information.' },
  { id: 'related', group: 'related', text: 'A cosine HNSW index retrieves similar document chunks from pgvector.' },
  { id: 'unrelated-legal', group: 'unrelated', text: 'The court clerk schedules hearings and files signed notices with the case docket.' },
  { id: 'unrelated-garden', group: 'unrelated', text: 'A sunflower grows toward sunlight in a garden during spring.' },
];
const SENTENCE_SIMILARITY_PREFIX = 'task: sentence similarity | query: ';

function renderInput(item) {
  return `${SENTENCE_SIMILARITY_PREFIX}${item.text}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function bareSha256(value) {
  return String(value ?? '').replace(/^sha256:/i, '').toLowerCase();
}

function findArtifactDigest(value) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
    if (['modelsha256', 'artifactsha256', 'ggufsha256', 'modeldigest', 'artifactdigest', 'ggufdigest', 'sha256'].includes(normalizedKey)
      && typeof item === 'string' && /^[a-f0-9]{64}$/i.test(bareSha256(item))) return bareSha256(item);
  }
  for (const item of Object.values(value)) {
    const nested = findArtifactDigest(item);
    if (nested) return nested;
  }
  return null;
}

function vectorChecksum(vector) {
  const bytes = Buffer.alloc(vector.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  vector.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return sha256Bytes(bytes);
}

function norm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosine(left, right) {
  if (left.length !== right.length || left.length === 0) throw new Error('VECTOR_DIMENSION_MISMATCH');
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function outputPathFromArgs() {
  const index = process.argv.indexOf('--output');
  const output = index >= 0 ? process.argv[index + 1] : DEFAULT_OUTPUT;
  if (!output) throw new Error('OUTPUT_PATH_REQUIRED');
  const resolved = path.resolve(ROOT, output);
  const tmpRoot = path.resolve(ROOT, '.tmp', 'atlas') + path.sep;
  if (!resolved.startsWith(tmpRoot)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
  if (fs.existsSync(resolved)) throw new Error('REFUSING_TO_OVERWRITE_OUTPUT');
  return resolved;
}

function getSequenceMetadata(encoded) {
  const ids = Array.from(encoded.input_ids.data, Number);
  const mask = Array.from(encoded.attention_mask.data, Number);
  if (ids.length === 0 || ids.length !== mask.length || ids.length > MAX_LENGTH) throw new Error('INVALID_TOKENIZER_OUTPUT');
  return { ids, mask, attentionTokenCount: mask.reduce((sum, bit) => sum + (bit === 1 ? 1 : 0), 0) };
}

function embedFromOutput(result, mask, ort) {
  const key = result.sentence_embedding
    ? 'sentence_embedding'
    : result.last_hidden_state
      ? 'last_hidden_state'
      : result.token_embeddings
        ? 'token_embeddings'
        : Object.keys(result)[0];
  const tensor = result[key];
  if (!tensor || !tensor.data || !tensor.dims) throw new Error('ONNX_OUTPUT_TENSOR_MISSING');
  const dims = Array.from(tensor.dims, Number);
  const data = Array.from(tensor.data, Number);
  if (data.some((value) => !Number.isFinite(value))) throw new Error('ONNX_OUTPUT_NONFINITE');
  if (dims.length === 2 && dims[0] === 1 && dims[1] === DIMENSIONS && data.length === DIMENSIONS) {
    return { vector: data, outputKey: key, outputShape: dims, pooling: 'MODEL_OUTPUT_SENTENCE_VECTOR; NO_ADDITIONAL_POOLING_OR_NORMALIZATION' };
  }
  if (dims.length !== 3 || dims[0] !== 1 || dims[2] !== DIMENSIONS || data.length !== dims[1] * DIMENSIONS) {
    throw new Error(`UNSUPPORTED_ONNX_OUTPUT_SHAPE:${dims.join('x')}`);
  }
  if (mask.length !== dims[1]) throw new Error('ATTENTION_MASK_OUTPUT_SEQUENCE_MISMATCH');
  const pooled = new Array(DIMENSIONS).fill(0);
  let validTokens = 0;
  for (let token = 0; token < dims[1]; token++) {
    if (mask[token] === 0) continue;
    validTokens++;
    for (let dimension = 0; dimension < DIMENSIONS; dimension++) {
      pooled[dimension] += data[token * DIMENSIONS + dimension];
    }
  }
  if (validTokens === 0) throw new Error('ATTENTION_MASK_EMPTY');
  for (let dimension = 0; dimension < DIMENSIONS; dimension++) pooled[dimension] /= validTokens;
  const preNormalizationNorm = norm(pooled);
  if (!(preNormalizationNorm > 0) || !Number.isFinite(preNormalizationNorm)) throw new Error('POOLED_VECTOR_NORM_INVALID');
  const vector = pooled.map((value) => value / preNormalizationNorm);
  return {
    vector,
    outputKey: key,
    outputShape: dims,
    pooling: 'MEAN_OVER_ATTENTION_MASK_THEN_L2_NORMALIZE',
    validTokens,
    preNormalizationNorm,
  };
}

async function readBoundQ8Reference(q8Sha256) {
  const base = REFERENCE_URL.replace(/\/$/, '');
  const timeout = AbortSignal.timeout(1500);
  let health = null;
  let models = null;
  try {
    const response = await fetch(`${base}/health`, { signal: timeout });
    health = { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    return { status: 'REFERENCE_RUNTIME_UNAVAILABLE', endpoint: base, reason: String(error), q8ArtifactSha256: q8Sha256, attemptedEmbeddingCalls: 0 };
  }
  try {
    const response = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(1500) });
    models = { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    models = { status: null, error: String(error) };
  }
  const embeddedDigest = findArtifactDigest(health.body);
  if (health.status < 200 || health.status >= 300) {
    return { status: 'REFERENCE_HEALTH_NOT_OK', endpoint: base, health, models, q8ArtifactSha256: q8Sha256, attemptedEmbeddingCalls: 0 };
  }
  if (!embeddedDigest || embeddedDigest !== q8Sha256.replace(/^sha256:/, '').toLowerCase()) {
    return {
      status: 'REFERENCE_RUNTIME_NOT_ARTIFACT_BOUND', endpoint: base, health, models,
      observedArtifactSha256: embeddedDigest ? `sha256:${embeddedDigest}` : null,
      expectedArtifactSha256: q8Sha256, attemptedEmbeddingCalls: 0,
    };
  }
  const vectors = [];
  for (const item of inputs) {
    const response = await fetch(`${base}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma', input: item.text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Q8_EMBED_HTTP_${response.status}`);
    const payload = await response.json();
    const vector = payload?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== DIMENSIONS || vector.some((value) => !Number.isFinite(value))) {
      throw new Error('Q8_EMBED_INVALID_768_VECTOR');
    }
    vectors.push(vector);
  }
  return { status: 'REFERENCE_EXECUTED_ARTIFACT_BOUND', endpoint: base, health, models, q8ArtifactSha256: q8Sha256, vectors };
}

function pairwiseMatrix(vectors) {
  return vectors.map((left) => vectors.map((right) => cosine(left, right)));
}

function summarizeVectors(vectors) {
  const norms = vectors.map(norm);
  const ranges = vectors.map((vector) => ({ min: Math.min(...vector), max: Math.max(...vector) }));
  return {
    vectorCount: vectors.length,
    dimensionCounts: [...new Set(vectors.map((vector) => vector.length))],
    finiteScalarCount: vectors.reduce((count, vector) => count + vector.filter(Number.isFinite).length, 0),
    zeroVectorCount: vectors.filter((vector) => norm(vector) === 0).length,
    norm: { min: Math.min(...norms), mean: norms.reduce((sum, value) => sum + value, 0) / norms.length, max: Math.max(...norms) },
    perVector: vectors.map((vector, index) => ({ id: inputs[index].id, l2Norm: norms[index], min: ranges[index].min, max: ranges[index].max, checksum: vectorChecksum(vector) })),
  };
}

function pairGroups(matrix) {
  const pairs = {
    exactDuplicate: [[0, 1]],
    paraphrase: [[0, 2]],
    related: [[0, 3]],
    unrelated: [[0, 4], [0, 5]],
  };
  return Object.fromEntries(Object.entries(pairs).map(([name, indices]) => [name, indices.map(([left, right]) => ({
    left: inputs[left].id, right: inputs[right].id, cosine: matrix[left][right],
  }))]));
}

async function main() {
  for (const file of [MODEL_PATH, TOKENIZER_PATH, INFO_PATH, ROOT_MODEL_PATH, ROOT_TOKENIZER_PATH, Q8_PATH, Q8_MANIFEST_PATH, Q8_PARITY_PATH, PRIOR_FAILURE_PATH]) {
    if (!fs.existsSync(file)) throw new Error(`REQUIRED_ARTIFACT_MISSING:${path.relative(ROOT, file)}`);
  }
  const modelInfo = JSON.parse(fs.readFileSync(INFO_PATH, 'utf8'));
  const cohortManifest = JSON.parse(fs.readFileSync(Q8_MANIFEST_PATH, 'utf8'));
  const q8Parity = JSON.parse(fs.readFileSync(Q8_PARITY_PATH, 'utf8'));
  const priorFailure = JSON.parse(fs.readFileSync(PRIOR_FAILURE_PATH, 'utf8'));
  const sourceModules = JSON.parse(fs.readFileSync(path.join(SOURCE_MODEL_DIR, 'modules.json'), 'utf8'));
  const poolingConfig = JSON.parse(fs.readFileSync(path.join(SOURCE_MODEL_DIR, '1_Pooling/config.json'), 'utf8'));
  const denseModules = ['2_Dense', '3_Dense'].map((name) => {
    const directory = path.join(SOURCE_MODEL_DIR, name);
    const configPath = path.join(directory, 'config.json');
    const weightsPath = path.join(directory, 'model.safetensors');
    return {
      name,
      config: JSON.parse(fs.readFileSync(configPath, 'utf8')),
      configSha256: sha256File(configPath),
      weightsSha256: sha256File(weightsPath),
      weightsBytes: fs.statSync(weightsPath).size,
    };
  });
  const modelChecksum = sha256File(MODEL_PATH);
  const tokenizerChecksum = sha256File(TOKENIZER_PATH);
  const q8Checksum = sha256File(Q8_PATH);
  const outputPath = outputPathFromArgs();
  const ort = frontendRequire('onnxruntime-node');
  const transformersEntry = frontendRequire.resolve('@huggingface/transformers');
  const { AutoTokenizer, env } = await import(pathToFileURL(transformersEntry).href);
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_DIR, { local_files_only: true });
  const session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
    intraOpNumThreads: Math.min(4, Math.max(1, Number(process.env.ONNX_CPU_INTRA_OP_THREADS) || 4)),
    interOpNumThreads: 1,
  });

  const vectors = [];
  const perInput = [];
  for (const item of inputs) {
    const renderedInput = renderInput(item);
    const encoded = await tokenizer(renderedInput, { return_tensors: 'np', padding: true, truncation: true, max_length: MAX_LENGTH });
    const { ids, mask, attentionTokenCount } = getSequenceMetadata(encoded);
    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(mask, BigInt), [1, mask.length]),
    };
    const tokenTypeIds = encoded.token_type_ids ? Array.from(encoded.token_type_ids.data, Number) : null;
    if (session.inputNames.includes('token_type_ids') && tokenTypeIds) {
      feeds.token_type_ids = new ort.Tensor('int64', BigInt64Array.from(tokenTypeIds, BigInt), [1, tokenTypeIds.length]);
    }
    const result = await session.run(feeds);
    const embedded = embedFromOutput(result, mask, ort);
    if (embedded.vector.length !== DIMENSIONS || embedded.vector.some((value) => !Number.isFinite(value))) throw new Error('INVALID_ONNX_VECTOR');
    vectors.push(embedded.vector);
    perInput.push({
      id: item.id,
      semanticGroup: item.group,
      renderedInput,
      renderedInputSha256: sha256Bytes(Buffer.from(renderedInput, 'utf8')),
      tokenIds: ids,
      attentionMask: mask,
      attentionTokenCount,
      feedShapes: Object.fromEntries(Object.entries(feeds).map(([name, tensor]) => [name, Array.from(tensor.dims, Number)])),
      onnxOutput: { tensorName: embedded.outputKey, shape: embedded.outputShape, pooling: embedded.pooling, validTokens: embedded.validTokens ?? null, preNormalizationNorm: embedded.preNormalizationNorm ?? null },
    });
  }
  await session.release();

  const onnxMatrix = pairwiseMatrix(vectors);
  const q8Reference = await readBoundQ8Reference(q8Checksum);
  let q8 = null;
  if (q8Reference.status === 'REFERENCE_EXECUTED_ARTIFACT_BOUND') {
    q8 = q8Reference.vectors;
    delete q8Reference.vectors;
  }
  const q8Matrix = q8 ? pairwiseMatrix(q8) : null;
  const perInputCrossCosine = q8 ? vectors.map((vector, index) => cosine(vector, q8[index])) : null;

  const receiptBody = {
    schema: 'atlas.embeddinggemma-onnx-failure-isolation.v1',
    createdAt: new Date().toISOString(),
    status: q8 ? 'ONNX_AND_Q8_REFERENCE_DIAGNOSTICS_COMPLETE_NOT_ADMITTED' : 'ONNX_DIAGNOSTIC_COMPLETE_Q8_REFERENCE_UNAVAILABLE',
    authority: { canonicalAuthority: false, writesPerformed: false, embeddingsPersisted: false, productionPromotion: false },
    artifactIdentity: {
      onnxPath: path.relative(ROOT, MODEL_PATH).replaceAll('\\', '/'),
      onnxSha256: modelChecksum,
      modelResolutionOrder: MODEL_DIR_CANDIDATES.map((directory) => path.relative(ROOT, directory).replaceAll('\\', '/')),
      rootIgnoredModelSha256: sha256File(ROOT_MODEL_PATH),
      rootIgnoredTokenizerSha256: sha256File(ROOT_TOKENIZER_PATH),
      rootTokenizerMatchesResolvedRuntime: sha256File(ROOT_TOKENIZER_PATH) === tokenizerChecksum,
      rootModelMatchesResolvedRuntime: sha256File(ROOT_MODEL_PATH) === modelChecksum,
      tokenizerPath: path.relative(ROOT, TOKENIZER_PATH).replaceAll('\\', '/'),
      tokenizerSha256: tokenizerChecksum,
      modelInfo,
      sourceModelPipeline: {
        sourceModelPath: path.relative(ROOT, SOURCE_MODEL_DIR).replaceAll('\\', '/'),
        modulesSha256: sha256File(path.join(SOURCE_MODEL_DIR, 'modules.json')),
        modules: sourceModules.map(({ idx, path: modulePath, type }) => ({ idx, path: modulePath, type })),
        poolingConfig,
        denseProjectionModules: denseModules,
        exporterPath: path.relative(ROOT, EXPORTER_PATH).replaceAll('\\', '/'),
        exporterSha256: sha256File(EXPORTER_PATH),
        runtimePath: path.relative(ROOT, RUNTIME_PATH).replaceAll('\\', '/'),
        runtimeSha256: sha256File(RUNTIME_PATH),
        observedMismatch: 'Exporter uses AutoModel and outputs only last_hidden_state; runtime mean-pools and normalizes but does not apply the local SentenceTransformer 2_Dense and 3_Dense projection modules.',
        diagnosis: 'LIKELY_EXPORT_PIPELINE_OMITS_LEARNED_SENTENCE_TRANSFORMER_PROJECTION; verify with identical-prompt full SentenceTransformer versus ONNX vectors before changing or promoting artifacts.',
      },
      q8ArtifactPath: path.relative(ROOT, Q8_PATH).replaceAll('\\', '/'),
      q8ArtifactSha256: q8Checksum,
      q8ManifestExpectedSha256: cohortManifest.ggufSha256,
        q8ManifestArtifactMatch: bareSha256(q8Checksum) === bareSha256(cohortManifest.ggufSha256),
      q8ParityReceipt: {
        path: path.relative(ROOT, Q8_PARITY_PATH).replaceAll('\\', '/'),
        result: q8Parity.result,
        reference: q8Parity.reference,
        executor: q8Parity.executor,
        measured: q8Parity.measured,
        promptContract: q8Parity.promptContract,
      },
      priorOnnxFailureReceipt: {
        path: path.relative(ROOT, PRIOR_FAILURE_PATH).replaceAll('\\', '/'),
        conclusion: priorFailure.conclusion,
        cosineStats: priorFailure.cosineStats,
        onnxModelSha256: priorFailure.executors?.b?.modelChecksum,
        sameOnnxArtifact: priorFailure.executors?.b?.modelChecksum === modelChecksum,
        withinExecutorSanity: priorFailure.withinExecutorSemanticSanityCheck?.results?.['onnx_cpu_1.29.0'] ?? null,
      },
    },
    recipe: {
      executionProvider: 'CPUExecutionProvider',
      maxSequenceLength: MAX_LENGTH,
      inputFormatting: 'task: sentence similarity | query: {text}; same UTF-8 prompt for each fixture item',
      tokenizer: 'local AutoTokenizer; remote model downloads disabled',
      effectivePooling: 'mean hidden states over attention_mask==1, then L2 normalize for [1, sequence, 768] output; mirrors current onnx-embed.ts behavior',
      outputDimension: DIMENSIONS,
      outputSelection: 'sentence_embedding, else last_hidden_state, else token_embeddings, else first output',
      quantizationDeclared: modelInfo.quantization_type ?? null,
    },
    testSet: {
      count: inputs.length,
      checksum: sha256Bytes(Buffer.from(canonicalJson(inputs.map((item) => ({ ...item, renderedInput: renderInput(item) }))), 'utf8')),
      inputs: perInput,
    },
    onnx: {
      dimensions: DIMENSIONS,
      vectors: summarizeVectors(vectors),
      pairwiseCosineMatrix: { ids: inputs.map((item) => item.id), values: onnxMatrix },
      semanticPairs: pairGroups(onnxMatrix),
    },
    q8Reference: {
      ...q8Reference,
      vectorSummary: q8 ? summarizeVectors(q8) : null,
      pairwiseCosineMatrix: q8Matrix ? { ids: inputs.map((item) => item.id), values: q8Matrix } : null,
      semanticPairs: q8Matrix ? pairGroups(q8Matrix) : null,
      perInputOnnxCrossCosine: perInputCrossCosine,
      directComparisonStatus: q8 ? 'SAME_INPUTS_AND_ARTIFACT_HASH_VERIFIED' : 'NOT_MEASURED_NO_ARTIFACT_BOUND_LIVE_REFERENCE',
    },
    diagnosticConclusion: {
      admission: 'NOT_ADMITTED_BY_THIS_DIAGNOSTIC',
      likelyExportIssue: 'The ONNX export/runtime path appears to omit the source model 2_Dense and 3_Dense modules; this is a source-pipeline mismatch candidate, not a measured causal attribution until direct full-pipeline vector comparison runs.',
      reason: q8 ? 'This receipt is diagnostic only; compare discrimination and exact recipe before a separate admission decision.' : 'The validated Q8_0 reference runtime could not be bound and run now; prior Q8 parity is cited but no fresh cross-executor cosine is claimed.',
      noEmbeddingStoreWrites: true,
    },
    outputPath: path.relative(ROOT, outputPath).replaceAll('\\', '/'),
  };
  const receipt = { ...receiptBody, checksum: sha256Bytes(Buffer.from(canonicalJson(receiptBody), 'utf8')) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const { checksum, ...readbackBody } = readback;
  const readbackChecksum = sha256Bytes(Buffer.from(canonicalJson(readbackBody), 'utf8'));
  if (checksum !== readbackChecksum) throw new Error('RECEIPT_READBACK_CHECKSUM_MISMATCH');
  console.log(JSON.stringify({
    status: receipt.status,
    onnxSha256: modelChecksum,
    tokenizerSha256: tokenizerChecksum,
    q8ArtifactSha256: q8Checksum,
    q8ArtifactMatchesValidatedManifest: receipt.artifactIdentity.q8ManifestArtifactMatch,
    q8ReferenceStatus: q8Reference.status,
    q8PairwiseComparison: receipt.q8Reference.directComparisonStatus,
    onnxVectorNorms: receipt.onnx.vectors.norm,
    onnxSemanticPairs: receipt.onnx.semanticPairs,
    receiptChecksum: checksum,
    readbackChecksum,
    readback: 'MATCH',
    reportPath: receipt.outputPath,
    canonicalAuthority: false,
    writesPerformed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
