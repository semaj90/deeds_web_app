#!/usr/bin/env node
/**
 * benchmark-gpu-primitives.mjs
 *
 * Deterministic GPU primitive benchmark lane for Parent Atlas.
 * Read-only by default.
 *
 * Benchmarks:
 *   - autoencoderEncodeGPU (768->128, 128->64)
 *   - trainSOM
 *   - pageRankGPU
 *   - kmeansWithCentroids
 *   - attentionScoreGPU
 *   - rewardScoreGPU
 *   - softmaxGPU
 *   - topKIndices
 *   - pcaProjectGPU (optional topology projection check)
 *
 * Outputs:
 *   docs/reports/gpu-primitives-benchmark.json
 *   docs/reports/gpu-primitives-benchmark.md
 *   .tmp/gpu-primitives-benchmark.json
 *   .tmp/gpu-primitives-benchmark.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '..', '..');
const WORKSPACE_ROOT = resolve(APP_ROOT, '..');
const REPORTS_DIR = join(APP_ROOT, 'docs', 'reports');
const TMP_DIR = join(APP_ROOT, '.tmp');
const QDRANT_URL = String(process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const QDRANT_COLLECTION = String(process.env.CODEBASE_QDRANT_COLLECTION ?? 'codebase_chunks_768');
const SAMPLE_LIMIT = Math.max(16, Number(process.argv.find((arg) => arg.startsWith('--sample='))?.split('=')[1] ?? 256));
const REPEAT = Math.max(1, Number(process.argv.find((arg) => arg.startsWith('--repeat='))?.split('=')[1] ?? 1));
const DRY_RUN = process.argv.includes('--dry-run');

loadAtlasEnv(APP_ROOT);

const requireEsm = createRequire(import.meta.url);

function ensureDirs() {
  mkdirSync(REPORTS_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });
}

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function median(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function stats(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) {
    return { min_ms: 0, median_ms: 0, mean_ms: 0, max_ms: 0 };
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  return {
    min_ms: round(min),
    median_ms: round(median(clean)),
    mean_ms: round(mean),
    max_ms: round(max),
  };
}

function checksumBytes(bytes) {
  const hash = createHash('sha256');
  hash.update(bytes);
  return hash.digest('hex').slice(0, 16);
}

function checksumArray(values, take = 16) {
  const slice = Array.from(values.slice(0, take)).map((value) => round(value, 6));
  return createHash('sha256').update(JSON.stringify(slice)).digest('hex').slice(0, 16);
}

function parseNpyFloat32(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.length < 10 || buffer.toString('latin1', 0, 6) !== '\x93NUMPY') {
    throw new Error(`Invalid npy file: ${filePath}`);
  }

  const major = buffer[6];
  const minor = buffer[7];
  const headerLen = major === 1 ? buffer.readUInt16LE(8) : buffer.readUInt32LE(8);
  const headerStart = major === 1 ? 10 : 12;
  const headerEnd = headerStart + headerLen;
  const header = buffer.toString('latin1', headerStart, headerEnd);

  const descrMatch = header.match(/'descr':\s*'([^']+)'/);
  const fortranMatch = header.match(/'fortran_order':\s*(True|False)/);
  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);

  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error(`Unsupported npy header in ${filePath}`);
  }
  if (!['<f4', '|f4', '=f4'].includes(descrMatch[1])) {
    throw new Error(`Expected float32 npy file, got ${descrMatch[1]} in ${filePath}`);
  }
  if (fortranMatch[1] !== 'False') {
    throw new Error(`Fortran-order npy not supported in ${filePath}`);
  }

  const shape = shapeMatch[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));

  const dataOffset = headerEnd;
  const dataBytes = buffer.slice(dataOffset);
  if (dataBytes.byteLength % 4 !== 0) {
    throw new Error(`Unexpected float32 payload length in ${filePath}`);
  }

  const array = new Float32Array(dataBytes.buffer, dataBytes.byteOffset, dataBytes.byteLength / 4);
  return {
    major,
    minor,
    shape,
    data: new Float32Array(array),
  };
}

function flattenVectors(vectors) {
  if (!vectors.length) return new Float32Array(0);
  const dim = vectors[0].length;
  const flat = new Float32Array(vectors.length * dim);
  for (let i = 0; i < vectors.length; i++) flat.set(vectors[i], i * dim);
  return flat;
}

function vectorNorm(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  return Math.sqrt(sum) || 1e-12;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-12);
}

function buildKnnAdjacency(vectors, k = 4) {
  const n = vectors.length;
  const dim = vectors[0]?.length ?? 0;
  const adj = new Float32Array(n * n);
  if (n === 0 || dim === 0) return adj;

  const norms = vectors.map((vec) => vectorNorm(vec));
  for (let i = 0; i < n; i++) {
    const candidates = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += vectors[i][d] * vectors[j][d];
      const sim = dot / (norms[i] * norms[j] + 1e-12);
      candidates.push({ j, sim: Math.max(0, sim) });
    }
    candidates.sort((a, b) => b.sim - a.sim);
    for (const { j, sim } of candidates.slice(0, k)) {
      adj[i * n + j] = sim;
    }
  }
  return adj;
}

function makeDeterministicEmbeddings(n, dim) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const vec = new Float32Array(dim);
    for (let d = 0; d < dim; d++) {
      vec[d] = Math.sin(i * 0.071 + d * 0.013) + Math.cos(i * 0.037 + d * 0.011) * 0.25;
    }
    out[i] = vec;
  }
  return out;
}

async function loadTsModule(relativePath) {
  const tsxRegister = await import('tsx/esm/api').catch(() => null);
  if (tsxRegister?.register) tsxRegister.register();
  const moduleUrl = pathToFileURL(resolve(APP_ROOT, relativePath)).href;
  return import(moduleUrl);
}

function candidateAddonPaths() {
  return [
    resolve(WORKSPACE_ROOT, 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node'),
    resolve(WORKSPACE_ROOT, 'simd-bridge', 'cpp', 'build', 'Debug', 'tensorrt_bridge.node'),
    resolve(WORKSPACE_ROOT, 'simd-bridge', 'build', 'Release', 'tensorrt_bridge.node'),
  ];
}

function detectAddon() {
  for (const candidate of candidateAddonPaths()) {
    if (!existsSync(candidate)) continue;
    try {
      const addon = requireEsm(candidate);
      return {
        addonLoaded: true,
        addonPath: candidate,
        cudaAvailable: typeof addon.checkCudaAvailable === 'function'
          ? Boolean(addon.checkCudaAvailable())
          : Boolean(addon.isCudaAvailable?.()),
      };
    } catch (error) {
      return {
        addonLoaded: false,
        addonPath: candidate,
        cudaAvailable: false,
        addonError: String(error?.message ?? error),
      };
    }
  }
  return {
    addonLoaded: false,
    addonPath: null,
    cudaAvailable: false,
    addonError: 'tensorrt_bridge.node not found',
  };
}

function probeGpuHealth() {
  try {
    const output = execFileSync(
      'nvidia-smi',
      [
        '--query-gpu=name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu',
        '--format=csv,noheader,nounits',
      ],
      { encoding: 'utf8', timeout: 5_000, windowsHide: true }
    ).trim();

    const [firstLine = ''] = output.split(/\r?\n/);
    const [name, driverVersion, memoryTotal, memoryUsed, utilization, temperature] = firstLine
      .split(',')
      .map((part) => part.trim());
    const total = Number(memoryTotal);
    const used = Number(memoryUsed);
    const usedPercent = Number.isFinite(total) && total > 0
      ? Math.round((used / total) * 1000) / 10
      : null;

    return {
      available: true,
      source: 'nvidia-smi',
      name: name ?? null,
      driver_version: driverVersion ?? null,
      memory_total_mb: Number.isFinite(total) ? total : null,
      memory_used_mb: Number.isFinite(used) ? used : null,
      memory_used_percent: usedPercent,
      utilization_percent: Number.isFinite(Number(utilization)) ? Number(utilization) : null,
      temperature_celsius: Number.isFinite(Number(temperature)) ? Number(temperature) : null,
      healthy: usedPercent === null ? true : usedPercent < 90,
    };
  } catch (error) {
    return {
      available: false,
      source: 'nvidia-smi',
      error: String(error?.message ?? error),
      healthy: false,
    };
  }
}

async function probeBitfrostCache(sampleRows) {
  const { container, password } = await resolveAtlasRedisContext(APP_ROOT, process.env);
  if (!container) {
    return {
      available: false,
      container: null,
      password_configured: Boolean(password),
      families: [],
      hit_rows: 0,
      hit_pct: 0,
      centroid_keys: 0,
      som_keys: 0,
      bifrost_packet_keys: 0,
      bifrost_feature_keys: 0,
      ace_context_keys: 0,
      ace_summary_keys: 0,
      note: 'Redis/Valkey container not found',
    };
  }

  const patterns = [
    { key: 'bifrost:sem:packet:*', pattern: 'bifrost:sem:packet:*' },
    { key: 'bifrost:sem:feature:*', pattern: 'bifrost:sem:feature:*' },
    { key: 'centroid:*', pattern: 'centroid:*' },
    { key: 'som:*', pattern: 'som:*' },
    { key: 'ace:context:*', pattern: 'ace:context:*' },
    { key: 'ace:summary:*', pattern: 'ace:summary:*' },
  ];

  const familyCounts = {};
  const familySamples = {};
  for (const { key, pattern } of patterns) {
    const result = runRedisCli(container, ['--raw', '--scan', '--pattern', pattern], password, null, {
      maxBuffer: 1024 * 1024 * 8,
    });
    const keys = result.ok
      ? result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      : [];
    familyCounts[key] = keys.length;
    familySamples[key] = keys.slice(0, 5);
  }

  const samplePoints = sampleRows.slice(0, 32);
  let hitRows = 0;
  const hitReasons = [];
  for (const row of samplePoints) {
    const candidateKeys = [];
    if (row.packet_key) candidateKeys.push(`bifrost:sem:packet:${row.packet_key}`, `ace:context:${row.packet_key}`, `ace:summary:${row.packet_key}`);
    if (row.feature_id) candidateKeys.push(`bifrost:sem:feature:${row.feature_id}`);
    if (row.community_id) candidateKeys.push(`centroid:${row.community_id}`);
    if (row.som_cluster) candidateKeys.push(`som:${row.som_cluster}`, `som:cell:${row.som_cluster}`);
    const existsArgs = ['EXISTS', ...candidateKeys.filter(Boolean)];
    const existsResult = candidateKeys.length > 0 ? runRedisCli(container, existsArgs, password) : null;
    const existsCount = existsResult?.ok ? Number(existsResult.stdout.trim()) : 0;
    if (existsCount > 0) {
      hitRows += 1;
      hitReasons.push({
        packet_key: row.packet_key ?? null,
        feature_id: row.feature_id ?? null,
        community_id: row.community_id ?? null,
        som_cluster: row.som_cluster ?? null,
        matched_keys: candidateKeys.slice(0, 5),
      });
    }
  }

  return {
    available: true,
    container,
    password_configured: Boolean(password),
    families: patterns.map(({ key }) => ({
      key,
      count: familyCounts[key] ?? 0,
      sample: familySamples[key] ?? [],
    })),
    hit_rows: hitRows,
    hit_pct: samplePoints.length ? round((hitRows / samplePoints.length) * 100, 2) : 0,
    centroid_keys: familyCounts['centroid:*'] ?? 0,
    som_keys: familyCounts['som:*'] ?? 0,
    bifrost_packet_keys: familyCounts['bifrost:sem:packet:*'] ?? 0,
    bifrost_feature_keys: familyCounts['bifrost:sem:feature:*'] ?? 0,
    ace_context_keys: familyCounts['ace:context:*'] ?? 0,
    ace_summary_keys: familyCounts['ace:summary:*'] ?? 0,
    hit_reasons: hitReasons.slice(0, 8),
  };
}

async function fetchQdrantVectors(limit) {
  const vectors = [];
  let offset = null;
  let pages = 0;
  const maxPages = Math.max(3, Math.ceil(limit / 8));

  try {
    while (vectors.length < limit && pages < maxPages) {
      pages += 1;
      const batchSize = Math.min(100, limit - vectors.length);
      const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: batchSize,
          offset,
          with_payload: true,
          with_vector: true,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        throw new Error(`Qdrant scroll ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const points = Array.isArray(data?.result?.points) ? data.result.points : [];
      if (points.length === 0) break;

      for (const point of points) {
        const rawVector =
          point?.vector?.content ??
          point?.vector?.default ??
          point?.vector?.[''] ??
          point?.vectors?.content ??
          point?.vectors?.default ??
          point?.vectors?.[''] ??
          point?.vector ??
          point?.vectors ??
          null;

        if (!Array.isArray(rawVector) || rawVector.length !== 768) continue;
        vectors.push({
          id: String(point.id),
          vector: new Float32Array(rawVector),
          payload: point.payload ?? {},
        });
        if (vectors.length >= limit) break;
      }

      offset = data?.result?.next_page_offset ?? null;
      if (!offset) break;
    }
    if (vectors.length >= limit) {
      return { source: 'qdrant', vectors };
    }
    return {
      source: 'synthetic',
      vectors: makeDeterministicEmbeddings(limit, 768).map((vector, index) => ({
        id: `synthetic-${index}`,
        vector,
        payload: {},
      })),
      warning: `Qdrant sample capped after ${pages} pages; fell back to synthetic vectors`,
    };
  } catch (error) {
    return {
      source: 'synthetic',
      vectors: makeDeterministicEmbeddings(limit, 768).map((vector, index) => ({
        id: `synthetic-${index}`,
        vector,
        payload: {},
      })),
      warning: String(error?.message ?? error),
    };
  }
}

async function benchRepeated(name, repeat, fn) {
  const timings = [];
  let lastResult = null;
  for (let i = 0; i < repeat; i++) {
    const start = performance.now();
    lastResult = await fn();
    timings.push(performance.now() - start);
  }
  return {
    name,
    timings_ms: timings.map((value) => round(value)),
    ...stats(timings),
    result: lastResult,
  };
}

function unwrapArray(result, keyCandidates = []) {
  if (!result || typeof result !== 'object') return null;
  for (const key of keyCandidates) {
    const value = result[key];
    if (Array.isArray(value)) return value;
    if (value instanceof Float32Array || value instanceof Int32Array) return value;
  }
  return null;
}

function summarizeBenchResult(result, arrayKeys = []) {
  const array = unwrapArray(result, arrayKeys);
  return {
    source: result?.source ?? 'unknown',
    ok: result?.ok ?? true,
    shape: array ? [Math.floor(array.length)] : null,
    checksum: array ? checksumArray(array) : null,
    preview: array ? Array.from(array.slice(0, 4)).map((value) => round(value, 6)) : [],
    output_meta: result?.outputMeta ?? null,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# GPU Primitives Benchmark');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  lines.push('## Inputs');
  lines.push('');
  lines.push(`- Qdrant collection: ${report.inputs.qdrant_collection}`);
  lines.push(`- Vector source: ${report.inputs.vector_source}`);
  lines.push(`- Sample size: ${report.inputs.sample_size}`);
  lines.push(`- Addon loaded: ${report.gpu.addon_loaded ? 'yes' : 'no'}`);
  lines.push(`- CUDA available: ${report.gpu.cuda_available ? 'yes' : 'no'}`);
  lines.push(`- Addon path: ${report.gpu.addon_path ?? 'none'}`);
  lines.push(`- GPU health: ${report.gpu.health.available ? 'online' : 'offline'}${report.gpu.health.name ? ` (${report.gpu.health.name})` : ''}`);
  lines.push(`- Bitfrost cache: ${report.bitfrost.available ? 'online' : 'offline'}`);
  lines.push(`- Bitfrost hit pct: ${report.bitfrost.hit_pct ?? 0}`);
  if (report.warnings.length) {
    lines.push(`- Warnings: ${report.warnings.join('; ')}`);
  }
  lines.push('');
  lines.push('## Cache Families');
  lines.push('');
  lines.push('| family | count | sample |');
  lines.push('| --- | ---: | --- |');
  for (const family of report.bitfrost.families ?? []) {
    lines.push(`| ${family.key} | ${family.count ?? 0} | ${(family.sample ?? []).slice(0, 3).join(', ') || 'none'} |`);
  }
  lines.push('');
  lines.push('## Benchmarks');
  lines.push('');
  lines.push('| primitive | source | median ms | mean ms | shape | checksum |');
  lines.push('| --- | --- | ---: | ---: | --- | --- |');
  for (const [name, bench] of Object.entries(report.benchmarks)) {
    lines.push(
      `| ${name} | ${bench.source ?? 'n/a'} | ${bench.median_ms ?? 0} | ${bench.mean_ms ?? 0} | ${Array.isArray(bench.shape) ? bench.shape.join('x') : 'n/a'} | ${bench.checksum ?? 'n/a'} |`
    );
  }
  lines.push('');
  lines.push('## Rules');
  lines.push('');
  lines.push(`- embedding_768_is_truth: ${report.rules.embedding_768_is_truth}`);
  lines.push(`- latent_64_is_routing_only: ${report.rules.latent_64_is_routing_only}`);
  lines.push(`- som_is_topology_metadata: ${report.rules.som_is_topology_metadata}`);
  lines.push(`- parent_atlas_is_canonical: ${report.rules.parent_atlas_is_canonical}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- The benchmark is read-only. It does not retrain models or mutate storage.');
  lines.push('- Autoencoder timing uses the saved 768→128 and 128→64 weights from the workspace artifacts.');
  lines.push('- If Qdrant is unavailable, the benchmark falls back to deterministic synthetic vectors and marks the report accordingly.');
  lines.push('- Bitfrost/Valkey cache families are probed read-only and can be used to estimate warm-path pressure before GPU work.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  ensureDirs();

  const addonInfo = detectAddon();
  const gpu = {
    addon_loaded: addonInfo.addonLoaded,
    cuda_available: addonInfo.cudaAvailable,
    addon_path: addonInfo.addonPath,
    addon_error: addonInfo.addonError ?? null,
    health: probeGpuHealth(),
  };

  const warnings = [];
  if (addonInfo.addonError) warnings.push(addonInfo.addonError);
  if (!gpu.health.healthy) {
    warnings.push(gpu.health.available ? 'GPU health probe reported degraded state' : `GPU health probe unavailable: ${gpu.health.error ?? 'unknown'}`);
  }

  const qdrantSample = await fetchQdrantVectors(SAMPLE_LIMIT);
  if (qdrantSample.warning) warnings.push(qdrantSample.warning);

  const vectorSource = qdrantSample.source;
  const sampleRows = qdrantSample.vectors.map((row) => ({
    id: row.id,
    vector: row.vector,
    payload: row.payload ?? {},
    packet_key: String(row.payload?.packet_key ?? row.payload?.packetKey ?? '').trim(),
    source_ref: String(row.payload?.source_ref ?? row.payload?.sourceRef ?? row.payload?.canonical_source_ref ?? '').trim(),
    feature_id: String(row.payload?.feature_id ?? row.payload?.featureId ?? '').trim(),
    community_id: String(row.payload?.community_id ?? row.payload?.communityId ?? '').trim(),
    som_cluster: String(row.payload?.som_cluster ?? row.payload?.somCluster ?? '').trim(),
  }));
  const sampleVectors = sampleRows.map((row) => row.vector);
  const sampleCount = sampleVectors.length;
  const sampleDim = sampleVectors[0]?.length ?? 0;

  if (sampleCount === 0 || sampleDim === 0) {
    throw new Error('No vectors available for benchmark');
  }

  console.log(`[gpu-benchmark] sample source=${vectorSource} count=${sampleCount} dim=${sampleDim}`);

  const cacheProbe = await probeBitfrostCache(sampleRows);
  if (!cacheProbe.available) warnings.push(cacheProbe.note ?? 'Bitfrost cache unavailable');
  else if (cacheProbe.hit_pct === 0) warnings.push('Bitfrost cache is online but no sampled packet rows hit cached families');
  console.log(`[gpu-benchmark] bitfrost=${cacheProbe.available ? 'online' : 'offline'} hit_pct=${cacheProbe.hit_pct}`);

  const gpuMod = await loadTsModule('src/lib/server/gpu/pytorch-graph.ts');
  const projMod = await loadTsModule('src/lib/server/gpu/topology-projection.ts');

  const aeRoot = resolve(WORKSPACE_ROOT, 'models', 'autoencoder');
  const aeFiles = {
    stage1W: resolve(aeRoot, 'W_enc_768_128.npy'),
    stage1B: resolve(aeRoot, 'b_enc_128.npy'),
    stage2W: resolve(aeRoot, 'W_enc_128_64.npy'),
    stage2B: resolve(aeRoot, 'b_enc_64.npy'),
  };

  const canUseSavedWeights = Object.values(aeFiles).every((filePath) => existsSync(filePath));
  if (!canUseSavedWeights) {
    warnings.push('autoencoder weight files missing; autoencoder benchmark will be skipped');
  }

  console.log(`[gpu-benchmark] autoencoder weights=${canUseSavedWeights ? 'present' : 'missing'}`);

  const stage1Weights = canUseSavedWeights ? {
    W: parseNpyFloat32(aeFiles.stage1W).data,
    b: parseNpyFloat32(aeFiles.stage1B).data,
    inputDim: 768,
    hidden: 128,
  } : null;

  const stage2Weights = canUseSavedWeights ? {
    W: parseNpyFloat32(aeFiles.stage2W).data,
    b: parseNpyFloat32(aeFiles.stage2B).data,
    inputDim: 128,
    hidden: 64,
  } : null;

  const heavySampleCount = Math.min(sampleVectors.length, Math.max(SAMPLE_LIMIT, 256));

  const autoencoderStage1 = canUseSavedWeights
    ? await benchRepeated('autoencoderEncodeGPU_768_to_128', REPEAT, async () =>
        projMod.autoencoderEncode(
          flattenVectors(sampleVectors.slice(0, heavySampleCount)),
          stage1Weights.W,
          stage1Weights.b,
          {
            n: heavySampleCount,
            dim: stage1Weights.inputDim,
            outDim: stage1Weights.hidden,
            preferGpu: true,
            maxN: heavySampleCount,
          }
        ))
    : null;
  console.log(`[gpu-benchmark] stage1=${autoencoderStage1?.result?.source ?? 'skipped'}`);

  const stage1Projected = autoencoderStage1?.result?.projected
    ? autoencoderStage1.result.projected
    : null;

  const stage1Latents = stage1Projected
    ? Array.from({ length: Math.floor(stage1Projected.length / 128) }, (_, index) =>
        stage1Projected.slice(index * 128, (index + 1) * 128))
    : [];

  const autoencoderStage2 = canUseSavedWeights && stage1Projected
    ? await benchRepeated('autoencoderEncodeGPU_128_to_64', REPEAT, async () =>
        projMod.autoencoderEncode(
          flattenVectors(stage1Latents),
          stage2Weights.W,
          stage2Weights.b,
          {
            n: stage1Latents.length,
            dim: stage2Weights.inputDim,
            outDim: stage2Weights.hidden,
            preferGpu: true,
            maxN: heavySampleCount,
          }
        ))
    : null;
  console.log(`[gpu-benchmark] stage2=${autoencoderStage2?.result?.source ?? 'skipped'}`);

  const latent64 = autoencoderStage2?.result?.projected
    ? autoencoderStage2.result.projected
    : null;

  const kmeansSample = sampleVectors.slice(0, heavySampleCount);
  const kmeansFlat = flattenVectors(kmeansSample);
  const kmeansBench = await benchRepeated('kmeansWithCentroids', REPEAT, async () =>
    gpuMod.kmeansWithCentroids(kmeansFlat, kmeansSample.length, sampleDim, Math.min(20, kmeansSample.length), 50)
  );
  console.log(`[gpu-benchmark] kmeans=${kmeansBench.result?.source ?? 'n/a'}`);

  const graphVectors = sampleVectors.slice(0, heavySampleCount);
  const graphAdj = buildKnnAdjacency(graphVectors, 4);
  const pageRankBench = await benchRepeated('pageRankGPU', REPEAT, async () =>
    gpuMod.pageRankGPU(graphAdj, graphVectors.length, 0.85, 30)
  );
  console.log(`[gpu-benchmark] pagerank=${pageRankBench.result?.source ?? 'n/a'}`);

  const queryVec = sampleVectors[0];
  const keyVectors = sampleVectors.slice(0, heavySampleCount);
  const flatKeys = flattenVectors(keyVectors);
  const attentionBench = await benchRepeated('attentionScoreGPU', REPEAT, async () =>
    gpuMod.attentionScoreGPU(queryVec, sampleDim, flatKeys, keyVectors.length)
  );
  console.log(`[gpu-benchmark] attention=${attentionBench.result?.source ?? 'n/a'}`);

  const rewardGen = flattenVectors(sampleVectors.slice(0, heavySampleCount));
  const rewardRef = flattenVectors(sampleVectors.slice(0, heavySampleCount).map((vec, idx) => {
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] * (0.99 + ((idx + i) % 7) * 0.001);
    return out;
  }));
  const rewardBench = await benchRepeated('rewardScoreGPU', REPEAT, async () =>
    gpuMod.rewardScoreGPU(rewardGen, rewardRef, heavySampleCount, sampleDim)
  );
  console.log(`[gpu-benchmark] reward=${rewardBench.result?.source ?? 'n/a'}`);

  const softmaxInput = attentionBench.result?.weights
    ? attentionBench.result.weights
    : pageRankBench.result?.scores ?? new Float32Array(0);
  const softmaxBench = await benchRepeated('softmaxGPU', REPEAT, async () =>
    gpuMod.softmaxGPU(softmaxInput instanceof Float32Array ? softmaxInput : new Float32Array(softmaxInput))
  );
  console.log(`[gpu-benchmark] softmax=${softmaxBench.result?.source ?? 'n/a'}`);

  const topKBench = await benchRepeated('topKIndices', REPEAT, async () =>
    gpuMod.topKIndices(softmaxBench.result?.probs ?? softmaxInput, Math.min(10, softmaxInput.length || 10))
  );
  console.log(`[gpu-benchmark] topk=${topKBench.result?.source ?? 'n/a'}`);

  const somInput = latent64
    ? Array.from({ length: Math.floor(latent64.length / 64) }, (_, index) =>
        latent64.slice(index * 64, (index + 1) * 64))
    : sampleVectors.slice(0, heavySampleCount).map((vec) => vec.slice(0, 64));
  const somFlat = flattenVectors(somInput);
  const somBench = await benchRepeated('trainSOM', REPEAT, async () =>
    gpuMod.trainSOM(
      somFlat,
      somInput.length,
      64,
      20,
      20,
      25,
      0.3,
      0.05,
      10,
      1.0
    )
  );
  console.log(`[gpu-benchmark] som=${somBench.result?.source ?? 'n/a'}`);

  const pcaInput = sampleVectors.slice(0, heavySampleCount);
  const mean = new Float32Array(sampleDim);
  const components = new Float32Array(4 * sampleDim);
  for (let i = 0; i < Math.min(4, sampleDim); i++) {
    components[i * sampleDim + i] = 1;
  }
  const pcaBench = await benchRepeated('pcaProjectGPU', REPEAT, async () =>
    projMod.pcaProject(
      flattenVectors(pcaInput),
      mean,
      components,
      { n: pcaInput.length, dim: sampleDim, outDim: 4, preferGpu: true, maxN: heavySampleCount }
    )
  );
  console.log(`[gpu-benchmark] pca=${pcaBench.result?.source ?? 'n/a'}`);

  const benchmarkEntries = {
    autoencoder_encode_gpu_768_to_128: autoencoderStage1
      ? {
          ...stats(autoencoderStage1.timings_ms),
          source: autoencoderStage1.result?.source ?? 'n/a',
          rows: heavySampleCount,
          input_dim: 768,
          output_dim: 128,
          checksum: autoencoderStage1.result?.projected ? checksumBytes(Buffer.from(autoencoderStage1.result.projected.buffer)) : null,
          preview: autoencoderStage1.result?.projected ? Array.from(autoencoderStage1.result.projected.slice(0, 4)).map((value) => round(value, 6)) : [],
          output_meta: autoencoderStage1.result?.outputMeta ?? null,
        }
      : {
          status: 'skipped_no_weights',
          source: 'skipped',
        },
    autoencoder_encode_gpu_128_to_64: autoencoderStage2
      ? {
          ...stats(autoencoderStage2.timings_ms),
          source: autoencoderStage2.result?.source ?? 'n/a',
          rows: stage1Latents.length,
          input_dim: 128,
          output_dim: 64,
          checksum: autoencoderStage2.result?.projected ? checksumBytes(Buffer.from(autoencoderStage2.result.projected.buffer)) : null,
          preview: autoencoderStage2.result?.projected ? Array.from(autoencoderStage2.result.projected.slice(0, 4)).map((value) => round(value, 6)) : [],
          output_meta: autoencoderStage2.result?.outputMeta ?? null,
        }
      : {
          status: 'skipped_no_weights',
          source: 'skipped',
        },
    kmeans_with_centroids: {
      ...stats(kmeansBench.timings_ms),
      source: kmeansBench.result?.source ?? 'n/a',
      rows: kmeansSample.length,
      dim: sampleDim,
      k: Math.min(20, kmeansSample.length),
      checksum: kmeansBench.result?.centroids ? checksumBytes(Buffer.from(kmeansBench.result.centroids.buffer)) : null,
      preview: kmeansBench.result?.centroids ? Array.from(kmeansBench.result.centroids.slice(0, 4)).map((value) => round(value, 6)) : [],
    },
    page_rank_gpu: {
      ...stats(pageRankBench.timings_ms),
      source: pageRankBench.result?.source ?? 'n/a',
      n: graphVectors.length,
      checksum: pageRankBench.result?.scores ? checksumBytes(Buffer.from(pageRankBench.result.scores.buffer)) : null,
      preview: pageRankBench.result?.scores ? Array.from(pageRankBench.result.scores.slice(0, 4)).map((value) => round(value, 6)) : [],
    },
    attention_score_gpu: {
      ...stats(attentionBench.timings_ms),
      source: attentionBench.result?.source ?? 'n/a',
      n: keyVectors.length,
      dim: sampleDim,
      checksum: attentionBench.result?.weights ? checksumBytes(Buffer.from(attentionBench.result.weights.buffer)) : null,
      preview: attentionBench.result?.weights ? Array.from(attentionBench.result.weights.slice(0, 4)).map((value) => round(value, 6)) : [],
    },
    reward_score_gpu: {
      ...stats(rewardBench.timings_ms),
      source: rewardBench.result?.source ?? 'n/a',
      n: Math.min(sampleVectors.length, 32),
      dim: sampleDim,
      checksum: rewardBench.result?.scores ? checksumBytes(Buffer.from(rewardBench.result.scores.buffer)) : null,
      preview: rewardBench.result?.scores ? Array.from(rewardBench.result.scores.slice(0, 4)).map((value) => round(value, 6)) : [],
    },
    softmax_gpu: {
      ...stats(softmaxBench.timings_ms),
      source: softmaxBench.result?.source ?? 'n/a',
      n: softmaxInput.length ?? 0,
      checksum: softmaxBench.result?.probs ? checksumBytes(Buffer.from(softmaxBench.result.probs.buffer)) : null,
      preview: softmaxBench.result?.probs ? Array.from(softmaxBench.result.probs.slice(0, 4)).map((value) => round(value, 6)) : [],
    },
    top_k_indices: {
      ...stats(topKBench.timings_ms),
      source: topKBench.result?.source ?? 'n/a',
      n: softmaxInput.length ?? 0,
      k: Math.min(10, softmaxInput.length || 10),
      checksum: topKBench.result?.indices ? checksumBytes(Buffer.from(topKBench.result.indices.buffer)) : null,
      preview: topKBench.result?.indices ? Array.from(topKBench.result.indices.slice(0, 4)) : [],
    },
    train_som_20x20: {
      ...stats(somBench.timings_ms),
      source: somBench.result?.source ?? 'n/a',
      rows: somInput.length,
      dim: 64,
      grid: '20x20',
      checksum: somBench.result?.bmu ? checksumBytes(Buffer.from(somBench.result.bmu.buffer)) : null,
      preview: somBench.result?.bmu ? Array.from(somBench.result.bmu.slice(0, 4)) : [],
    },
    pca_project_4d: {
      ...stats(pcaBench.timings_ms),
      source: pcaBench.result?.source ?? 'n/a',
      rows: pcaInput.length,
      dim: sampleDim,
      out_dim: 4,
      checksum: pcaBench.result?.projected ? checksumBytes(Buffer.from(pcaBench.result.projected.buffer)) : null,
      preview: pcaBench.result?.projected ? Array.from(pcaBench.result.projected.slice(0, 4)).map((value) => round(value, 6)) : [],
      output_meta: pcaBench.result?.outputMeta ?? null,
    },
  };

  const passCount = Object.values(benchmarkEntries).filter((entry) => entry.source === 'gpu').length;
  const fallbackCount = Object.values(benchmarkEntries).filter((entry) => entry.source && entry.source !== 'gpu' && entry.source !== 'skipped').length;
  const skippedCount = Object.values(benchmarkEntries).filter((entry) => entry.source === 'skipped').length;
  if (passCount === 0) {
    warnings.push('all primitives fell back to cpu; gpu coverage is 0');
  }

  const report = {
    generated_at: new Date().toISOString(),
    status: addonInfo.addonLoaded && gpu.cuda_available && passCount > 0 ? 'PASS' : 'PASS_WITH_WARNINGS',
    inputs: {
      qdrant_url: QDRANT_URL,
      qdrant_collection: QDRANT_COLLECTION,
      vector_source: vectorSource,
      sample_size: sampleCount,
      sample_dim: sampleDim,
      repeat: REPEAT,
    },
    gpu,
    bitfrost: cacheProbe,
    warnings,
    benchmarks: benchmarkEntries,
    benchmark_summary: {
      gpu_primitive_count: passCount,
      cpu_or_fallback_count: fallbackCount,
      skipped_count: skippedCount,
    },
    rules: {
      embedding_768_is_truth: true,
      latent_64_is_routing_only: true,
      som_is_topology_metadata: true,
      parent_atlas_is_canonical: true,
    },
  };

  const markdown = buildMarkdown(report);

  writeFileSync(join(TMP_DIR, 'gpu-primitives-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(TMP_DIR, 'gpu-primitives-benchmark.md'), `${markdown}\n`);
  writeFileSync(join(REPORTS_DIR, 'gpu-primitives-benchmark.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(REPORTS_DIR, 'gpu-primitives-benchmark.md'), `${markdown}\n`);

  console.log(`GPU primitives benchmark: ${report.status}`);
  console.log(`  addon_loaded: ${gpu.addon_loaded}`);
  console.log(`  cuda_available: ${gpu.cuda_available}`);
  console.log(`  bitfrost: ${report.bitfrost.available ? 'online' : 'offline'} hit_pct=${report.bitfrost.hit_pct}`);
  console.log(`  vector_source: ${vectorSource}`);
  console.log(`  sample_size: ${sampleCount}`);
  for (const [name, bench] of Object.entries(benchmarkEntries)) {
    console.log(`  ${name}: ${bench.source ?? 'n/a'} median=${bench.median_ms ?? 0}ms`);
  }
  console.log(`Reports written to ${join(REPORTS_DIR, 'gpu-primitives-benchmark.json')} and .md`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[gpu-primitives-benchmark] Fatal:', error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
