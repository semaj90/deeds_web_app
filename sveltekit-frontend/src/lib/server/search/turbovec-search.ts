/**
 * TurboVec-backed ANN seam for codebase search.
 *
 * Contract:
 *   caller -> qdrant-search.ts -> searchTurboVecCode()
 *
 * The seam stays stable while the backend can swap between:
 *   1) native N-API TurboVec module
 *   2) TurboVec HTTP sidecar (:8791) for GPU-assisted rerank
 *   3) Qdrant + in-process rerank fallback
 *
 * Qdrant remains the default ANN store. TurboVec is an optional acceleration
 * layer for load handling and rerank reshaping; callers never see a contract
 * change.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';
import { ENV } from '$lib/server/env.server.js';
import { encodedClusterPrefilter } from '$lib/server/retrieval/encoded-cluster-prefilter.js';
import { turbovecRerank } from '$lib/server/retrieval/turbovec-rerank.js';
import { getCodebaseAnnBackend } from './codebase-ann-backend.js';
import {
  attentionScoreChunks,
  attentionScoreChunks_fp16,
  gpuHasRoom,
  isCudaAvailable,
  vramNeededMB,
} from '$lib/server/gpu/libtorch-bridge.js';
import { encode768to64 } from '$lib/server/gpu/encode-768-to-64.js';
import { encode768to64Batch } from '$lib/server/gpu/encode-768-to-64.js';

export interface QdrantCodeResult {
  stable_key: string;
  file_path: string;
  symbol_name?: string;
  symbol_kind?: string;
  language?: string;
  content: string;
  tags?: string;
  topo_class?: string;
  graph_authority_score?: number;
  semantic_score: number;
  qdrant_id: string;
  som_cluster?: number;
  som_bmu_row?: number;
  som_bmu_col?: number;
  centroid_id?: string;
  quaternion_bucket?: string;
}

interface TurboVecNativeSearchResult {
  stable_key?: string;
  file_path?: string;
  symbol_name?: string;
  symbol_kind?: string;
  language?: string;
  content?: string;
  tags?: string;
  topo_class?: string;
  graph_authority_score?: number;
  semantic_score?: number;
  qdrant_id?: string;
  id?: string | number;
  som_cluster?: number;
  som_bmu_row?: number;
  som_bmu_col?: number;
  centroid_id?: string;
  quaternion_bucket?: string;
}

interface TurboVecNativeModule {
  searchCodebaseAnn?: (
    embedding: number[],
    options: {
      limit: number;
      topoClass?: string;
      collection: string;
      filters?: unknown;
    }
  ) => Promise<TurboVecNativeSearchResult[] | { results?: TurboVecNativeSearchResult[] } | null>;
  search?: TurboVecNativeModule['searchCodebaseAnn'];
  query?: TurboVecNativeModule['searchCodebaseAnn'];
}

type QdrantScrollPoint = {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: unknown;
  vectors?: unknown;
};

let _native: TurboVecNativeModule | null | undefined;

function getNativeModuleName(): string | null {
  const raw =
    process.env.TURBO_VEC_NATIVE_MODULE ||
    process.env.TURBO_VEC_NATIVE_PATH ||
    process.env.TURBOVEC_NATIVE_MODULE ||
    process.env.TURBOVEC_NATIVE_PATH ||
    '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getTurboVecSidecarUrl(): string {
  return (ENV.TURBOVEC_SIDECAR || 'http://127.0.0.1:8791').trim();
}

function getTurboVecMaxCandidates(limit: number): number {
  const configured = Number(process.env.TURBOVEC_MAX_CANDIDATES ?? 256);
  const fallback = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 256;
  return Math.max(1, Math.min(fallback, Math.max(limit, limit * 4)));
}

async function loadNativeTurboVec(): Promise<TurboVecNativeModule | null> {
  if (_native !== undefined) return _native;

  const moduleName = getNativeModuleName();
  if (!moduleName) {
    _native = null;
    return null;
  }

  try {
    if (moduleName.startsWith('.') || moduleName.startsWith('/') || /^[A-Za-z]:/.test(moduleName)) {
      if (!existsSync(moduleName)) {
        _native = null;
        return null;
      }
      const require = createRequire(import.meta.url);
      const loaded = require(moduleName) as TurboVecNativeModule;
      _native = loaded ?? null;
      return _native;
    }

    const loaded = (await import(moduleName)) as unknown as TurboVecNativeModule;
    _native = loaded ?? null;
    return _native;
  } catch (err) {
    console.warn('[turbovec-search] native module load failed, using fallback:', err);
    _native = null;
    return null;
  }
}

function extractVector(raw: unknown): number[] | null {
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'number')) {
    return raw as number[];
  }

  if (raw && typeof raw === 'object') {
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
        return value as number[];
      }
    }
  }

  return null;
}

function mapResult(hit: TurboVecNativeSearchResult): QdrantCodeResult {
  return {
    stable_key: String(hit.stable_key ?? hit.qdrant_id ?? hit.id ?? ''),
    file_path: String(hit.file_path ?? ''),
    symbol_name: hit.symbol_name ? String(hit.symbol_name) : undefined,
    symbol_kind: hit.symbol_kind ? String(hit.symbol_kind) : undefined,
    language: hit.language ? String(hit.language) : undefined,
    content: String(hit.content ?? ''),
    tags: hit.tags ? String(hit.tags) : undefined,
    topo_class: hit.topo_class ? String(hit.topo_class) : undefined,
    graph_authority_score:
      typeof hit.graph_authority_score === 'number' ? hit.graph_authority_score : undefined,
    semantic_score: typeof hit.semantic_score === 'number' ? hit.semantic_score : 0,
    qdrant_id: String(hit.qdrant_id ?? hit.id ?? hit.stable_key ?? ''),
    som_cluster: typeof hit.som_cluster === 'number' ? hit.som_cluster : undefined,
    som_bmu_row: typeof hit.som_bmu_row === 'number' ? hit.som_bmu_row : undefined,
    som_bmu_col: typeof hit.som_bmu_col === 'number' ? hit.som_bmu_col : undefined,
    centroid_id: hit.centroid_id ? String(hit.centroid_id) : undefined,
    quaternion_bucket: hit.quaternion_bucket ? String(hit.quaternion_bucket) : undefined,
  };
}

function buildGraphHints(rows: QdrantCodeResult[]) {
  const authorityScores: Record<string, number> = {};
  for (const row of rows) {
    if (!row.file_path) continue;
    const base = typeof row.graph_authority_score === 'number' ? row.graph_authority_score : 0;
    authorityScores[row.file_path] = Math.max(authorityScores[row.file_path] ?? 0, base);
  }
  return { authorityScores };
}

function buildAeScores(rows: QdrantCodeResult[]) {
  const aeScores: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row.qdrant_id || row.stable_key);
    if (!key) continue;
    const semantic = Number(row.semantic_score ?? 0);
    const authority = Number(row.graph_authority_score ?? 0);
    aeScores[key] = Math.max(0, Math.min(1, semantic * 0.75 + authority * 0.25));
  }
  return aeScores;
}

type TurboCandidate = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
  score: number;
};

const TURBOVEC_GPU_MAX_IN_FLIGHT = Math.max(
  1,
  Number(process.env.TURBOVEC_GPU_MAX_IN_FLIGHT ?? 1)
);
let turbovecGpuInFlight = 0;

function tryAcquireTurboVecGpuSlot(): boolean {
  if (turbovecGpuInFlight >= TURBOVEC_GPU_MAX_IN_FLIGHT) return false;
  turbovecGpuInFlight += 1;
  return true;
}

function releaseTurboVecGpuSlot(): void {
  turbovecGpuInFlight = Math.max(0, turbovecGpuInFlight - 1);
}

function clusterKey(payload: Record<string, unknown>): string {
  const raw = payload.som_cluster ?? payload.cluster_id ?? payload.centroid_id ?? 'none';
  return String(raw);
}

function pruneCandidatesBySomCluster(rows: TurboCandidate[], limit: number): TurboCandidate[] {
  if (rows.length <= limit) return rows;

  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const clusterCap = Math.max(2, Math.ceil(limit / 4));
  const clusterCounts = new Map<string, number>();
  const kept: TurboCandidate[] = [];

  for (const row of sorted) {
    const key = clusterKey(row.payload);
    const count = clusterCounts.get(key) ?? 0;
    if (count >= clusterCap) continue;
    clusterCounts.set(key, count + 1);
    kept.push(row);
    if (kept.length >= Math.max(limit, limit * 2)) break;
  }

  return kept.length > 0 ? kept : sorted.slice(0, Math.max(limit, limit * 2));
}

async function encodeTo64(vec: number[]): Promise<number[] | null> {
  try {
    const encoded = await encode768to64(new Float32Array(vec), { preferGpu: true });
    return Array.from(encoded);
  } catch (err) {
    console.warn('[turbovec-search] AE encode failed:', err);
    return null;
  }
}

async function rerankWithGpuAttention(
  queryEmbedding: number[],
  candidates: TurboCandidate[]
): Promise<Array<TurboCandidate & { rerankScore: number }> | null> {
  if (!isCudaAvailable()) return null;
  if (!tryAcquireTurboVecGpuSlot()) return null;

  try {
    const estimatedMB = vramNeededMB(candidates.length, 64) + 256;
    if (!gpuHasRoom(estimatedMB)) {
      console.warn(
        `[turbovec-search] insufficient VRAM for GPU attention rerank: requiredMB=${estimatedMB}`
      );
      return null;
    }

    const query64 = await encodeTo64(queryEmbedding);
    if (!query64) return null;

    const flattened = new Float32Array(candidates.length * 768);
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const vector = candidate.vector;
      for (let d = 0; d < 768; d++) {
        flattened[i * 768 + d] = Number(vector[d] ?? 0);
      }
    }

    const encodedBatch = await encode768to64Batch(flattened, candidates.length, { preferGpu: true });
    const candidate64s: number[][] = [];
    for (let i = 0; i < candidates.length; i++) {
      const offset = i * 64;
      candidate64s.push(Array.from(encodedBatch.encoded.slice(offset, offset + 64)));
    }

    const scores = await attentionScoreChunks_fp16(query64, candidate64s).catch(() =>
      attentionScoreChunks(query64, candidate64s)
    );
    if (!Array.isArray(scores) || scores.length !== candidates.length) {
      return null;
    }

    return candidates.map((candidate, idx) => ({
      ...candidate,
      rerankScore: Number(scores[idx] ?? 0),
    }));
  } catch (err) {
    console.warn('[turbovec-search] GPU attention rerank failed:', err);
    return null;
  } finally {
    releaseTurboVecGpuSlot();
  }
}

function buildSearchFilter(topoClass?: string): Record<string, unknown> | undefined {
  const mustConditions: any[] = [];
  if (topoClass) {
    mustConditions.push({ key: 'topo_class', match: { value: topoClass } });
  }

  if (ENV.ACE_ENCODED_PREFILTER_ENABLED === 'true') {
    return { must: mustConditions };
  }

  return mustConditions.length > 0 ? { must: mustConditions } : undefined;
}

async function maybeApplyEncodedPrefilter(embedding: number[], filter?: Record<string, unknown>) {
  if (ENV.ACE_ENCODED_PREFILTER_ENABLED !== 'true') return filter;

  try {
    const pre = await encodedClusterPrefilter(new Float32Array(embedding));
    if (pre?.filter?.should) {
      return filter ? { must: [filter, { should: pre.filter.should }] } : { should: pre.filter.should };
    }
  } catch (err) {
    console.warn('[turbovec-search] encoded prefilter failed:', err);
  }

  return filter;
}

async function searchQdrantDirect(
  embedding: number[],
  limit: number,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[]> {
  const mgr = getQdrantClient();
  const filter = await maybeApplyEncodedPrefilter(embedding, buildSearchFilter(topoClass));

  const res = await mgr.hybridSearch({
    collection,
    query: '',
    queryEmbedding: embedding,
    limit,
    filters: filter,
  });

  return (res.results ?? []).map((r) => {
    const p = r.payload ?? {};
    return {
      stable_key: String(p.stable_key ?? p.chunk_id ?? r.id),
      file_path: String(p.file_path ?? ''),
      symbol_name: p.symbol_name ? String(p.symbol_name) : undefined,
      symbol_kind: p.symbol_kind ? String(p.symbol_kind) : undefined,
      language: p.language ? String(p.language) : undefined,
      content: String(p.content ?? p.chunk_text ?? ''),
      tags: p.tags ? String(p.tags) : undefined,
      topo_class: p.topo_class ? String(p.topo_class) : undefined,
      graph_authority_score:
        typeof p.graph_authority_score === 'number' ? p.graph_authority_score : undefined,
      semantic_score: r.score,
      qdrant_id: String(r.id),
      som_cluster: typeof p.som_cluster === 'number' ? p.som_cluster : undefined,
      som_bmu_row: typeof p.som_bmu_row === 'number' ? p.som_bmu_row : undefined,
      som_bmu_col: typeof p.som_bmu_col === 'number' ? p.som_bmu_col : undefined,
      centroid_id: p.centroid_id ? String(p.centroid_id) : undefined,
      quaternion_bucket: p.quaternion_bucket ? String(p.quaternion_bucket) : undefined,
    };
  });
}

async function searchQdrantWithVectors(
  embedding: number[],
  limit: number,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantScrollPoint[]> {
  const filter = await maybeApplyEncodedPrefilter(embedding, buildSearchFilter(topoClass));
  const vectorField = buildVectorPayload(collection, embedding);
  const maxCandidates = getTurboVecMaxCandidates(limit);
  const candidateLimit = Math.max(limit, Math.min(maxCandidates, limit * 4));

  const res = await fetch(`${ENV.QDRANT_URL}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: vectorField,
      limit: candidateLimit,
      score_threshold: 0,
      with_payload: true,
      with_vector: true,
      ...(filter ? { filter } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as { result?: QdrantScrollPoint[] };
  return Array.isArray(data.result) ? data.result : [];
}

async function searchTurboVecNative(
  embedding: number[],
  limit: number,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[] | null> {
  const native = await loadNativeTurboVec();
  if (!native) return null;

  const fn = native.searchCodebaseAnn ?? native.search ?? native.query;
  if (!fn) return null;

  const result = await fn(embedding, {
    limit,
    topoClass,
    collection,
  });

  const rows = Array.isArray(result)
    ? result
    : Array.isArray((result as { results?: TurboVecNativeSearchResult[] } | null)?.results)
      ? ((result as { results: TurboVecNativeSearchResult[] }).results ?? [])
      : [];

  if (!rows.length) return [];
  return rows.map(mapResult);
}

async function searchTurboVecSidecar(
  embedding: number[],
  limit: number,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[] | null> {
  const sidecarUrl = getTurboVecSidecarUrl();
  if (!sidecarUrl) return null;

  const candidates = await searchQdrantWithVectors(embedding, limit, topoClass, collection);
  if (!candidates.length) return [];

  const candidateRows = pruneCandidatesBySomCluster(
    candidates
    .map((point) => {
      const vector = extractVector(point.vector ?? point.vectors);
      if (!vector) return null;
      const payload = point.payload ?? {};
      return {
        id: String(point.id),
        vector,
        payload,
        score: Number(point.score ?? 0),
      };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        vector: number[];
        payload: Record<string, unknown>;
        score: number;
      } => row !== null
    ),
    limit
  );

  if (!candidateRows.length) return null;

  try {
    const res = await fetch(`${sidecarUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: embedding,
        candidates: candidateRows.map((row) => ({
          id: row.id,
          vector: row.vector,
          payload: row.payload,
        })),
        top_k: limit,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: Array<{ id: string | number; turbovec_score?: number; rank?: number }>;
    };
    const rows = Array.isArray(data.results) ? data.results : [];
    if (!rows.length) return [];

    return rows
      .map((row) => {
        const candidate = candidateRows.find((entry) => entry.id === String(row.id));
        if (!candidate) return null;
        const payload = candidate.payload ?? {};
        return {
          stable_key: String(payload.stable_key ?? payload.chunk_id ?? candidate.id),
          file_path: String(payload.file_path ?? ''),
          symbol_name: payload.symbol_name ? String(payload.symbol_name) : undefined,
          symbol_kind: payload.symbol_kind ? String(payload.symbol_kind) : undefined,
          language: payload.language ? String(payload.language) : undefined,
          content: String(payload.content ?? payload.chunk_text ?? ''),
          tags: payload.tags ? String(payload.tags) : undefined,
          topo_class: payload.topo_class ? String(payload.topo_class) : undefined,
          graph_authority_score:
            typeof payload.graph_authority_score === 'number'
              ? payload.graph_authority_score
              : undefined,
          semantic_score: Number(row.turbovec_score ?? candidate.score ?? 0),
          qdrant_id: candidate.id,
          som_cluster: typeof payload.som_cluster === 'number' ? payload.som_cluster : undefined,
          som_bmu_row: typeof payload.som_bmu_row === 'number' ? payload.som_bmu_row : undefined,
          som_bmu_col: typeof payload.som_bmu_col === 'number' ? payload.som_bmu_col : undefined,
          centroid_id: payload.centroid_id ? String(payload.centroid_id) : undefined,
          quaternion_bucket: payload.quaternion_bucket ? String(payload.quaternion_bucket) : undefined,
        } satisfies QdrantCodeResult;
      })
      .filter((row) => row !== null)
      .slice(0, limit) as QdrantCodeResult[];
  } catch (err) {
    console.warn('[turbovec-search] sidecar rerank unavailable, falling back to Qdrant:', err);
    return null;
  }
}

function buildRerankHits(rows: QdrantCodeResult[]) {
  return rows.map((row) => ({
    id: row.qdrant_id || row.stable_key,
    score: row.semantic_score,
    payload: {
      stable_key: row.stable_key,
      file_path: row.file_path,
      symbol_name: row.symbol_name,
      symbol_kind: row.symbol_kind,
      language: row.language,
      content: row.content,
      tags: row.tags,
      topo_class: row.topo_class,
      graph_authority_score: row.graph_authority_score,
      som_cluster: row.som_cluster,
      som_bmu_row: row.som_bmu_row,
      som_bmu_col: row.som_bmu_col,
      centroid_id: row.centroid_id,
      quaternion_bucket: row.quaternion_bucket,
    } as Record<string, unknown>,
  }));
}

async function searchTurboVecFallback(
  embedding: number[],
  limit: number,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[]> {
  const qdrantCandidates = await searchQdrantWithVectors(
    embedding,
    Math.max(limit * 2, limit),
    topoClass,
    collection
  );
  if (!qdrantCandidates.length) return [];

  const candidates: TurboCandidate[] = pruneCandidatesBySomCluster(
    qdrantCandidates
      .map((point) => {
        const vector = extractVector(point.vector ?? point.vectors);
        if (!vector) return null;
        const payload = point.payload ?? {};
        return {
          id: String(point.id),
          vector,
          payload,
          score: Number(point.score ?? 0),
        };
      })
      .filter(
        (
          row
        ): row is {
          id: string;
          vector: number[];
          payload: Record<string, unknown>;
          score: number;
        } => row !== null
      ),
    limit
  );

  if (!candidates.length) return [];

  const gpuReranked = await rerankWithGpuAttention(embedding, candidates);
  if (gpuReranked && gpuReranked.length > 0) {
    return gpuReranked
      .slice()
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, limit)
      .map((candidate) => ({
        stable_key: String(candidate.payload.stable_key ?? candidate.payload.chunk_id ?? candidate.id),
        file_path: String(candidate.payload.file_path ?? ''),
        symbol_name: candidate.payload.symbol_name ? String(candidate.payload.symbol_name) : undefined,
        symbol_kind: candidate.payload.symbol_kind ? String(candidate.payload.symbol_kind) : undefined,
        language: candidate.payload.language ? String(candidate.payload.language) : undefined,
        content: String(candidate.payload.content ?? candidate.payload.chunk_text ?? ''),
        tags: candidate.payload.tags ? String(candidate.payload.tags) : undefined,
        topo_class: candidate.payload.topo_class ? String(candidate.payload.topo_class) : undefined,
        graph_authority_score:
          typeof candidate.payload.graph_authority_score === 'number'
            ? candidate.payload.graph_authority_score
            : undefined,
        semantic_score: Number(candidate.rerankScore ?? candidate.score ?? 0),
        qdrant_id: candidate.id,
        som_cluster: typeof candidate.payload.som_cluster === 'number' ? candidate.payload.som_cluster : undefined,
        som_bmu_row: typeof candidate.payload.som_bmu_row === 'number' ? candidate.payload.som_bmu_row : undefined,
        som_bmu_col: typeof candidate.payload.som_bmu_col === 'number' ? candidate.payload.som_bmu_col : undefined,
        centroid_id: candidate.payload.centroid_id ? String(candidate.payload.centroid_id) : undefined,
        quaternion_bucket: candidate.payload.quaternion_bucket ? String(candidate.payload.quaternion_bucket) : undefined,
      }));
  }

  const hits = candidates.map((candidate) => ({
    id: candidate.id,
    score: candidate.score,
    payload: {
      ...candidate.payload,
      file_path: String(candidate.payload.file_path ?? ''),
      content: String(candidate.payload.content ?? candidate.payload.chunk_text ?? ''),
      graph_authority_score:
        typeof candidate.payload.graph_authority_score === 'number'
          ? candidate.payload.graph_authority_score
          : undefined,
    },
  }));

  const reranked = await turbovecRerank({
    query: '',
    hits: buildRerankHits(
      candidates.map((candidate) => ({
        stable_key: String(candidate.payload.stable_key ?? candidate.payload.chunk_id ?? candidate.id ?? ''),
        file_path: String(candidate.payload.file_path ?? ''),
        symbol_name: candidate.payload.symbol_name ? String(candidate.payload.symbol_name) : undefined,
        symbol_kind: candidate.payload.symbol_kind ? String(candidate.payload.symbol_kind) : undefined,
        language: candidate.payload.language ? String(candidate.payload.language) : undefined,
        content: String(candidate.payload.content ?? ''),
        tags: candidate.payload.tags ? String(candidate.payload.tags) : undefined,
        topo_class: candidate.payload.topo_class ? String(candidate.payload.topo_class) : undefined,
        graph_authority_score:
          typeof candidate.payload.graph_authority_score === 'number'
            ? candidate.payload.graph_authority_score
            : undefined,
        semantic_score: candidate.score,
        qdrant_id: candidate.id,
        som_cluster: typeof candidate.payload.som_cluster === 'number' ? candidate.payload.som_cluster : undefined,
        som_bmu_row: typeof candidate.payload.som_bmu_row === 'number' ? candidate.payload.som_bmu_row : undefined,
        som_bmu_col: typeof candidate.payload.som_bmu_col === 'number' ? candidate.payload.som_bmu_col : undefined,
        centroid_id: candidate.payload.centroid_id ? String(candidate.payload.centroid_id) : undefined,
        quaternion_bucket: candidate.payload.quaternion_bucket ? String(candidate.payload.quaternion_bucket) : undefined,
      }))
    ),
    graphHints: buildGraphHints(
      candidates.map((candidate) => ({
        stable_key: String(candidate.payload.stable_key ?? candidate.payload.chunk_id ?? candidate.id ?? ''),
        file_path: String(candidate.payload.file_path ?? ''),
        symbol_name: candidate.payload.symbol_name ? String(candidate.payload.symbol_name) : undefined,
        symbol_kind: candidate.payload.symbol_kind ? String(candidate.payload.symbol_kind) : undefined,
        language: candidate.payload.language ? String(candidate.payload.language) : undefined,
        content: String(candidate.payload.content ?? ''),
        tags: candidate.payload.tags ? String(candidate.payload.tags) : undefined,
        topo_class: candidate.payload.topo_class ? String(candidate.payload.topo_class) : undefined,
        graph_authority_score:
          typeof candidate.payload.graph_authority_score === 'number'
            ? candidate.payload.graph_authority_score
            : undefined,
        semantic_score: candidate.score,
        qdrant_id: candidate.id,
        som_cluster: typeof candidate.payload.som_cluster === 'number' ? candidate.payload.som_cluster : undefined,
        som_bmu_row: typeof candidate.payload.som_bmu_row === 'number' ? candidate.payload.som_bmu_row : undefined,
        som_bmu_col: typeof candidate.payload.som_bmu_col === 'number' ? candidate.payload.som_bmu_col : undefined,
        centroid_id: candidate.payload.centroid_id ? String(candidate.payload.centroid_id) : undefined,
        quaternion_bucket: candidate.payload.quaternion_bucket ? String(candidate.payload.quaternion_bucket) : undefined,
      }))
    ),
    aeScores: buildAeScores(
      candidates.map((candidate) => ({
        stable_key: String(candidate.payload.stable_key ?? candidate.payload.chunk_id ?? candidate.id ?? ''),
        file_path: String(candidate.payload.file_path ?? ''),
        symbol_name: candidate.payload.symbol_name ? String(candidate.payload.symbol_name) : undefined,
        symbol_kind: candidate.payload.symbol_kind ? String(candidate.payload.symbol_kind) : undefined,
        language: candidate.payload.language ? String(candidate.payload.language) : undefined,
        content: String(candidate.payload.content ?? ''),
        tags: candidate.payload.tags ? String(candidate.payload.tags) : undefined,
        topo_class: candidate.payload.topo_class ? String(candidate.payload.topo_class) : undefined,
        graph_authority_score:
          typeof candidate.payload.graph_authority_score === 'number'
            ? candidate.payload.graph_authority_score
            : undefined,
        semantic_score: candidate.score,
        qdrant_id: candidate.id,
        som_cluster: typeof candidate.payload.som_cluster === 'number' ? candidate.payload.som_cluster : undefined,
        som_bmu_row: typeof candidate.payload.som_bmu_row === 'number' ? candidate.payload.som_bmu_row : undefined,
        som_bmu_col: typeof candidate.payload.som_bmu_col === 'number' ? candidate.payload.som_bmu_col : undefined,
        centroid_id: candidate.payload.centroid_id ? String(candidate.payload.centroid_id) : undefined,
        quaternion_bucket: candidate.payload.quaternion_bucket ? String(candidate.payload.quaternion_bucket) : undefined,
      }))
    ),
  });

  const ranked = reranked.hits.slice(0, limit);
  return ranked.map((hit) => {
    const payload = (hit.payload ?? {}) as Record<string, unknown>;
    return {
      stable_key: String(payload.stable_key ?? payload.chunk_id ?? hit.id),
      file_path: String(payload.file_path ?? ''),
      symbol_name: payload.symbol_name ? String(payload.symbol_name) : undefined,
      symbol_kind: payload.symbol_kind ? String(payload.symbol_kind) : undefined,
      language: payload.language ? String(payload.language) : undefined,
      content: String(payload.content ?? payload.chunk_text ?? ''),
      tags: payload.tags ? String(payload.tags) : undefined,
      topo_class: payload.topo_class ? String(payload.topo_class) : undefined,
      graph_authority_score:
        typeof payload.graph_authority_score === 'number' ? payload.graph_authority_score : undefined,
      semantic_score: Number(hit.score ?? 0),
      qdrant_id: String(hit.id),
      som_cluster: typeof payload.som_cluster === 'number' ? payload.som_cluster : undefined,
      som_bmu_row: typeof payload.som_bmu_row === 'number' ? payload.som_bmu_row : undefined,
      som_bmu_col: typeof payload.som_bmu_col === 'number' ? payload.som_bmu_col : undefined,
      centroid_id: payload.centroid_id ? String(payload.centroid_id) : undefined,
      quaternion_bucket: payload.quaternion_bucket ? String(payload.quaternion_bucket) : undefined,
    };
  });
}

/**
 * Stable ANN retrieval contract for codebase chunks.
 *
 * Current default: Qdrant HNSW.
 * Optional acceleration lane: TurboVec native N-API or sidecar.
 * Future experiment lane: cuVS/CAGRA or a small Rust gRPC ANN worker behind the
 * same result shape and caller contract.
 */
export async function searchCodebaseAnn(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[]> {
  const backend = getCodebaseAnnBackend();
  if (backend === 'turbovec') {
    return searchTurboVecCode(embedding, limit, topoClass, collection);
  }

  if (backend !== 'qdrant') {
    console.warn(`[searchCodebaseAnn] backend=${backend} not implemented yet; falling back to qdrant`);
  }

  return searchQdrantDirect(embedding, limit, topoClass, collection).catch(() => []);
}

export async function searchTurboVecCode(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[]> {
  const native = await searchTurboVecNative(embedding, limit, topoClass, collection);
  if (native) return native;

  const sidecar = await searchTurboVecSidecar(embedding, limit, topoClass, collection);
  if (sidecar) return sidecar;

  return searchTurboVecFallback(embedding, limit, topoClass, collection);
}

export async function searchQdrantCode(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[]> {
  return searchCodebaseAnn(embedding, limit, topoClass, collection);
}
