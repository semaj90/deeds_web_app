#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qdrant } from '../../lib/qdrant-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parsePort(url, fallback) {
  try {
    const parsed = new URL(url);
    return parsed.port ? Number(parsed.port) : fallback;
  } catch {
    return fallback;
  }
}

export function resolveTurboVec4BitConfig(env = process.env) {
  const buildUrl = String(env.TURBOVEC_BUILD_URL ?? 'http://127.0.0.1:8795').replace(/\/+$/, '');
  return {
    collection: String(env.CODEBASE_QDRANT_COLLECTION ?? 'codebase_chunks_384_hybrid'),
    vectorName: String(env.TURBOVEC_VECTOR_NAME ?? 'content'),
    bits: Math.max(1, Number(env.TURBOVEC_BITS ?? 4)),
    dimension: Math.max(1, Number(env.TURBOVEC_DIMENSION ?? 384)),
    limit: Math.max(1, Number(env.TURBOVEC_BUILD_LIMIT ?? 1000)),
    buildUrl,
    buildPort: Math.max(1, Number(env.TURBOVEC_BUILD_PORT ?? parsePort(buildUrl, 8795))),
    pythonExe: String(env.ATLAS_PYTHON_EXE ?? env.PYTHON_EXE ?? 'python'),
    pythonScript: path.resolve(__dirname, '../../turbovec-sidecar.py'),
  };
}

export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

export function round(value, digits = 6) {
  return Number(Number(value).toFixed(digits));
}

export function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  return dot / ((Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) + 1e-12);
}

export function extractVector(point, vectorName = 'content') {
  const candidate = point?.vector?.[vectorName]
    ?? point?.vectors?.[vectorName]
    ?? point?.vector?.content
    ?? point?.vectors?.content
    ?? point?.vector?.default
    ?? point?.vectors?.default
    ?? point?.vector
    ?? point?.vectors
    ?? null;

  if (!Array.isArray(candidate)) return null;
  const vector = candidate.map((value) => Number(value));
  return Number.isFinite(vector[0]) ? new Float32Array(vector) : null;
}

export async function scrollQdrantVectors({
  collection = 'codebase_chunks_384_hybrid',
  vectorName = 'content',
  limit = 1000,
  pageSize = 200,
  withPayload = true,
} = {}) {
  const points = [];
  let offset = null;
  let pages = 0;

  while (points.length < limit && pages < 10_000) {
    pages += 1;
    const body = {
      limit: Math.min(pageSize, limit - points.length),
      with_payload: withPayload,
      with_vector: true,
      ...(offset !== null ? { offset } : {}),
    };
    const response = await qdrant.post(`/collections/${collection}/points/scroll`, body);
    const batch = Array.isArray(response?.result?.points) ? response.result.points : [];
    if (!batch.length) break;

    for (const point of batch) {
      const vector = extractVector(point, vectorName);
      if (!vector || vector.length === 0) continue;
      points.push({
        id: String(point.id),
        vector,
        payload: point.payload ?? {},
      });
      if (points.length >= limit) break;
    }

    offset = response?.result?.next_page_offset ?? null;
    if (offset === null || offset === undefined) break;
  }

  return points;
}

export async function fetchQdrantVectorsByIds({
  collection = 'codebase_chunks_384_hybrid',
  ids = [],
  vectorName = 'content',
}) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const points = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const response = await qdrant.post(`/collections/${collection}/points`, {
      ids: batch,
      with_payload: true,
      with_vector: true,
    });
    const result = Array.isArray(response?.result) ? response.result : [];
    for (const point of result) {
      const vector = extractVector(point, vectorName);
      if (!vector || vector.length === 0) continue;
      points.push({
        id: String(point.id),
        vector,
        payload: point.payload ?? {},
      });
    }
  }
  return points;
}

export function quantizeInt4(vector) {
  let maxAbs = 0;
  for (let i = 0; i < vector.length; i++) {
    const abs = Math.abs(vector[i]);
    if (abs > maxAbs) maxAbs = abs;
  }

  const scale = maxAbs > 0 ? maxAbs / 7 : 1;
  const packed = new Uint8Array(Math.ceil(vector.length / 2));
  const codes = new Int8Array(vector.length);

  for (let i = 0; i < vector.length; i++) {
    let code = Math.round(vector[i] / scale);
    if (code < -8) code = -8;
    if (code > 7) code = 7;
    codes[i] = code;
    const nibble = code & 0x0f;
    const byteIndex = Math.floor(i / 2);
    if (i % 2 === 0) packed[byteIndex] = nibble;
    else packed[byteIndex] |= (nibble << 4);
  }

  return {
    scale,
    maxAbs,
    packed,
    codes,
  };
}

export function dequantizeInt4(packed, scale, dimension) {
  const vector = new Float32Array(dimension);
  for (let i = 0; i < dimension; i++) {
    const byte = packed[Math.floor(i / 2)] ?? 0;
    let nibble = i % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;
    if (nibble >= 8) nibble -= 16;
    vector[i] = nibble * scale;
  }
  return vector;
}

export function spearmanCorrelation(leftRanks, rightRanks) {
  if (!Array.isArray(leftRanks) || !Array.isArray(rightRanks) || leftRanks.length !== rightRanks.length || leftRanks.length < 2) {
    return 0;
  }
  const n = leftRanks.length;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const delta = leftRanks[i] - rightRanks[i];
    sumSq += delta * delta;
  }
  return 1 - (6 * sumSq) / (n * (n * n - 1));
}

export function topKRankCorrelation(exactIds, approxIds, topK) {
  const exact = Array.isArray(exactIds) ? exactIds.slice(0, topK) : [];
  const approx = Array.isArray(approxIds) ? approxIds.slice(0, topK) : [];
  const universe = new Set([...exact, ...approx]);
  const exactMap = new Map();
  const approxMap = new Map();
  exact.forEach((id, index) => exactMap.set(String(id), index + 1));
  approx.forEach((id, index) => approxMap.set(String(id), index + 1));

  const fallbackRank = topK + 1;
  const left = [];
  const right = [];
  for (const id of universe) {
    left.push(exactMap.get(String(id)) ?? fallbackRank);
    right.push(approxMap.get(String(id)) ?? fallbackRank);
  }

  const rho = spearmanCorrelation(left, right);
  const overlap = exact.filter((id) => approxMap.has(String(id))).length;
  return {
    rho,
    overlap,
    universeSize: universe.size,
    exactTopK: exact.length,
    approxTopK: approx.length,
  };
}

export async function probeTurboVecHealth(url) {
  const response = await fetch(`${String(url).replace(/\/+$/, '')}/health`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) {
    throw new Error(`TurboVec health HTTP ${response.status}`);
  }
  return response.json();
}

export async function ensureTurboVecSidecar({
  buildUrl,
  buildPort,
  pythonExe,
  pythonScript,
  collection,
  dimension,
  bits,
  timeoutMs = 15_000,
  logPrefix = '[turbovec-384-4bit]',
} = {}) {
  const health = await probeTurboVecHealth(buildUrl).catch(() => null);
  if (health?.ok && Number(health.dim) === Number(dimension) && Number(health.bits) === Number(bits)) {
    return {
      started: false,
      url: buildUrl,
      health,
    };
  }

  if (health?.ok && (Number(health.dim) !== Number(dimension) || Number(health.bits) !== Number(bits))) {
    throw new Error(`TurboVec sidecar at ${buildUrl} is already running with dim=${health.dim} bits=${health.bits}; choose a dedicated build port`);
  }

  const proc = spawn(pythonExe, [
    pythonScript,
    '--port', String(buildPort),
    '--dim', String(dimension),
    '--bits', String(bits),
    '--collection', collection,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  proc.stdout.on('data', (data) => process.stdout.write(`${logPrefix} ${data}`));
  proc.stderr.on('data', (data) => process.stderr.write(`${logPrefix} ${data}`));

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await probeTurboVecHealth(buildUrl).catch(() => null);
    if (current?.ok) {
      return { started: true, url: buildUrl, health: current, process: proc };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`TurboVec sidecar at ${buildUrl} did not become healthy within ${timeoutMs}ms`);
}

export async function uploadTurboVecIndex({
  buildUrl,
  vectors = [],
}) {
  const response = await fetch(`${String(buildUrl).replace(/\/+$/, '')}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidates: vectors.map((entry) => ({
        id: entry.id,
        vector: Array.from(entry.vector),
      })),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`TurboVec build HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  return parsed;
}




