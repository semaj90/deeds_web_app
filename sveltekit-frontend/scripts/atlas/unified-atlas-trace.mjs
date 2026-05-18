#!/usr/bin/env node
/**
 * unified-atlas-trace.mjs
 *
 * CHR97 fast path first, TRACE MCP fallback on low confidence, then
 * deterministic context fusion with sourceRefs.
 *
 * Usage:
 *   node --import tsx scripts/atlas/unified-atlas-trace.mjs --query "how does x handle errors"
 *   node --import tsx scripts/atlas/unified-atlas-trace.mjs --query "..." --dry-run --json
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runCHR97Search } from '../../src/lib/server/ace/context-assembler.ts';
import { collectSourceRefs, fuseContext, normalizeSourceRef } from './ace-context-fusion.mjs';
import { runRgAsync } from '../rg-atlas/run-rg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MCP_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const DEFAULT_LIMIT = 8;
const DEFAULT_TOP_K = 12;
const DEFAULT_THRESHOLD = 0.45;

function clampInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function clampFloat(value, fallback, min, max) {
  const num = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function asJsonText(payload) {
  const content = payload?.result?.content ?? payload?.content ?? [];
  if (!Array.isArray(content)) return null;
  const text = content.map((item) => item?.text ?? '').join('').trim();
  return text || null;
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function extractList(payload, keys = ['results', 'hits', 'items', 'rows']) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (Array.isArray(payload.result)) return payload.result;
  return [];
}

function scoreFromPosition(index, total) {
  if (total <= 0) return 0.5;
  return Math.max(0.2, 1 - index / Math.max(1, total));
}

function normalizeKagHit(hit) {
  const stableKey = hit?.stableKey ?? hit?.filePath ?? hit?.file_path ?? hit?.path ?? null;
  const sourceRef = normalizeSourceRef(stableKey ?? hit?.source_path ?? hit?.id ?? null);
  return {
    source: 'trace.kag_search',
    stableKey,
    source_ref: sourceRef,
    filePath: hit?.filePath ?? hit?.file_path ?? hit?.path ?? null,
    title: hit?.title ?? hit?.label ?? hit?.path ?? null,
    content: hit?.content ?? hit?.text ?? hit?.summary ?? '',
    qdrant_score: Number(hit?.score ?? hit?.semantic_score ?? hit?.similarity ?? 0) || 0,
    pagerank_score: Number(hit?.pagerank_score ?? hit?.pagerank ?? 0) || 0,
    topology_score: Number(hit?.topology_score ?? hit?.graph_score ?? 0) || 0,
    redis_hot: Number(hit?.redis_hot ?? hit?.hotScore ?? 0) || 0,
    freshness: Number(hit?.freshness ?? hit?.recency ?? 0) || 0,
    llm_synthesis_weight: Number(hit?.llm_synthesis_weight ?? hit?.score ?? 0) || 0,
    why: hit?.why ?? hit?.reason ?? null,
  };
}

function normalizePostgresHit(hit) {
  const stableKey = hit?.stableKey ?? hit?.filePath ?? hit?.file_path ?? hit?.path ?? null;
  const sourceRef = normalizeSourceRef(stableKey ?? hit?.source_path ?? hit?.id ?? null);
  return {
    source: 'search.postgres_fts',
    stableKey,
    source_ref: sourceRef,
    filePath: hit?.filePath ?? hit?.file_path ?? hit?.path ?? null,
    title: hit?.title ?? hit?.label ?? hit?.path ?? null,
    content: hit?.content ?? hit?.text ?? hit?.summary ?? '',
    qdrant_score: Number(hit?.score ?? hit?.rank ?? 0) || 0,
    pagerank_score: Number(hit?.pagerank_score ?? hit?.pagerank ?? 0) || 0,
    topology_score: Number(hit?.topology_score ?? hit?.graph_score ?? 0) || 0,
    redis_hot: Number(hit?.redis_hot ?? hit?.hotScore ?? 0) || 0,
    freshness: Number(hit?.freshness ?? hit?.recency ?? 0) || 0,
    llm_synthesis_weight: Number(hit?.llm_synthesis_weight ?? hit?.score ?? 0) || 0,
    why: hit?.why ?? hit?.reason ?? null,
  };
}

function normalizeGraphNeighbor(neighbor, index, total, center) {
  const stableKey = neighbor?.stableKey ?? neighbor?.filePath ?? neighbor?.file_path ?? neighbor?.path ?? null;
  const sourceRef = normalizeSourceRef(stableKey ?? neighbor?.id ?? null);
  const topologyScore = scoreFromPosition(index, total);
  return {
    source: 'graph.expand_neighborhood',
    center,
    stableKey,
    source_ref: sourceRef,
    filePath: neighbor?.filePath ?? neighbor?.file_path ?? neighbor?.path ?? null,
    title: neighbor?.label ?? neighbor?.title ?? neighbor?.stableKey ?? null,
    content: neighbor?.content ?? '',
    qdrant_score: Number(neighbor?.score ?? 0) || 0,
    pagerank_score: Number(neighbor?.pagerank_score ?? neighbor?.pagerank ?? 0) || 0,
    topology_score: Number(neighbor?.topology_score ?? topologyScore) || topologyScore,
    redis_hot: Number(neighbor?.redis_hot ?? 0) || 0,
    freshness: Number(neighbor?.freshness ?? 0) || 0,
    llm_synthesis_weight: Number(neighbor?.llm_synthesis_weight ?? topologyScore) || topologyScore,
    why: neighbor?.relation ?? neighbor?.lastRelation ?? null,
  };
}

function normalizeChr97Chunk(chunk) {
  const stableKey = chunk?.stableKey ?? (chunk?.path ? `file:${chunk.path}` : null);
  const sourceRef = normalizeSourceRef(stableKey ?? chunk?.path ?? null);
  return {
    source: 'chr97',
    stableKey,
    source_ref: sourceRef,
    filePath: chunk?.path ?? chunk?.filePath ?? null,
    title: chunk?.path ?? chunk?.label ?? chunk?.stableKey ?? null,
    content: chunk?.content ?? chunk?.summary ?? '',
    qdrant_score: Number(chunk?.score ?? 0) || 0,
    pagerank_score: Number(chunk?.pagerank_score ?? chunk?.pagerank ?? 0) || 0,
    topology_score: Number(chunk?.topology_score ?? chunk?.topoScore ?? 0) || 0,
    redis_hot: Number(chunk?.redis_hot ?? chunk?.hotScore ?? 0) || 0,
    freshness: Number(chunk?.freshness ?? chunk?.recency ?? 0) || 0,
    llm_synthesis_weight: Number(chunk?.llm_synthesis_weight ?? chunk?.score ?? 0) || 0,
    feature_key: chunk?.feature_key ?? chunk?.featureKey ?? null,
    cluster_id: chunk?.cluster_id ?? chunk?.clusterId ?? null,
    why: chunk?.why ?? chunk?.reason ?? null,
  };
}

function normalizeRgChunk(hit, index) {
  const sourceRef = normalizeSourceRef(hit?.file ?? hit?.filePath ?? hit?.path ?? hit?.source_ref ?? null);
  const score = Number(hit?.score ?? 0.45 - index * 0.02) || 0;
  return {
    source: 'trace.rg_search',
    stableKey: sourceRef ? `rg:${sourceRef}` : null,
    source_ref: sourceRef,
    filePath: hit?.file ?? hit?.filePath ?? hit?.path ?? null,
    title: hit?.file ?? hit?.filePath ?? hit?.path ?? null,
    content: hit?.snippet ?? hit?.text ?? '',
    qdrant_score: score,
    pagerank_score: 0,
    topology_score: 0.1,
    redis_hot: 0,
    freshness: 0,
    llm_synthesis_weight: score,
    why: 'ripgrep lexical match',
  };
}

async function callTraceTool(name, argumentsObject, timeoutMs = 20_000) {
  const endpoint = MCP_URL.endsWith('/mcp') ? MCP_URL : `${MCP_URL}/mcp`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: argumentsObject },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const line = text.split('\n').find((entry) => entry.startsWith('data:') || entry.startsWith('{'));
  const raw = line?.startsWith('data:') ? line.slice(5).trim() : line ?? text;
  const payload = JSON.parse(raw);
  const content = asJsonText(payload);
  return tryParseJson(content) ?? payload;
}

async function gatherFallback(query, limit, centerStableKey) {
  const planned = [
    { name: 'trace.kag_search', args: { query, limit } },
    { name: 'search.postgres_fts', args: { query, limit } },
    { name: 'trace.explain_retrieval', args: { query } },
    centerStableKey
      ? { name: 'graph.expand_neighborhood', args: { stableKey: centerStableKey, depth: 2, limit: 24 } }
      : null,
  ].filter(Boolean);

  const results = {};
  const settled = await Promise.allSettled(
    planned.map(async (entry) => ({
      name: entry.name,
      value: await callTraceTool(entry.name, entry.args, entry.name === 'trace.kag_search' ? 30_000 : 20_000),
    })),
  );

  for (let index = 0; index < settled.length; index += 1) {
    const entry = planned[index];
    const settledResult = settled[index];
    if (settledResult.status === 'fulfilled') {
      results[entry.name] = settledResult.value.value;
    } else {
      results[entry.name] = { error: settledResult.reason instanceof Error ? settledResult.reason.message : String(settledResult.reason) };
    }
  }

  return results;
}

function flattenFallbackCandidates(fallback) {
  const candidates = [];

  for (const hit of extractList(fallback['trace.kag_search'])) {
    candidates.push(normalizeKagHit(hit));
  }

  for (const hit of extractList(fallback['search.postgres_fts'])) {
    candidates.push(normalizePostgresHit(hit));
  }

  const graphPayload = fallback['graph.expand_neighborhood'];
  const graphCenter = graphPayload?.center ?? graphPayload?.stableKey ?? null;
  const graphNeighbors = extractList(graphPayload?.neighbors ?? graphPayload?.nodes ?? graphPayload);
  graphNeighbors.forEach((neighbor, index) => {
    candidates.push(normalizeGraphNeighbor(neighbor, index, graphNeighbors.length, graphCenter));
  });

  return candidates;
}

async function main() {
  const { values: flags, positionals } = parseArgs({
    options: {
      query: { type: 'string' },
      limit: { type: 'string' },
      topK: { type: 'string' },
      threshold: { type: 'string' },
      userId: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean', default: false },
      dryRun: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const query = String(flags.query ?? positionals.join(' ').trim() ?? '').trim();
  if (!query) {
    console.error('Usage: node --import tsx scripts/atlas/unified-atlas-trace.mjs --query "..."');
    process.exit(1);
  }

  const limit = clampInt(flags.limit, DEFAULT_LIMIT, 1, 50);
  const topK = clampInt(flags.topK, DEFAULT_TOP_K, 1, 50);
  const threshold = clampFloat(flags.threshold, DEFAULT_THRESHOLD, 0, 1);
  const dryRun = Boolean(flags.dryRun || process.argv.includes('--dry-run'));
  const startedAt = Date.now();

  if (dryRun) {
    const planned = {
      query,
      mode: 'dry-run',
      limit,
      topK,
      threshold,
      plannedStages: [
        'chr97.fast_path',
        'trace.kag_search',
        'rg.lexical_search',
        'graph.expand_neighborhood',
        'search.postgres_fts',
        'trace.explain_retrieval',
        'ace-context-fusion',
      ],
      sourceRefs: [],
      latencyMs: Date.now() - startedAt,
    };
    if (flags.json) {
      console.log(JSON.stringify(planned, null, 2));
    } else {
      console.log(`[atlas:unified:trace] dry-run for "${query}"`);
      console.log(`[atlas:unified:trace] stages: ${planned.plannedStages.join(' -> ')}`);
    }
    if (flags.out) {
      const outputPath = path.isAbsolute(flags.out) ? flags.out : path.resolve(ROOT, flags.out);
      await writeFile(outputPath, JSON.stringify(planned, null, 2), 'utf8');
    }
    return;
  }

  const chr97 = await runCHR97Search(query, limit, flags.userId ?? undefined);
  const chr97Candidates = (chr97.topChunks ?? []).map(normalizeChr97Chunk);
  const fastPathHit = chr97.confidence >= threshold && chr97Candidates.length > 0;

  let fallback = {};
  let traceExplain = null;
  let rgCandidates = [];
  let lexicalHitCount = 0;

  if (!fastPathHit) {
    const centerStableKey = chr97Candidates[0]?.stableKey ?? (chr97Candidates[0]?.filePath ? `file:${chr97Candidates[0].filePath}` : null);
    const rgPromise = runRgAsync(query, ['src', 'scripts']);
    fallback = await gatherFallback(query, limit, centerStableKey);
    const rgHits = await rgPromise;
    rgCandidates = rgHits.map(normalizeRgChunk);
    lexicalHitCount = rgCandidates.length;
    traceExplain = fallback['trace.explain_retrieval'] ?? null;
  }

  const fallbackCandidates = fastPathHit ? [] : flattenFallbackCandidates(fallback);
  const fused = fuseContext({
    query,
    mode: fastPathHit ? 'chr97-fast-path' : 'deep-trace',
    threshold,
    topK,
    fastPathConfidence: chr97.confidence,
    candidates: [...chr97Candidates, ...fallbackCandidates, ...rgCandidates],
  });

  const sourceRefs = collectSourceRefs(fused.ranked);
  const result = {
    query,
    mode: fused.mode,
    threshold,
    limit,
    topK,
    fastPath: {
      hit: fastPathHit,
      confidence: chr97.confidence,
      topChunkCount: chr97Candidates.length,
      topRefs: collectSourceRefs(chr97Candidates).slice(0, 8),
    },
    sourceRefs,
    trace: {
      explainRetrieval: traceExplain,
      kagSearch: fallback['trace.kag_search'] ?? null,
      graphExpand: fallback['graph.expand_neighborhood'] ?? null,
      postgresFts: fallback['search.postgres_fts'] ?? null,
      rgSearch: lexicalHitCount > 0 ? { count: lexicalHitCount, results: rgCandidates } : null,
    },
    fusion: fused,
    lexicalHitCount,
    latencyMs: Date.now() - startedAt,
  };

  if (flags.out) {
    const outputPath = path.isAbsolute(flags.out) ? flags.out : path.resolve(ROOT, flags.out);
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`[atlas:unified:trace] query="${query}"`);
  console.log(`[atlas:unified:trace] chr97 confidence=${chr97.confidence.toFixed(3)} threshold=${threshold.toFixed(2)} fastPath=${fastPathHit ? 'yes' : 'no'}`);
  console.log(`[atlas:unified:trace] ranked=${fused.ranked.length} sourceRefs=${sourceRefs.length} latency=${result.latencyMs}ms`);
  if (flags.verbose && fused.topCandidate) {
    console.log(`[atlas:unified:trace] top=${fused.topCandidate.source_ref ?? 'unknown'} score=${fused.topCandidate.score.toFixed(3)}`);
  }
}

const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[atlas:unified:trace] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
