/**
 * 4D Hypergraph — GPU-backed legal knowledge hypergraph
 *
 * Extends the pairwise Neo4j graph to hyperedges (n-ary relations) with
 * 4-dimensional addressing for every node:
 *
 *   x, y  — SOM BMU grid coordinates (2D semantic neighborhood)
 *   z     — cosine distance to cluster centroid (semantic depth, 0=centroid)
 *   w     — GRPO reward score (policy-adjusted quality, 0–1)
 *
 * Hyperedge types:
 *   RESEARCH_CLUSTER  — k-means cluster of research summaries (one per cluster)
 *   ACE_CONTEXT       — ACE retrieval bundle (query + RAG sources + KAG neighbors)
 *   LEGAL_PRINCIPLE   — n-ary legal relation (statute + case + evidence + jurisdiction)
 *
 * HGNN propagation (Feng et al. 2019, simplified):
 *   H[i,j] = attention_score(embedding_i, centroid_j)   — incidence weights
 *   W[j]   = reward_score(centroid_j, anchor)           — edge importance (GRPO)
 *   X'[j]  = W[j] * Σ_i H[i,j] * X[i] / D_e[j]        — hyperedge aggregation
 *   X'[i]  = Σ_j H[i,j] * X'[j] / D_v[i]               — node update
 *
 * Grade pointing (ACE contextual addressing):
 *   A ≥ 0.75 · B ≥ 0.55 · C ≥ 0.35 · D < 0.35
 *   Stored in Redis hg:edge:idx ZSET for O(log n) range queries.
 *
 * Pre-ingestion enrichment pipeline (Step 0 — fires before SOM/k-means):
 *   Docling  — layout-aware PDF/DOCX block extraction → richer summary text
 *   YOLO     — object detection on image nodes → bbox entity tags
 *   Gemma4 VLM — multimodal description of image/PDF visual content
 *   LangGraph — HMM-adapted RAG+KAG synthesis → enriched summary field
 *
 * GPU batch summarization (Step 9):
 *   Hyperedge summarization is batched in groups of SUMMARIZE_BATCH_SIZE
 *   (default 5) with Promise.allSettled — 5× throughput vs sequential awaits.
 *
 * Deep research summarization:
 *   Each hyperedge gets an ACE-style summary via bifrostChat (gemma4-rotorquant:latest).
 *   Summary cached in Redis hg:edge:{hash} (4h TTL) + Postgres hypergraph_edges.
 */

import { getRedis }              from '$lib/server/redis.js';
import { pool, db }              from '$lib/server/db/client';
import { contextTimeline }       from '$lib/server/db/schema-postgres.js';
import { bifrostChat }           from '$lib/server/ollama.js';
import {
  runKMeans,
  runSOM,
  runPageRank,
  scoreAttention,
  scoreGRPOReward,
  publishMemoryCheckpoints,
  type MemoryCheckpoint,
} from '$lib/server/grpc/graph-ml-client.js';
import {
  kmeansWithCentroids,
  attentionScoreGPU,
  rewardScoreGPU,
  softmaxGPU,
  topKIndices,
  trainSOM,
} from '$lib/server/gpu/pytorch-graph.js';
import { batchCosineSimilarityFp16 } from '$lib/server/gpu/libtorch-bridge.js';
import { analyzeDocumentWithDocling } from '$lib/server/docling.js';
import { YOLOService }               from '$lib/server/yolo.js';
import { analyzeEvidenceImage }      from '$lib/server/analysis/vlm-evidence-analyzer.js';
import { langGraphSynthesize }       from '$lib/server/ai/langgraph-client.js';
import { classifyPath }              from '$lib/server/tensor/topology-byte-mapper.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const DIM             = 768;
const K_CLUSTERS      = 20;           // hyperedges per build
const INCIDENCE_THRESH = 0.55;        // attention score → binary H[i,j]
const HG_EDGE_TTL     = 4 * 60 * 60; // 4h Redis TTL for edge blobs
const HG_COORD_TTL    = 1 * 60 * 60; // 1h Redis TTL for 4D coords
const HG_IDX_TTL      = 4 * 60 * 60;
const MAX_ROWS        = 4_000;        // cap DB fetch
const SOM_GRID_W           = 12;   // research SOM grid (smaller than codebase 44×44)
const SOM_GRID_H           = 12;
const MODEL                = 'gemma4-rotorquant:latest';
const SUMMARIZE_BATCH_SIZE = 5;    // parallel hyperedge summarization batch width

// Grade thresholds
const GRADE_A = 0.75;
const GRADE_B = 0.55;
const GRADE_C = 0.35;

// Redis key factories
const HG_COORD_KEY  = (id: string) => `hg:4d:${id}`;
const HG_EDGE_KEY   = (h: string)  => `hg:edge:${h}`;
const HG_IDX_KEY    = 'hg:edge:idx';   // ZSET: edgeHash → gradeScore
const HG_BUILT_KEY  = 'hg:built_at';

// ── Public Types ───────────────────────────────────────────────────────────────

export interface HyperNode4D {
  id:    string;   // research_summary UUID or other node ID
  x:     number;   // SOM BMU x [0, SOM_GRID_W)
  y:     number;   // SOM BMU y [0, SOM_GRID_H)
  z:     number;   // cosine distance to assigned centroid [0,1]
  w:     number;   // GRPO reward score [0,1]
  type:  string;   // 'research_summary' | 'legal_doc' | 'evidence' | 'statute'
  table: 'research_summaries' | 'embedded_summaries' | 'codebase_chunks_768';
}

export type HyperEdgeGrade = 'A' | 'B' | 'C' | 'D';

export interface HyperEdge {
  hash:         string;                   // 8-char FNV-1a of sorted memberIds
  type:         'RESEARCH_CLUSTER' | 'ACE_CONTEXT' | 'LEGAL_PRINCIPLE';
  memberIds:    string[];                  // node IDs that belong to this hyperedge
  centroid:     number[];                  // 768-dim mean of member embeddings
  gradeScore:   number;                    // GRPO reward score [0,1]
  gradeLabel:   HyperEdgeGrade;
  summary:      string;                    // ACE-style gemma4-rotorquant:latest summary
  pipeline:     string;                    // dominant pipeline label
  memberCount:  number;
  builtAt:      string;
}

export interface HypergraphBuildResult {
  nodesTagged:   number;
  hyperedges:    number;
  gradeA:        number;
  gradeB:        number;
  gradeC:        number;
  gradeD:        number;
  durationMs:    number;
  source:        'gpu' | 'cpu';
}

// ── Hash helper ────────────────────────────────────────────────────────────────

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < Math.min(s.length, 512); i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) | 0) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function edgeHash(memberIds: string[]): string {
  return fnv1a([...memberIds].sort().join(','));
}

// ── GPU helpers ────────────────────────────────────────────────────────────────

/** Convert number[][] to flat Float32Array row-major. */
function flatF32(rows: number[][]): Float32Array {
  const out = new Float32Array(rows.length * DIM);
  for (let i = 0; i < rows.length; i++) {
    out.set(rows[i].slice(0, DIM), i * DIM);
  }
  return out;
}

/** L2-normalize a single 768-dim vector. */
function l2norm(v: number[]): Float32Array {
  const f = new Float32Array(v);
  let sq = 0;
  for (let i = 0; i < f.length; i++) sq += f[i] * f[i];
  const inv = sq > 0 ? 1 / Math.sqrt(sq) : 1;
  for (let i = 0; i < f.length; i++) f[i] *= inv;
  return f;
}

/** Cosine distance of a single node to a centroid (for z coordinate). */
function cosineDist(a: number[], b: Float32Array): number {
  let dot = 0;
  for (let d = 0; d < DIM; d++) dot += a[d] * b[d];
  return 1 - Math.max(-1, Math.min(1, dot));
}

// ── Step 0: Pre-ingestion enrichment ──────────────────────────────────────────
//
// Runs before SOM/k-means on rows that have a storage_path (PDF/DOCX/image).
// Enriches the summary field in-place so downstream steps see richer text:
//   • Docling   → structured blocks (headings, tables) replace raw OCR text
//   • YOLO      → object bbox classes appended as entity_tags
//   • Gemma4 VLM → visual description prepended to summary for image nodes
//   • LangGraph → HMM-adapted synthesis replaces flat summary when available
//
// All sub-steps are non-fatal: if a service is down the original summary is kept.
// Fire-and-forget parallel batching (Promise.allSettled) — no sequential stalling.

const _yoloService = new YOLOService();

async function enrichSummaryRow(row: SummaryRow & { storage_path?: string; mime_type?: string }): Promise<void> {
  const storagePath = row.storage_path;
  const mimeType    = row.mime_type ?? '';
  if (!storagePath) return;

  const isImage    = mimeType.startsWith('image/');
  const isDocument = mimeType === 'application/pdf' || mimeType.includes('word');

  await Promise.allSettled([
    // ── Docling: layout-aware block extraction for PDFs/DOCX ────────────────
    (async () => {
      if (!isDocument) return;
      try {
        const { ENV } = await import('$lib/server/env.server.js');
        if (!ENV.GRANITE_DOCLING_ENABLED) return;
        const fileRes = await fetch(storagePath, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
        if (!fileRes?.ok) return;
        const buf = Buffer.from(await fileRes.arrayBuffer());
        const result = await analyzeDocumentWithDocling({ fileBuffer: buf, mimeType });
        if (result.fullText && result.fullText.length > row.summary.length) {
          // Prefer Docling structured text — headings + tables beat raw OCR
          row.summary = result.fullText.slice(0, 2000);
        }
      } catch { /* Docling service unavailable — keep original */ }
    })(),

    // ── YOLO: object/layout detection for image evidence nodes ──────────────
    (async () => {
      if (!isImage) return;
      try {
        if (!await _yoloService.isModelAvailable()) return;
        const fileRes = await fetch(storagePath, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
        if (!fileRes?.ok) return;
        const buf = Buffer.from(await fileRes.arrayBuffer());
        const yoloResult = await _yoloService.analyzeDocument(buf, 'evidence');
        const classes = (yoloResult.objects ?? [])
          .filter((o: { confidence: number; class: string }) => o.confidence > 0.5)
          .map((o: { confidence: number; class: string }) => o.class)
          .filter((c: string, i: number, a: string[]) => a.indexOf(c) === i); // unique
        if (classes.length > 0) {
          row.entity_tags = [...new Set([...row.entity_tags, ...classes])];
        }
      } catch { /* YOLO model unavailable */ }
    })(),

    // ── Gemma4 VLM: visual description for image nodes ──────────────────────
    (async () => {
      if (!isImage) return;
      try {
        const fileRes = await fetch(storagePath, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
        if (!fileRes?.ok) return;
        const buf = Buffer.from(await fileRes.arrayBuffer());
        const vlm = await analyzeEvidenceImage({ buffer: buf, fileName: 'evidence' });
        if (vlm?.summary) {
          row.summary = `[VLM] ${vlm.summary}\n\n${row.summary}`.slice(0, 2000);
          if (vlm.suggestedTags?.length) {
            row.entity_tags = [...new Set([...row.entity_tags, ...vlm.suggestedTags])];
          }
        }
      } catch { /* VLM unavailable */ }
    })(),

    // ── LangGraph: HMM-adapted synthesis replaces flat summary ──────────────
    (async () => {
      if (row.summary.length < 20) return;
      try {
        const lg = await langGraphSynthesize({ query: row.summary.slice(0, 500), skip_cache: false });
        if (lg?.answer && lg.answer.length > 80) {
          row.summary = lg.answer.slice(0, 2000);
        }
      } catch { /* LangGraph service unavailable */ }
    })(),
  ]);
}

// ── DB fetch ────────────────────────────────────────────────────────────────────

interface SummaryRow {
  id: string;
  pipeline: string;
  entity_tags: string[];
  summary: string;
  embedding: number[];
  relevance_score: number;
  // Pre-computed SOM BMU coordinates from Qdrant payload (codebase nodes only).
  // When present, buildHypergraph4D skips the GPU SOM re-training step.
  somX?: number;
  somY?: number;
  table: 'research_summaries' | 'embedded_summaries' | 'codebase_chunks_768';
}

async function fetchEmbeddedSummaries(): Promise<SummaryRow[]> {
  const research = await pool.query<SummaryRow>(
    `SELECT id::text, pipeline, entity_tags, summary,
            embedding::text, relevance_score::real,
            'research_summaries' as table
     FROM   research_summaries
     WHERE  embedding IS NOT NULL
     ORDER  BY relevance_score DESC
     LIMIT  $1`,
    [MAX_ROWS],
  ).then(r => r.rows);

  const embedded = await pool.query<any>(
    `SELECT id::text, source_type as pipeline, tags as entity_tags, summary_text as summary,
            NULL as embedding, confidence as relevance_score,
            'embedded_summaries' as table
     FROM   embedded_summaries
     ORDER  BY confidence DESC
     LIMIT  $1`,
    [MAX_ROWS],
  ).then(r => r.rows);

  // Combine and parse embeddings
  const all = [...research, ...embedded].map(r => ({
    ...r,
    embedding: typeof r.embedding === 'string'
      ? (r.embedding as string)
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map(Number)
      : (r.embedding as unknown as number[]),
  }));

  // Filter out any without embeddings (embedded_summaries might need Qdrant fetch)
  // For now, we only include those with embeddings already in PG
  return all.filter(a => a.embedding && a.embedding.length === DIM);
}

/**
 * Scroll `codebase_chunks_768` in Qdrant and return one entry per unique file
 * (deduplicated by relativePath / file_path / path payload field), formatted as
 * SummaryRow so the rest of the hypergraph pipeline works unchanged.
 *
 * Mirrors the logic in som-topology-pipeline.ts scrollEmbeddings().
 */
async function fetchCodebaseNodes(): Promise<SummaryRow[]> {
  const { ENV } = await import('$lib/server/env.server.js');
  const qdrantUrl = ENV.QDRANT_URL;
  if (!qdrantUrl) return [];

  const base = qdrantUrl.replace(/\/$/, '');
  const CODEBASE_COLLECTION = 'codebase_chunks_768';

  const seen = new Map<string, SummaryRow>(); // filePath → first entry
  let offset: string | number | null = null;

  do {
    const body: Record<string, unknown> = {
      limit: 250,
      with_vector: true,
      with_payload: true,
    };
    if (offset !== null) body.offset = offset;

    let res: Response;
    try {
      res = await fetch(`${base}/collections/${CODEBASE_COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      break; // network error — return what we have
    }

    if (!res.ok) break;

    const raw = await res.text();
    let data: {
      result?: {
        points?: Array<{
          id: number | string;
          payload?: Record<string, unknown>;
          vector?: number[] | Record<string, number[]>;
        }>;
        next_page_offset?: string | number | null;
      };
    };

    try {
      const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
      if (isSimdJsonAvailable()) {
        data = fastJsonParse(raw);
      } else {
        data = JSON.parse(raw);
      }
    } catch {
      data = JSON.parse(raw);
    }

    const points = data.result?.points ?? [];
    offset = data.result?.next_page_offset ?? null;

    for (const pt of points) {
      const p = pt.payload ?? {};

      // Resolve file path from whichever payload field is present
      const filePath = (
        (p['relativePath'] ?? p['file_path'] ?? p['path']) as string | undefined
      ) ?? '';
      if (!filePath) continue;

      // Resolve vector — may be bare array or named-vector map
      let vec: number[] | undefined;
      if (Array.isArray(pt.vector)) {
        vec = pt.vector as number[];
      } else if (pt.vector && typeof pt.vector === 'object') {
        vec = (pt.vector as Record<string, number[]>)['content'] ??
              Object.values(pt.vector as Record<string, number[]>)[0];
      }
      if (!vec || vec.length !== DIM) continue;

      // Deduplicate: keep first chunk per file path
      if (!seen.has(filePath)) {
        const tags = Array.isArray(p['tags']) ? (p['tags'] as string[]) : [];

        // Read SOM BMU coords written by som-topology-pipeline (44×44 grid)
        const somRow = typeof p['som_bmu_row'] === 'number' ? (p['som_bmu_row'] as number) : undefined;
        const somCol = typeof p['som_bmu_col'] === 'number' ? (p['som_bmu_col'] as number) : undefined;

        seen.set(filePath, {
          id:              String(pt.id),
          pipeline:        'codebase',
          entity_tags:     tags,
          summary:         filePath,
          embedding:       vec,
          relevance_score: 0.5, // placeholder — overwritten below from Redis PageRank
          somX:            somCol, // SOM col = x axis
          somY:            somRow, // SOM row = y axis
          table:           'codebase_chunks_768',
        });
      }

      if (seen.size >= MAX_ROWS) break;
    }

    if (seen.size >= MAX_ROWS) break;
  } while (offset !== null);

  // Hydrate CouchDB PageRank scores from Redis (written by runCouchDbPageRank).
  // Keys are relative file paths; values are normalised 0–1 floats.
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const rawScores = await redis.hgetall('couchdb:pagerank_scores').catch(() => ({}));
    if (rawScores && Object.keys(rawScores).length > 0) {
      for (const [filePath, row] of seen) {
        const score = rawScores[filePath];
        if (score !== undefined) {
          row.relevance_score = parseFloat(score);
        }
      }
    }
  } catch {
    // Redis unavailable — keep 0.5 default
  }

  return [...seen.values()];
}

// ── SOM BMU assignment (x, y coordinates) ────────────────────────────────────

async function computeSomCoords(
  embeddings: number[][],
): Promise<Array<{ x: number; y: number }>> {
  try {
    const flat = flatF32(embeddings);
    const n = embeddings.length;
    const result = await runSOM(
      flat, n, DIM,
      SOM_GRID_W, SOM_GRID_H,
      200, 0.5, 0.01, 3.0, 0.5,
    );
    // trainSOM returns { bmu: Int32Array[n] } — 1D BMU index
    return Array.from(result.bmu).map(idx => ({
      x: idx % SOM_GRID_W,
      y: Math.floor(idx / SOM_GRID_W),
    }));
  } catch {
    // CPU fallback: positional grid assignment
    const n = embeddings.length;
    const w = Math.ceil(Math.sqrt(n));
    return embeddings.map((_, i) => ({ x: i % w, y: Math.floor(i / w) }));
  }
}

// ── k-means → hyperedges ────────────────────────────────────────────────────────

interface KMeansResult {
  centroids: Float32Array;  // K × DIM
  labels: Uint32Array;      // N assignments
}

async function runGpuKmeans(
  flat: Float32Array,
  n: number,
  k: number,
): Promise<KMeansResult> {
  try {
    const { assignments, centroids } = await runKMeans(flat, n, DIM, k, 100);
    return { centroids, labels: new Uint32Array(assignments) };
  } catch {
    // CPU fallback: deterministic round-robin
    const labels = new Uint32Array(n);
    for (let i = 0; i < n; i++) labels[i] = i % k;
    const centroids = new Float32Array(k * DIM);
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      for (let d = 0; d < DIM; d++) centroids[c * DIM + d] += flat[i * DIM + d];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      const cnt = counts[c] || 1;
      for (let d = 0; d < DIM; d++) centroids[c * DIM + d] /= cnt;
    }
    return { centroids, labels };
  }
}

// ── HGNN incidence + propagation ──────────────────────────────────────────────

/**
 * Build sparse incidence matrix H (N × K) where H[i,j] = 1 if
 * attention_score(embedding_i, centroid_j) > INCIDENCE_THRESH.
 *
 * Returns:
 *   members[j]  — node indices assigned to hyperedge j
 *   nodeEdges[i] — hyperedge indices node i belongs to
 *   D_v[i]      — node degree (how many hyperedges)
 *   D_e[j]      — hyperedge degree (how many members)
 */
async function buildIncidenceMatrix(
  embeddings: Float32Array,
  centroids: Float32Array,
  n: number,
  k: number,
): Promise<{
  members:   number[][];
  nodeEdges: number[][];
  D_v:       number[];
  D_e:       number[];
}> {
  const members:   number[][] = Array.from({ length: k }, () => []);
  const nodeEdges: number[][] = Array.from({ length: n }, () => []);

  for (let j = 0; j < k; j++) {
    const centroid = centroids.slice(j * DIM, (j + 1) * DIM);
    // scoreAttention: query=centroid vs keys=all embeddings
    const { scores: weights } = await scoreAttention(centroid, DIM, embeddings, n);
    // Threshold: include nodes whose attention weight > INCIDENCE_THRESH / n
    const threshold = INCIDENCE_THRESH / n;
    for (let i = 0; i < n; i++) {
      if (weights[i] > threshold) {
        members[j].push(i);
        nodeEdges[i].push(j);
      }
    }
  }

  const D_v = nodeEdges.map(e => e.length || 1);
  const D_e = members.map(m => m.length || 1);

  return { members, nodeEdges, D_v, D_e };
}

/**
 * HGNN message passing: compute enriched hyperedge representations X'_j.
 *
 * X'_j = W[j] * (1/D_e[j]) * Σ_{i ∈ members[j]} X[i]
 */
function hgnnPropagate(
  embeddings: Float32Array,
  members:    number[][],
  edgeWeights: Float32Array,
  D_e:        number[],
  _n:         number,
  k:          number,
): Float32Array {
  // Enriched hyperedge embeddings (K × DIM)
  const X_prime = new Float32Array(k * DIM);
  for (let j = 0; j < k; j++) {
    const w = edgeWeights[j] ?? 1;
    const deg = D_e[j];
    for (const i of members[j]) {
      for (let d = 0; d < DIM; d++) {
        X_prime[j * DIM + d] += (w / deg) * embeddings[i * DIM + d];
      }
    }
  }
  return X_prime;
}

// ── LoRA hint mapping ──────────────────────────────────────────────────────────

/** Map a pipeline label to the nearest fine-tuned LoRA adapter identifier. */
function pipelineToLoraHint(pipeline: string): string {
  const map: Record<string, string> = {
    rag:      'legal_rag',
    kag:      'legal_kag',
    dag:      'legal_dag',
    ace:      'legal_ace',
    codebase: 'legal_codebase',
  };
  return map[pipeline] ?? 'legal_ace';
}

// ── Grade assignment ────────────────────────────────────────────────────────────

function scoreToGrade(score: number): HyperEdgeGrade {
  if (score >= GRADE_A) return 'A';
  if (score >= GRADE_B) return 'B';
  if (score >= GRADE_C) return 'C';
  return 'D';
}

// ── Deep research summarization ────────────────────────────────────────────────

async function summarizeHyperedge(
  memberSummaries: string[],
  pipeline: string,
  gradeLabel: HyperEdgeGrade,
): Promise<string> {
  const excerpts = memberSummaries.slice(0, 5).join('\n\n---\n\n');
  try {
    return await bifrostChat(
      [
        {
          role: 'system',
          content:
            `You are a legal knowledge synthesizer. Given ${memberSummaries.length} research fragments, ` +
            'produce a 3-5 sentence synthesis capturing the central legal principle, key statutes or ' +
            'holdings, and practical significance. Be precise and cite any statutes/cases mentioned.',
        },
        {
          role: 'user',
          content:
            `Pipeline: ${pipeline.toUpperCase()} | Grade: ${gradeLabel}\n\n` +
            `Research fragments:\n\n${excerpts}`,
        },
      ],
      MODEL,
      { temperature: 0.15, maxTokens: 300, cacheKey: `hg-sum-${fnv1a(excerpts)}` },
    );
  } catch {
    return memberSummaries[0]?.slice(0, 400) ?? '';
  }
}

// ── Postgres manifold4 write-back ──────────────────────────────────────────────

/**
 * Write manifold4 = [som_x, som_y, semantic_z, grpo_w] back to research_summaries
 * in a single batch UPDATE. This makes 4D coordinates queryable directly in SQL —
 * useful for offline analytics, batch reranking, and cursor pagination by region
 * without requiring a Redis hit.
 */
async function writeManifold4ToDB(nodes: HyperNode4D[]): Promise<void> {
  if (!nodes.length) return;
  try {
    const research = nodes.filter(n => n.table === 'research_summaries');
    const embedded = nodes.filter(n => n.table === 'embedded_summaries');
    const chunks   = nodes.filter(n => n.table === 'codebase_chunks_768');

    if (research.length) {
      await pool.query(
        `UPDATE research_summaries AS rs
         SET    manifold4 = u.coords::real[]
         FROM   unnest($1::uuid[], $2::text[]) AS u(id, coords)
         WHERE  rs.id = u.id`,
        [research.map(n => n.id), research.map(n => `{${n.x},${n.y},${n.z},${n.w}}`)],
      );
    }

    if (embedded.length) {
      await pool.query(
        `UPDATE embedded_summaries AS es
         SET    manifold4 = u.coords::double precision[]
         FROM   unnest($1::uuid[], $2::text[]) AS u(id, coords)
         WHERE  es.id = u.id`,
        [embedded.map(n => n.id), embedded.map(n => `{${n.x},${n.y},${n.z},${n.w}}`)],
      );
    }

    if (chunks.length) {
      // For codebase chunks, we update codebase_chunk_index.
      // Chunks might have string IDs (from Qdrant) or UUIDs.
      // We assume they map to the 'id' UUID column in Postgres.
      await pool.query(
        `UPDATE codebase_chunk_index AS cci
         SET    manifold4 = u.coords::real[]
         FROM   unnest($1::uuid[], $2::text[]) AS u(id, coords)
         WHERE  cci.id = u.id`,
        [chunks.map(n => n.id), chunks.map(n => `{${n.x},${n.y},${n.z},${n.w}}`)],
      );
    }
  } catch (err) {
    console.error('[hypergraph-4d] Failed to write manifold4 to DB:', err);
  }
}

// ── Neo4j persistence ───────────────────────────────────────────────────────────

async function syncHypergraphToNeo4j(
  edges: HyperEdge[],
  nodes: HyperNode4D[],
): Promise<void> {
  try {
    const { ensureNeo4jDriver } = await import(
      '$lib/server/connections/connection-pool.js'
    );
    const driver = ensureNeo4jDriver();
    if (!driver) return;
    const session = driver.session();
    try {
      // 1. Upsert File nodes with 4D coordinates + SomCell / Cluster nodes
      for (const node of nodes) {
        // File node — one per codebase file (or research summary)
        await session.run(
          `MERGE (f:File { id: $id })
           SET   f.som_x      = $x,
                 f.som_y      = $y,
                 f.semantic_z = $z,
                 f.reward_w   = $w,
                 f.manifold4X = $x,
                 f.manifold4Y = $y,
                 f.manifold4Z = $z,
                 f.manifold4W = $w,
                 f.nodeType   = $type
           WITH  f
           MERGE (sc:SomCell { col: $x, row: $y })
           MERGE (f)-[:IN_SOM_CELL]->(sc)`,
          { id: node.id, x: node.x, y: node.y, z: node.z, w: node.w, type: node.type },
        );
      }

      // 2. Upsert Cluster nodes + IN_CLUSTER edges, then MEMBER_OF → HyperEdge
      for (const edge of edges) {
        await session.run(
          `MERGE (cl:Cluster { hash: $hash })
           SET   cl.gradeScore  = $gradeScore,
                 cl.gradeLabel  = $gradeLabel,
                 cl.summary     = $summary,
                 cl.pipeline    = $pipeline,
                 cl.memberCount = $memberCount,
                 cl.builtAt     = $builtAt
           WITH  cl
           UNWIND $memberIds AS mid
             MATCH (f:File { id: mid })
             MERGE (f)-[:IN_CLUSTER]->(cl)
             MERGE (f)-[:MEMBER_OF { weight: f.reward_w }]->(cl)`,
          {
            hash:        edge.hash,
            gradeScore:  edge.gradeScore,
            gradeLabel:  edge.gradeLabel,
            summary:     edge.summary,
            pipeline:    edge.pipeline,
            memberCount: edge.memberCount,
            builtAt:     edge.builtAt,
            memberIds:   edge.memberIds,
          },
        );
      }

      // 3. Cross-cluster adjacency: Grade A/B clusters that share SomCell neighbors
      await session.run(
        `MATCH (a:Cluster), (b:Cluster)
         WHERE a.hash < b.hash
           AND a.gradeLabel IN ['A','B']
           AND b.gradeLabel IN ['A','B']
         MATCH (fa:File)-[:IN_CLUSTER]->(a),
               (fb:File)-[:IN_CLUSTER]->(b),
               (fa)-[:IN_SOM_CELL]->(sc:SomCell)<-[:IN_SOM_CELL]-(fb)
         WITH  a, b, count(sc) AS sharedCells
         WHERE sharedCells > 0
         MERGE (a)-[:ADJACENT_CLUSTER { sharedCells: sharedCells }]->(b)`,
      );
    } finally {
      await session.close();
    }
  } catch {
    // Neo4j not running — silently skip
  }
}

// ── Qdrant SOM payload mirror ──────────────────────────────────────────────────

/**
 * Mirror 4D coordinates into Qdrant `research_summaries` collection payloads.
 *
 * Adds three new payload fields to every point that has an embedding:
 *   som_cluster  integer  — k-means cluster assignment (0…K-1)
 *   som_x        integer  — SOM BMU x-coordinate (0…SOM_GRID_W-1)
 *   som_y        integer  — SOM BMU y-coordinate (0…SOM_GRID_H-1)
 *   manifold4    float[]  — [som_x, som_y, semantic_z, grpo_w]
 *
 * Why mirror into Qdrant?
 *   PostgreSQL pgvector is the durable truth (HNSW + manifold4 real[] column).
 *   Qdrant is the fast serving index (ANN with payload prefilter).
 *   Mirroring som_cluster lets ACE do:
 *     qdrant.search({ filter: { must: [{ key: 'som_cluster', match: { value: 7 } }] } })
 *   — topology prefilter in O(1) before the 768-dim ANN sweep, instead of
 *     fetching all candidates and re-ranking.
 *
 * After first call, create a payload index so Qdrant can use it for filtering:
 *   POST /collections/research_summaries/index
 *   { "field_name": "som_cluster", "field_schema": "integer" }
 */
/**
 * Mirror gpu_cluster + som_cluster payload fields into Qdrant codebase_chunks_768.
 *
 * Qdrant's job: fast ANN serving with payload prefilters.
 * Fields written here enable:
 *   filter: { must: [{ key: 'gpu_cluster', match: { value: 7 } }] }
 *   filter: { must: [{ key: 'som_cluster', match: { value: 12 } }] }
 *
 * NOT written here: manifold4 float[] — that is Postgres's job (durable truth,
 * cursor pagination, offline analytics). Qdrant payloads are fast-serving only.
 */
async function updateQdrantClusterPayloads(
  summaries: SummaryRow[],
  gpuLabels: Uint32Array,   // k-means cluster assignment per node
  somCoords: Array<{ x: number; y: number }>,
): Promise<void> {
  if (!summaries.length) return;
  try {
    const { ENV } = await import('$lib/server/env.server.js');
    const base = (ENV.QDRANT_URL ?? '').replace(/\/$/, '');
    if (!base) return;
    // Write to codebase_chunks_768 (the collection fetchCodebaseNodes reads from)
    const COLLECTION = 'codebase_chunks_768';

    const BATCH = 100;
    for (let start = 0; start < summaries.length; start += BATCH) {
      const slice = summaries.slice(start, start + BATCH);
      const points = slice.map((s, idx) => {
        const i = start + idx;
        const somCluster = (somCoords[i].y * 44) + somCoords[i].x;
        const topoClass = s.table === 'codebase_chunks_768' ? classifyPath(s.summary) : '';
        return {
          id:      s.id,
          payload: {
            gpu_cluster: gpuLabels[i],
            som_cluster: somCluster,
            som_bmu_col: somCoords[i].x,
            som_bmu_row: somCoords[i].y,
            ...(topoClass ? { cluster_key: `${topoClass}:${somCluster}` } : {}),
          },
        };
      });

      await fetch(`${base}/collections/${COLLECTION}/points/payload`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ points }),
        signal:  AbortSignal.timeout(15_000),
      }).catch(() => {});
    }

    // Payload indexes — idempotent, safe to call every build
    for (const field of ['gpu_cluster', 'som_cluster']) {
      fetch(`${base}/collections/${COLLECTION}/index`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ field_name: field, field_schema: { type: 'integer', lookup: true, range: false } }),
      }).catch(() => {});
    }
  } catch {
    // Qdrant not running — Redis + Postgres have the coordinates
  }
}

// ── Redis persistence ───────────────────────────────────────────────────────────

async function persistToRedis(
  edges: HyperEdge[],
  nodes: HyperNode4D[],
): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();

  // 4D coordinates per node
  for (const n of nodes) {
    pipeline.set(HG_COORD_KEY(n.id), JSON.stringify(n), 'EX', HG_COORD_TTL);
  }

  // Hyperedge blobs + ZSET index
  for (const e of edges) {
    pipeline.set(HG_EDGE_KEY(e.hash), JSON.stringify(e), 'EX', HG_EDGE_TTL);
    pipeline.zadd(HG_IDX_KEY, e.gradeScore, e.hash);
  }
  pipeline.expire(HG_IDX_KEY, HG_IDX_TTL);
  pipeline.set(HG_BUILT_KEY, new Date().toISOString(), 'EX', HG_EDGE_TTL);

  await pipeline.exec().catch(() => {});
}

// ── Main build function ─────────────────────────────────────────────────────────

/**
 * Build the full 4D hypergraph over research_summaries:
 *   1. Fetch embeddings from Postgres
 *   2. trainSOM → (x, y) coordinates
 *   3. kmeansWithCentroids → K hyperedges
 *   4. attentionScoreGPU → incidence matrix H
 *   5. rewardScoreGPU → edge weights W (GRPO)
 *   6. hgnnPropagate → enriched hyperedge representations X'
 *   7. Grade hyperedges (A/B/C/D)
 *   8. Summarize each hyperedge with gemma4-rotorquant:latest
 *   9. Write to Redis + Neo4j
 */
export async function buildHypergraph4D(): Promise<HypergraphBuildResult> {
  const t0 = Date.now();

  // ── Node set: codebase files first, fall back to research_summaries ──────────
  // fetchCodebaseNodes() scrolls codebase_chunks_768 (same data the SOM topology
  // pipeline uses). Falls back to Postgres research_summaries if < 10 codebase
  // nodes are available (e.g. Qdrant is down or collection is empty).
  let summaries: SummaryRow[] = await fetchCodebaseNodes().catch(() => []);
  if (summaries.length < 10) {
    const pgRows = await fetchEmbeddedSummaries().catch(() => [] as SummaryRow[]);
    // Merge both sources if we got some codebase nodes; otherwise use pgRows only
    summaries = summaries.length > 0 ? [...summaries, ...pgRows] : pgRows;
  }

  // Cap at 2000 nodes so downstream GPU ops stay tractable
  if (summaries.length > 2000) summaries = summaries.slice(0, 2000);

  if (summaries.length < 10) {
    return { nodesTagged: 0, hyperedges: 0, gradeA: 0, gradeB: 0, gradeC: 0, gradeD: 0, durationMs: 0, source: 'cpu' };
  }

  // ── Step 0: Pre-ingestion enrichment (Docling / YOLO / VLM / LangGraph) ──────
  // Enriches summary + entity_tags in-place on rows that carry a storage_path.
  // Batched 10 at a time; Promise.allSettled guarantees the pipeline continues
  // even if every external service is down (all failures are silently swallowed).
  const ENRICH_BATCH = 10;
  const rowsWithPath = summaries.filter(s => (s as { storage_path?: string }).storage_path);
  if (rowsWithPath.length > 0) {
    for (let i = 0; i < rowsWithPath.length; i += ENRICH_BATCH) {
      await Promise.allSettled(
        rowsWithPath.slice(i, i + ENRICH_BATCH).map(s =>
          enrichSummaryRow(s as SummaryRow & { storage_path?: string; mime_type?: string })
        )
      );
    }
  }

  const n = summaries.length;
  const k = Math.min(K_CLUSTERS, Math.floor(n / 3));
  const flat = flatF32(summaries.map(s => s.embedding));

  // ── Step 1: SOM (x, y) ──────────────────────────────────────────────────────
  // Codebase nodes carry pre-computed SOM BMU coords from som-topology-pipeline.
  // Use them directly — no need to re-train SOM on already-topologically-grouped data.
  const hasBmuCoords = summaries.every(s => s.somX !== undefined && s.somY !== undefined);
  const somCoords: Array<{ x: number; y: number }> = hasBmuCoords
    ? summaries.map(s => ({ x: s.somX!, y: s.somY! }))
    : await computeSomCoords(summaries.map(s => s.embedding));

  // ── Step 2: k-means (cluster assignments + centroids) ──────────────────────
  const { centroids, labels } = await runGpuKmeans(flat, n, k);

  // ── Step 3: z coordinate = cosine distance from assigned centroid ───────────
  const normCentroids: Float32Array[] = Array.from({ length: k }, (_, c) =>
    l2norm(Array.from(centroids.slice(c * DIM, (c + 1) * DIM)))
  );
  const zCoords = summaries.map((s, i) => {
    const c = labels[i];
    return cosineDist(s.embedding, normCentroids[c]);
  });

  // ── Step 4: GRPO reward score (w coordinate) ────────────────────────────────
  // Score each embedding vs the cluster mean of HIGH-pagerank summaries as anchor
  let wCoords: Float32Array;
  try {
    const { indices: anchorIdxArr } = topKIndices(
      new Float32Array(summaries.map(s => s.relevance_score)),
      Math.min(10, n),
    );
    const anchorIdx = Array.from(anchorIdxArr);
    const anchorMean = new Float32Array(DIM);
    for (const idx of anchorIdx) {
      const emb = summaries[idx].embedding;
      for (let d = 0; d < DIM; d++) anchorMean[d] += emb[d] / anchorIdx.length;
    }
    const anchorNorm = l2norm(Array.from(anchorMean));
    const { scores } = rewardScoreGPU(flat, anchorNorm, n, DIM);
    // Normalize to [0,1]
    const min = Math.min(...scores);
    const range = Math.max(...scores) - min || 1;
    wCoords = new Float32Array(scores.map(s => (s - min) / range));
  } catch {
    wCoords = new Float32Array(summaries.map(s => s.relevance_score));
  }

  // ── Step 5: Build incidence matrix H ────────────────────────────────────────
  const { members, D_e } = await buildIncidenceMatrix(flat, centroids, n, k);

  // ── Step 6: HGNN edge weights from softmax of per-cluster reward scores ─────
  const clusterRewards = new Float32Array(k);
  for (let j = 0; j < k; j++) {
    if (members[j].length === 0) continue;
    clusterRewards[j] = members[j].reduce((sum, i) => sum + wCoords[i], 0) / members[j].length;
  }
  const { probs: edgeWeights } = softmaxGPU(clusterRewards);

  // ── Step 7: HGNN propagation (enriched hyperedge representations X'_j) ──────
  // X_prime[j] = W[j] * Σ_i H[i,j] * X[i] / D_e[j]
  // These are the RL-enriched centroid vectors — semantically weighted by GRPO
  // reward and HGNN attention. Used by:
  //   • QLoRA memory serialization (scoreGRPOReward in gRPC graph-ml-client)
  //   • KAG contextual loading: ACE uses X_prime[top-j] as semantic anchors
  //   • FastMCP agentic deep-research tool: fetches X_prime clusters as context
  //   • Self-modifying LoRA path: X_prime feeds into runKMeans → re-cluster
  //     after RL update, shifting which memories are in each hyperedge
  const X_prime = hgnnPropagate(flat, members, edgeWeights, D_e, n, k);

  // ── Step 8: Assemble HyperNode4D objects ────────────────────────────────────
  // nodeMap enables O(1) id→coordinate lookup used by:
  //   • addressHyperedges() (4D bounding region queries from ACE)
  //   • scoreGRPOReward path: compare X_prime[j] vs nodeMap[id].w
  //   • FastMCP `search_hypergraph` tool: resolve member IDs → 4D coords
  const nodeMap = new Map<string, HyperNode4D>();
  const nodes: HyperNode4D[] = summaries.map((s, i) => {
    const node: HyperNode4D = {
      id:   s.id,
      x:    somCoords[i].x,
      y:    somCoords[i].y,
      z:    zCoords[i],
      w:    wCoords[i],
      type: 'research_summary',
      table: s.table,
    };
    nodeMap.set(s.id, node);
    return node;
  });

  // ── Step 8b: Write manifold4 back to Postgres (durable 4D coordinates) ────────
  writeManifold4ToDB(nodes).catch(() => {}); // fire-and-forget, non-fatal

  // ── Step 9: Assemble HyperEdge objects with grade + summary ──────────────────
  // Determine dominant pipeline per cluster
  const clusterPipelines = members.map(memberIdxs => {
    const freq: Record<string, number> = {};
    for (const i of memberIdxs) {
      const p = summaries[i].pipeline ?? 'ace';
      freq[p] = (freq[p] ?? 0) + 1;
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ace';
  });

  // ── Step 9a: Collect edge metadata (no I/O) ─────────────────────────────────
  interface EdgeDraft {
    j:              number;
    memberIds:      string[];
    memberSummaries: string[];
    gradeScore:     number;
    gradeLabel:     HyperEdgeGrade;
    pipeline:       string;
    summary:        string; // filled in Step 9b
  }
  const drafts: EdgeDraft[] = [];
  const gradeCount = { A: 0, B: 0, C: 0, D: 0 };
  let gpuUsed = false;

  for (let j = 0; j < k; j++) {
    if (members[j].length < 2) continue;

    const memberIds      = members[j].map(i => summaries[i].id);
    const gradeScore     = edgeWeights[j];
    const gradeLabel     = scoreToGrade(gradeScore);
    gradeCount[gradeLabel]++;

    drafts.push({
      j,
      memberIds,
      memberSummaries: members[j].map(i => summaries[i].summary),
      gradeScore,
      gradeLabel,
      pipeline: clusterPipelines[j],
      summary: '',
    });
    gpuUsed = true;
  }

  // ── Step 9b: Batch summarize (SUMMARIZE_BATCH_SIZE parallel at a time) ────────
  // Promise.allSettled keeps going if individual summarizations fail (service down,
  // timeout, etc.). Sequential awaits would make each build take k × ~5s.
  for (let b = 0; b < drafts.length; b += SUMMARIZE_BATCH_SIZE) {
    await Promise.allSettled(
      drafts.slice(b, b + SUMMARIZE_BATCH_SIZE).map(async d => {
        d.summary = await summarizeHyperedge(d.memberSummaries, d.pipeline, d.gradeLabel);
      })
    );
  }

  // ── Step 9c: Build final HyperEdge objects ────────────────────────────────────
  const edges: HyperEdge[] = drafts.map(d => ({
    hash:        edgeHash(d.memberIds),
    type:        'RESEARCH_CLUSTER' as const,
    memberIds:   d.memberIds,
    // X_prime[j] is the HGNN-enriched centroid (reward-weighted mean of member
    // embeddings). More semantically precise than raw k-means centroid.
    // Used by: scoreGRPOReward gRPC path, FastMCP search_hypergraph, KAG
    // LoRA memory loader (reads this vector to select which adapter to load).
    centroid:    Array.from(X_prime.slice(d.j * DIM, (d.j + 1) * DIM)),
    gradeScore:  d.gradeScore,
    gradeLabel:  d.gradeLabel,
    summary:     d.summary,
    pipeline:    d.pipeline,
    memberCount: d.memberIds.length,
    builtAt:     new Date().toISOString(),
  }));

  // ── Step 10: Persist ─────────────────────────────────────────────────────────
  await persistToRedis(edges, nodes);
  syncHypergraphToNeo4j(edges, nodes).catch(() => {}); // fire-and-forget

  // ── Step 11: Publish X_prime memory checkpoints via gRPC ────────────────────
  // Grade A/B edges only — their X_prime centroids are reward-weighted enough
  // to be useful for QLoRA adapter selection. Grade C/D are noise.
  // Falls back to Redis ZSET when gRPC is unavailable.
  const checkpoints: MemoryCheckpoint[] = edges
    .filter(e => e.gradeLabel === 'A' || e.gradeLabel === 'B')
    .map(e => ({
      hyperedgeHash:  e.hash,
      xPrimeCentroid: new Float32Array(e.centroid),
      gradeScore:     e.gradeScore,
      gradeLabel:     e.gradeLabel,
      pipeline:       e.pipeline,
      memberCount:    e.memberCount,
      loraHint:       pipelineToLoraHint(e.pipeline),
    }));
  if (checkpoints.length > 0) {
    publishMemoryCheckpoints(checkpoints).catch(() => {});
  }

  // ── Step 12: Mirror SOM/manifold4 into Qdrant payloads ───────────────────────
  // Adds som_cluster (integer, indexed) + manifold4 to every research_summaries
  // Qdrant point — enables topology prefilter before the 768-dim ANN sweep.
  // This closes the pgvector ↔ Qdrant mirror contract:
  //   Postgres manifold4 real[] = durable truth (offline analytics, cursor pagination)
  //   Qdrant som_cluster payload = fast serving prefilter (live ACE/KAG retrieval)
  updateQdrantClusterPayloads(summaries, labels, somCoords).catch(() => {});

  const durationMs = Date.now() - t0;
  const source     = gpuUsed ? 'gpu' : 'cpu';

  // ── Step 13: Record rl_adapt timeline event ───────────────────────────────
  // Timestamps every rebuild cycle so the admin dashboard can audit when
  // self-modification occurred and what quality it produced (grade distribution).
  // grpoReward = fraction of Grade A/B edges as proxy for overall build quality.
  const qualityScore = edges.length > 0
    ? (gradeCount.A + gradeCount.B) / edges.length
    : 0;
  db.insert(contextTimeline).values({
    sessionId:        '',
    eventType:        'rl_adapt',
    pipeline:         'ace',
    grpoReward:       qualityScore,
    triggeredRebuild: true,
    payload: {
      nodesTagged: n,
      hyperedges:  edges.length,
      gradeA:      gradeCount.A,
      gradeB:      gradeCount.B,
      gradeC:      gradeCount.C,
      gradeD:      gradeCount.D,
      durationMs,
      source,
    } as Record<string, unknown>,
  }).catch(() => { /* non-fatal */ });

  return {
    nodesTagged: n,
    hyperedges:  edges.length,
    gradeA:      gradeCount.A,
    gradeB:      gradeCount.B,
    gradeC:      gradeCount.C,
    gradeD:      gradeCount.D,
    durationMs,
    source,
  };
}

// ── Query APIs ─────────────────────────────────────────────────────────────────

/** Get top-N hyperedges by grade score. */
export async function queryTopHyperedges(
  minGrade: HyperEdgeGrade = 'B',
  limit:    number          = 10,
): Promise<HyperEdge[]> {
  const redis = getRedis();
  const minScore = minGrade === 'A' ? GRADE_A : minGrade === 'B' ? GRADE_B : minGrade === 'C' ? GRADE_C : 0;
  const hashes = await redis
    .zrevrangebyscore(HG_IDX_KEY, 1, minScore, 'LIMIT', 0, limit)
    .catch(() => [] as string[]);
  if (!hashes.length) return [];
  const raw = await redis.mget(hashes.map(h => HG_EDGE_KEY(h))).catch(() => [] as (string|null)[]);

  // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. HyperEdge records carry
  // node arrays + tags + grade metadata — typical 2-6KB per edge so 10+
  // hyperedges easily clear the threshold.
  const totalChars = raw.reduce((sum, r) => sum + (r?.length ?? 0), 0);
  let parseFn: (s: string) => HyperEdge = (s) => JSON.parse(s) as HyperEdge;
  if (raw.length >= 10 && totalChars >= 5_000) {
    try {
      const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
      if (isSimdJsonAvailable()) parseFn = fastJsonParse<HyperEdge>;
    } catch { /* addon unavailable — keep V8 */ }
  }

  const out: HyperEdge[] = [];
  for (const r of raw) {
    if (!r) continue;
    try { out.push(parseFn(r)); } catch { /* */ }
  }
  return out;
}

/** Get the 4D coordinates for a specific node. */
export async function getNode4D(nodeId: string): Promise<HyperNode4D | null> {
  try {
    const raw = await getRedis().get(HG_COORD_KEY(nodeId));
    return raw ? (JSON.parse(raw) as HyperNode4D) : null;
  } catch {
    return null;
  }
}

/**
 * ACE contextual addressing: find hyperedges within a 4D bounding region.
 * Address: { x_range, y_range, z_max, w_min }
 *
 * Used by ACE context assembly to inject relevant hyperedge summaries:
 *   "find high-reward (w>0.6) hyperedges near this SOM region (x 8-14, y 4-10)"
 */
export async function addressHyperedges(opts: {
  xRange?:  [number, number];   // [x_min, x_max]
  yRange?:  [number, number];
  zMax?:    number;              // max semantic depth (0=at centroid)
  wMin?:    number;              // min reward score
  limit?:   number;
}): Promise<HyperEdge[]> {
  const { xRange, yRange, zMax, wMin = 0, limit = 5 } = opts;
  const all = await queryTopHyperedges('D', 100);
  const redis = getRedis();

  const filtered: HyperEdge[] = [];
  for (const edge of all) {
    if (edge.gradeScore < wMin) continue;

    // Check if enough members fall within the 4D region
    const memberSlice = edge.memberIds.slice(0, 20);
    const coordKeys   = memberSlice.map(id => HG_COORD_KEY(id));
    const coordRaws   = await redis.mget(...coordKeys).catch(() => [] as Array<string | null>);

    // simdjson AVX2 fast-parse for ≥10/≥5KB aggregate. HyperNode4D
    // contains 4 floats + type — typical 200B per node so 20 members
    // is ~4KB. Threshold check below handles smaller batches.
    const totalChars = coordRaws.reduce((sum, r) => sum + (r?.length ?? 0), 0);
    let parseNode: (s: string) => HyperNode4D = (s) => JSON.parse(s) as HyperNode4D;
    if (coordRaws.length >= 10 && totalChars >= 5_000) {
      try {
        const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
        if (isSimdJsonAvailable()) parseNode = fastJsonParse<HyperNode4D>;
      } catch { /* addon unavailable — keep V8 */ }
    }

    let inRegion = 0;
    for (const raw of coordRaws) {
      if (!raw) continue;
      try {
        const node = parseNode(raw);
        const xOk = !xRange || (node.x >= xRange[0] && node.x <= xRange[1]);
        const yOk = !yRange || (node.y >= yRange[0] && node.y <= yRange[1]);
        const zOk = zMax === undefined || node.z <= zMax;
        const wOk = node.w >= wMin;
        if (xOk && yOk && zOk && wOk) inRegion++;
      } catch { continue; }
    }

    if (inRegion >= 2) filtered.push(edge);
    if (filtered.length >= limit) break;
  }

  return filtered;
}

/** Hypergraph build stats. */
export async function getHypergraphStats(): Promise<{
  builtAt:    string | null;
  totalEdges: number;
  gradeA:     number;
  gradeB:     number;
  gradeC:     number;
  gradeD:     number;
}> {
  const redis = getRedis();
  const [builtAt, total, a, b, c] = await Promise.all([
    redis.get(HG_BUILT_KEY).catch(() => null),
    redis.zcard(HG_IDX_KEY).catch(() => 0),
    redis.zcount(HG_IDX_KEY, GRADE_A, 1).catch(() => 0),
    redis.zcount(HG_IDX_KEY, GRADE_B, GRADE_A - 0.001).catch(() => 0),
    redis.zcount(HG_IDX_KEY, GRADE_C, GRADE_B - 0.001).catch(() => 0),
  ]);
  const d = Number(total) - Number(a) - Number(b) - Number(c);
  return {
    builtAt,
    totalEdges: Number(total),
    gradeA: Number(a),
    gradeB: Number(b),
    gradeC: Number(c),
    gradeD: Math.max(0, d),
  };
}

/** Invalidate the entire hypergraph cache. */
export async function invalidateHypergraph(): Promise<void> {
  const redis = getRedis();
  const [edgeKeys, coordKeys] = await Promise.all([
    redis.keys('hg:edge:*').catch(() => [] as string[]),
    redis.keys('hg:4d:*').catch(() => [] as string[]),
  ]);
  const all = [...edgeKeys, ...coordKeys, HG_IDX_KEY, HG_BUILT_KEY];
  if (all.length) await redis.del(...all).catch(() => {});
}

// ── Adaptive Memory Interface ──────────────────────────────────────────────────
//
// Self-modification loop:
//   user query → selectAdaptiveMemory → X_prime centroid injected into system prompt
//   → inference → user signal → adaptFromAnalytics
//   → RL policy update (rlpolicy:pipeline_weights)
//   → threshold crossed → buildHypergraph4D() rebuild
//   → new X_prime centroids shift which memories future queries receive
//
// External consumers:
//   turbo-prefix-cache.ts  — enriches system prompt with top-K memory summaries
//   ACE context-assembler  — injects hyperedge summaries above retrieval chunks
//   FastMCP search_hypergraph tool — returns MemoryModule[] for agentic workflows
//   QLoRA distillation path — publishes X_prime via publishMemoryCheckpoints (step 11)

/** A loadable memory module returned by selectAdaptiveMemory. */
export interface MemoryModule {
  hyperedgeHash:  string;
  gradeLabel:     HyperEdgeGrade;
  gradeScore:     number;
  pipeline:       string;
  summary:        string;        // gemma4-rotorquant:latest ACE synthesis of cluster members
  xPrimeCentroid: number[];      // 768-dim HGNN-enriched centroid (reward-weighted)
  memberCount:    number;
  similarity:     number;        // cosine similarity to the incoming query embedding
  loraHint:       string;        // suggested LoRA adapter: 'legal_rag' | 'legal_kag' | …
}

/** User analytics signal that drives RL policy adaptation. */
export interface AnalyticsSignal {
  signal:         'thumbs_up' | 'thumbs_down' | 'dwell_long' | 'dwell_short' | 'citation_saved';
  pipeline:       'ace' | 'rag' | 'kag' | 'dag' | 'codebase';
  hyperedgeHash?: string;  // which memory module was active when the signal fired
  userId?:        string;
  sessionId?:     string;
}

// Reward deltas applied to the pipeline weight in rlpolicy:pipeline_weights
const SIGNAL_DELTA: Record<AnalyticsSignal['signal'], number> = {
  citation_saved: +0.05,
  thumbs_up:      +0.04,
  dwell_long:     +0.02,
  dwell_short:    -0.01,
  thumbs_down:    -0.04,
};
const ADAPT_WEIGHT_MIN  = 0.5;
const ADAPT_WEIGHT_MAX  = 2.0;
const ADAPT_REBUILD_THRESHOLD = 8; // pending signals before async rebuild fires

/** Cosine similarity between two L2-normalised 768-dim vectors. */
function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length, DIM);
  let dot = 0;
  for (let d = 0; d < len; d++) dot += a[d] * b[d];
  return Math.max(-1, Math.min(1, dot));
}

/**
 * Select the top-K hyperedge memory modules whose X_prime centroid best matches
 * the incoming query embedding (cosine similarity).
 *
 * The returned MemoryModule[] is injected into the system prompt by
 * turbo-prefix-cache / ACE context-assembler so the LLM "loads" relevant
 * knowledge anchors before generating a response.
 *
 * Falls back to empty array (non-fatal) if the hypergraph is not yet built.
 */
export async function selectAdaptiveMemory(
  queryEmb: number[] | Float32Array,
  topK = 3,
): Promise<MemoryModule[]> {
  const query: number[] = queryEmb instanceof Float32Array
    ? Array.from(queryEmb)
    : queryEmb;

  // Fetch up to topK×6 candidates (Grades A–C) then re-rank by cosine sim
  const edges = await queryTopHyperedges('C', Math.min(topK * 6, 60)).catch(() => [] as HyperEdge[]);
  if (!edges.length) return [];

  const candidates = edges.filter(e => e.centroid?.length >= DIM);
  if (!candidates.length) return [];

  // H6: FP16 synthesis-lane rerank — use GPU cosine if available, CPU fallback
  let sims: number[];
  try {
    const centroids = candidates.map(e => e.centroid);
    const result = await batchCosineSimilarityFp16(query, centroids);
    sims = result.scores;
    if (!Array.isArray(sims) || sims.length !== candidates.length) throw new Error('shape mismatch');
  } catch {
    sims = candidates.map(e => cosineSim(query, e.centroid));
  }

  return candidates
    .map((e, i) => ({ e, sim: sims[i] ?? cosineSim(query, e.centroid) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)
    .map(({ e, sim }) => ({
      hyperedgeHash:  e.hash,
      gradeLabel:     e.gradeLabel,
      gradeScore:     e.gradeScore,
      pipeline:       e.pipeline,
      summary:        e.summary,
      xPrimeCentroid: e.centroid,
      memberCount:    e.memberCount,
      similarity:     sim,
      loraHint:       pipelineToLoraHint(e.pipeline),
    }));
}

/**
 * Receive a user analytics signal, update the RL policy weights, and trigger
 * an async hypergraph rebuild when enough signals have accumulated.
 *
 * How the LLM adapts itself:
 *   1. Delta applied to pipeline weight  → rlpolicy:pipeline_weights in Redis
 *   2. Pending count incremented         → hg:adapt:pending in Redis
 *   3. If pending ≥ ADAPT_REBUILD_THRESHOLD:
 *        → rebuild fires (buildHypergraph4D)
 *        → new X_prime centroids computed with updated reward weighting
 *        → selectAdaptiveMemory returns different knowledge anchors
 *        → LLM sees updated context shaped by accumulated user feedback
 *
 * Positive signals on a hyperedgeHash are tracked in rl:memory:positive_signals
 * ZSET for future QLoRA distillation (high-signal edges → training pairs).
 *
 * Always fire-and-forget — never throws, never delays the response path.
 */
export async function adaptFromAnalytics(signal: AnalyticsSignal): Promise<void> {
  try {
    const redis = getRedis();
    const delta = SIGNAL_DELTA[signal.signal] ?? 0;
    if (delta === 0) return;

    // 1. Update pipeline weight (clamped to [0.5, 2.0])
    const raw = await redis.get('rlpolicy:pipeline_weights').catch(() => null);
    const policy: Record<string, number | string> = raw ? JSON.parse(raw) : {};
    const current = typeof policy[signal.pipeline] === 'number'
      ? (policy[signal.pipeline] as number)
      : 1.0;
    const newWeight = Math.max(
      ADAPT_WEIGHT_MIN,
      Math.min(ADAPT_WEIGHT_MAX, current + delta),
    );
    policy[signal.pipeline] = newWeight;
    policy.updatedAt = new Date().toISOString();
    await redis.set('rlpolicy:pipeline_weights', JSON.stringify(policy), 'EX', 24 * 60 * 60).catch(() => {});

    // 2. Record positive signal on the active memory module (distillation seed)
    if (signal.hyperedgeHash && delta > 0) {
      await redis
        .zadd('rl:memory:positive_signals', 1, signal.hyperedgeHash)
        .catch(() => {});
    }

    // 3. Accumulate pending count; trigger rebuild at threshold
    const pending = Number(await redis.incr('hg:adapt:pending').catch(() => 0));
    let rebuiltTriggered = false;
    if (pending >= ADAPT_REBUILD_THRESHOLD) {
      await redis.del('hg:adapt:pending').catch(() => {});
      rebuiltTriggered = true;
      // Defer by 200ms so the current request finishes before the rebuild starts
      setTimeout(() => { buildHypergraph4D().catch(() => {}); }, 200);
    }

    // 4. Durable timeline record — closes the RL audit trail + QLoRA distillation seed
    db.insert(contextTimeline).values({
      userId:              signal.userId ? Number(signal.userId) : null,
      sessionId:           signal.sessionId     ?? '',
      eventType:           'feedback',
      pipeline:            signal.pipeline,
      hyperedgeHash:       signal.hyperedgeHash ?? null,
      signal:              signal.signal,
      grpoReward:          delta,
      pipelineWeightAfter: newWeight,
      triggeredRebuild:    rebuiltTriggered,
      payload:             { previousWeight: current } as Record<string, unknown>,
    }).catch(() => { /* non-fatal */ });
  } catch {
    // Non-fatal
  }
}
