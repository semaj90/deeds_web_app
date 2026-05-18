#!/usr/bin/env node
/**
 * ace-context-fusion.mjs
 *
 * Deterministically merges candidate context from CHR97, TRACE MCP, graph
 * expansion, and lexical retrieval into a single ranked context payload.
 *
 * Usage:
 *   node scripts/atlas/ace-context-fusion.mjs --input scratch/trace.json
 *   node scripts/atlas/ace-context-fusion.mjs --query "how does x work?" --input scratch/candidates.json
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const SCORE_WEIGHTS = {
  cosine: 0.45,
  pagerank: 0.20,
  topology: 0.15,
  redisHot: 0.10,
  freshness: 0.10,
};

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSourceRef(value) {
  if (value == null) return null;
  let text = String(value).trim();
  if (!text) return null;

  if (text.startsWith('file:///')) {
    try {
      text = decodeURIComponent(new URL(text).pathname.replace(/^\//, ''));
    } catch {
      text = text.slice('file:///'.length);
    }
  } else if (text.startsWith('file:')) {
    text = text.slice('file:'.length);
  }

  text = text.replace(/\\/g, '/').replace(/^\/+/u, '');

  const rootPrefix = ROOT.replace(/\\/g, '/').replace(/\/+$/u, '') + '/';
  if (text.startsWith(rootPrefix)) {
    text = text.slice(rootPrefix.length);
  }

  const repoPrefix = 'sveltekit-frontend/';
  if (text.startsWith(repoPrefix)) {
    text = text.slice(repoPrefix.length);
  }

  return text || null;
}

function sourceRefFromCandidate(candidate) {
  return normalizeSourceRef(
    candidate?.source_ref ??
    candidate?.sourceRef ??
    candidate?.stableKey ??
    candidate?.filePath ??
    candidate?.file_path ??
    candidate?.path ??
    candidate?.source_path ??
    candidate?.file ??
    candidate?.id ??
    null,
  );
}

function dedupeKey(candidate) {
  const sourceRef = sourceRefFromCandidate(candidate);
  if (sourceRef) return sourceRef;
  if (candidate?.cluster_id != null) return `cluster:${candidate.cluster_id}`;
  if (candidate?.feature_key) return `feature:${candidate.feature_key}`;
  return (
    candidate?.label ??
    candidate?.title ??
    candidate?.stableKey ??
    candidate?.filePath ??
    candidate?.path ??
    JSON.stringify(candidate ?? {}).slice(0, 120)
  );
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter(Boolean).map((value) => String(value)))];
}

function mergeCandidate(existing, incoming) {
  const sourceRefs = uniqueStrings([
    ...(existing.sourceRefs ?? []),
    ...(incoming.sourceRefs ?? []),
    sourceRefFromCandidate(existing),
    sourceRefFromCandidate(incoming),
  ]);

  return {
    ...existing,
    ...incoming,
    sourceRefs,
    source_ref: sourceRefs[0] ?? null,
    stableKey: existing.stableKey ?? incoming.stableKey ?? null,
    filePath: existing.filePath ?? incoming.filePath ?? null,
    file_path: existing.file_path ?? incoming.file_path ?? null,
    path: existing.path ?? incoming.path ?? null,
    feature_key: existing.feature_key ?? incoming.feature_key ?? null,
    cluster_id: existing.cluster_id ?? incoming.cluster_id ?? null,
    title: existing.title ?? incoming.title ?? null,
    content: existing.content ?? incoming.content ?? null,
    why: uniqueStrings([existing.why, incoming.why]).join(' | ') || null,
    qdrant_score: Math.max(toNumber(existing.qdrant_score), toNumber(incoming.qdrant_score)),
    pagerank_score: Math.max(toNumber(existing.pagerank_score), toNumber(incoming.pagerank_score)),
    topology_score: Math.max(toNumber(existing.topology_score), toNumber(incoming.topology_score)),
    redis_hot: Math.max(toNumber(existing.redis_hot), toNumber(incoming.redis_hot)),
    freshness: Math.max(toNumber(existing.freshness), toNumber(incoming.freshness)),
    llm_synthesis_weight: Math.max(
      toNumber(existing.llm_synthesis_weight),
      toNumber(incoming.llm_synthesis_weight),
    ),
    sources: uniqueStrings([...(existing.sources ?? []), ...(incoming.sources ?? [])]),
    evidence: existing.evidence ?? incoming.evidence ?? null,
  };
}

export function scoreCandidate(candidate) {
  const qdrantScore = clamp01(
    candidate?.qdrant_score ?? candidate?.semantic_score ?? candidate?.score ?? candidate?.cosine ?? candidate?.similarity,
  );
  const pagerankScore = clamp01(
    candidate?.pagerank_score ?? candidate?.pageRankScore ?? candidate?.pagerank ?? candidate?.authority ?? candidate?._pagerank_score,
  );
  const topologyScore = clamp01(
    candidate?.topology_score ?? candidate?.topologyScore ?? candidate?.graph_score ?? candidate?._topology_score ?? candidate?.community_score,
  );
  const redisHot = clamp01(
    candidate?.redis_hot ?? candidate?.redisHot ?? candidate?.hot_score ?? candidate?.hotScore ?? candidate?.cache_score,
  );
  const freshness = clamp01(
    candidate?.freshness ?? candidate?.recency ?? candidate?.fresh_score ?? candidate?.ageScore,
  );
  const llmSynthesisWeight = clamp01(
    candidate?.llm_synthesis_weight ?? candidate?.synthesis_weight ?? candidate?.synthesisScore ?? qdrantScore,
  );

  const score =
    SCORE_WEIGHTS.cosine * qdrantScore +
    SCORE_WEIGHTS.pagerank * pagerankScore +
    SCORE_WEIGHTS.topology * topologyScore +
    SCORE_WEIGHTS.redisHot * redisHot +
    SCORE_WEIGHTS.freshness * freshness;

  return {
    ...candidate,
    qdrant_score: qdrantScore,
    pagerank_score: pagerankScore,
    topology_score: topologyScore,
    redis_hot: redisHot,
    freshness,
    llm_synthesis_weight: llmSynthesisWeight,
    score,
    scoreBreakdown: {
      cosine: qdrantScore,
      pagerank: pagerankScore,
      topology: topologyScore,
      redis_hot: redisHot,
      freshness,
    },
  };
}

export function collectSourceRefs(candidates) {
  const refs = [];
  const seen = new Set();
  for (const candidate of candidates ?? []) {
    for (const ref of candidate?.sourceRefs ?? [sourceRefFromCandidate(candidate)]) {
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

export function normalizeCandidates(candidates) {
  const merged = new Map();
  for (const candidate of candidates ?? []) {
    if (!candidate) continue;
    const normalized = {
      ...candidate,
      source_ref: sourceRefFromCandidate(candidate),
      sourceRefs: uniqueStrings([
        ...(candidate.sourceRefs ?? []),
        sourceRefFromCandidate(candidate),
      ]),
    };
    const key = dedupeKey(normalized);
    if (!merged.has(key)) {
      merged.set(key, normalized);
    } else {
      merged.set(key, mergeCandidate(merged.get(key), normalized));
    }
  }
  return [...merged.values()];
}

export function fuseContext(input = {}) {
  const query = String(input.query ?? '').trim();
  const mode = input.mode ?? 'deep-path';
  const threshold = clamp01(input.threshold ?? 0.7);
  const topK = Math.max(1, Math.min(50, toNumber(input.topK, 12) || 12));
  const fastPathConfidence = clamp01(input.fastPathConfidence ?? input.chr97Confidence ?? 0);
  const candidates = normalizeCandidates(Array.isArray(input.candidates) ? input.candidates : []);
  const scored = candidates.map(scoreCandidate).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return toNumber(right.llm_synthesis_weight) - toNumber(left.llm_synthesis_weight);
  });
  const ranked = scored.slice(0, topK).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    source_ref: candidate.source_ref ?? sourceRefFromCandidate(candidate),
  }));
  const sourceRefs = collectSourceRefs(ranked);

  return {
    query,
    mode,
    threshold,
    fastPathConfidence,
    candidateCount: candidates.length,
    sourceRefs,
    topCandidate: ranked[0] ?? null,
    ranked,
    rankingFormula: '0.45*cosine + 0.20*pagerank + 0.15*topology + 0.10*redis_hot + 0.10*freshness',
  };
}

async function readJsonInput(inputPath) {
  if (inputPath) {
    const absolutePath = path.isAbsolute(inputPath) ? inputPath : resolve(ROOT, inputPath);
    const text = await readFile(absolutePath, 'utf8');
    return JSON.parse(text);
  }

  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return null;
    return JSON.parse(text);
  }

  return null;
}

async function main() {
  const { values: flags, positionals } = parseArgs({
    options: {
      input: { type: 'string' },
      query: { type: 'string' },
      topK: { type: 'string' },
      threshold: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean', default: false },
      dryRun: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const inputPath = flags.input ?? positionals[0] ?? null;
  const payload = inputPath ? await readJsonInput(inputPath) : await readJsonInput(null);
  if (!payload && !flags.query) {
    console.error('[atlas:ctx:fuse] Provide --input <file> or pipe JSON into stdin.');
    process.exit(1);
  }

  const query = flags.query ?? payload?.query ?? payload?.prompt ?? '';
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.candidates)
      ? payload.candidates
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

  const result = fuseContext({
    query,
    mode: payload?.mode ?? (flags.dryRun ? 'dry-run' : 'deep-path'),
    threshold: flags.threshold ?? payload?.threshold,
    topK: flags.topK ?? payload?.topK,
    fastPathConfidence: payload?.fastPathConfidence ?? payload?.chr97Confidence,
    candidates,
  });

  if (flags.verbose && !flags.json) {
    console.log(`[atlas:ctx:fuse] query="${result.query}"`);
    console.log(`[atlas:ctx:fuse] candidates=${result.candidateCount} sourceRefs=${result.sourceRefs.length}`);
    if (result.topCandidate) {
      console.log(`[atlas:ctx:fuse] top=${result.topCandidate.source_ref ?? 'unknown'} score=${result.topCandidate.score.toFixed(3)}`);
    }
  }

  if (flags.out) {
    const outputPath = path.isAbsolute(flags.out) ? flags.out : resolve(ROOT, flags.out);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`[atlas:ctx:fuse] ranked ${result.ranked.length}/${result.candidateCount} candidates`);
  console.log(`[atlas:ctx:fuse] topRefs: ${result.sourceRefs.slice(0, 8).join(', ') || 'none'}`);
}

const isDirectRun = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(`[atlas:ctx:fuse] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
